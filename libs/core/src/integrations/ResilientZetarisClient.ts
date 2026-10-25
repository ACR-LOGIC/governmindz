/**
 * ResilientZetarisClient.ts
 *
 * Implements Requirement R2 (F15, F16, F17):
 * Decorates ZetarisClient with the CircuitBreaker and ZetarisFallbackCatalog.
 *
 * When Zetaris is unreachable/offline or the circuit is OPEN, gracefully returns
 * fallback schema metadata and synthetic evidence with transparent status flags:
 * {
 *   isSynthetic: true,
 *   circuitBreakerState: "OPEN" | "HALF_OPEN",
 *   evidenceSource: "synthetic_fallback"
 * }
 */

import { CircuitBreaker, type CircuitBreakerConfig, type CircuitState } from "../resilience/CircuitBreaker.js";
import {
	ZetarisClient,
	type ZetarisConfig,
	type ZetarisQueryResult,
} from "./zetarisClient.js";
import {
	ZetarisFallbackCatalog,
	defaultZetarisFallbackCatalog,
} from "./ZetarisFallbackCatalog.js";

export interface ResilientQueryResult {
	columns: string[];
	rows: unknown[][];
	rowCount: number;
	total?: number;
	timeUsed?: number;
	executionTimeMs: number;
	circuitBreakerState: CircuitState;
	isSynthetic: boolean;
	evidenceSource: "live_zetaris" | "synthetic_fallback";
	fallbackReason?: string;
}

export interface ResilientZetarisClientOptions {
	clientConfig?: ZetarisConfig;
	circuitBreakerConfig?: CircuitBreakerConfig;
	fallbackCatalog?: ZetarisFallbackCatalog;
	underlyingClient?: ZetarisClient;
}

export class ResilientZetarisClient {
	private readonly client: ZetarisClient;
	private readonly breaker: CircuitBreaker;
	private readonly catalog: ZetarisFallbackCatalog;

	constructor(options: ResilientZetarisClientOptions = {}) {
		this.client =
			options.underlyingClient ?? new ZetarisClient(options.clientConfig ?? {});
		this.breaker = new CircuitBreaker(
			options.circuitBreakerConfig ?? {
				name: "ZetarisResilienceCircuitBreaker",
				failureThreshold: 3,
				resetTimeoutMs: 15_000,
				halfOpenSuccessThreshold: 1,
				probeTimeoutMs: 3_000,
			},
		);
		this.catalog = options.fallbackCatalog ?? defaultZetarisFallbackCatalog;
	}

	getCircuitBreaker(): CircuitBreaker {
		return this.breaker;
	}

	getFallbackCatalog(): ZetarisFallbackCatalog {
		return this.catalog;
	}

	/**
	 * Reset the circuit breaker to CLOSED.
	 */
	reset(): void {
		this.breaker.reset();
	}

	/**
	 * Trip the circuit breaker to OPEN.
	 */
	trip(reason?: string): void {
		this.breaker.trip(reason);
	}

	async query(
		sql: string,
		options: { limit?: number; timeoutMs?: number } = {},
	): Promise<ResilientQueryResult> {
		const startTime = Date.now();

		return this.breaker.execute(
			// Primary Action: Attempt live Zetaris query
			async (): Promise<ResilientQueryResult> => {
				const raw: ZetarisQueryResult = await this.client.query(sql, options);
				const duration = Math.max(1, Date.now() - startTime);

				return {
					columns: raw.columns,
					rows: raw.rows,
					rowCount: raw.rows.length,
					total: raw.total ?? raw.rows.length,
					timeUsed: raw.timeUsed ?? duration,
					executionTimeMs: duration,
					circuitBreakerState: this.breaker.getState(),
					isSynthetic: false,
					evidenceSource: "live_zetaris",
				};
			},
			// Fallback Action: Resolve from authoritative fallback catalog
			async (error: Error): Promise<ResilientQueryResult> => {
				const duration = Math.max(1, Date.now() - startTime);
				const fallback = this.catalog.resolveQuery(sql, options.limit ?? 50);

				return {
					columns: fallback.columns,
					rows: fallback.rows,
					rowCount: fallback.rows.length,
					total: fallback.total,
					timeUsed: fallback.timeUsed,
					executionTimeMs: duration,
					circuitBreakerState: this.breaker.getState(),
					isSynthetic: true,
					evidenceSource: "synthetic_fallback",
					fallbackReason: error.message,
				};
			},
		);
	}

	async listDatabases(): Promise<ResilientQueryResult> {
		return this.query("SHOW LIGHTNING DATABASES");
	}
}

// Global shared resilient client instance
export const sharedResilientZetarisClient = new ResilientZetarisClient();
