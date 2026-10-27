import assert from "node:assert/strict";
import { test } from "node:test";

test("runDebate sample mode returns a complete deterministic workflow without live providers", async () => {
	const previousNodeEnv = process.env.NODE_ENV;
	const previousCrewTimeout = process.env.CREW_TIMEOUT_MS;
	process.env.NODE_ENV = "test";
	// Keep this regression test bounded while still exercising both research crews.
	process.env.CREW_TIMEOUT_MS = "5000";

	try {
		const { runDebate } = await import("../apps/gateway/src/debateRunner.js");
		const events: Record<string, unknown>[] = [];

		const output = await runDebate({
			mode: "sample",
			scenarioPath: "input_examples/01-regulatory-risk.json",
			eventSink: (event) => events.push(event),
		});

		assert.equal(output.mode, "sample");
		assert.equal(output.scenarioId, "regulatory-risk");
		assert.equal(output.zetaris.isSynthetic, true);
		assert.equal(output.zetaris.evidenceSource, "sample_scenario");
		assert.equal(output.auditIntegrity, true);
		assert.equal(output.result.halted, false);
		assert.ok(output.result.transcript.length > 0);

		const eventTypes = events.map((event) => event.type);
		assert.ok(eventTypes.includes("deliverable_contract"));
		assert.ok(eventTypes.includes("crew:created"));
		assert.ok(eventTypes.includes("agent_pre_cue"));
		assert.ok(eventTypes.includes("zetaris"));
		assert.equal(eventTypes.at(-1), "complete");

		const completion = events.at(-1);
		assert.equal((completion?.result as { session_id: string }).session_id, output.result.session_id);
		assert.equal(completion?.auditIntegrity, true);
	} finally {
		if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = previousNodeEnv;
		if (previousCrewTimeout === undefined) delete process.env.CREW_TIMEOUT_MS;
		else process.env.CREW_TIMEOUT_MS = previousCrewTimeout;
	}
});
