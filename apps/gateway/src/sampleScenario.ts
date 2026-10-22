// Copyright (c) 2026 ACR Logic.

import fs from "node:fs";
import path from "node:path";

export interface SampleReply {
	position: string;
	confidence_self: number;
	confidence_expert_agreement?: number;
	evidence?: string[];
	caveats?: string[];
	dissents_from?: string[];
	supports?: string[];
	raw_reasoning?: string;
}

export interface SampleScenario {
	id: string;
	topic: string;
	zetaris: {
		query: string;
		columns: string[];
		rows: unknown[][];
		total?: number;
	};
	seats: Record<string, SampleReply[]>;
}

export const DEFAULT_SAMPLE_SCENARIO =
	"input_examples/01-governance-readiness.json";

export function loadSampleScenario(
	file = process.env.SAMPLE_SCENARIO?.trim() || DEFAULT_SAMPLE_SCENARIO,
): { scenario: SampleScenario; filePath: string } {
	const filePath = path.resolve(process.cwd(), file);
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (error) {
		throw new Error(
			`Cannot read sample scenario ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const scenario = parsed as SampleScenario;
	if (
		!scenario.id ||
		!scenario.topic ||
		!scenario.zetaris?.columns ||
		!Array.isArray(scenario.zetaris.rows) ||
		!scenario.seats
	) {
		throw new Error(`Invalid sample scenario ${filePath}: missing id, topic, zetaris, or seats.`);
	}
	return { scenario, filePath };
}
