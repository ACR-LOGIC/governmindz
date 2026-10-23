
import type { AgentMessage } from "../debate/AgentMessage.js";
import type { ILLMClient } from "../debate/AgentSeat.js";
import type { WorkflowState } from "../orchestration/WorkflowStateMachine.js";

export interface ChallengeResult {
	seatId: string;
	challenge: string;
	verifiedClaims: string[];
	unsupportedClaims: string[];
	correctedPosition: string;
	confidence: number;
}

export interface RivalTrigger {
	type:
		| "high_confidence_weak_evidence"
		| "unsupported_claim"
		| "citation_mismatch"
		| "agent_contradiction"
		| "premature_consensus"
		| "new_evidence_undermines"
		| "critical_claim_insufficient_evidence";
	severity: "low" | "medium" | "high";
	description: string;
	targetSeat: string;
	targetClaim?: string;
	evidenceQuality: number; // 0-1
	confidenceScore: number; // 0-10 from agent
}

export interface ChallengeIntervention {
	id: string;
	trigger: RivalTrigger;
	challengeResult?: ChallengeResult;
	resolution: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED" | "PENDING";
	recheckRequired: boolean;
	recheckCount: 0;
	maxRechecks: number;
	timestamp: number;
}

const CHALLENGE_SYSTEM = `You are the Rival Challenger. You operate independently of the debate and do NOT vote in consensus.
Given an agent's position, its stated evidence, and the available context, you must:
1. Double-check the agent's claims against the evidence.
2. Identify any unsupported or inaccurate claims.
3. Identify citations that fail to support their claims.
4. Correct unsupported claims.
5. Do not manufacture disagreement when the evidence supports the original conclusion.
Return ONLY valid JSON:
{
  "challenge": "<your challenge text or 'none' if no issue found>",
  "verifiedClaims": ["<claim supported by evidence>"],
  "unsupportedClaims": ["<claim not supported>"],
  "correctedPosition": "<corrected position or original if all verified>",
  "confidence": <0.0-1.0>
}`;

export class RivalChallenger {
	private interventions: Map<string, ChallengeIntervention> = new Map();
	private challengedClaims = new Set<string>();
	private maxRechecks = 3;

	constructor(private readonly llm: ILLMClient) {}

	/**
	 * Scan a set of agent messages for trigger conditions and return
	 * any triggers that fire. This is the event-driven entry point.
	 */
	scanForTriggers(params: {
		messages: AgentMessage[];
		evidenceContext: string;
		round: number;
		inquiryScore: number;
		conversationHistory?: string;
	}): RivalTrigger[] {
		const triggers: RivalTrigger[] = [];

		for (const msg of params.messages) {
			if (!msg.structured) continue;

			const confidence = msg.structured.confidenceSelf ?? msg.confidence;
			const evidence = msg.structured.evidence ?? [];
			const claimKey = `${msg.fromSeat}:${msg.structured.position.slice(0, 80)}`;

			// Trigger: high confidence (8-10/10) with weak or unverified evidence
			if (confidence >= 0.8 && evidence.length <= 1) {
				if (!this.challengedClaims.has(claimKey + "_high_conf")) {
					triggers.push({
						type: "high_confidence_weak_evidence",
						severity: "high",
						description: `Agent ${msg.fromSeat} reports confidence ${(confidence * 10).toFixed(0)}/10 with ${evidence.length} evidence item(s)`,
						targetSeat: msg.fromSeat,
						targetClaim: msg.structured.position,
						evidenceQuality: evidence.length > 0 ? 0.3 : 0.1,
						confidenceScore: confidence * 10,
					});
					this.challengedClaims.add(claimKey + "_high_conf");
				}
			}

			// Trigger: critical claim has insufficient evidence regardless of confidence
			if (evidence.length === 0 && msg.structured.position.length > 20) {
				if (!this.challengedClaims.has(claimKey + "_no_evidence")) {
					triggers.push({
						type: "critical_claim_insufficient_evidence",
						severity: "high",
						description: `Agent ${msg.fromSeat} makes a material claim with zero supporting evidence`,
						targetSeat: msg.fromSeat,
						targetClaim: msg.structured.position,
						evidenceQuality: 0,
						confidenceScore: confidence * 10,
					});
					this.challengedClaims.add(claimKey + "_no_evidence");
				}
			}

			// Trigger: dissent or contradiction between agents
			const dissents = msg.structured.dissents_from ?? msg.structured.dissentsFrom ?? [];
			if (dissents.length > 0) {
				const dissentKey = claimKey + "_dissent";
				if (!this.challengedClaims.has(dissentKey)) {
					triggers.push({
						type: "agent_contradiction",
						severity: "medium",
						description: `Agent ${msg.fromSeat} dissents from: ${dissents.join(", ")}`,
						targetSeat: msg.fromSeat,
						targetClaim: msg.structured.position,
						evidenceQuality: evidence.length > 0 ? 0.5 : 0.2,
						confidenceScore: confidence * 10,
					});
					this.challengedClaims.add(dissentKey);
				}
			}

			// Trigger: premature consensus (supports with no evidence)
			const supports = msg.structured.supports ?? [];
			if (supports.length > 0 && evidence.length === 0) {
				if (!this.challengedClaims.has(claimKey + "_premature")) {
					triggers.push({
						type: "premature_consensus",
						severity: "medium",
						description: `Agent ${msg.fromSeat} supports ${supports.join(", ")} without evidence`,
						targetSeat: msg.fromSeat,
						targetClaim: msg.structured.position,
						evidenceQuality: 0,
						confidenceScore: confidence * 10,
					});
					this.challengedClaims.add(claimKey + "_premature");
				}
			}
		}

		return triggers;
	}

