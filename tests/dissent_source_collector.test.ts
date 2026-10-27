import assert from "node:assert/strict";
import { test } from "node:test";
import type { DebateResult } from "@governmindz/core/debate/DebateLoop";
import { collectDissentSources } from "../apps/gateway/src/application/DissentSourceCollector.js";

function transcriptWith(...structured: Array<Record<string, unknown>>): DebateResult["transcript"] {
	return structured.map((value) => ({
		fromSeat: "Synthesizer",
		toSeat: "all",
		type: "analysis" as const,
		content: "test",
		timestamp: 0,
		structured: value,
	})) as DebateResult["transcript"];
}

test("collectDissentSources supports both dissent field names", () => {
	assert.deepEqual(
		collectDissentSources(
			transcriptWith({ dissents_from: ["CloudArchitect"] }, { dissentsFrom: ["FactChecker"] }),
		),
		["CloudArchitect", "FactChecker"],
	);
});

test("collectDissentSources removes duplicate sources", () => {
	assert.deepEqual(
		collectDissentSources(
			transcriptWith({ dissents_from: ["Synthesizer", "FactChecker"] }, { dissentsFrom: ["FactChecker"] }),
		),
		["FactChecker", "Synthesizer"],
	);
});

test("collectDissentSources filters empty and missing values", () => {
	assert.deepEqual(
		collectDissentSources(transcriptWith({}, { dissents_from: ["", "CloudArchitect"] })),
		["CloudArchitect"],
	);
});

test("collectDissentSources returns sources in alphabetical order", () => {
	assert.deepEqual(
		collectDissentSources(transcriptWith({ dissentsFrom: ["Synthesizer", "CloudArchitect", "FactChecker"] })),
		["CloudArchitect", "FactChecker", "Synthesizer"],
	);
});
