
import type { AgentMessage } from "../debate/AgentMessage.js";
import type { ILLMClient } from "../debate/AgentSeat.js";
import type { WorkflowState } from "../orchestration/WorkflowStateMachine.js";

export interface ThinkerQuestion {
	question: string;
	assignedTo: string[];
	reason: string;
}

export interface ThinkerResult {
	questions: ThinkerQuestion[];
	summary: string;
}

export interface ThinkerTrigger {
	type:
		| "untested_assumption"
		| "overlooked_alternative"
		| "repeated_evidence"
		| "conflicting_findings"
		| "new_research_direction"
		| "material_question_unanswered";
	severity: "low" | "medium" | "high";
	description: string;
	context: string;
}

export interface ThinkerIntervention {
	id: string;
	trigger: ThinkerTrigger;
	questions: ThinkerQuestion[];
	summary: string;
	status: "PENDING" | "ANSWERED" | "UNRESOLVED";
	timestamp: number;
}

const THINKER_SYSTEM = `You are the Thinker Agent. You operate independently of the debate and do NOT vote in consensus.
You monitor the investigation for missing angles, unexamined assumptions, research gaps, narrow approaches, conflicting findings, and pre-finalization blind spots.
You generate at most 1-2 specific, actionable questions that could improve the investigation, assign each to relevant agents, and explain why.
Return ONLY valid JSON:
{
  "questions": [{"question":"...","assignedTo":["SeatId"],"reason":"..."}],
  "summary": "<brief summary of blind spots found, or 'none' if no intervention needed>"
}
If no intervention is warranted, return {"questions":[],"summary":"none"}.`;

export class ThinkerAgent {
	private interventions: Map<string, ThinkerIntervention> = new Map();
	private askedQuestions = new Set<string>();
	private maxInterventions = 5;

	constructor(private readonly llm: ILLMClient) {}

	/**
	 * Scan current state for trigger conditions and return any triggers.
	 * Event-driven entry point - can fire at any stage.
	 */
	scanForTriggers(params: {
		messages: AgentMessage[];
		inquiry: string;
		findings: string;
		sources: string;
		inquiryScore: number;
		round: number;
	}): ThinkerTrigger[] {
		const triggers: ThinkerTrigger[] = [];

		// Check for conflicting findings
		const positions = new Map<string, string>();
		for (const msg of params.messages) {
			if (msg.structured?.position) {
				const existing = positions.get(msg.fromSeat);
				if (existing && existing !== msg.structured.position) {
					triggers.push({
						type: "conflicting_findings",
						severity: "high",
						description: `Agent ${msg.fromSeat} changed position from "${existing.slice(0, 60)}..." to "${msg.structured.position.slice(0, 60)}..."`,
						context: params.findings,
					});
				}
				positions.set(msg.fromSeat, msg.structured.position);
			}
		}

		// Check for repeated evidence (agents citing same sources)
		const evidenceCounts = new Map<string, number>();
		for (const msg of params.messages) {
			const ev = msg.structured?.evidence ?? [];
			for (const e of ev) {
				evidenceCounts.set(e, (evidenceCounts.get(e) ?? 0) + 1);
			}
		}
		const repeatedEvidence = [...evidenceCounts.entries()]
			.filter(([, count]) => count >= 2)
			.map(([evidence]) => evidence);
		if (repeatedEvidence.length > 0) {
			triggers.push({
				type: "repeated_evidence",
				severity: "medium",
				description: `Multiple agents rely on the same evidence: ${repeatedEvidence.join(", ")}`,
				context: params.findings,
			});
		}

		// Check for untested assumptions - high confidence with no caveats
		for (const msg of params.messages) {
			if (msg.structured && (msg.structured.confidenceSelf ?? msg.confidence) >= 0.7) {
				const caveats = msg.structured.caveats ?? [];
				if (caveats.length === 0) {
					const key = `assumption_${msg.fromSeat}_${msg.round}`;
					if (!this.askedQuestions.has(key)) {
						triggers.push({
							type: "untested_assumption",
							severity: "medium",
							description: `Agent ${msg.fromSeat} expresses confidence ${(msg.structured.confidenceSelf ?? msg.confidence) * 10}/10 with no stated caveats`,
							context: msg.structured.position,
						});
						this.askedQuestions.add(key);
					}
				}
			}
		}

		// Check for unanswered material questions (inquiry score high)
		if (params.inquiryScore >= 7) {
			const hasActionItems = params.messages.some(
				(m) => m.type === "action_items",
			);
			if (!hasActionItems && params.round > 0) {
				triggers.push({
					type: "material_question_unanswered",
					severity: "high",
					description: "High-inquiry question may have unresolved material issues; no action items generated yet",
					context: params.inquiry,
				});
			}
		}

		return triggers;
	}

