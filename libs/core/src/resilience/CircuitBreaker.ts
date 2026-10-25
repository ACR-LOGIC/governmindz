/**
 * CircuitBreaker.ts
 *
 * Implements Requirement R2 (F15): Fault-tolerant circuit breaker with 3 states:
 * CLOSED (normal live execution), OPEN (tripped, fast-failover to fallback),
 * and HALF_OPEN (canary probe trial).
 *
 * Emits state transition events to AuditTrailEmitter when available.
 */

import { auditTrail } from "../engine/AuditTrailEmitter.js";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
	name?: string;
	failureThreshold?: number; // default: 3
	resetTimeoutMs?: number; // default: 15_000ms
	halfOpenSuccessThreshold?: number; // default: 1
	probeTimeoutMs?: number; // default: 3_000ms
	onStateChange?: (transition: CircuitBreakerTransition) => void;
}

export interface CircuitBreakerTransition {
	circuitName: string;
	fromState: CircuitState;
	toState: CircuitState;
	timestamp: number;
	reason: string;
	consecutiveFailures: number;
	lastError?: string;
}

export interface CircuitBreakerStats {
	name: string;
	state: CircuitState;
	consecutiveFailures: number;
	consecutiveSuccesses: number;
	stateChangedAt: number;
	totalExecutions: number;
	totalSuccesses: number;
	totalFailures: number;
	totalFallbacks: number;
}

export class CircuitBreaker {
	readonly name: string;
	private state: CircuitState = "CLOSED";
	private failureThreshold: number;
	private resetTimeoutMs: number;
	private halfOpenSuccessThreshold: number;
	private probeTimeoutMs: number;
	private onStateChange?: (transition: CircuitBreakerTransition) => void;

	private consecutiveFailures = 0;
	private probeSuccesses = 0;
	private stateChangedAt: number = Date.now();

	private totalExecutions = 0;
	private totalSuccesses = 0;
	private totalFailures = 0;
	private totalFallbacks = 0;

	constructor(config: CircuitBreakerConfig = {}) {
		this.name = config.name ?? "ZetarisCircuitBreaker";
		this.failureThreshold = Math.max(1, config.failureThreshold ?? 3);
		this.resetTimeoutMs = Math.max(1, config.resetTimeoutMs ?? 15_000);
		this.halfOpenSuccessThreshold = Math.max(1, config.halfOpenSuccessThreshold ?? 1);
		this.probeTimeoutMs = Math.max(1, config.probeTimeoutMs ?? 3_000);
		this.onStateChange = config.onStateChange;
	}

	getState(): CircuitState {
		this.evaluateStateExpiry();
		return this.state;
	}

	isOpen(): boolean {
		return this.getState() === "OPEN";
	}

	isHalfOpen(): boolean {
		return this.getState() === "HALF_OPEN";
	}

	isClosed(): boolean {
		return this.getState() === "CLOSED";
	}

	/**
	 * Force-trip the circuit breaker into OPEN state (for testing or manual governance overrides).
	 */
	trip(reason = "Manual override / administrative trip"): void {
		if (this.state !== "OPEN") {
			this.transitionTo("OPEN", reason);
		}
	}

	/**
	 * Reset the circuit breaker to CLOSED state.
	 */
	reset(reason = "Manual reset"): void {
		this.consecutiveFailures = 0;
		this.probeSuccesses = 0;
		if (this.state !== "CLOSED") {
			this.transitionTo("CLOSED", reason);
		}
	}

	getStats(): CircuitBreakerStats {
		return {
			name: this.name,
			state: this.getState(),
			consecutiveFailures: this.consecutiveFailures,
			consecutiveSuccesses: this.probeSuccesses,
			stateChangedAt: this.stateChangedAt,
			totalExecutions: this.totalExecutions,
			totalSuccesses: this.totalSuccesses,
			totalFailures: this.totalFailures,
			totalFallbacks: this.totalFallbacks,
		};
	}

