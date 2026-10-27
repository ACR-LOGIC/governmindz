import assert from "node:assert/strict";
import { test } from "node:test";
import type { DataCrewReport } from "@governmindz/core/agents/DataCrew";
import type { WebSearchCrewReport } from "@governmindz/core/agents/WebSearchCrew";
import {
	ResearchCrewRunner,
	type ResearchCrewRunnerDependencies,
} from "../apps/gateway/src/application/ResearchCrewRunner.js";
import {
	emptyDataCrewReport,
	emptyWebCrewReport,
	runCrewSafely,
} from "../apps/gateway/src/crewResilience.js";

const dataReport = {
	runId: "data-run",
	mode: "sample",
	findings: [],
	catalogDatabases: ["SEC_DATA"],
	queriesExecuted: [],
	anomaliesDetected: [],
	provenanceSummary: "sample provenance",
	overallConfidence: 0.9,
	isSyntheticFallback: true,
	summary: "data ready",
} satisfies DataCrewReport;

const webReport = {
	runId: "web-run",
	topic: "sample topic",
	findings: [],
	totalCitationsFound: 0,
	contradictionsFound: [],
	unresolvedGaps: [],
	overallConfidence: 0.9,
	summary: "web ready",
} satisfies WebSearchCrewReport;

function createRunner(
	dataRun: () => Promise<DataCrewReport>,
	webRun: () => Promise<WebSearchCrewReport>,
): ResearchCrewRunner {
	const dependencies: ResearchCrewRunnerDependencies = {
		createDataCrew: () => ({ run: dataRun }),
		createWebCrew: () => ({ run: webRun }),
		runCrewSafely,
		emptyDataCrewReport,
		emptyWebCrewReport,
	};
	return new ResearchCrewRunner(dependencies);
}

function options(mode: "sample" | "live" = "sample") {
	return {
		topic: "sample topic",
		mode,
		conversationId: "conversation-1",
		timeoutMs: 1000,
	};
}

test("ResearchCrewRunner starts both crews concurrently and preserves pre-cue order", async () => {
	const events: Record<string, unknown>[] = [];
	let started = 0;
	let releaseBoth!: () => void;
	const bothStarted = new Promise<void>((resolve) => {
		releaseBoth = resolve;
	});

	const run = async (report: DataCrewReport | WebSearchCrewReport) => {
		started += 1;
		if (started === 2) releaseBoth();
		await bothStarted;
		return report;
	};
	const runner = createRunner(
		() => run(dataReport) as Promise<DataCrewReport>,
		() => run(webReport) as Promise<WebSearchCrewReport>,
	);

	const result = await runner.run({ ...options(), eventSink: (event) => events.push(event) });

	assert.equal(started, 2);
	assert.equal(result.dataOutcome.failed, false);
	assert.equal(result.webOutcome.failed, false);
	assert.deepEqual(
		events.map((event) => event.type),
		[
			"crew:created",
			"crew:created",
			"agent_pre_cue",
			"crew:ready",
			"crew:ready",
			"agent_pre_cue",
			"agent_pre_cue",
		],
	);
	assert.deepEqual(
		events.filter((event) => event.type === "agent_pre_cue").map((event) => event.sequence),
		[1, 2, 3],
	);
});

test("ResearchCrewRunner preserves partial evidence when Web Search fails in sample mode", async () => {
	const events: Record<string, unknown>[] = [];
	const runner = createRunner(
		async () => dataReport,
		async () => {
			throw new Error("search unavailable");
		},
	);

	const result = await runner.run({ ...options(), eventSink: (event) => events.push(event) });

	assert.equal(result.dataOutcome.failed, false);
	assert.equal(result.webOutcome.failed, true);
	assert.equal(result.webCrewReport.totalCitationsFound, 0);
	assert.ok(events.some((event) => event.type === "crew_failed" && event.crew === "WebSearchCrew"));
	assert.ok(events.some((event) => event.type === "crew:failed" && event.crewId === "web-crew"));
});

test("ResearchCrewRunner degrades on Data Crew failure in sample mode", async () => {
	const runner = createRunner(
		async () => {
			throw new Error("catalog unavailable");
		},
		async () => webReport,
	);

	const result = await runner.run(options("sample"));

	assert.equal(result.dataOutcome.failed, true);
	assert.match(result.dataCrewReport.summary, /No database evidence was gathered/);
	assert.equal(result.webOutcome.failed, false);
});

test("ResearchCrewRunner preserves the live-mode Data Crew failure message", async () => {
	const runner = createRunner(
		async () => {
			throw new Error("catalog unavailable");
		},
		async () => webReport,
	);

	await assert.rejects(
		runner.run(options("live")),
		(error) =>
			error instanceof Error &&
			error.message ===
				"Live mode aborted: Zetaris Data Crew failed (catalog unavailable). No synthetic fallback is permitted in live mode.",
	);
});

test("ResearchCrewRunner preserves timeout failure metadata", async () => {
	const runner = createRunner(
		() => new Promise<DataCrewReport>(() => {}),
		async () => webReport,
	);

	const result = await runner.run({ ...options(), timeoutMs: 10 });

	assert.equal(result.dataOutcome.failed, true);
	assert.equal(result.dataOutcome.timedOut, true);
	assert.match(result.dataOutcome.error ?? "", /DataCrew timed out after 10ms/);
});
