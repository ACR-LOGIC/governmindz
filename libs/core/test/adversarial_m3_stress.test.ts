import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
	CredibilityManager,
	clampWeight,
	computeCredibilityMetrics,
	type AgentCredibilityRecord,
} from "../src/kernel/CredibilityManager.js";
import { HMemService } from "../src/memory/HMemService.js";
import { DebateLoop, type DebateConfig } from "../src/debate/DebateLoop.js";
import type { ISeatTransport } from "../src/debate/SeatTransport.js";
import type { AgentMessage, MessageType } from "../src/debate/AgentMessage.js";

function createMockMessage(opts: {
	id: string;
	fromSeat: string;
	type: MessageType;
	confidence: number;
	round: number;
	position?: string;
}): AgentMessage {
	const pos = opts.position || `Position for ${opts.fromSeat}`;
	return {
		id: opts.id,
		fromSeat: opts.fromSeat,
		toSeat: "all",
		type: opts.type,
		content: pos,
		confidence: opts.confidence,
		round: opts.round,
		timestamp: Date.now(),
		structured: {
			position: pos,
			confidenceSelf: opts.confidence,
			confidence_self: opts.confidence,
			confidenceExpertAgreement: opts.confidence,
			confidence_expert_agreement: opts.confidence,
			evidence: [`ev-${opts.fromSeat}`],
			caveats: [],
			dissents_from: [],
			supports: [],
		},
	};
}

class DummyTransport implements ISeatTransport {
	readonly mode = "in_process" as const;
	constructor(private readonly seats: string[] = ["FactChecker", "CloudArchitect", "Synthesizer"]) {}
	listSeatIds(): string[] { return [...this.seats]; }
	hasSeat(seatId: string): boolean { return this.seats.includes(seatId); }
	async propose(seatId: string, _task: string, _round: number): Promise<AgentMessage> {
		return createMockMessage({ id: `p-${seatId}`, fromSeat: seatId, type: "proposal", confidence: 0.8, round: 1 });
	}
	async respond(seatId: string, _h: AgentMessage[], _round: number): Promise<AgentMessage> {
		return createMockMessage({ id: `r-${seatId}`, fromSeat: seatId, type: "refinement", confidence: 0.8, round: 1 });
	}
	async synthesize(judgeSeatId: string, _h: AgentMessage[], round: number, inst?: string): Promise<AgentMessage> {
		return createMockMessage({ id: `s-${judgeSeatId}`, fromSeat: judgeSeatId, type: "consensus", confidence: 0.9, round, position: inst || "decree" });
	}
}

// ============================================================
// 1. CredibilityManager Adversarial & Boundary Stress Tests
// ============================================================

test("CredibilityManager: clampWeight handles extreme, non-finite, and negative inputs", () => {
	assert.equal(clampWeight(-Infinity), 1.0);
	assert.equal(clampWeight(Infinity), 1.0);
	assert.equal(clampWeight(NaN), 1.0);
	assert.equal(clampWeight(0), 0.2);
	assert.equal(clampWeight(-100), 0.2);
	assert.equal(clampWeight(0.1999), 0.2);
	assert.equal(clampWeight(0.2), 0.2);
	assert.equal(clampWeight(1.0), 1.0);
	assert.equal(clampWeight(1.8), 1.8);
	assert.equal(clampWeight(1.8001), 1.8);
	assert.equal(clampWeight(99999), 1.8);
});

test("CredibilityManager: computeCredibilityMetrics handles 0, negative, and extreme inputs", () => {
	// Zero inputs
	const zero = computeCredibilityMetrics(0, 0);
	assert.equal(zero.credibilityScore, 0.5);
	assert.equal(zero.weightMultiplier, 1.0);

	// Negative sum
	const neg = computeCredibilityMetrics(-5, -5);
	assert.equal(neg.credibilityScore, 0.5);
	assert.equal(neg.weightMultiplier, 1.0);

	// Extreme disparity
	const highAlpha = computeCredibilityMetrics(10000, 0);
	assert.equal(highAlpha.credibilityScore, 1.0);
	assert.equal(highAlpha.weightMultiplier, 1.8);

	const highBeta = computeCredibilityMetrics(0, 10000);
	assert.equal(highBeta.credibilityScore, 0.0);
	assert.equal(highBeta.weightMultiplier, 0.2);
});