	private evaluateStateExpiry(): void {
		if (this.state === "OPEN") {
			const elapsed = Date.now() - this.stateChangedAt;
			if (elapsed >= this.resetTimeoutMs) {
				this.transitionTo(
					"HALF_OPEN",
					`Reset timeout of ${this.resetTimeoutMs}ms elapsed in OPEN state; entering probe mode.`,
				);
			}
		}
	}

	private transitionTo(nextState: CircuitState, reason: string, lastError?: string): void {
		const prevState = this.state;
		if (prevState === nextState) return;

		this.state = nextState;
		this.stateChangedAt = Date.now();

		if (nextState === "HALF_OPEN") {
			this.probeSuccesses = 0;
		} else if (nextState === "CLOSED") {
			this.consecutiveFailures = 0;
			this.probeSuccesses = 0;
		}

		const transition: CircuitBreakerTransition = {
			circuitName: this.name,
			fromState: prevState,
			toState: nextState,
			timestamp: this.stateChangedAt,
			reason,
			consecutiveFailures: this.consecutiveFailures,
			lastError,
		};

		// 1. Invoke user listener if supplied
		try {
			this.onStateChange?.(transition);
		} catch {
			// ignore listener errors
		}

		// 2. Emit transition to cryptographic AuditTrailEmitter
		try {
			auditTrail.emitEvent({
				event_type: "governance_recalibration",
				session_id: "resilience-circuit-breaker",
				timestamp: transition.timestamp,
				payload: {
					workflow_event: "circuit_breaker_transition",
					circuit_name: transition.circuitName,
					from_state: transition.fromState,
					to_state: transition.toState,
					reason: transition.reason,
					consecutive_failures: transition.consecutiveFailures,
					last_error: transition.lastError,
				},
			});
		} catch {
			// In isolated test environments without audit secret, silently degrade
		}
	}

	/**
	 * Execute an action protected by the circuit breaker.
	 * If the circuit is OPEN, immediately executes the fallback (or throws).
	 * If the circuit is CLOSED or HALF_OPEN, attempts the action; on failure,
	 * increments failure counts and delegates to fallback.
	 */
	async execute<T>(
		action: () => Promise<T>,
		fallback?: (error: Error) => Promise<T> | T,
	): Promise<T> {
		this.totalExecutions++;
		this.evaluateStateExpiry();

		if (this.state === "OPEN") {
			this.totalFallbacks++;
			const err = new Error(
				`Circuit breaker '${this.name}' is OPEN. Fast-failover to fallback.`,
			);
			if (fallback) {
				return await fallback(err);
			}
			throw err;
		}

		// Circuit is CLOSED or HALF_OPEN
		try {
			const result = await action();
			this.onActionSuccess();
			return result;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.onActionFailure(err);

			if (fallback) {
				this.totalFallbacks++;
				return await fallback(err);
			}
			throw err;
		}
	}

	private onActionSuccess(): void {
		this.totalSuccesses++;
		if (this.state === "HALF_OPEN") {
			this.probeSuccesses++;
			if (this.probeSuccesses >= this.halfOpenSuccessThreshold) {
				this.transitionTo(
					"CLOSED",
					`Probe succeeded (${this.probeSuccesses}/${this.halfOpenSuccessThreshold}); circuit recovered.`,
				);
			}
		} else if (this.state === "CLOSED") {
			this.consecutiveFailures = 0;
		}
	}

	private onActionFailure(err: Error): void {
		this.totalFailures++;
		this.consecutiveFailures++;

		if (this.state === "HALF_OPEN") {
			this.transitionTo(
				"OPEN",
				`Probe failed in HALF_OPEN: ${err.message}. Tripping back to OPEN.`,
				err.message,
			);
		} else if (this.state === "CLOSED") {
			if (this.consecutiveFailures >= this.failureThreshold) {
				this.transitionTo(
					"OPEN",
					`Failure threshold reached (${this.consecutiveFailures}/${this.failureThreshold}): ${err.message}. Tripping to OPEN.`,
					err.message,
				);
			}
		}
	}
}
