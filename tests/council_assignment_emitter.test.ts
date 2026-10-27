import assert from "node:assert/strict";
import { test } from "node:test";
import { emitCouncilAssignments } from "../apps/gateway/src/application/CouncilAssignmentEmitter.js";

test("emitCouncilAssignments emits the five assignments in workflow order", () => {
	const events: Record<string, unknown>[] = [];
	emitCouncilAssignments((event) => events.push(event));

	assert.deepEqual(
		events.map((event) => event.agentId),
		["FactChecker", "CloudArchitect", "Synthesizer", "RivalChallenger", "Thinker"],
	);
	assert.ok(events.every((event) => event.type === "agent_task_assigned"));
	assert.ok(events.every((event) => typeof event.timestamp === "number"));
});

test("emitCouncilAssignments preserves assignment payloads and task id format", () => {
	const events: Record<string, unknown>[] = [];
	emitCouncilAssignments((event) => events.push(event));

	assert.equal(events[0].role, "Fact Checker");
	assert.equal(events[0].task, "Inspect database schemas, primary keys, and catalog definitions across Zetaris.");
	assert.equal(events[0].acknowledgment, "On it. Let me check the database schemas and records.");
	assert.match(String(events[0].taskId), /^task_FactChecker_[0-9a-f-]+$/);
});

test("emitCouncilAssignments does not require an event sink", () => {
	assert.doesNotThrow(() => emitCouncilAssignments());
});
