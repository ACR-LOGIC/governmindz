
import type { AgentResult, AgentContext, IAgent } from "../interfaces/IAgent";
import { HMemService } from "../memory/HMemService";

export interface ContextAssessment {
	relevantMemories: Array<{
		id: string;
		domain: string;
		category: string;
		content: string;
		source: string;
		confidence: number;
		createdAt: number;
	}>;
	missingContext: string[];
	incorrectAssumptions: string[];
	irrelevantResearch: string[];
	confirmedFacts: string[];
	inferences: string[];
	outdatedInformation: string[];
	contradictions: Array<{
		claim: string;
		conflictingSource: string;
		severity: "low" | "medium" | "high";
	}>;
	contextSummary: string;
	shareableContext: string;
}

export interface ContextAgentInput {
	userQuestion: string;
	conversationHistory: Array<{ role: string; content: string; timestamp: number }>;
	researchFindings?: Array<{ source: string; claim: string; evidence: string[] }>;
	proposedAnswers?: Array<{ agent: string; position: string; confidence: number }>;
	mode: "sample" | "live";
}

export class ContextAgent implements IAgent {
	id = "ContextAgent";
	name = "Context Agent";
	role = "Evaluate research and answers against user question, intent, and conversation history";
	provider = "internal";
	modelFamily = "rule-based";
	model = "context-evaluator-v1";
	capability = "context_assessment";
	executionPath = "context_agent";

	private readonly hmem = new HMemService();

	constructor(private readonly llmComplete?: (system: string, prompt: string) => Promise<string>) {}

	async execute(context: AgentContext): Promise<AgentResult> {
		const input = context.prompt as unknown as ContextAgentInput;
		if (!input) {
			return this.result("No input provided for Context Agent.", 1.0);
		}

		const assessment = this.assessContext(input);

		const content = JSON.stringify({
			contextSummary: assessment.contextSummary,
			shareableContext: assessment.shareableContext,
			relevantMemories: assessment.relevantMemories.map((m) => ({
				id: m.id,
				domain: m.domain,
				category: m.category,
				content: m.content,
				source: m.source,
				confidence: m.confidence,
			})),
			missingContext: assessment.missingContext,
			incorrectAssumptions: assessment.incorrectAssumptions,
			irrelevantResearch: assessment.irrelevantResearch,
			confirmedFacts: assessment.confirmedFacts,
			inferences: assessment.inferences,
			outdatedInformation: assessment.outdatedInformation,
			contradictions: assessment.contradictions,
		});

		return {
			agentId: this.id,
			content,
			confidence: 0.85,
			timestamp: Date.now(),
		};
	}

	/**
	 * Helper to build an AgentResult.
	 */
	protected result(content: string, confidence: number = 1.0): AgentResult {
		return {
			agentId: this.id,
			content,
			confidence,
			timestamp: Date.now(),
		};
	}

