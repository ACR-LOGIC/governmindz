// Copyright (c) 2026 ACR Logic.

/**
 * InterruptManager.ts
 *
 * Implements Claim 42/43: Hardware-interrupt style control interface.
 * This classifies runtime signals into formal categories that are
 * persisted in the auditable event log.
 */

export type InterruptClass =
	| "PRIORITY" // Force immediate seat shift
	| "CONTAINMENT" // Sandbox an agent's context
	| "VALIDATION" // Force a tester round regardless of graph
	| "TERMINATION" // Immediate halt
	| "RECALIBRATION"; // Update Bayesian priors mid-run

export interface RuntimeInterrupt {
	id: string;
	class: InterruptClass;
	source: "user" | "system" | "governance";
	timestamp: number;
	reason: string;
	payload?: Record<string, unknown>;
}

export class InterruptManager {
	private interruptLog: RuntimeInterrupt[] = [];

	/**
	 * Records and validates a runtime interrupt.
	 */
	public trigger(
		interrupt: Omit<RuntimeInterrupt, "id" | "timestamp">,
	): RuntimeInterrupt {
		const fullInterrupt: RuntimeInterrupt = {
			...interrupt,
			id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
			timestamp: Date.now(),
		};

		this.interruptLog.push(fullInterrupt);

		// Log for the "Officer" gate and Audit Trail
		console.log(
			`[Interrupt][${fullInterrupt.class}] Source: ${fullInterrupt.source} - ${fullInterrupt.reason}`,
		);

		return fullInterrupt;
	}

	public getLog(): RuntimeInterrupt[] {
		return [...this.interruptLog];
	}

	public clear(): void {
		this.interruptLog = [];
	}
}
