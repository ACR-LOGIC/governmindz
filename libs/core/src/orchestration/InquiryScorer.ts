
export type InquiryScoreBand =
	| "simple"
	| "interpretive"
	| "multi_factor"
	| "complex"
	| "high_stakes";

export interface InquiryScoreResult {
	score: number; // 1-10
	band: InquiryScoreBand;
	rationale: string;
	factors: Record<string, number>;
	defaultScrutiny: string;
	recommendedAgents: string[];
	requiresZetaris: boolean;
	requiresResearch: boolean;
}

const SCORE_DESCRIPTIONS: Record<number, string> = {
	1: "Simple factual question; minimal research unless a trigger fires.",
	2: "Simple factual question; minimal research unless a trigger fires.",
	3: "Some interpretation required; monitor for missing assumptions.",
	4: "Some interpretation required; monitor for missing assumptions.",
	5: "Multiple factors or sources; actively monitor research quality and gaps.",
	6: "Multiple factors or sources; actively monitor research quality and gaps.",
	7: "Complex, disputed, or consequential; both independent agents actively review.",
	8: "Complex, disputed, or consequential; both independent agents actively review.",
	9: "High-stakes, highly uncertain, or difficult to verify; intensive scrutiny and disclose unresolved uncertainty.",
	10: "High-stakes, highly uncertain, or difficult to verify; intensive scrutiny and disclose unresolved uncertainty.",
};

export class InquiryScorer {
	/**
	 * Compute an initial inquiry-complexity score from 1-10 based on the
	 * user question, conversation history, and available context.
	 */
	scoreInitial(params: {
		question: string;
		conversationHistory?: Array<{ role: string; content: string }>;
		availableTools?: string[];
		existingContext?: string;
	}): InquiryScoreResult {
		const { question, conversationHistory = [], availableTools = [], existingContext = "" } = params;
		const factors: Record<string, number> = {};

		// Question length and complexity
		const wordCount = question.split(/\s+/).filter((w) => w.length > 0).length;
		factors.question_length = Math.min(1, wordCount / 50);

		// Presence of comparison/contrast words
		const comparisonWords = /compare|contrast|versus|vs\.|difference|better|worse|trade.?off/i;
		factors.comparison = comparisonWords.test(question) ? 1 : 0;

		// Presence of uncertainty/ambiguity words
		const uncertaintyWords = /unclear|uncertain|ambiguous|disputed|controversial|unresolved|unclear/i;
		factors.uncertainty = uncertaintyWords.test(question) ? 1 : 0;

		// Presence of multi-source indicators
		const multiSourceWords = /multiple|various|several|different|all|each|every/i;
		factors.multiSource = multiSourceWords.test(question) ? 1 : 0;

		// Presence of governance/compliance terms (suggests consequential)
		const governanceWords = /govern|compliance|policy|audit|regulat|standard|require|mandat/i;
		factors.governance = governanceWords.test(question) ? 1 : 0;

		// Presence of technical/infrastructure terms
		const technicalWords = /infrastructure|architecture|deploy|security|scal|perform|cost|optimiz/i;
		factors.technical = technicalWords.test(question) ? 1 : 0;

		// Conversation history length suggests ongoing complex discussion
		factors.history_depth = Math.min(1, conversationHistory.length / 10);

		// Existing context richness
		factors.context_richness = existingContext.length > 200 ? 1 : 0;

		// Zetaris/database relevance
		const dbWords = /zetaris|database|table|row|sql|query|federat|lightning/i;
		factors.database_relevant = dbWords.test(question) ? 1 : 0;

		// Weighted sum (each factor 0-1, weights sum to ~10)
		const weights: Record<string, number> = {
			question_length: 1.5,
			comparison: 1.0,
			uncertainty: 1.5,
			multiSource: 1.0,
			governance: 1.5,
			technical: 1.0,
			history_depth: 0.5,
			context_richness: 0.5,
			database_relevant: 1.5,
		};

		let weightedSum = 0;
		let totalWeight = 0;
		for (const [key, weight] of Object.entries(weights)) {
			weightedSum += (factors[key] ?? 0) * weight;
			totalWeight += weight;
		}

		const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
		const score = Math.max(1, Math.min(10, Math.round(rawScore * 10)));

		const band = this.scoreToBand(score);
		return {
			score,
			band,
			rationale: SCORE_DESCRIPTIONS[score],
			factors,
			defaultScrutiny: this.defaultScrutinyFor(score),
			recommendedAgents: this.recommendAgents(score, factors),
			requiresZetaris: factors.database_relevant > 0.5 || score >= 5,
			requiresResearch: score >= 3,
		};
	}

