import assert from "node:assert/strict";
import { test } from "node:test";
import type { ILLMClient } from "@governmindz/core/debate/AgentSeat";
import type { SampleScenario } from "../apps/gateway/src/sampleScenario.js";
import { DebateSeatFactory } from "../apps/gateway/src/services/DebateSeatFactory.js";

const client: ILLMClient = {
	complete: async () => ({ content: "{}", confidence: 0.9 }),
};

const scenario: SampleScenario = {
	id: "sample",
	topic: "governance",
	zetaris: { query: "SHOW DATABASES", columns: [], rows: [] },
	seats: {
		FactChecker: [{ position: "fact", confidence_self: 0.9 }],
		CloudArchitect: [{ position: "cloud", confidence_self: 0.9 }],
		Synthesizer: [{ position: "synthesis", confidence_self: 0.9 }],
	},
};

test("DebateSeatFactory creates sample seats with injected prompts and clients", () => {
	const prompts: string[] = [];
	const sampleClients: Array<{ seatId: string; delayMs: number }> = [];
	const factory = new DebateSeatFactory({
		loadPrompt: (name) => {
			prompts.push(name);
			return `${name} prompt`;
		},
		createSampleClient: (seatId, _replies, delayMs) => {
			sampleClients.push({ seatId, delayMs });
			return client;
		},
		createMeterlessClient: () => client,
	});

	const seats = factory.create({ provider: null, scenario, sampleDelayMs: 0 });

	assert.deepEqual(seats.map((seat) => seat.seatId), ["FactChecker", "CloudArchitect", "Synthesizer"]);
	assert.deepEqual(prompts, ["fact_checker", "architect", "synthesizer"]);
	assert.deepEqual(sampleClients, [
		{ seatId: "FactChecker", delayMs: 0 },
		{ seatId: "CloudArchitect", delayMs: 0 },
		{ seatId: "Synthesizer", delayMs: 0 },
	]);
});

test("DebateSeatFactory creates live seats through the injected provider client factory", () => {
	const models: Array<string | undefined> = [];
	const factory = new DebateSeatFactory({
		loadPrompt: () => "prompt",
		createSampleClient: () => client,
		createMeterlessClient: (_provider, model) => {
			models.push(model);
			return client;
		},
	});

	const seats = factory.create({ provider: {} as never, seatModel: "model-a", sampleDelayMs: 0 });

	assert.equal(seats.length, 3);
	assert.deepEqual(models, ["model-a", "model-a", "model-a"]);
});

test("DebateSeatFactory rejects live construction without a provider", () => {
	const factory = new DebateSeatFactory({
		loadPrompt: () => "prompt",
		createSampleClient: () => client,
		createMeterlessClient: () => client,
	});

	assert.throws(
		() => factory.create({ provider: null, sampleDelayMs: 0 }),
		/Meterless provider is required outside sample mode\./,
	);
});