test("CredibilityManager: infinite alpha is guarded and yields safe non-NaN credibilityScore", () => {
	const infAlpha = computeCredibilityMetrics(Infinity, 2);
	assert.ok(!Number.isNaN(infAlpha.credibilityScore), "credibilityScore must not be NaN when alpha is Infinity");
	assert.equal(infAlpha.credibilityScore, 0.5);
	assert.equal(infAlpha.weightMultiplier, 1.0, "Weight multiplier safely clamped to 1.0 via clampWeight");
});

test("CredibilityManager: 10,000 consecutive 'up' ratings strictly clamp weight to 1.8", () => {
	const mgr = new CredibilityManager();
	const seatId = "FactCheckerStreak";

	for (let i = 0; i < 10000; i++) {
		mgr.recordRating(seatId, "up");
	}

	const cred = mgr.getCredibility(seatId);
	assert.equal(cred.sampleCount, 10000);
	assert.equal(cred.alpha, 2 + 10000);
	assert.equal(cred.beta, 2);
	assert.ok(cred.credibilityScore > 0.999);
	assert.equal(cred.weightMultiplier, 1.8, "Weight multiplier must strictly clamp at 1.8");
	assert.equal(mgr.getWeightMultiplier(seatId), 1.8);
});

test("CredibilityManager: 10,000 consecutive 'down' ratings strictly clamp weight to 0.2", () => {
	const mgr = new CredibilityManager();
	const seatId = "RogueAgentStreak";

	for (let i = 0; i < 10000; i++) {
		mgr.recordRating(seatId, "down");
	}

	const cred = mgr.getCredibility(seatId);
	assert.equal(cred.sampleCount, 10000);
	assert.equal(cred.alpha, 2);
	assert.equal(cred.beta, 2 + 10000);
	assert.ok(cred.credibilityScore < 0.001);
	assert.equal(cred.weightMultiplier, 0.2, "Weight multiplier must strictly clamp at 0.2");
	assert.equal(mgr.getWeightMultiplier(seatId), 0.2);
});

test("CredibilityManager: alternating 10,000 ratings maintain stability around 1.0", () => {
	const mgr = new CredibilityManager();
	const seatId = "AlternatingAgent";

	for (let i = 0; i < 5000; i++) {
		mgr.recordRating(seatId, "up");
		mgr.recordRating(seatId, "down");
	}

	const cred = mgr.getCredibility(seatId);
	assert.equal(cred.sampleCount, 10000);
	assert.equal(cred.alpha, 2 + 5000);
	assert.equal(cred.beta, 2 + 5000);
	assert.equal(cred.credibilityScore, 0.5);
	assert.equal(cred.weightMultiplier, 1.0);
});

test("CredibilityManager: concurrent asynchronous ratings maintain state consistency", async () => {
	const savedRecords: AgentCredibilityRecord[] = [];
	const mgr = new CredibilityManager([], {
		saveRecord: (r) => { savedRecords.push({ ...r }); },
	});
	const seatId = "ConcurrentSeat";

	// Execute 100 concurrent rating events
	const promises = Array.from({ length: 100 }, (_, i) => {
		const rating = i % 2 === 0 ? "up" : "down";
		return Promise.resolve().then(() => mgr.recordRating(seatId, rating));
	});

	await Promise.all(promises);

	const cred = mgr.getCredibility(seatId);
	assert.equal(cred.sampleCount, 100);
	assert.equal(cred.alpha, 2 + 50);
	assert.equal(cred.beta, 2 + 50);
	assert.equal(cred.credibilityScore, 0.5);
	assert.equal(cred.weightMultiplier, 1.0);
	assert.equal(savedRecords.length, 100);
});

// ============================================================
// 2. DebateLoop Adversarial Consensus & Hijacking Tests
// ============================================================