	/**
	 * Update an existing inquiry score based on new evidence, challenges, or
	 * interventions that emerge during the workflow.
	 */
	scoreUpdate(params: {
		currentScore: number;
		newEvidenceCount: number;
		contradictionsFound: number;
		unsupportedClaims: number;
		interventionsTriggered: number;
		confidenceVsEvidenceGap: number; // 0-1, how much confidence exceeds evidence quality
	}): InquiryScoreResult {
		let delta = 0;

		if (params.contradictionsFound > 0) delta += 2;
		if (params.unsupportedClaims > 0) delta += 1;
		if (params.confidenceVsEvidenceGap > 0.5) delta += 1;
		if (params.interventionsTriggered > 0) delta += 1;
		if (params.newEvidenceCount > 0 && params.contradictionsFound === 0) delta -= 1;

		const newScore = Math.max(1, Math.min(10, params.currentScore + delta));
		const band = this.scoreToBand(newScore);

		const rationale = `Score updated from ${params.currentScore} to ${newScore}: ` +
			(params.contradictionsFound > 0 ? `${params.contradictionsFound} contradiction(s) found. ` : "") +
			(params.unsupportedClaims > 0 ? `${params.unsupportedClaims} unsupported claim(s). ` : "") +
			(params.confidenceVsEvidenceGap > 0.5 ? "Confidence exceeds evidence quality. " : "") +
			(params.interventionsTriggered > 0 ? `${params.interventionsTriggered} intervention(s) triggered. ` : "") +
			(params.newEvidenceCount > 0 && params.contradictionsFound === 0 ? "New evidence resolved some gaps." : "");

		return {
			score: newScore,
			band,
			rationale,
			factors: {},
			defaultScrutiny: this.defaultScrutinyFor(newScore),
			recommendedAgents: this.recommendAgents(newScore, {}),
			requiresZetaris: newScore >= 5,
			requiresResearch: newScore >= 3,
		};
	}

	private scoreToBand(score: number): InquiryScoreBand {
		if (score <= 2) return "simple";
		if (score <= 4) return "interpretive";
		if (score <= 6) return "multi_factor";
		if (score <= 8) return "complex";
		return "high_stakes";
	}

	private defaultScrutinyFor(score: number): string {
		if (score <= 2) return "minimal; research only on trigger";
		if (score <= 4) return "moderate; monitor for missing assumptions";
		if (score <= 6) return "active; monitor research quality and gaps";
		if (score <= 8) return "high; both independent agents review";
		return "intensive; disclose unresolved uncertainty";
	}

	private recommendAgents(score: number, factors: Record<string, number>): string[] {
		const agents: string[] = [];

		if (score >= 3) agents.push("ContextAgent");
		if (score >= 5) agents.push("CredibleSourcesResearchAgent");
		if (score >= 5 && factors.multiSource > 0.5) agents.push("SocialCommunityResearchAgent");
		if (score >= 7) agents.push("RivalChallenger", "ThinkerAgent");
		if (score >= 5 && factors.database_relevant > 0.5) agents.push("FactChecker", "CloudArchitect", "Synthesizer");

		return agents;
	}
}

export const inquiryScorer = new InquiryScorer();
