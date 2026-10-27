import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ZetarisEvidencePreparationService,
	type ZetarisEvidenceResult,
} from "../apps/gateway/src/services/ZetarisEvidencePreparationService.js";

const result: ZetarisEvidenceResult = {
	columns: ["database"],
	rows: [["finance_demo"]],
	total: 1,
};

function createService(retrieved: string | undefined = undefined) {
	const memoryQueries: Array<{ topic: string; topN: number }> = [];
	const service = new ZetarisEvidencePreparationService({
		formatResult: (value) => `formatted:${value.rows.length}`,
		retrieveMemory: (topic, topN) => {
			memoryQueries.push({ topic, topN });
			return retrieved ? { context: retrieved } : null;
		},
	});
	return { service, memoryQueries };
}

test("ZetarisEvidencePreparationService adds the sample prefix and emits the event", () => {
	const { service, memoryQueries } = createService("should not be used");
	const events: Record<string, unknown>[] = [];

	const output = service.prepare({
		mode: "sample",
		topic: "governance",
		query: "SHOW DATABASES",
		result,
		eventSink: (event) => events.push(event),
	});

	assert.equal(output.evidenceContext, "[Demo Scenario: deterministic sample dataset — not live Zetaris data]\nformatted:1");
	assert.deepEqual(memoryQueries, []);
	assert.deepEqual(events[0], {
		type: "zetaris",
		query: "SHOW DATABASES",
		columns: ["database"],
		rows: [["finance_demo"]],
		total: 1,
		circuitBreakerState: undefined,
		isSynthetic: undefined,
		evidenceSource: undefined,
		fallbackReason: undefined,
	});
});

test("ZetarisEvidencePreparationService includes live memory context", () => {
	const { service, memoryQueries } = createService("prior governance context");

	const output = service.prepare({ mode: "live", topic: "audit policy", query: "SHOW", result });

	assert.equal(output.evidenceContext, "formatted:1\n\nprior governance context");
	assert.deepEqual(memoryQueries, [{ topic: "audit policy", topN: 5 }]);
});

test("ZetarisEvidencePreparationService preserves synthetic live metadata", () => {
	const { service } = createService();
	const syntheticResult = {
		...result,
		isSynthetic: true,
		circuitBreakerState: "OPEN",
		evidenceSource: "fallback",
	};

	const output = service.prepare({ mode: "live", topic: "audit", query: "SHOW", result: syntheticResult });

	assert.equal(output.evidenceContext, "[Circuit Breaker: OPEN] [Evidence Source: fallback]\nformatted:1");
});