test("DebateLoop: low-credibility rogue agent cannot hijack consensus against cautious reputable agents", () => {
	const credMgr = new CredibilityManager();
	// Seat A (FactChecker): weight 1.5, confidence 0.70
	credMgr.setCredibility({
		seatId: "FactChecker",
		alpha: 3.75,
		beta: 1.25,
		sampleCount: 5,
		credibilityScore: 0.75,
		weightMultiplier: 1.5,
		updatedAt: Date.now(),
	});
	// Seat B (CloudArchitect): weight 1.5, confidence 0.70
	credMgr.setCredibility({
		seatId: "CloudArchitect",
		alpha: 3.75,
		beta: 1.25,
		sampleCount: 5,
		credibilityScore: 0.75,
		weightMultiplier: 1.5,
		updatedAt: Date.now(),
	});
	// Seat C (RogueAgent): low weight 0.2, highly confident 0.95
	credMgr.setCredibility({
		seatId: "RogueAgent",
		alpha: 0.5,
		beta: 4.5,
		sampleCount: 10,
		credibilityScore: 0.1,
		weightMultiplier: 0.2,
		updatedAt: Date.now(),
	});

	const config: DebateConfig = {
		maxRounds: 3,
		consensusThreshold: 0.75,
		minConsensusSeats: 3,
		enableTieredPhases: false,
		dissentTriggerCount: 2,
		credibilityManager: credMgr,
	};

	const transport = new DummyTransport(["FactChecker", "CloudArchitect", "RogueAgent"]);
	const loop = new DebateLoop(
		["FactChecker", "CloudArchitect", "RogueAgent"],
		transport,
		() => [],
		config,
	);
	loop.setRound(1);

	// Without weighting: (0.70 + 0.70 + 0.95) / 3 = 0.7833 (WOULD PASS 0.75 threshold!)
	// With credibility weighting: (1.5*0.70 + 1.5*0.70 + 0.2*0.95) / (1.5 + 1.5 + 0.2) = 2.29 / 3.2 = 0.7156 (< 0.75 FAILS!)
	loop.pushTranscriptMessage(createMockMessage({ id: "m1", fromSeat: "FactChecker", type: "consensus", confidence: 0.70, round: 1 }));
	loop.pushTranscriptMessage(createMockMessage({ id: "m2", fromSeat: "CloudArchitect", type: "consensus", confidence: 0.70, round: 1 }));
	loop.pushTranscriptMessage(createMockMessage({ id: "m3", fromSeat: "RogueAgent", type: "consensus", confidence: 0.95, round: 1 }));

	const consensusPassed = loop.hasConsensus(1);
	assert.equal(consensusPassed, false, "Rogue agent with inflated confidence must not pass consensus against cautious reputable peers");

	const finalConf = loop.computeFinalConfidence(1);
	assert.equal(finalConf, 0.72, "Final confidence should reflect weighted calculation 0.72");
});

