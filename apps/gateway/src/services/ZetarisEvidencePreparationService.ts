export type ZetarisEvidenceEventSink = (event: Record<string, unknown>) => void;

import type { ZetarisQueryResult } from "@governmindz/core/integrations/zetarisClient";

export interface ZetarisEvidenceResult extends ZetarisQueryResult {
	circuitBreakerState?: string;
	isSynthetic?: boolean;
	evidenceSource?: string;
	fallbackReason?: string;
}

export interface ZetarisEvidenceMemory {
	context?: string;
}

export interface ZetarisEvidencePreparationDependencies {
	formatResult(result: ZetarisEvidenceResult, maxRows: number): string;
	retrieveMemory(topic: string, topN: number): ZetarisEvidenceMemory | null;
}

export interface ZetarisEvidencePreparationOptions {
	mode: "sample" | "live";
	topic: string;
	query: string;
	result: ZetarisEvidenceResult;
	eventSink?: ZetarisEvidenceEventSink;
}

export interface ZetarisEvidencePreparationResult {
	evidenceContext: string;
}

export class ZetarisEvidencePreparationService {
	constructor(private readonly dependencies: ZetarisEvidencePreparationDependencies) {}

	prepare(options: ZetarisEvidencePreparationOptions): ZetarisEvidencePreparationResult {
		let zetarisContext = this.dependencies.formatResult(options.result, 50);
		if (options.mode === "sample") {
			zetarisContext = `[Demo Scenario: deterministic sample dataset — not live Zetaris data]\n${zetarisContext}`;
		} else if (options.result.isSynthetic) {
			zetarisContext = `[Circuit Breaker: ${options.result.circuitBreakerState ?? "OPEN"}] [Evidence Source: ${options.result.evidenceSource ?? "synthetic_fallback"}]\n${zetarisContext}`;
		}

		const memoryRetrieved = options.mode === "sample" ? null : this.dependencies.retrieveMemory(options.topic, 5);
		const evidenceContext = memoryRetrieved?.context
			? `${zetarisContext}\n\n${memoryRetrieved.context}`
			: zetarisContext;

		options.eventSink?.({
			type: "zetaris",
			query: options.query,
			columns: options.result.columns,
			rows: options.result.rows,
			total: options.result.total ?? options.result.rows.length,
			circuitBreakerState: options.result.circuitBreakerState,
			isSynthetic: options.result.isSynthetic,
			evidenceSource: options.result.evidenceSource,
			fallbackReason: options.result.fallbackReason,
		});

		return { evidenceContext };
	}
}
