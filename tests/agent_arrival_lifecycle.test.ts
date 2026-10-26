import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentArrivalManager } from "../apps/web/src/services/agentArrivalManager.js";
import { getAllAgentProfiles, getAgentProfile } from "../apps/web/src/services/agentRegistry.js";

test("AgentArrivalManager: begins with an empty active roster on new conversation", () => {
	const manager = new AgentArrivalManager();
	manager.setConversation("conv_new_1");

	assert.equal(manager.getRoster().length, 0, "Initial visible roster must be visually empty");
	assert.equal(manager.getConversationId(), "conv_new_1");

	// Verify agent definitions remain registered in base registry
	const baseProfiles = getAllAgentProfiles();
	assert.ok(baseProfiles.length >= 10, "Base agent definitions must remain intact");
	assert.ok(getAgentProfile("FactChecker").name.includes("Fact Checker"));
});

test("AgentArrivalManager: transitions sequentially through pop_in, holding, greeting, assigned, and working", async () => {
	const manager = new AgentArrivalManager({
		holdingDurationMs: 40,
		greetingDurationMs: 40,
		assignedDurationMs: 30,
	});

	manager.setConversation("conv_arrival_test");

	// 1. Activate FactChecker
	const agent = manager.activateAgent(
		"FactChecker",
		{ humanName: "Priya", avatarId: "priya", role: "Fact Checker" },
		"Inspect database schemas",
		"conv_arrival_test",
	);

	assert.equal(manager.getRoster().length, 1);
	assert.equal(agent.arrivalStage, "holding");
	assert.ok(agent.arrivalMessage?.includes("sec") || agent.arrivalMessage?.includes("second") || agent.arrivalMessage?.includes("joining") || agent.arrivalMessage?.includes("tight"));

	// 2. Wait for holding beat -> transitions to greeting ("Hey, I'm here.")
	await new Promise((r) => setTimeout(r, 55));
	let current = manager.getRoster()[0];
	assert.equal(current.arrivalStage, "greeting");
	assert.equal(current.arrivalMessage, "Hey, I’m here.");

	// 3. Wait for greeting beat -> transitions to assigned
	await new Promise((r) => setTimeout(r, 55));
	current = manager.getRoster()[0];
	assert.equal(current.arrivalStage, "assigned");
	assert.ok(current.arrivalMessage?.includes("Inspect database schemas"));

	// 4. Wait for assignment beat -> transitions to working
	await new Promise((r) => setTimeout(r, 45));
	current = manager.getRoster()[0];
	assert.equal(current.arrivalStage, "working");
	assert.equal(current.arrivalMessage, undefined);
	assert.equal(current.status, "analyzing");

	manager.clearTimers();
});

test("AgentArrivalManager: non-blocking independent arrival for multiple agents concurrently", async () => {
	const manager = new AgentArrivalManager({
		holdingDurationMs: 30,
		greetingDurationMs: 30,
		assignedDurationMs: 20,
	});

	manager.setConversation("conv_multi");

	// Activate FactChecker first
	manager.activateAgent("FactChecker", { humanName: "Priya" }, "Task A");

	// Activate CloudArchitect 15ms later
	await new Promise((r) => setTimeout(r, 15));
	manager.activateAgent("CloudArchitect", { humanName: "Marcus" }, "Task B");

	const roster = manager.getRoster();
	assert.equal(roster.length, 2, "Both agents present in active roster");

	// Wait 25ms: FactChecker should have transitioned to greeting, while CloudArchitect is still holding
	await new Promise((r) => setTimeout(r, 25));
	const fc = manager.getRoster().find((a) => a.id === "FactChecker");
	const ca = manager.getRoster().find((a) => a.id === "CloudArchitect");

	assert.equal(fc?.arrivalStage, "greeting");
	assert.equal(ca?.arrivalStage, "holding");

	manager.clearTimers();
});

test("AgentArrivalManager: substantive backend event immediately supersedes arrival without blocking real work", async () => {
	const manager = new AgentArrivalManager({
		holdingDurationMs: 200,
		greetingDurationMs: 200,
	});

	manager.setConversation("conv_fast_work");

	// Agent activates
	manager.activateAgent("Synthesizer", { humanName: "Val" }, "Evaluate consensus");
	assert.equal(manager.getRoster()[0].arrivalStage, "holding");

	// Real work event arrives immediately from backend (e.g. substantive proposal or analysis)
	manager.updateWorkflowStatus("Synthesizer", "completed", 0.92, undefined, "conv_fast_work");

	const current = manager.getRoster()[0];
	assert.equal(current.arrivalStage, "working", "Substantive backend event must immediately advance to working");
	assert.equal(current.status, "completed");
	assert.equal(current.confidence, 0.92);

	// Ensure timer won't later regress status back to greeting
	await new Promise((r) => setTimeout(r, 250));
	const checkLater = manager.getRoster()[0];
	assert.equal(checkLater.arrivalStage, "working");
	assert.equal(checkLater.status, "completed");

	manager.clearTimers();
});

test("AgentArrivalManager: prevents duplicate arrivals and guards against stale conversation events", () => {
	const manager = new AgentArrivalManager({ holdingDurationMs: 50 });
	manager.setConversation("conv_current");

	// 1. Activation in current conversation succeeds
	manager.activateAgent("FactChecker", { humanName: "Priya" }, "Task 1", "conv_current");
	assert.equal(manager.getRoster().length, 1);

	// 2. Duplicate activation does not create duplicate entries
	manager.activateAgent("FactChecker", { humanName: "Priya" }, "Task 1", "conv_current");
	assert.equal(manager.getRoster().length, 1);

	// 3. Stale event from old conversation is safely ignored
	manager.activateAgent("RivalChallenger", { humanName: "Arturo" }, "Stale Task", "conv_old_stale");
	assert.equal(manager.getRoster().length, 1, "Stale conversation event must be ignored");
	assert.equal(manager.getRoster().some((a) => a.id === "RivalChallenger"), false);

	// 4. Resetting conversation empties the visible roster
	manager.clearRoster();
	assert.equal(manager.getRoster().length, 0, "Cleared roster must be empty");

	manager.clearTimers();
});