test("DebateLoop: high-credibility reputable agent prevents low-credibility dissenters from destroying valid consensus", () => {
	const credMgr = new CredibilityManager();
	// High-credibility reputable seat
	credMgr.setCredibility({
		seatId: "FactChecker",
		alpha: 9.0,
		beta: 1.0,
		sampleCount: 10,
		credibilityScore: 0.9,
		weightMultiplier: 1.8,
		updatedAt: Date.now(),
	});
	// Two low-credibility seats
	credMgr.setCredibility({
		seatId: "SeatLow1",
		alpha: 1.0,
		beta: 9.0,
		sampleCount: 10,
		credibilityScore: 0.1,
		weightMultiplier: 0.2,
		updatedAt: Date.now(),
	});
	credMgr.setCredibility({
		seatId: "SeatLow2",
		alpha: 1.0,
		beta: 9.0,
		sampleCount: 10,
		credibilityScore: 0.1,
		weightMultiplier: 0.2,
		updatedAt: Date.now(),
	});

	const config: DebateConfig = {
		maxRounds: 3,
		consensusThreshold: 0.75,
		minConsensusSeats: 3,
		enableTieredPhases: false,
		dissentTriggerCount: 2,
		credibilityManager: credMgr,
	};

	const transport = new DummyTransport(["FactChecker", "SeatLow1", "SeatLow2"]);
	const loop = new DebateLoop(
		["FactChecker", "SeatLow1", "SeatLow2"],
		transport,
		() => [],
		config,
	);
	loop.setRound(1);

	// FactChecker confidence 0.90
	// SeatLow1 confidence 0.60
	// SeatLow2 confidence 0.60
	// Unweighted: (0.90 + 0.60 + 0.60) / 3 = 0.70 (< 0.75 would fail)
	// Weighted: (1.8*0.90 + 0.2*0.60 + 0.2*0.60) / (1.8 + 0.2 + 0.2) = (1.62 + 0.12 + 0.12) / 2.2 = 1.86 / 2.2 = 0.845 (>= 0.75 passes!)
	loop.pushTranscriptMessage(createMockMessage({ id: "m1", fromSeat: "FactChecker", type: "consensus", confidence: 0.90, round: 1 }));
	loop.pushTranscriptMessage(createMockMessage({ id: "m2", fromSeat: "SeatLow1", type: "consensus", confidence: 0.60, round: 1 }));
	loop.pushTranscriptMessage(createMockMessage({ id: "m3", fromSeat: "SeatLow2", type: "consensus", confidence: 0.60, round: 1 }));

	const consensusPassed = loop.hasConsensus(1);
	assert.equal(consensusPassed, true, "High-credibility consensus should pass despite low-credibility drag");

	const finalConf = loop.computeFinalConfidence(1);
	assert.equal(finalConf, 0.85);
});

test("DebateLoop: computeFinalConfidence handles empty transcript, zero weights, and out-of-bound confidences", () => {
	const transport = new DummyTransport(["FactChecker"]);
	const loop = new DebateLoop(
		["FactChecker"],
		transport,
		() => [],
		{ maxRounds: 3, consensusThreshold: 0.75, minConsensusSeats: 1, enableTieredPhases: false, dissentTriggerCount: 2 },
	);

	// 1. Empty round
	assert.equal(loop.computeFinalConfidence(999), 0, "Empty round should return 0");

	// 2. Out of bound confidence (> 1.0 and < 0.0)
	loop.setRound(1);
	loop.pushTranscriptMessage(createMockMessage({ id: "m1", fromSeat: "FactChecker", type: "proposal", confidence: 1.5, round: 1 }));
	assert.equal(loop.computeFinalConfidence(1), 1.0, "Confidence > 1.0 should be clamped to 1.0");

	loop.pushTranscriptMessage(createMockMessage({ id: "m2", fromSeat: "FactChecker", type: "proposal", confidence: -0.5, round: 2 }));
	assert.equal(loop.computeFinalConfidence(2), 0.0, "Confidence < 0.0 should be clamped to 0.0");
});

test("DebateLoop: computeFinalConfidence sanitizes NaN confidence and guarantees valid range [0.0, 1.0]", () => {
	const credMgr = new CredibilityManager();
	const transport = new DummyTransport(["FactChecker"]);
	const loop = new DebateLoop(
		["FactChecker"],
		transport,
		() => [],
		{ maxRounds: 3, consensusThreshold: 0.75, minConsensusSeats: 1, enableTieredPhases: false, dissentTriggerCount: 2, credibilityManager: credMgr },
	);

	loop.setRound(1);
	loop.pushTranscriptMessage(createMockMessage({ id: "m-nan", fromSeat: "FactChecker", type: "consensus", confidence: NaN, round: 1 }));

	const result = loop.computeFinalConfidence(1);
	assert.ok(!Number.isNaN(result), "computeFinalConfidence must not return NaN when agent message has NaN confidence");
	assert.ok(result >= 0.0 && result <= 1.0, "computeFinalConfidence must fall within [0.0, 1.0]");
});

// ============================================================
// 3. HMemService Adversarial Stress & Capacity Tests
// ============================================================