	/**
	 * Execute a challenge against a specific claim. Returns a ChallengeResult
	 * and records the intervention.
	 */
	async challenge(
		seatId: string,
		message: AgentMessage,
		evidenceContext: string,
	): Promise<ChallengeResult> {
		const position = message.structured?.position || message.content || "";
		const evidence = (message.structured?.evidence || []).join("; ");
		const prompt = [
			`Agent: ${seatId}`,
			`Position: ${position}`,
			`Stated evidence: ${evidence}`,
			"",
			"Available evidence context:",
			evidenceContext,
			"",
			"Verify and challenge.",
		].join("\n");

		try {
			const result = await this.llm.complete(CHALLENGE_SYSTEM, prompt);
			const cleaned = result.content
				.replace(/^```json\s*/i, "")
				.replace(/^```\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = JSON.parse(cleaned) as Partial<ChallengeResult>;
			return {
				seatId,
				challenge: parsed.challenge || result.content.slice(0, 300),
				verifiedClaims: Array.isArray(parsed.verifiedClaims)
					? parsed.verifiedClaims
					: [],
				unsupportedClaims: Array.isArray(parsed.unsupportedClaims)
					? parsed.unsupportedClaims
					: [],
				correctedPosition:
					parsed.correctedPosition || position,
				confidence:
					typeof parsed.confidence === "number"
						? parsed.confidence
						: result.confidence,
			};
		} catch {
			return {
				seatId,
				challenge: "Challenger could not parse model output; claims unverified.",
				verifiedClaims: [],
				unsupportedClaims: [],
				correctedPosition: position,
				confidence: 0.3,
			};
		}
	}

	/**
	 * Record a new challenge intervention. Returns the intervention ID.
	 */
	recordIntervention(
		runId: string,
		trigger: RivalTrigger,
	): ChallengeIntervention {
		const id = `rival_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
		const intervention: ChallengeIntervention = {
			id,
			trigger,
			resolution: "PENDING",
			recheckRequired: false,
			recheckCount: 0,
			maxRechecks: this.maxRechecks,
			timestamp: Date.now(),
		};
		this.interventions.set(id, intervention);
		return intervention;
	}

	/**
	 * Update the resolution of a challenge intervention.
	 */
	resolveIntervention(
		interventionId: string,
		resolution: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED",
		challengeResult?: ChallengeResult,
	): boolean {
		const intervention = this.interventions.get(interventionId);
		if (!intervention) return false;

		intervention.resolution = resolution;
		intervention.challengeResult = challengeResult;

		if (resolution === "PARTIALLY_RESOLVED" && intervention.recheckCount < intervention.maxRechecks) {
			intervention.recheckRequired = true;
			intervention.recheckCount += 1;
		} else {
			intervention.recheckRequired = false;
		}

		return true;
	}

	/**
	 * Check if any intervention needs rechecking (bounded retry).
	 */
	getPendingRechecks(): ChallengeIntervention[] {
		return Array.from(this.interventions.values()).filter(
			(i) => i.recheckRequired && i.recheckCount < i.maxRechecks,
		);
	}

	/**
	 * Get all interventions for a run.
	 */
	getInterventions(): ChallengeIntervention[] {
		return Array.from(this.interventions.values());
	}

	/**
	 * Clear all interventions (for testing/fresh runs).
	 */
	clearInterventions(): void {
		this.interventions.clear();
		this.challengedClaims.clear();
	}

	get hasInterventions(): boolean {
		return this.interventions.size > 0;
	}
}


