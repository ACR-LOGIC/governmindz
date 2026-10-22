
// packages/core/src/scoring/ConfidenceScorer.ts — v1.1 ENHANCED
import type { AgentMessage } from "../debate/AgentMessage";
import {
	type AdaptiveCalibrationEngine,
	adaptiveCalibrationEngine,
} from "../kernel/AdaptiveCalibration";
import {
	CalibrationService,
	type ComplexityMetrics,
} from "../kernel/CalibrationService";

export interface ConfidenceInput {
	verification: number; // 0.0 – 1.0: fact-checking result
	accuracy: number; // 0.0 – 1.0: output accuracy vs. known reference
	consensus: number; // 0.0 – 1.0: agreement ratio across seats
	priorConfidence: number; // 0.0 – 1.0: agent's historical confidence
	sampleSize: number; // number of prior observations for this agent
	deterministicValidation?: number; // exact match / sandbox / signature-based validation
	retrievalMatch?: number; // exact overlap against retrieved docs or artifacts
	executionValidation?: number; // code exec or other deterministic runtime checks
	// NEW v1.1 dual-signal fields
	confidenceSelf?: number; // from AgentOutputContract
	confidenceExpertAgreement?: number; // from AgentOutputContract
	complexity?: ComplexityMetrics; // NEW: task complexity
	heuristicMultiplier?: number; // NEW: deterministic validation multiplier (0.0 - 1.0)
}

export interface ConfidenceWeights {
	verification: number;
	accuracy: number;
	consensus: number;
}

export interface ConfidenceResult {
	score: number; // final Bayesian confidence score
	dualSignalScore: number; // NEW v1.1: dual-signal score from structured output
	dual_signal_score: number; // BACKWARD COMPAT alias
	weights: ConfidenceWeights;
	posteriorVerification: number;
	posteriorAccuracy: number;
	posteriorConsensus: number;
	uncertainty: number; // 1 - score
}

export class ConfidenceScorer {
	// Beta distribution hyperparameters — calibrated from empirical data
	// Alpha = prior successes + 1, Beta = prior failures + 1
	private readonly PRIORS = {
		verification: { alpha: 4, beta: 2 }, // verification historically reliable
		accuracy: { alpha: 3, beta: 2 }, // moderate prior
		consensus: { alpha: 2, beta: 2 }, // neutral prior — data-driven
	};
	constructor(
		private readonly calibrationEngine: AdaptiveCalibrationEngine = adaptiveCalibrationEngine,
	) {}

	/**
	 * Compute Bayesian posterior confidence score.
	 *
	 * For each dimension, we update the Beta distribution prior
	 * with the observed likelihood, then compute the posterior mean.
	 *
	 * Posterior mean of Beta(α, β) = α / (α + β)
	 *
	 * The final score is a weighted combination of posteriors,
	 * where weights are dynamically adjusted by sample size
	 * (more data → trust observed values more than priors).
	 */
	score(input: ConfidenceInput): ConfidenceResult {
		const weights = this.computeAdaptiveWeights(input);
		const deterministicValidation = this.computeDeterministicValidation(input);

		// Adjust priors based on complexity
		const complexityPriors = input.complexity
			? CalibrationService.getComplexityAdjustedPriors(input.complexity)
			: { alpha: 2, beta: 2 };

		// Update Beta posteriors with observed values
		const posteriorVerification = this.betaPosteriorMean(
			{
				alpha: this.PRIORS.verification.alpha,
				beta: this.PRIORS.verification.beta + (complexityPriors.beta - 2),
			},
			Math.max(input.verification, deterministicValidation),
			input.sampleSize,
		);
		const posteriorAccuracy = this.betaPosteriorMean(
			{
				alpha: this.PRIORS.accuracy.alpha,
				beta: this.PRIORS.accuracy.beta + (complexityPriors.beta - 2),
			},
			Math.max(input.accuracy, deterministicValidation),
			input.sampleSize,
		);
		const posteriorConsensus = this.betaPosteriorMean(
			{
				alpha: this.PRIORS.consensus.alpha,
				beta: this.PRIORS.consensus.beta + (complexityPriors.beta - 2),
			},
			input.consensus,
			input.sampleSize,
		);

		// Weighted combination of posteriors
		const rawScore =
			weights.verification * posteriorVerification +
			weights.accuracy * posteriorAccuracy +
			weights.consensus * posteriorConsensus;

		// Blend with prior confidence using sample-size dampening
		const dampening = this.sampleDampening(input.sampleSize);
		let score = dampening * rawScore + (1 - dampening) * input.priorConfidence;

		// NEW v1.1: Dual-signal score
		let dualSignalScore = this.computeDualSignalScore(
			input.confidenceSelf ?? score,
			input.confidenceExpertAgreement ?? score * 0.9,
			deterministicValidation,
			input.sampleSize,
		);

		// Apply deterministic heuristic multiplier (Fail-Safe)
		if (typeof input.heuristicMultiplier === "number") {
			score *= input.heuristicMultiplier;
			dualSignalScore *= input.heuristicMultiplier;
		}

		return {
			score: Math.min(1, Math.max(0, score)),
			dualSignalScore: Math.min(1, Math.max(0, dualSignalScore)),
			dual_signal_score: Math.min(1, Math.max(0, dualSignalScore)),
			weights,
			posteriorVerification,
			posteriorAccuracy,
			posteriorConsensus,
			uncertainty: 1 - score,
		};
	}