test("HMemService: capacity capping strictly prevents unbounded memory leak in mine() beyond 500 entries", () => {
	const tempDir = path.join(os.tmpdir(), `hmem-stress-${Date.now()}`);
	mkdirSync(tempDir, { recursive: true });
	const hmemPath = path.join(tempDir, "hmem.json");

	try {
		const hmem = new HMemService(hmemPath);

		// Mine 150 sessions with 4 seats each (total 150 * 5 = 750 entries)
		for (let s = 0; s < 150; s++) {
			hmem.mine({
				sessionId: `session-${s}`,
				topic: `Data Governance Policy topic ${s}`,
				finalAnswer: `Approved policy ${s}`,
				seatPositions: [
					{ seatId: "FactChecker", position: `Position A ${s}`, confidence: 0.85 },
					{ seatId: "CloudArchitect", position: `Position B ${s}`, confidence: 0.82 },
					{ seatId: "ComplianceOfficer", position: `Position C ${s}`, confidence: 0.90 },
					{ seatId: "SecurityLead", position: `Position D ${s}`, confidence: 0.88 },
				],
			});
		}

		assert.equal(hmem.count(), 500, "mine() must strictly cap total entries to 500");
		const allEntries = hmem.list();
		assert.equal(allEntries.length, 500);

		// Now test recordFeedback with existing and new entries
		const firstEntry = allEntries[0];
		const updated = hmem.recordFeedback(firstEntry.source, firstEntry.id, firstEntry.category, "up");
		if (!updated) throw new Error("updated is null");
		assert.ok(updated.tags?.includes("approved_precedent"));

		// Verify retrieval still works under full 500 entries load
		const res = hmem.retrieve("Data Governance Compliance", 5);
		assert.ok(res.entries.length <= 5);
		assert.ok(res.context.length > 0);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("HMemService: recordFeedback strictly enforces 500-entry capacity cap on unmined messages", () => {
	const tempDir = path.join(os.tmpdir(), `hmem-unbounded-${Date.now()}`);
	mkdirSync(tempDir, { recursive: true });
	const hmemPath = path.join(tempDir, "hmem.json");

	try {
		const hmem = new HMemService(hmemPath);

		// Add 600 unmined feedback entries
		for (let i = 0; i < 600; i++) {
			hmem.recordFeedback(`sess_${i}`, `msg_${i}`, `seat_${i}`, "up");
		}

		assert.equal(hmem.count(), 500, "recordFeedback must strictly enforce 500-entry capacity cap");
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("HMemService: recordFeedback handles missing session/message IDs and confidence boundary clamping", () => {
	const tempDir = path.join(os.tmpdir(), `hmem-fb-stress-${Date.now()}`);
	mkdirSync(tempDir, { recursive: true });
	const hmemPath = path.join(tempDir, "hmem.json");

	try {
		const hmem = new HMemService(hmemPath);

		// Missing IDs should create new entry safely
		const entry1 = hmem.recordFeedback("", "", "FactChecker", "up");
		if (!entry1) throw new Error("entry1 is null");
		assert.ok(entry1.id, "Generated random ID when missing");
		assert.equal(entry1.confidence, 0.9);
		assert.ok(entry1.tags?.includes("approved_precedent"));

		// 20 consecutive thumbs down on the entry to test lower clamp [0.1, 1.0]
		for (let i = 0; i < 20; i++) {
			hmem.recordFeedback(entry1.source, entry1.id, "FactChecker", "down");
		}
		const degraded = hmem.list().find((e) => e.id === entry1.id);
		if (!degraded) throw new Error("degraded is undefined");
		assert.equal(degraded.confidence, 0.1, "Confidence must not degrade below 0.1");
		assert.ok(degraded.tags?.includes("disputed_precedent"));
		assert.ok(!degraded.tags?.includes("approved_precedent"));

		// 20 consecutive thumbs up on the entry to test upper clamp [0.1, 1.0]
		for (let i = 0; i < 20; i++) {
			hmem.recordFeedback(entry1.source, entry1.id, "FactChecker", "up");
		}
		const elevated = hmem.list().find((e) => e.id === entry1.id);
		if (!elevated) throw new Error("elevated is undefined");
		assert.equal(elevated.confidence, 1.0, "Confidence must not exceed 1.0");
		assert.ok(elevated.tags?.includes("approved_precedent"));
		assert.ok(!elevated.tags?.includes("disputed_precedent"));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