	/**
	 * Generate questions based on triggers and current state.
	 */
	async think(params: {
		inquiry: string;
		findings: string;
		sources: string;
		maxQuestions?: number;
	}): Promise<ThinkerResult> {
		const prompt = [
			`Inquiry: ${params.inquiry}`,
			"",
			"Current findings:",
			params.findings,
			"",
			"Source references:",
			params.sources,
			"",
			"Identify blind spots and propose 1-2 questions.",
		].join("\n");

		try {
			const result = await this.llm.complete(THINKER_SYSTEM, prompt);
			const cleaned = result.content
				.replace(/^```json\s*/i, "")
				.replace(/^```\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = JSON.parse(cleaned) as Partial<ThinkerResult>;
			const questions = Array.isArray(parsed.questions)
				? parsed.questions
						.slice(0, params.maxQuestions ?? 2)
						.map((q) => ({
							question: String(q.question || ""),
							assignedTo: Array.isArray(q.assignedTo)
								? q.assignedTo.map(String)
								: [],
							reason: String(q.reason || ""),
						}))
						.filter((q) => q.question.trim().length > 0)
						.filter((q) => !this.askedQuestions.has(q.question.slice(0, 80)))
				: [];
			// Record asked questions to prevent repetition
			for (const q of questions) {
				this.askedQuestions.add(q.question.slice(0, 80));
			}
			return {
				questions,
				summary: String(parsed.summary || "none"),
			};
		} catch {
			return { questions: [], summary: "none" };
		}
	}

	/**
	 * Record a Thinker intervention.
	 */
	recordIntervention(
		runId: string,
		trigger: ThinkerTrigger,
		questions: ThinkerQuestion[],
		summary: string,
	): ThinkerIntervention {
		const id = `thinker_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
		const intervention: ThinkerIntervention = {
			id,
			trigger,
			questions,
			summary,
			status: "PENDING",
			timestamp: Date.now(),
		};
		this.interventions.set(id, intervention);
		return intervention;
	}

	/**
	 * Mark an intervention as answered.
	 */
	resolveIntervention(interventionId: string, status: "ANSWERED" | "UNRESOLVED"): boolean {
		const intervention = this.interventions.get(interventionId);
		if (!intervention) return false;
		intervention.status = status;
		return true;
	}

	/**
	 * Get all pending interventions.
	 */
	getPendingInterventions(): ThinkerIntervention[] {
		return Array.from(this.interventions.values()).filter((i) => i.status === "PENDING");
	}

	/**
	 * Get all interventions.
	 */
	getInterventions(): ThinkerIntervention[] {
		return Array.from(this.interventions.values());
	}

	/**
	 * Clear all interventions.
	 */
	clearInterventions(): void {
		this.interventions.clear();
		this.askedQuestions.clear();
	}

	get hasInterventions(): boolean {
		return this.interventions.size > 0;
	}

	get atInterventionLimit(): boolean {
		return this.interventions.size >= this.maxInterventions;
	}
}


