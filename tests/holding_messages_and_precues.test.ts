import { test } from "node:test";
import assert from "node:assert/strict";
import { runDebate } from "../apps/gateway/src/debateRunner.js";

test("Backend Pre-Cues: runDebate emits agent_pre_cue events with correlation IDs", async () => {
	const emittedEvents: any[] = [];
	const sink = (ev: any) => {
		emittedEvents.push(ev);
	};

	const convId = "conv_test_precue_123";

	// Run in sample mode
	await runDebate({
		mode: "sample",
		scenarioPath: "input_examples/01-fragmented-intelligence.json",
		topicOverride: "Reconcile conflicting records across ERP and Logistics API",
		eventSink: sink,
		conversationId: convId,
	});

	// Find agent_pre_cue events
	const preCueEvents = emittedEvents.filter((e) => e.type === "agent_pre_cue");

	assert.ok(preCueEvents.length >= 2, `Expected at least 2 agent_pre_cue events, got ${preCueEvents.length}`);

	// Validate correlation identifiers on pre-cues
	for (const cue of preCueEvents) {
		assert.ok(cue.cueId, "Pre-cue must have a unique cueId");
		assert.ok(cue.runId, "Pre-cue must correlate with runId");
		assert.equal(cue.conversationId, convId, "Pre-cue must correlate with conversationId");
		assert.ok(cue.targetAgent, "Pre-cue must designate a target agent");
		assert.ok(cue.taskType, "Pre-cue must define taskType");
		assert.ok(cue.sequence > 0, "Pre-cue must have sequence number");
		assert.ok(cue.hint, "Pre-cue must contain actionable hint");
	}

	// Verify pre-cue target agents match actual council participants
	const targetAgents = preCueEvents.map((e) => e.targetAgent);
	assert.ok(targetAgents.includes("FactChecker"), "Should pre-cue FactChecker for schema validation");
	assert.ok(targetAgents.includes("RivalChallenger"), "Should pre-cue RivalChallenger for adversarial review");
	assert.ok(targetAgents.includes("Synthesizer"), "Should pre-cue Synthesizer for consensus preparation");

	// Pre-cues must NOT be treated as substantive messages
	const substantiveMessages = emittedEvents.filter((e) => e.type === "message");
	for (const m of substantiveMessages) {
		assert.notEqual(m.message?.type, "agent_pre_cue");
	}
});

test("Holding Message State Logic: displays after delay and supersedes when substantive content arrives", async () => {
	let holdingMessage: string | null = null;
	let timerRef: any = null;

	const startHoldingWatchdog = (delayMs = 50) => {
		if (timerRef) clearTimeout(timerRef);
		timerRef = setTimeout(() => {
			holdingMessage = "I’m still checking the evidence across federated databases and external sources.";
		}, delayMs);
	};

	const clearHoldingWatchdog = () => {
		if (timerRef) {
			clearTimeout(timerRef);
			timerRef = null;
		}
		holdingMessage = null;
	};

	// 1. If response is fast (under delay threshold), holding message is never set
	startHoldingWatchdog(50);
	clearHoldingWatchdog(); // fast response arrives
	assert.equal(holdingMessage, null, "Fast response must not display holding message");

	// 2. If response takes time, holding message activates
	startHoldingWatchdog(20);
	await new Promise((r) => setTimeout(r, 40));
	assert.ok(holdingMessage !== null, "Meaningful delay displays short professional status");
	assert.ok(holdingMessage.includes("checking the evidence"));

	// 3. Substantive content arrives -> immediately clears holding message
	clearHoldingWatchdog();
	assert.equal(holdingMessage, null, "Holding message cleared immediately when content arrives");
});
