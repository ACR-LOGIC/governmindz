import { test } from "node:test";
import assert from "node:assert/strict";
import { CrewBarrierManager } from "../apps/web/src/services/crewBarrier.js";

test("CrewBarrierManager: createRound initializes authoritative crew roster", () => {
	const round = CrewBarrierManager.createRound("round-100", ["data-crew", "web-crew"], "chat-1", {
		softDeadlineMs: 15000,
	});

	assert.equal(round.roundId, "round-100");
	assert.equal(round.crewIds.length, 2);
	assert.equal(round.barrierReleased, false);
	assert.equal(round.summaryPosted, false);
	assert.equal(round.crews["data-crew"].status, "talking");
	assert.equal(round.crews["web-crew"].status, "talking");
	assert.ok(round.crews["data-crew"].softDeadlineAt > Date.now());
});

test("CrewBarrierManager: individual crew completing does NOT release barrier while other crew works", () => {
	let round = CrewBarrierManager.createRound("round-100", ["data-crew", "web-crew"], "chat-1");

	// Data crew completes early
	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "DataCrew",
		findingsCount: 4,
		summary: "Zetaris database catalog validated.",
	});

	// Data crew is ready
	assert.equal(round.crews["data-crew"].status, "ready");
	assert.equal(round.crews["data-crew"].summary, "Zetaris database catalog validated.");

	// Web crew is still talking
	assert.equal(round.crews["web-crew"].status, "talking");

	// BARRIER MUST NOT BE ELIGIBLE FOR RELEASE!
	assert.equal(CrewBarrierManager.canRelease(round), false);
});

test("CrewBarrierManager: soft deadline transitions crew to wrapping_up, NOT ready", () => {
	let round = CrewBarrierManager.createRound("round-100", ["data-crew", "web-crew"], "chat-1", {
		softDeadlineMs: 1000,
	});

	const pastTime = Date.now() + 5000;
	round = CrewBarrierManager.checkSoftDeadlines(round, pastTime);

	// Both crews should now be wrapping_up
	assert.equal(round.crews["data-crew"].status, "wrapping_up");
	assert.equal(round.crews["web-crew"].status, "wrapping_up");

	// Barrier is still NOT released!
	assert.equal(CrewBarrierManager.canRelease(round), false);
});

test("CrewBarrierManager: barrier releases only when all crews are ready", () => {
	let round = CrewBarrierManager.createRound("round-100", ["data-crew", "web-crew"], "chat-1");

	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "DataCrew",
		summary: "All Zetaris tables queried.",
	});

	assert.equal(CrewBarrierManager.canRelease(round), false);

	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "WebSearchCrew",
		summary: "External NIST/ISO standards retrieved.",
	});

	// Now both are ready
	assert.equal(round.crews["data-crew"].status, "ready");
	assert.equal(round.crews["web-crew"].status, "ready");
	assert.equal(CrewBarrierManager.canRelease(round), true);
});

test("CrewBarrierManager: preserves conflicting findings and detects discrepancies", () => {
	let round = CrewBarrierManager.createRound("round-100", ["data-crew", "web-crew"], "chat-1");

	round = CrewBarrierManager.processEvent(round, {
		type: "research_finding",
		agentId: "DataCrew-Anomaly",
		finding: {
			claim: "Notice of Discrepancy: Data record delayed by 13 days in vendor log.",
			timestamp: Date.now(),
		},
	});

	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "DataCrew",
		summary: "Discovered delayed delivery records.",
	});

	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "WebSearchCrew",
		summary: "Industry benchmark expects zero delays.",
	});

	const summaryResult = CrewBarrierManager.generateCombinedSummary(round);
	assert.equal(summaryResult.hasConflict, true);
	assert.match(summaryResult.summaryText, /Evidence Divergence \/ Discrepancy Detected/);
	assert.match(summaryResult.summaryText, /Zetaris Federated Data Crew Findings/);
	assert.match(summaryResult.summaryText, /External Standards & Web Search Crew Findings/);
});

test("CrewBarrierManager: summary posting and idempotency", () => {
	let round = CrewBarrierManager.createRound("round-100", ["data-crew", "web-crew"], "chat-1");

	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "DataCrew",
		summary: "Data ready.",
	});
	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "WebSearchCrew",
		summary: "Web ready.",
	});

	assert.equal(CrewBarrierManager.canRelease(round), true);

	const summaryResult = CrewBarrierManager.generateCombinedSummary(round);
	round = CrewBarrierManager.markSummaryPosted(round, summaryResult.summaryText);

	assert.equal(round.barrierReleased, true);
	assert.equal(round.summaryPosted, true);

	// Cannot release again (idempotent)
	assert.equal(CrewBarrierManager.canRelease(round), false);
});

test("CrewBarrierManager: failure handling preserves state for recovery", () => {
	let round = CrewBarrierManager.createRound("round-100", ["data-crew", "web-crew"], "chat-1");

	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "DataCrew",
		summary: "Data ready.",
	});
	round = CrewBarrierManager.processEvent(round, {
		type: "crew_complete",
		crew: "WebSearchCrew",
		summary: "Web ready.",
	});

	// Simulate post failure
	round = CrewBarrierManager.markSummaryFailed(round, "Network timeout during post");

	assert.equal(round.barrierReleased, false);
	assert.equal(round.summaryPosted, false);
	assert.equal(round.error, "Network timeout during post");
	// State is intact, crews still ready
	assert.equal(round.crews["data-crew"].status, "ready");
	assert.equal(round.crews["web-crew"].status, "ready");
});
