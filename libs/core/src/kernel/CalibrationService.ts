
export interface ModelParameters {
	temperature: number;
	topP: number;
	maxTokens: number;
}

export interface ComplexityMetrics {
	score: number; // 0.0 - 1.0
	tier: "low" | "medium" | "high";
}

export class CalibrationService {
	/**
	 * Estimates complexity based on the prompt and context.
	 */
	static estimateComplexity(
		prompt: string,
		historyCount: number,
	): ComplexityMetrics {
		const lengthFactor = Math.min(1, prompt.length / 5000);
		const historyFactor = Math.min(1, historyCount / 10);
		const score = lengthFactor * 0.7 + historyFactor * 0.3;

		let tier: ComplexityMetrics["tier"] = "low";
		if (score > 0.7) tier = "high";
		else if (score > 0.3) tier = "medium";

		return { score, tier };
	}

	/**
	 * Resolves model parameters based on the agent's role and task complexity.
	 */
	static resolveParameters(
		role: string,
		complexity: ComplexityMetrics,
	): ModelParameters {
		const baseParams: ModelParameters = {
			temperature: 0.7,
			topP: 0.9,
			maxTokens: 2000,
		};

		// Fact-checkers and Synthesizers need to be more deterministic
		if (role === "fact-checker" || role === "synthesizer") {
			baseParams.temperature = 0.2;
			baseParams.topP = 0.1;
		}

		// Adjust for complexity
		if (complexity.tier === "high") {
			baseParams.temperature += 0.1; // More "creative" space for hard problems
			baseParams.maxTokens = 4000;
		} else if (complexity.tier === "low") {
			baseParams.temperature -= 0.1;
		}

		// Clamp values
		baseParams.temperature = Math.max(0, Math.min(1, baseParams.temperature));

		return baseParams;
	}

	/**
	 * Adjusts confidence priors based on complexity.
	 * Harder tasks should have lower initial trust in agent outputs.
	 */
	static getComplexityAdjustedPriors(complexity: ComplexityMetrics) {
		const baseAlpha = 2;
		const baseBeta = 2;

		// High complexity increases Beta (failure prior)
		const penalty = complexity.score * 2;

		return {
			alpha: baseAlpha,
			beta: baseBeta + penalty,
		};
	}
}
