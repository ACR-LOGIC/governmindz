
/**
 * GravityFormula — role-based gravity weighting for the GOVERNMINDZ debate baseline.
 *
 * Provides the orbital-zone weight, the core gravity value, per-role decay
 * multipliers, and a role-decay applicator. Recreated fresh for baseline
 * extraction; the proprietary history of this formula is not carried over.
 */

export type Role = "RESEARCHER" | "FACT_CHECKER" | "SYNTHESIZER";

/**
 * Gravity signals used across coordination, receipts, and the policy gate.
 */
export type GravitySignals = {
	urgency: number;
	dependencyWeight: number;
	relevance: number;
	confidence: number;
};

/**
 * Calculates the weight for a specific orbital zone based on status.
 */
export function getOrbitalZoneWeight(status: string = "inbox"): number {
	return status.toLowerCase() === "now" ? 1.5 : 1.0;
}

/**
 * Core Gravity Value formula.
 */
export function calculateGravityValue(
	basePriority: number,
	orbitalZoneWeight: number,
): number {
	return basePriority * orbitalZoneWeight;
}

/**
 * Subtask decay multipliers for specialized roles.
 */
export const DECAY_MULTIPLIERS: Record<Role, number> = {
	RESEARCHER: 1.0,
	FACT_CHECKER: 0.9,
	SYNTHESIZER: 0.85,
} as const;

/**
 * Applies a role-specific decay to a gravity value.
 */
export function applyRoleDecay(
	baseGravity: number,
	role: Role,
): number {
	return baseGravity * DECAY_MULTIPLIERS[role];
}
