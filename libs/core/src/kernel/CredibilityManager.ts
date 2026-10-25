/**
 * CredibilityManager.ts
 *
 * Implements Milestone 3: Closed-Loop Human Feedback & Adaptive Bayesian Prior Calibration.
 *
 * Utilizes a Beta-Binomial conjugate Bayesian update model:
 * - Cold-start prior: alpha_0 = 2.0, beta_0 = 2.0, sample_count = 0, mu = 0.50, weight = 1.0.
 * - Rating "up" (thumbs up) updates alpha <- alpha + 1.0.
 * - Rating "down" (thumbs down) updates beta <- beta + 1.0.
 * - Consensus agreement can optionally increment alpha (+0.3) or beta (+0.3).
 * - Credibility score: mu_i = alpha_i / (alpha_i + beta_i).
 * - Normalized weight multiplier: w_i = clamp(0.2, 1.8, mu_i / 0.5).
 */

export interface MessageFeedbackPayload {
	conversationId: string;
	messageId: string;
	seatId: string;
	rating: "up" | "down";
	round?: number;
	userComment?: string;
}

export interface AgentCredibilityRecord {
	seatId: string;
	alpha: number;
	beta: number;
	sampleCount: number;
	credibilityScore: number;
	weightMultiplier: number;
	updatedAt: number;
}

export interface ICredibilityDelegate {
	loadAll?(): Promise<AgentCredibilityRecord[]> | AgentCredibilityRecord[];
	saveRecord?(record: AgentCredibilityRecord): Promise<void> | void;
}

export const COLD_START_PRIORS = {
	alpha: 2.0,
	beta: 2.0,
	sampleCount: 0,
	credibilityScore: 0.5,
	weightMultiplier: 1.0,
} as const;

export function clampWeight(weight: number): number {
	if (!Number.isFinite(weight)) return 1.0;
	return Math.min(1.8, Math.max(0.2, weight));
}

export function computeCredibilityMetrics(
	alpha: number,
	beta: number,
): { credibilityScore: number; weightMultiplier: number } {
	const denom = alpha + beta;
	const rawScore = denom > 0 && Number.isFinite(alpha / denom) ? alpha / denom : 0.5;
	const credibilityScore = Math.min(1.0, Math.max(0.0, rawScore));
	const weightMultiplier = clampWeight(credibilityScore / 0.5);
	return {
		credibilityScore: Math.round(credibilityScore * 10000) / 10000,
		weightMultiplier: Math.round(weightMultiplier * 10000) / 10000,
	};
}

export class CredibilityManager {
	private readonly records = new Map<string, AgentCredibilityRecord>();
	private delegate?: ICredibilityDelegate;

	constructor(
		initialRecords?: AgentCredibilityRecord[],
		delegate?: ICredibilityDelegate,
	) {
		this.delegate = delegate;
		if (initialRecords) {
			for (const r of initialRecords) {
				this.records.set(r.seatId, { ...r });
			}
		}
	}

	setPersistenceDelegate(delegate: ICredibilityDelegate): void {
		this.delegate = delegate;
	}

	getCredibility(seatId: string): AgentCredibilityRecord {
		const existing = this.records.get(seatId);
		if (existing) {
			return { ...existing };
		}

		const now = Date.now();
		const record: AgentCredibilityRecord = {
			seatId,
			alpha: COLD_START_PRIORS.alpha,
			beta: COLD_START_PRIORS.beta,
			sampleCount: COLD_START_PRIORS.sampleCount,
			credibilityScore: COLD_START_PRIORS.credibilityScore,
			weightMultiplier: COLD_START_PRIORS.weightMultiplier,
			updatedAt: now,
		};
		this.records.set(seatId, record);
		return { ...record };
	}

	getWeightMultiplier(seatId: string): number {
		return this.getCredibility(seatId).weightMultiplier;
	}

	getAllCredibilities(): AgentCredibilityRecord[] {
		return Array.from(this.records.values()).map((r) => ({ ...r }));
	}

	recordRating(
		seatId: string,
		rating: "up" | "down",
		_round?: number,
	): AgentCredibilityRecord {
		const current = this.getCredibility(seatId);

		let newAlpha = current.alpha;
		let newBeta = current.beta;

		if (rating === "up") {
			newAlpha += 1.0;
		} else if (rating === "down") {
			newBeta += 1.0;
		}

		const { credibilityScore, weightMultiplier } = computeCredibilityMetrics(
			newAlpha,
			newBeta,
		);

		const updated: AgentCredibilityRecord = {
			seatId,
			alpha: Math.round(newAlpha * 100) / 100,
			beta: Math.round(newBeta * 100) / 100,
			sampleCount: current.sampleCount + 1,
			credibilityScore,
			weightMultiplier,
			updatedAt: Date.now(),
		};

		this.records.set(seatId, updated);
		this.delegate?.saveRecord?.(updated);
		return { ...updated };
	}

	recordConsensusAgreement(
		seatId: string,
		agreed: boolean,
	): AgentCredibilityRecord {
		const current = this.getCredibility(seatId);

		let newAlpha = current.alpha;
		let newBeta = current.beta;

		if (agreed) {
			newAlpha += 0.3;
		} else {
			newBeta += 0.3;
		}

		const { credibilityScore, weightMultiplier } = computeCredibilityMetrics(
			newAlpha,
			newBeta,
		);

		const updated: AgentCredibilityRecord = {
			seatId,
			alpha: Math.round(newAlpha * 100) / 100,
			beta: Math.round(newBeta * 100) / 100,
			sampleCount: current.sampleCount + 1,
			credibilityScore,
			weightMultiplier,
			updatedAt: Date.now(),
		};

		this.records.set(seatId, updated);
		this.delegate?.saveRecord?.(updated);
		return { ...updated };
	}

	setCredibility(record: AgentCredibilityRecord): void {
		this.records.set(record.seatId, { ...record });
		this.delegate?.saveRecord?.(record);
	}

	reset(): void {
		this.records.clear();
	}
}

/** Global default singleton */
export const credibilityManager = new CredibilityManager();
