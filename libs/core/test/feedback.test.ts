import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
	CredibilityManager,
	COLD_START_PRIORS,
	type AgentCredibilityRecord,
} from "../src/kernel/CredibilityManager.js";
import { HMemService } from "../src/memory/HMemService.js";
import { DebateLoop, type DebateConfig } from "../src/debate/DebateLoop.js";
import type { ISeatTransport } from "../src/debate/SeatTransport.js";
import type { AgentMessage, MessageType } from "../src/debate/AgentMessage.js";
import { AuditTrailEmitter } from "../src/engine/AuditTrailEmitter.js";

// Helper for creating mock messages
function createTestMessage(opts: {
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

class MockSeatTransport implements ISeatTransport {
	readonly mode = "in_process" as const;
	constructor(private readonly seats: string[] = ["FactChecker", "CloudArchitect", "Synthesizer"]) {}

	listSeatIds(): string[] {
		return [...this.seats];
	}

	hasSeat(seatId: string): boolean {
		return this.seats.includes(seatId);
	}

	async propose(seatId: string, _task: string, _round: number): Promise<AgentMessage> {
		return createTestMessage({
			id: `prop-${seatId}-${Date.now()}`,
			fromSeat: seatId,
			type: "proposal",
			confidence: 0.85,
			round: 1,
		});
	}

	async respond(seatId: string, _history: AgentMessage[], _round: number): Promise<AgentMessage> {
		return createTestMessage({
			id: `resp-${seatId}-${Date.now()}`,
			fromSeat: seatId,
			type: "refinement",
			confidence: 0.85,
			round: 1,
		});
	}

	async synthesize(judgeSeatId: string, _history: AgentMessage[], round: number, instruction?: string): Promise<AgentMessage> {
		return createTestMessage({
			id: `synth-${judgeSeatId}-${Date.now()}`,
			fromSeat: judgeSeatId,
			type: "consensus",
			confidence: 0.9,
			round,
			position: instruction || "Synthesized consensus decree",
		});
	}
}

// ============================================================
// 1. CredibilityManager Tests
// ============================================================
test("CredibilityManager: initializes agent with cold-start priors", () => {
	const mgr = new CredibilityManager();
	const cred = mgr.getCredibility("FactChecker");

	assert.equal(cred.seatId, "FactChecker");
	assert.equal(cred.alpha, COLD_START_PRIORS.alpha);
	assert.equal(cred.beta, COLD_START_PRIORS.beta);
	assert.equal(cred.sampleCount, 0);
	assert.equal(cred.credibilityScore, 0.5);
	assert.equal(cred.weightMultiplier, 1.0);
	assert.equal(mgr.getWeightMultiplier("FactChecker"), 1.0);
});

test("CredibilityManager: updates Bayesian priors upon positive rating (thumbs up)", () => {
	const mgr = new CredibilityManager();
	const initial = mgr.getCredibility("CloudArchitect");
	assert.equal(initial.alpha, 2.0);
	assert.equal(initial.beta, 2.0);

	const updated = mgr.recordRating("CloudArchitect", "up");
	assert.equal(updated.alpha, 3.0);
	assert.equal(updated.beta, 2.0);
	assert.equal(updated.sampleCount, 1);
	// mu = 3 / (3 + 2) = 0.60
	assert.equal(updated.credibilityScore, 0.6);
	// weight = 0.6 / 0.5 = 1.20
	assert.equal(updated.weightMultiplier, 1.2);
	assert.ok(updated.weightMultiplier > 1.0);
});

test("CredibilityManager: updates Bayesian priors upon negative rating (thumbs down)", () => {
	const mgr = new CredibilityManager();
	const updated = mgr.recordRating("AndresAgent", "down");
	assert.equal(updated.alpha, 2.0);
	assert.equal(updated.beta, 3.0);
	assert.equal(updated.sampleCount, 1);
	// mu = 2 / (2 + 3) = 0.40
	assert.equal(updated.credibilityScore, 0.4);
	// weight = 0.4 / 0.5 = 0.80
	assert.equal(updated.weightMultiplier, 0.8);
	assert.ok(updated.weightMultiplier < 1.0);
});

test("CredibilityManager: enforces strict bounds clamping [0.2, 1.8]", () => {
	const mgr = new CredibilityManager();

	// Highly approved agent
	for (let i = 0; i < 25; i++) {
		mgr.recordRating("TopExpert", "up");
	}
	const top = mgr.getCredibility("TopExpert");
	assert.ok(top.credibilityScore > 0.9);
	assert.equal(top.weightMultiplier, 1.8, "Weight multiplier must clamp at 1.8");

	// Highly penalized agent
	for (let i = 0; i < 25; i++) {
		mgr.recordRating("FlawedAgent", "down");
	}
	const low = mgr.getCredibility("FlawedAgent");
	assert.ok(low.credibilityScore < 0.1);
	assert.equal(low.weightMultiplier, 0.2, "Weight multiplier must clamp at 0.2");
});

test("CredibilityManager: handles consensus agreement adjustments (+0.3 increments)", () => {
	const mgr = new CredibilityManager();

	const agreed = mgr.recordConsensusAgreement("FactChecker", true);
	assert.equal(agreed.alpha, 2.3);
	assert.equal(agreed.beta, 2.0);
	assert.equal(agreed.sampleCount, 1);

	const disagreed = mgr.recordConsensusAgreement("FactChecker", false);
	assert.equal(disagreed.alpha, 2.3);
	assert.equal(disagreed.beta, 2.3);
	assert.equal(disagreed.sampleCount, 2);
	assert.equal(disagreed.credibilityScore, 0.5);
	assert.equal(disagreed.weightMultiplier, 1.0);
});

test("CredibilityManager: invokes persistence delegate and restores preloaded records", () => {
	const savedRecords: AgentCredibilityRecord[] = [];
	const delegate = {
		saveRecord: (r: AgentCredibilityRecord) => {
			savedRecords.push({ ...r });
		},
	};

	const mgr = new CredibilityManager([], delegate);
	mgr.recordRating("Seat1", "up");
	assert.equal(savedRecords.length, 1);
	assert.equal(savedRecords[0].seatId, "Seat1");
	assert.equal(savedRecords[0].alpha, 3.0);

	// Preloaded constructor initialization
	const mgr2 = new CredibilityManager(savedRecords);
	const restored = mgr2.getCredibility("Seat1");
	assert.equal(restored.alpha, 3.0);
	assert.equal(restored.credibilityScore, 0.6);
});

// ============================================================
// 2. HMemService Feedback Integration Tests
// ============================================================
test("HMemService: records feedback tags and calibrates confidence priors", () => {
	const tempDir = path.join(os.tmpdir(), `hmem-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
	mkdirSync(tempDir, { recursive: true });
	const hmemPath = path.join(tempDir, "hmem.json");

	try {
		const hmem = new HMemService(hmemPath);

		// Mine an initial governance episode
		const sessionId = "session_test_42";
		hmem.mine({
			sessionId,
			topic: "Federated data policy compliance and row level security",
			finalAnswer: "Approved data masking policies.",
			seatPositions: [
				{ seatId: "FactChecker", position: "Data complies with HIPAA rule 4", confidence: 0.8 },
				{ seatId: "CloudArchitect", position: "Use BigQuery authorized views", confidence: 0.75 },
			],
		});

		assert.equal(hmem.count(), 3); // 1 summary + 2 seat positions

		// 1. Thumbs Up feedback for FactChecker
		const updatedUp = hmem.recordFeedback(sessionId, "", "FactChecker", "up");
		assert.ok(updatedUp !== null);
		assert.ok(updatedUp?.tags?.includes("approved_precedent"));
		assert.ok(!updatedUp?.tags?.includes("disputed_precedent"));
		assert.equal(updatedUp?.confidence, 0.85); // 0.8 + 0.05

		// 2. Thumbs Down feedback for CloudArchitect
		const updatedDown = hmem.recordFeedback(sessionId, "", "CloudArchitect", "down");
		assert.ok(updatedDown !== null);
		assert.ok(updatedDown?.tags?.includes("disputed_precedent"));
		assert.ok(!updatedDown?.tags?.includes("approved_precedent"));
		assert.equal(updatedDown?.confidence, 0.72); // 0.75 - 0.03

		// 3. Retrieval returns domain-relevant precedents
		const retrieval = hmem.retrieve("compliance security");
		assert.ok(retrieval.entries.length > 0);
		assert.ok(retrieval.context.includes("Relevant memory from prior debates"));

		// 4. Standalone feedback creates new precedent
		const standalone = hmem.recordFeedback("sess_new", "msg_99", "SecuritySpecialist", "up");
		assert.ok(standalone !== null);
		assert.equal(standalone?.category, "SecuritySpecialist");
		assert.ok(standalone?.tags?.includes("approved_precedent"));
	} finally {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	}
});

// ============================================================
// 3. DebateLoop Credibility Weighting Tests
// ============================================================
test("DebateLoop: credibility-weighted consensus enables high-credibility agreement to pass threshold", () => {
	const credibilityMgr = new CredibilityManager();

	// Highly credible Agent A (weight = 1.5)
	credibilityMgr.setCredibility({
		seatId: "SeatA",
		alpha: 6.0,
		beta: 2.0,
		sampleCount: 5,
		credibilityScore: 0.75,
		weightMultiplier: 1.5,
		updatedAt: Date.now(),
	});

	// Lower credibility Agent B (weight = 0.5)
	credibilityMgr.setCredibility({
		seatId: "SeatB",
		alpha: 1.0,
		beta: 3.0,
		sampleCount: 5,
		credibilityScore: 0.25,
		weightMultiplier: 0.5,
		updatedAt: Date.now(),
	});

	const transport = new MockSeatTransport(["SeatA", "SeatB"]);
	const config: DebateConfig = {
		maxRounds: 2,
		consensusThreshold: 0.76, // Threshold is 0.76
		minConsensusSeats: 2,
		enableTieredPhases: false,
		dissentTriggerCount: 2,
		credibilityManager: credibilityMgr,
	};

	const debate = new DebateLoop(
		["SeatA", "SeatB"],
		transport,
		() => [],
		config,
	);

	debate.setRound(1);
	// SeatA confidence 0.80, SeatB confidence 0.70.
	// Unweighted average = (0.80 + 0.70) / 2 = 0.75 (< 0.76 threshold -> would FAIL unweighted)
	// Weighted average = (1.5 * 0.80 + 0.5 * 0.70) / (1.5 + 0.5) = (1.20 + 0.35) / 2.0 = 1.55 / 2.0 = 0.775 (>= 0.76 -> PASSES)
	debate.pushTranscriptMessage(createTestMessage({
		id: "m1",
		fromSeat: "SeatA",
		type: "consensus",
		confidence: 0.80,
		round: 1,
	}));
	debate.pushTranscriptMessage(createTestMessage({
		id: "m2",
		fromSeat: "SeatB",
		type: "consensus",
		confidence: 0.70,
		round: 1,
	}));

	assert.equal(debate.hasConsensus(1), true, "Weighted consensus must pass with high-credibility weighting");
});

test("DebateLoop: credibility-weighted consensus prevents low-credibility agent from crossing threshold", () => {
	const credibilityMgr = new CredibilityManager();

	// High credibility Agent A has lower confidence (0.70, weight = 1.5)
	credibilityMgr.setCredibility({
		seatId: "SeatA",
		alpha: 6.0,
		beta: 2.0,
		sampleCount: 5,
		credibilityScore: 0.75,
		weightMultiplier: 1.5,
		updatedAt: Date.now(),
	});

	// Low credibility Agent B has high confidence (0.82, weight = 0.5)
	credibilityMgr.setCredibility({
		seatId: "SeatB",
		alpha: 1.0,
		beta: 3.0,
		sampleCount: 5,
		credibilityScore: 0.25,
		weightMultiplier: 0.5,
		updatedAt: Date.now(),
	});

	const transport = new MockSeatTransport(["SeatA", "SeatB"]);
	const config: DebateConfig = {
		maxRounds: 2,
		consensusThreshold: 0.75,
		minConsensusSeats: 2,
		enableTieredPhases: false,
		dissentTriggerCount: 2,
		credibilityManager: credibilityMgr,
	};

	const debate = new DebateLoop(
		["SeatA", "SeatB"],
		transport,
		() => [],
		config,
	);

	debate.setRound(1);
	// Unweighted = (0.70 + 0.82) / 2 = 0.76 (>= 0.75 -> would pass unweighted)
	// Weighted = (1.5 * 0.70 + 0.5 * 0.82) / 2.0 = (1.05 + 0.41) / 2.0 = 1.46 / 2.0 = 0.73 (< 0.75 -> fails weighted)
	debate.pushTranscriptMessage(createTestMessage({
		id: "m1",
		fromSeat: "SeatA",
		type: "consensus",
		confidence: 0.70,
		round: 1,
	}));
	debate.pushTranscriptMessage(createTestMessage({
		id: "m2",
		fromSeat: "SeatB",
		type: "consensus",
		confidence: 0.82,
		round: 1,
	}));

	assert.equal(debate.hasConsensus(1), false, "Low-credibility agent vote should be discounted and fail threshold");
});

test("DebateLoop: computeFinalConfidence clamps [0.0, 1.0] and rounds to 2 decimal places", () => {
	const credibilityMgr = new CredibilityManager();
	credibilityMgr.setCredibility({
		seatId: "SeatX",
		alpha: 3.0,
		beta: 2.0,
		sampleCount: 1,
		credibilityScore: 0.6,
		weightMultiplier: 1.2,
		updatedAt: Date.now(),
	});
	credibilityMgr.setCredibility({
		seatId: "SeatY",
		alpha: 2.0,
		beta: 2.0,
		sampleCount: 0,
		credibilityScore: 0.5,
		weightMultiplier: 1.0,
		updatedAt: Date.now(),
	});

	const transport = new MockSeatTransport(["SeatX", "SeatY"]);
	const debate = new DebateLoop(
		["SeatX", "SeatY"],
		transport,
		() => [],
		{
			maxRounds: 1,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: false,
			dissentTriggerCount: 2,
			credibilityManager: credibilityMgr,
		},
	);

	debate.setRound(1);
	// SeatX: conf 0.85 * 1.2 = 1.02
	// SeatY: conf 0.73 * 1.0 = 0.73
	// Sum = 1.75 / 2.2 = 0.795454... -> rounded to 0.80
	debate.pushTranscriptMessage(createTestMessage({
		id: "m1",
		fromSeat: "SeatX",
		type: "proposal",
		confidence: 0.85,
		round: 1,
	}));
	debate.pushTranscriptMessage(createTestMessage({
		id: "m2",
		fromSeat: "SeatY",
		type: "proposal",
		confidence: 0.73,
		round: 1,
	}));

	const finalConf = debate.computeFinalConfidence(1);
	assert.equal(finalConf, 0.8);
});

// ============================================================
// 4. Persistence & Audit Integration Tests
// ============================================================
test("SQLite & Audit: persists feedback and credibility with HMAC-SHA256 audit chaining", () => {
	// In-memory SQLite matching apps/web/server.ts schema
	const db = new Database(":memory:");
	db.exec(`
		CREATE TABLE message_feedback (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			conversation_id TEXT,
			message_id TEXT,
			seat_id TEXT,
			rating TEXT,
			round INTEGER,
			comment TEXT,
			created_at INTEGER
		);

		CREATE TABLE agent_credibility (
			seat_id TEXT PRIMARY KEY,
			alpha REAL,
			beta REAL,
			sample_count INTEGER,
			credibility_score REAL,
			weight_multiplier REAL,
			updated_at INTEGER
		);
	`);

	const credMgr = new CredibilityManager();
	const auditEmitter = new AuditTrailEmitter("test-audit-secret-key-1234");

	const conversationId = "conv_feedback_test";
	const messageId = "msg_101";
	const seatId = "FactChecker";
	const rating = "up";
	const round = 1;

	// 1. Insert feedback record
	const insertFeedback = db.prepare(`
		INSERT INTO message_feedback (conversation_id, message_id, seat_id, rating, round, comment, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	insertFeedback.run(conversationId, messageId, seatId, rating, round, "Verified citation", Date.now());

	// 2. Update CredibilityManager
	const updated = credMgr.recordRating(seatId, rating, round);

	// 3. Upsert into agent_credibility table
	const upsertCred = db.prepare(`
		INSERT INTO agent_credibility (seat_id, alpha, beta, sample_count, credibility_score, weight_multiplier, updated_at)
		VALUES (@seat_id, @alpha, @beta, @sample_count, @credibility_score, @weight_multiplier, @updated_at)
		ON CONFLICT(seat_id) DO UPDATE SET
			alpha = excluded.alpha,
			beta = excluded.beta,
			sample_count = excluded.sample_count,
			credibility_score = excluded.credibility_score,
			weight_multiplier = excluded.weight_multiplier,
			updated_at = excluded.updated_at
	`);
	upsertCred.run({
		seat_id: updated.seatId,
		alpha: updated.alpha,
		beta: updated.beta,
		sample_count: updated.sampleCount,
		credibility_score: updated.credibilityScore,
		weight_multiplier: updated.weightMultiplier,
		updated_at: updated.updatedAt,
	});

	// 4. Emit cryptographic audit event
	const auditEvent = auditEmitter.emitGovernanceRecalibration({
		sessionId: conversationId,
		seatId,
		rating,
		credibilityScore: updated.credibilityScore,
		weightMultiplier: updated.weightMultiplier,
		alpha: updated.alpha,
		beta: updated.beta,
		sampleCount: updated.sampleCount,
	});

	// Assertions
	const feedbackRows = db.prepare("SELECT * FROM message_feedback").all() as any[];
	assert.equal(feedbackRows.length, 1);
	assert.equal(feedbackRows[0].seat_id, "FactChecker");
	assert.equal(feedbackRows[0].rating, "up");

	const credRow = db.prepare("SELECT * FROM agent_credibility WHERE seat_id = ?").get("FactChecker") as any;
	assert.ok(credRow);
	assert.equal(credRow.alpha, 3.0);
	assert.equal(credRow.sample_count, 1);
	assert.equal(credRow.credibility_score, 0.6);

	assert.equal(auditEvent.event_type, "governance_recalibration");
	assert.ok(auditEvent.hash.length > 0);
	assert.ok(auditEvent.signature.length > 0);
	assert.equal(auditEmitter.verifyIntegrity(), true, "Cryptographic audit chain must remain unbroken");

	db.close();
});