	/**
	 * NEW v1.1: Score directly from an AgentMessage's structured output.
	 * Convenience method that extracts confidence signals from the contract.
	 *
	 * Dual-signal formula:
	 *   score = confidenceSelf * 0.6 + confidenceExpertAgreement * 0.4
	 *
	 * Rationale: self-confidence alone is susceptible to overconfidence bias.
	 * Expert agreement estimate adds calibration pressure.
	 * With sampleSize > 10, bayesian blend reduces naive overconfidence further.
	 */
	scoreFromMessage(message: AgentMessage, sampleSize = 1): ConfidenceResult {
		const s = message.structured;
		if (!s) {
			// Fallback for messages without structured output
			return this.score({
				verification: message.confidence,
				accuracy: message.confidence,
				consensus: message.confidence,
				priorConfidence: message.confidence,
				sampleSize,
			});
		}
		return this.score({
			verification:
				s.evidence.length > 0 ? Math.min(1, s.evidence.length * 0.2) : 0.3,
			accuracy:
				s.evidence.length > 0
					? Math.min(1, 0.45 + s.evidence.length * 0.1)
					: 0.35,
			consensus:
				s.supports && s.supports.length > 0
					? Math.min(1, 0.4 + s.supports.length * 0.15)
					: 0.2,
			priorConfidence: Math.min(s.confidenceSelf, 0.75),
			sampleSize,
			deterministicValidation:
				s.evidence.length > 0 ? Math.min(1, 0.5 + s.evidence.length * 0.1) : 0,
			confidenceSelf: s.confidenceSelf,
			confidenceExpertAgreement: s.confidenceExpertAgreement,
		});
	}

	/**
	 * NEW v1.1: Score a full round of messages.
	 * Returns seat-keyed scores plus an aggregate session confidence.
	 */
	scoreRound(messages: AgentMessage[]): {
		byseat: Record<string, ConfidenceResult>;
		aggregate: number;
		dualSignalAggregate: number;
	} {
		const byseat: Record<string, ConfidenceResult> = {};
		let totalScore = 0;
		let totalDual = 0;
		let count = 0;

		for (const msg of messages) {
			const result = this.scoreFromMessage(msg, messages.length);
			byseat[msg.fromSeat] = result;
			totalScore += result.score;
			totalDual += result.dualSignalScore;
			count++;
		}

		return {
			byseat,
			aggregate: count > 0 ? totalScore / count : 0,
			dualSignalAggregate: count > 0 ? totalDual / count : 0,
		};
	}

	/**
	 * Beta posterior mean: Bayesian update of Beta(α, β) prior
	 * given n observations with observed success rate p.
	 *
	 * posterior α' = α + n*p
	 * posterior β' = β + n*(1-p)
	 * posterior mean = α' / (α' + β')
	 */
	private betaPosteriorMean(
		prior: { alpha: number; beta: number },
		observed: number,
		n: number,
	): number {
		const effectiveN = Math.min(n, 100); // cap to prevent prior collapse
		const posteriorAlpha = prior.alpha + effectiveN * observed;
		const posteriorBeta = prior.beta + effectiveN * (1 - observed);
		return posteriorAlpha / (posteriorAlpha + posteriorBeta);
	}

	/**
	 * NEW v1.1: Dual-signal score computation.
	 * With low sample size (cold start), fall back to bayesian blend.
	 * With high sample size, trust observed signals more.
	 */
	private computeDualSignalScore(
		confidenceSelf: number,
		expertAgreement: number,
		deterministicValidation: number,
		sampleSize: number,
	): number {
		const base =
			clamp(confidenceSelf) * 0.1 +
			clamp(expertAgreement) * 0.2 +
			clamp(deterministicValidation) * 0.7;
		// Apply mild dampening for small samples (< 5) to prevent overconfidence
		const dampen = this.sampleDampening(sampleSize, 5);
		return base * dampen + base * 0.85 * (1 - dampen);
	}

	/**
	 * Adaptive weights — consensus matters more with many agents,
	 * verification matters more with few data points.
	 *
	 * Dynamic weight formula:
	 * w_verification = 0.50 - 0.10 * log10(n + 1)
	 * w_accuracy = 0.30 (stable)
	 * w_consensus = 0.20 + 0.10 * log10(n + 1)
	 * (normalized to sum to 1.0)
	 */
	private computeAdaptiveWeights(input: ConfidenceInput): ConfidenceWeights {
		const calibrated = this.calibrationEngine.getWeights("confidence", {
			verification: 0.5,
			accuracy: 0.3,
			consensus: 0.2,
		});
		const logN = Math.log10(input.sampleSize + 1);
		const rawVerification = Math.max(
			0.35,
			calibrated.verification - 0.08 * logN,
		);
		const rawAccuracy = Math.max(
			0.2,
			calibrated.accuracy + this.computeDeterministicValidation(input) * 0.1,
		);
		const rawConsensus = Math.min(0.3, calibrated.consensus + 0.03 * logN);
		const total = rawVerification + rawAccuracy + rawConsensus;
		return {
			verification: rawVerification / total,
			accuracy: rawAccuracy / total,
			consensus: rawConsensus / total,
		};
	}

	private computeDeterministicValidation(input: ConfidenceInput): number {
		const signals = [
			input.deterministicValidation,
			input.retrievalMatch,
			input.executionValidation,
		]
			.filter((value): value is number => typeof value === "number")
			.map((value) => clamp(value));

		if (signals.length === 0) {
			return 0;
		}

		return signals.reduce((sum, value) => sum + value, 0) / signals.length;
	}

	/**
	 * Sample dampening — how much we trust observed data vs. prior.
	 * Approaches 1.0 as sample size grows (full trust in observations).
	 * Formula: n / (n + k) where k = smoothing constant (default 10)
	 */
	private sampleDampening(n: number, k = 10): number {
		return n / (n + k);
	}
}

function clamp(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