	assessContext(input: ContextAgentInput): ContextAssessment {
		const { userQuestion, conversationHistory, researchFindings = [], proposedAnswers = [], mode } = input;

		// Retrieve relevant H-MEM context
		const hmemResult = this.hmem.retrieve(userQuestion, 5);

		const relevantMemories = hmemResult.entries.map((e) => ({
			id: e.id,
			domain: e.domain,
			category: e.category,
			content: e.episode,
			source: e.source,
			confidence: e.confidence,
			createdAt: e.createdAt,
		}));

		// Identify missing context
		const missingContext: string[] = [];
		const lowerQuestion = userQuestion.toLowerCase();

		if (!/zetaris|database|table|sql|query/i.test(userQuestion)) {
			missingContext.push("No database context provided; question may not require Zetaris.");
		}
		if (conversationHistory.length === 0) {
			missingContext.push("No conversation history available; intent inferred solely from current question.");
		}

		// Identify incorrect assumptions
		const incorrectAssumptions: string[] = [];
		for (const answer of proposedAnswers) {
			if (answer.confidence >= 8 && !answer.position.includes("evidence")) {
				incorrectAssumptions.push(
					`${answer.agent} expresses high confidence (${answer.confidence}/10) without citing specific evidence.`,
				);
			}
		}

		// Identify irrelevant research
		const irrelevantResearch: string[] = [];
		for (const finding of researchFindings) {
			const findingText = `${finding.source} ${finding.claim} ${finding.evidence.join(" ")}`.toLowerCase();
			const questionTokens = new Set(userQuestion.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
			const overlap = [...questionTokens].filter((t) => findingText.includes(t)).length;
			if (overlap === 0) {
				irrelevantResearch.push(`${finding.source}: ${finding.claim}`);
			}
		}

		// Distinguish confirmed facts from inferences
		const confirmedFacts: string[] = [];
		const inferences: string[] = [];
		const outdatedInformation: string[] = [];

		for (const memory of relevantMemories) {
			if (memory.confidence >= 0.8) {
				confirmedFacts.push(memory.content);
			} else if (memory.confidence >= 0.5) {
				inferences.push(memory.content);
			} else {
				outdatedInformation.push(memory.content);
			}
		}

		// Find contradictions between research and established context
		const contradictions: Array<{
			claim: string;
			conflictingSource: string;
			severity: "low" | "medium" | "high";
		}> = [];

		for (const finding of researchFindings) {
			for (const memory of relevantMemories) {
				if (this.textsContradict(finding.claim, memory.content)) {
					contradictions.push({
						claim: finding.claim,
						conflictingSource: `H-MEM:${memory.id}`,
						severity: memory.confidence > 0.7 ? "high" : "medium",
					});
				}
			}
		}

		// Build shareable context (only what's necessary)
		const shareableContextParts: string[] = [];
		if (relevantMemories.length > 0) {
			shareableContextParts.push("Relevant prior context:");
			for (const m of relevantMemories.slice(0, 3)) {
				shareableContextParts.push(`- [${m.domain}/${m.category}] ${m.content.slice(0, 200)}`);
			}
		}
		if (confirmedFacts.length > 0) {
			shareableContextParts.push("Confirmed facts from prior sessions:");
			for (const f of confirmedFacts.slice(0, 3)) {
				shareableContextParts.push(`- ${f.slice(0, 200)}`);
			}
		}
		if (contradictions.length > 0) {
			shareableContextParts.push("Contradictions detected:");
			for (const c of contradictions) {
				shareableContextParts.push(`- ${c.claim} conflicts with ${c.conflictingSource} (${c.severity})`);
			}
		}

		const contextSummary = `Context assessment for question: "${userQuestion}" ` +
			`(${relevantMemories.length} relevant memories, ${contradictions.length} contradictions, ` +
			`${missingContext.length} context gaps)`;

		return {
			relevantMemories,
			missingContext,
			incorrectAssumptions,
			irrelevantResearch,
			confirmedFacts,
			inferences,
			outdatedInformation,
			contradictions,
			contextSummary,
			shareableContext: shareableContextParts.join("\n"),
		};
	}

	private textsContradict(a: string, b: string): boolean {
		const aLower = a.toLowerCase();
		const bLower = b.toLowerCase();

		// Simple heuristic: opposing polarity words
		const positive = /increase|improve|better|higher|more|expand|grow|enable|allow|support/i;
		const negative = /decrease|worsen|worse|lower|less|reduce|shrink|block|deny|prevent|restrict/i;

		const aPos = positive.test(aLower);
		const aNeg = negative.test(aLower);
		const bPos = positive.test(bLower);
		const bNeg = negative.test(bLower);

		return (aPos && bNeg) || (aNeg && bPos);
	}

	getSystemPrompt(): string {
		return `You are the Context Agent for GOVERNMINDZ. Your role is to evaluate whether research and proposed answers make sense in relation to the user's question, intent, and relevant conversation history.

You must:
1. Identify missing context, incorrect assumptions, and irrelevant research.
2. Retrieve relevant H-MEM information when appropriate.
3. Distinguish confirmed user-provided facts from inferences and outdated information.
4. Share only the context necessary for the task.
5. Flag contradictions between new research and established context.

Do not treat remembered information as automatically correct or allow irrelevant personal information to influence answers.`;
	}
}

export const contextAgent = new ContextAgent();
