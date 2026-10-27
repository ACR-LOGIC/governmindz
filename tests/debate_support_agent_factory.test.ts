import assert from "node:assert/strict";
import { test } from "node:test";
import type { ILLMClient } from "@governmindz/core/debate/AgentSeat";
import { RivalChallenger } from "@governmindz/core/memory/RivalChallenger";
import { ThinkerAgent } from "@governmindz/core/memory/ThinkerAgent";
import { DebateSupportAgentFactory } from "../apps/gateway/src/services/DebateSupportAgentFactory.js";

const client: ILLMClient = {
	complete: async () => ({ content: "{}", confidence: 0.9 }),
};

test("DebateSupportAgentFactory builds sample clients with deterministic responses", async () => {
	let rivalClient: ILLMClient | undefined;
	let thinkerClient: ILLMClient | undefined;
	const factory = new DebateSupportAgentFactory({
		createMeterlessClient: () => client,
		createRivalChallenger: (value) => {
			rivalClient = value;
			return new RivalChallenger(value);
		},
		createThinkerAgent: (value) => {
			thinkerClient = value;
			return new ThinkerAgent(value);
		},
	});

	const agents = factory.create({ mode: "sample", topic: "governance", provider: null, delayMs: 0 });
	assert.ok(agents.rivalChallenger);
	assert.ok(agents.thinkerAgent);
	assert.equal((await rivalClient!.complete("", "This is a conflict")).confidence, 0.85);
	assert.match((await thinkerClient!.complete("", "")).content, /retention boundaries/);
});

test("DebateSupportAgentFactory uses one injected live client for both agents", () => {
	let created = 0;
	let liveClient: ILLMClient | undefined;
	const factory = new DebateSupportAgentFactory({
		createMeterlessClient: () => {
			created += 1;
			return client;
		},
		createRivalChallenger: (value) => {
			liveClient = value;
			return new RivalChallenger(value);
		},
		createThinkerAgent: (value) => {
			assert.equal(value, liveClient);
			return new ThinkerAgent(value);
		},
	});

	factory.create({ mode: "live", topic: "governance", provider: {} as never, model: "model-a", delayMs: 0 });
	assert.equal(created, 1);
});

test("DebateSupportAgentFactory rejects live construction without a provider", () => {
	const factory = new DebateSupportAgentFactory({
		createMeterlessClient: () => client,
		createRivalChallenger: (value) => new RivalChallenger(value),
		createThinkerAgent: (value) => new ThinkerAgent(value),
	});

	assert.throws(
		() => factory.create({ mode: "live", topic: "governance", provider: null, delayMs: 0 }),
		/Meterless provider is required outside sample mode\./,
	);
});
