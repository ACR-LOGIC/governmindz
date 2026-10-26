import { test } from "node:test";
import assert from "node:assert/strict";
import { runDebate } from "../apps/gateway/src/debateRunner.js";

(test as any)("Conversational Bypass: simple greeting does not launch research crews or forced multi-round debate", { skip: true }, async () => {
	const emittedEvents: any[] = [];
	const sink = (ev: any) => {
		emittedEvents.push(ev);
	};

	const out = await runDebate({
		mode: "sample",
		topicOverride: "Hello, good morning!",
		eventSink: sink,
		conversationId: "conv_greeting_123",
	});

	// Should not emit crew:created or crew_start
	const crewEvents = emittedEvents.filter((e) => e.type === "crew:created" || e.type === "crew_start");
	assert.equal(crewEvents.length, 0, "Simple greeting must NOT activate research crews");

	// Should emit a conversational message from Supervisor / Orchestrator
	const messages = emittedEvents.filter((e) => e.type === "message");
	assert.ok(messages.length >= 1, "Must emit a conversational response");
	assert.ok(messages[0].message?.content.includes("GovernMindz"));

	// Should complete gracefully with consensusReached
	assert.equal(out.result.consensusReached, true);
	assert.equal(out.result.rounds, 0, "No debate rounds forced for basic greeting");
});

(test as any)("Research Inquiry: governance question activates research crews and agent assignments", { skip: true }, async () => {
	const emittedEvents: any[] = [];
	const sink = (ev: any) => {
		emittedEvents.push(ev);
	};

	const out = await runDebate({
		mode: "sample",
		scenarioPath: "input_examples/01-fragmented-intelligence.json",
		topicOverride: "Assess compliance risk across SEC and GLEIF databases in Zetaris.",
		eventSink: sink,
		conversationId: "conv_research_123",
	});

	// Must activate research crews
	const crewEvents = emittedEvents.filter((e) => e.type === "crew:created" || e.type === "crew_start");
	assert.ok(crewEvents.length >= 2, "Research question must activate Data and Web crews");

	// Must assign tasks to council members
	const taskEvents = emittedEvents.filter((e) => e.type === "agent_task_assigned");
	assert.ok(taskEvents.length >= 4, "Must emit agent_task_assigned events for council and crews");

	// Council members have concise acknowledgment text
	const factCheckerTask = taskEvents.find((e) => e.agentId === "FactChecker");
	assert.ok(factCheckerTask, "FactChecker must have task assigned");
	assert.ok(factCheckerTask.acknowledgment, "FactChecker must have concise acknowledgment text");

	assert.equal(out.result.consensusReached, true);
});
