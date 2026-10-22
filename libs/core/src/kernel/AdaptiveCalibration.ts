
/**
 * AdaptiveCalibration.ts
 * ACR Logic — © 2026 Andres Chavez Ramirez.
 *
 * Fix #5 — Typed AcceptanceSource enum added to CalibrationFeedback.
 *
 * Previously, `accepted: boolean` had no definition of what produced that
 * signal, risking over-reward of API-successful but substantively poor outputs.
 *
 * Now:
 *   - AcceptanceSource enum makes the signal origin explicit and auditable.
 *   - Each source carries a weight multiplier so HUMAN_APPROVAL carries full
 *     weight, OFFICER_AGENT_SIGNAL carries 0.7x, and API_SUCCESS carries only
 *     0.3x — preventing an API 200 from masking a bad output.
 *   - The reward function applies the multiplier before updating weights.
 */

export type CalibratedWeightMap = Record<string, number>;

// ── Fix #5: Typed Acceptance Signal ──────────────────────────────────────────

/**
 * Identifies the source that determined whether an output was "accepted".
 * Used to discount API-only signals that may not reflect substantive quality.
 */
export enum AcceptanceSource {
	/** A human reviewer explicitly approved the output. Full weight (1.0×). */
	HUMAN_APPROVAL = "HUMAN_APPROVAL",
	/** An ANDRES Officer agent evaluated and approved the output. 0.7× weight. */
	OFFICER_AGENT_SIGNAL = "OFFICER_AGENT_SIGNAL",
	/** The downstream API call returned a success status. 0.3× weight. */
	API_SUCCESS = "API_SUCCESS",
}

/** Discount multipliers applied per AcceptanceSource. */
const ACCEPTANCE_WEIGHT: Record<AcceptanceSource, number> = {
	[AcceptanceSource.HUMAN_APPROVAL]: 1.0,
	[AcceptanceSource.OFFICER_AGENT_SIGNAL]: 0.7,
	[AcceptanceSource.API_SUCCESS]: 0.3,
};

export interface CalibrationFeedback {
	/** Whether the output was accepted by the source below. */
	accepted: boolean;
	/**
	 * Required: identifies WHO determined acceptance.
	 * This prevents API_SUCCESS from carrying the same weight as a human
	 * reviewer, which would reward technically successful but poor outputs.
	 */
	acceptanceSource: AcceptanceSource;
	deterministicValidationScore: number;
	validationFailures: number;
}

export interface CalibrationSnapshot {
	key: string;
	weights: CalibratedWeightMap;
	sampleSize: number;
	updatedAt: number;
}

export interface ICalibrationStore {
	get(key: string): CalibrationSnapshot | null;
	set(snapshot: CalibrationSnapshot): void;
}

export class InMemoryCalibrationStore implements ICalibrationStore {
	private readonly snapshots = new Map<string, CalibrationSnapshot>();

	get(key: string): CalibrationSnapshot | null {
		return this.snapshots.get(key) ?? null;
	}

	set(snapshot: CalibrationSnapshot): void {
		this.snapshots.set(snapshot.key, snapshot);
	}
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.min(1, Math.max(0, value));
}

function normalizeWeights(weights: CalibratedWeightMap): CalibratedWeightMap {
	const sanitized = Object.fromEntries(
		Object.entries(weights).map(([key, value]) => [
			key,
			Math.max(0.001, value),
		]),
	);
	const total = Object.values(sanitized).reduce((sum, value) => sum + value, 0);

	return Object.fromEntries(
		Object.entries(sanitized).map(([key, value]) => [key, value / total]),
	);
}

export class AdaptiveCalibrationEngine {
	constructor(
		private readonly store: ICalibrationStore = new InMemoryCalibrationStore(),
		private readonly learningRate = 0.12,
	) {}

	getWeights(
		key: string,
		seedWeights: CalibratedWeightMap,
	): CalibratedWeightMap {
		const snapshot = this.store.get(key);
		return snapshot?.weights ?? normalizeWeights(seedWeights);
	}

	recordFeedback(
		key: string,
		seedWeights: CalibratedWeightMap,
		feedback: CalibrationFeedback,
	): CalibrationSnapshot {
		const current = this.getWeights(key, seedWeights);

		// Fix #5: Apply acceptance source discount before computing reward.
		// An API_SUCCESS alone (0.3×) contributes far less than a human review (1.0×).
		const acceptanceMultiplier =
			ACCEPTANCE_WEIGHT[feedback.acceptanceSource] ?? 0.3;
		const acceptanceSignal = (feedback.accepted ? 1 : 0) * acceptanceMultiplier;

		const reward =
			acceptanceSignal * 0.55 +
			clamp01(feedback.deterministicValidationScore) * 0.45 -
			Math.min(1, feedback.validationFailures * 0.25);

		const nextWeights = Object.fromEntries(
			Object.entries(current).map(([dimension, value]) => {
				const shouldBoostDeterminism =
					dimension.toLowerCase().includes("verification") ||
					dimension.toLowerCase().includes("accuracy") ||
					dimension.toLowerCase().includes("dependency");
				const direction = shouldBoostDeterminism ? reward - 0.5 : 0.5 - reward;
				return [dimension, value + this.learningRate * direction];
			}),
		);

		const previous = this.store.get(key);
		const snapshot: CalibrationSnapshot = {
			key,
			weights: normalizeWeights(nextWeights),
			sampleSize: (previous?.sampleSize ?? 0) + 1,
			updatedAt: Date.now(),
		};

		this.store.set(snapshot);
		return snapshot;
	}
}

/**
 * Process-global fallback singleton — uses InMemoryCalibrationStore.
 * For production multi-tenant use, replace this with TenantCalibrationFactory.getEngine(tenantId, db).
 * @see TenantCalibrationFactory
 */
export const adaptiveCalibrationEngine = new AdaptiveCalibrationEngine();
