import { test } from "node:test";
import assert from "node:assert/strict";
import {
	runCrewSafely,
	emptyDataCrewReport,
	emptyWebCrewReport,
} from "../apps/gateway/src/crewResilience.js";

test("runCrewSafely: healthy crew passes its report through with no failure events", async () => {
	const events: any[] = [];
	const out = await runCrewSafely("DataCrew", async () => "ok-report", () => "empty", (e) => events.push(e), "run1");
	assert.equal(out.failed, false);
	assert.equal(out.report, "ok-report");
	assert.equal(events.length, 0);
});

test("runCrewSafely: failed crew is disclosed, never counted as success, and does not throw", async () => {
	const events: any[] = [];
	const out = await runCrewSafely(
		"WebSearchCrew",
		async () => {
			throw new Error("search connector unavailable");
		},
		(e) => emptyWebCrewReport("run1", "topic", e),
		(e) => events.push(e),
		"run1",
	);
	assert.equal(out.failed, true);
	assert.equal(out.report.findings.length, 0);
	assert.equal(out.report.totalCitationsFound, 0);
	assert.match(out.report.summary, /No external sources were reviewed/);
	assert.ok(events.some((e) => e.type === "crew_failed" && /unavailable/.test(e.error)));
	const complete = events.find((e) => e.type === "crew_complete");
	assert.equal(complete.failed, true, "terminal event must be flagged failed so the barrier releases");
	assert.match(complete.summary, /NOT included/);
});

test("runCrewSafely: slow crew hits the timeout and is reported as failed", async () => {
	const events: any[] = [];
	const out = await runCrewSafely(
		"DataCrew",
		() => new Promise<string>((r) => setTimeout(() => r("late"), 500)),
		(e) => emptyDataCrewReport("run1", "sample", e),
		(e) => events.push(e),
		"run1",
		30,
	);
	assert.equal(out.failed, true);
	assert.match(out.error!, /timed out/);
	assert.equal(out.report.findings.length, 0);
});

test("runCrewSafely: one crew failing does not block the other (partial completion)", async () => {
	const events: any[] = [];
	const [a, b] = await Promise.all([
		runCrewSafely("DataCrew", async () => "data-ok", () => "x", (e) => events.push(e), "r"),
		runCrewSafely(
			"WebSearchCrew",
			async () => {
				throw new Error("boom");
			},
			() => "web-empty",
			(e) => events.push(e),
			"r",
		),
	]);
	assert.equal(a.failed, false);
	assert.equal(a.report, "data-ok");
	assert.equal(b.failed, true);
	assert.equal(b.report, "web-empty");
});
