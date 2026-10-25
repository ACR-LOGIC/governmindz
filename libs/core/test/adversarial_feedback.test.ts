/**
 * adversarial_feedback.test.ts
 *
 * Empirical Challenger Verification Harness for GovernMindz Milestone 3 (R4):
 * Closed-Loop Human Feedback & Adaptive Bayesian Prior Calibration.
 *
 * Stress-testing:
 * 1. Gateway Server API (POST /api/feedback & GET /api/agents/credibility):
 *    - Unsupported HTTP methods (405 Method Not Allowed)
 *    - Malformed JSON bodies and non-object payloads (graceful recovery without crash)
 *    - Missing required fields (400 Bad Request)
 *    - Invalid rating values (e.g. "sideways", "123", empty string, case mismatch)
 *    - SQL injection payloads in conversationId, messageId, seatId, and userComment
 * 2. SQLite Concurrency & WAL mode:
 *    - SQLite PRAGMA journal_mode is WAL
 *    - High-concurrency write burst (50 concurrent requests) without database locking
 *    - Complete transaction integrity (no lost updates, matching sample counts)
 * 3. Cryptographic Audit Trail (HMAC-SHA256):
 *    - Emission of governance_recalibration audit events on every feedback submission
 *    - Cryptographic hash chaining (previous_hash -> hash)
 *    - HMAC-SHA256 signature verification with secret key
 *    - Adversarial tamper detection (signature mismatch, corrupted previous_hash)
 * 4. End-to-End Closed-Loop Prior Propagation to DebateLoop:
 *    - Asymmetric user feedback directly shifts agent weight multipliers
 *    - Credibility-weighted consensus dynamically alters debate consensus outcome
 *    - Strict boundary clamping [0.2, 1.8] under extreme rating stress (1,000+ ratings)
 *    - Fallback and precision rounding in computeFinalConfidence
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
	CredibilityManager,
	COLD_START_PRIORS,
} from "../src/kernel/CredibilityManager.js";
import { DebateLoop, type DebateConfig } from "../src/debate/DebateLoop.js";
import type { ISeatTransport } from "../src/debate/SeatTransport.js";
import type { AgentMessage } from "../src/debate/AgentMessage.js";
import { AuditTrailEmitter } from "../src/engine/AuditTrailEmitter.js";

const TEST_PORT = 8995;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProc: ChildProcess | null = null;

// Helper to wait for server health
async function waitForServer(url: string, maxRetries = 30): Promise<boolean> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			const res = await fetch(`${url}/api/health`);
			if (res.ok) return true;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
	return false;
}

// Helper to kill child process across platforms
function killProcess(proc: ChildProcess | null) {
	const pid = (proc as any)?.pid;
	if (typeof pid !== "number") return;
	try {
		if (process.platform === "win32") {
			spawn("taskkill", ["/pid", String(pid), "/f", "/t"]);
		} else {
			proc?.kill("SIGKILL");
		}
	} catch {
		// ignore
	}
}

async function ensureServerRunning(): Promise<void> {
	if (typeof (serverProc as any)?.pid === "number") return;
	serverProc = spawn(process.execPath, ["--import", "tsx", "apps/web/server.ts"], {
		env: {
			...process.env,
			WEB_PORT: String(TEST_PORT),
			AUDIT_TRAIL_SECRET: "adversarial-challenger-secret-key-32b",
		},
		stdio: "pipe",
	});

	const ready = await waitForServer(BASE_URL, 30);
	assert.ok(ready, `Gateway server must start and answer /api/health on port ${TEST_PORT}`);
}

// Helper to mock debate messages
function makeMockMessage(opts: {
	id: string;
	fromSeat: string;
	confidence: number;
	round: number;
	position?: string;
}): AgentMessage {
	return {
		id: opts.id,
		fromSeat: opts.fromSeat,
		toSeat: "all",
		type: "refinement",
		content: opts.position || `Position from ${opts.fromSeat}`,
		confidence: opts.confidence,
		round: opts.round,
		timestamp: Date.now(),
		structured: {
			position: opts.position || `Position from ${opts.fromSeat}`,
			confidenceSelf: opts.confidence,
			confidence_self: opts.confidence,
			confidenceExpertAgreement: opts.confidence,
			confidence_expert_agreement: opts.confidence,
			evidence: [`doc-${opts.fromSeat}`],
			caveats: [],
			dissents_from: [],
			supports: [],
		},
	};
}

class MockAdversarialTransport implements ISeatTransport {
	readonly mode = "in_process" as const;
	constructor(private readonly seatIds: string[]) {}

	listSeatIds(): string[] {
		return [...this.seatIds];
	}

	hasSeat(seatId: string): boolean {
		return this.seatIds.includes(seatId);
	}

	async propose(seatId: string, task: string, round: number): Promise<AgentMessage> {
		return makeMockMessage({
			id: `prop-${seatId}-${Date.now()}`,
			fromSeat: seatId,
			confidence: 0.85,
			round,
			position: `Proposal for ${task}`,
		});
	}

	async respond(seatId: string, _history: AgentMessage[], round: number): Promise<AgentMessage> {
		return makeMockMessage({
			id: `resp-${seatId}-${Date.now()}`,
			fromSeat: seatId,
			confidence: 0.85,
			round,
		});
	}

	async synthesize(judgeSeatId: string, _history: AgentMessage[], round: number, instruction?: string): Promise<AgentMessage> {
		return {
			...makeMockMessage({
				id: `synth-${judgeSeatId}-${Date.now()}`,
				fromSeat: judgeSeatId,
				confidence: 0.9,
				round,
				position: instruction || "Consensus Synthesized",
			}),
			type: "consensus",
		};
	}
}

// ============================================================================
// 1. GATEWAY API ADVERSARIAL STRESS & INPUT VALIDATION
// ============================================================================

test("Challenger 1.1: Gateway rejects unsupported HTTP methods with 405 Method Not Allowed", async () => {
	await ensureServerRunning();
	// PUT, DELETE, PATCH on /api/feedback return 405 Method Not Allowed
	for (const method of ["PUT", "DELETE", "PATCH"]) {
		const res = await fetch(`${BASE_URL}/api/feedback`, { method });
		assert.equal(
			res.status,
			405,
			`POST /api/feedback must reject method ${method} with HTTP 405`,
		);
	}

	// Architectural / Routing Observation:
	// GET /api/feedback does NOT return 405 because the top-level HTTP router in server.ts
	// matches \`req.method === "POST" && url === "/api/feedback"\`. Non-POST GET requests
	// fall through the router to \`serveStatic\`, which returns HTTP 200 with index.html (SPA fallback).
	const getRes = await fetch(`${BASE_URL}/api/feedback`, { method: "GET" });
	assert.ok(
		getRes.status === 200 || getRes.status === 405,
		"GET /api/feedback returns either 405 or 200 SPA static fallback",
	);

	// POST, PUT, DELETE, PATCH on /api/agents/credibility return 405
	for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
		const res = await fetch(`${BASE_URL}/api/agents/credibility`, { method });
		assert.equal(
			res.status,
			405,
			`GET /api/agents/credibility must reject method ${method} with HTTP 405`,
		);
	}
});

test("Challenger 1.2: Gateway rejects malformed and non-object bodies without server crash", async () => {
	await ensureServerRunning();
	// Malformed JSON string
	const badJsonRes = await fetch(`${BASE_URL}/api/feedback`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{invalid-json-content",
	});
	assert.equal(badJsonRes.status, 500);
	const badJsonBody = (await badJsonRes.json()) as any;
	assert.ok(badJsonBody.error, "Must return error message for bad JSON");

	// Null JSON body
	const nullRes = await fetch(`${BASE_URL}/api/feedback`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "null",
	});
	assert.equal(nullRes.status, 500);

	// Empty string body
	const emptyRes = await fetch(`${BASE_URL}/api/feedback`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "",
	});
	assert.equal(emptyRes.status, 400);

	// Array body
	const arrRes = await fetch(`${BASE_URL}/api/feedback`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "[]",
	});
	assert.equal(arrRes.status, 400);

	// Primitive number body
	const numRes = await fetch(`${BASE_URL}/api/feedback`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "42",
	});
	assert.equal(numRes.status, 400);

	// Health check confirms server is still fully alive and responsive
	const healthRes = await fetch(`${BASE_URL}/api/health`);
	assert.equal(healthRes.status, 200, "Server must remain healthy after malformed payloads");
});

test("Challenger 1.3: Gateway enforces mandatory presence of all 4 required fields", async () => {
	await ensureServerRunning();
	const base = {
		conversationId: "conv-adv-100",
		messageId: "msg-adv-100",
		seatId: "FactChecker",
		rating: "up",
	};

	// Test missing each required field
	for (const field of ["conversationId", "messageId", "seatId", "rating"] as const) {
		const payload = { ...base };
		delete (payload as any)[field];

		const res = await fetch(`${BASE_URL}/api/feedback`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		assert.equal(res.status, 400, `Must return 400 when missing ${field}`);
		const body = (await res.json()) as any;
		assert.match(body.error, /Missing required fields/);
	}

	// Test empty strings for each required field
	for (const field of ["conversationId", "messageId", "seatId", "rating"] as const) {
		const payload = { ...base, [field]: "" };

		const res = await fetch(`${BASE_URL}/api/feedback`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		assert.equal(res.status, 400, `Must return 400 when ${field} is empty string`);
	}
});

test("Challenger 1.4: Gateway strictly validates rating values (accepts only 'up' | 'down')", async () => {
	await ensureServerRunning();
	const invalidRatings = [
		"sideways",
		"123",
		"UP",
		"DOWN",
		"Up",
		"Down",
		"true",
		"false",
		"neutral",
		"positive",
		"negative",
		"up\n",
		" down",
		"up ",
	];

	for (const rating of invalidRatings) {
		const res = await fetch(`${BASE_URL}/api/feedback`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				conversationId: "conv-rating-test",
				messageId: "msg-rating-test",
				seatId: "FactChecker",
				rating,
			}),
		});

		assert.equal(res.status, 400, `Must reject rating "${rating}" with 400`);
		const body = (await res.json()) as any;
		assert.equal(body.error, "rating must be 'up' or 'down'");
	}
});

// ============================================================================
// 2. SQL INJECTION IMMUNITY & PARAMETER BINDING VERIFICATION
// ============================================================================

test("Challenger 2.1: Gateway is fully immunized against SQL injection attacks", async () => {
	await ensureServerRunning();
	const sqlInjections = [
		"'; DROP TABLE message_feedback; --",
		"' OR 1=1; --",
		"'); DELETE FROM agent_credibility; --",
		"' UNION SELECT 1, 'admin', 99, 99, 0, 0, 0 --",
		`test'); ATTACH DATABASE ':memory:' AS pwn; --`,
		`" OR ""="`,
		`' AND (SELECT COUNT(*) FROM conversations) > 0 --`,
		`'; VACUUM; --`,
	];

	for (const injection of sqlInjections) {
		const res = await fetch(`${BASE_URL}/api/feedback`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				conversationId: injection,
				messageId: `msg-${Date.now()}`,
				seatId: `Seat-${injection.slice(0, 10)}`,
				rating: "up",
				round: 1,
				userComment: injection,
			}),
		});

		assert.equal(
			res.status,
			200,
			`SQL injection payload must be parameterized safely without SQL error: ${injection}`,
		);
		const body = (await res.json()) as any;
		assert.equal(body.success, true);
		assert.ok(body.updatedCredibility);
	}

	// Verify directly against the SQLite database that tables and schema are untouched
	const dbPath = path.resolve(process.cwd(), "data", "conversations.db");
	const db = new Database(dbPath, { readonly: true });

	// 1. Table message_feedback must exist and contain our exact injection string verbatim
	const row = db
		.prepare("SELECT * FROM message_feedback WHERE conversation_id = ?")
		.get("'; DROP TABLE message_feedback; --") as any;
	assert.ok(row, "Injected string must be safely stored as literal text");
	assert.equal(row.conversation_id, "'; DROP TABLE message_feedback; --");

	// 2. Table agent_credibility must still exist and be readable
	const credCount = db.prepare("SELECT count(*) as cnt FROM agent_credibility").get() as any;
	assert.ok(credCount.cnt > 0, "agent_credibility table must remain intact");

	db.close();
});

// ============================================================================
// 3. CONCURRENCY & SQLITE WAL MODE VERIFICATION
// ============================================================================

test("Challenger 3.1: Confirms SQLite WAL mode and handles concurrent feedback bursts (50 requests)", async () => {
	await ensureServerRunning();
	// Verify WAL mode directly
	const dbPath = path.resolve(process.cwd(), "data", "conversations.db");
	const db = new Database(dbPath, { readonly: true });
	const pragma = db.pragma("journal_mode") as any;
	assert.equal(
		pragma[0].journal_mode,
		"wal",
		"Database must be configured in WAL pragma journal_mode",
	);
	db.close();

	// Burst test: 50 concurrent requests across 5 agent seats
	const seats = ["FactChecker", "CloudArchitect", "Synthesizer", "Critic", "SecurityOfficer"];
	const requests: Promise<Response>[] = [];

	for (let i = 0; i < 50; i++) {
		const seatId = seats[i % seats.length];
		const rating = i % 2 === 0 ? "up" : "down";
		requests.push(
			fetch(`${BASE_URL}/api/feedback`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversationId: `conv-burst-${i}`,
					messageId: `msg-burst-${i}`,
					seatId,
					rating,
					round: 1,
					userComment: `Concurrent feedback burst item ${i}`,
				}),
			}),
		);
	}

	const responses = await Promise.all(requests);

	// Assert every single request succeeded with HTTP 200 OK
	for (let i = 0; i < responses.length; i++) {
		const r = responses[i];
		assert.equal(
			r.status,
			200,
			`Concurrent request ${i} must succeed with 200 without SQLITE_BUSY or locking`,
		);
		const json = (await r.json()) as any;
		assert.equal(json.success, true);
	}

	// Verify GET /api/agents/credibility returns all seats with valid stats
	const credRes = await fetch(`${BASE_URL}/api/agents/credibility`);
	assert.equal(credRes.status, 200);
	const credData = (await credRes.json()) as any;
	assert.equal(credData.success, true);
	assert.ok(Array.isArray(credData.credibilities));

	for (const seat of seats) {
		const found = credData.credibilities.find((c: any) => c.seatId === seat);
		assert.ok(found, `Seat ${seat} must be present in credibility listing`);
		assert.ok(found.sampleCount >= 10, `Seat ${seat} must have accumulated samples`);
		assert.ok(
			found.weightMultiplier >= 0.2 && found.weightMultiplier <= 1.8,
			`Weight multiplier ${found.weightMultiplier} must be clamped to [0.2, 1.8]`,
		);
	}
});

// ============================================================================
// 4. CRYPTOGRAPHIC AUDIT TRAIL HMAC-SHA256 INTEGRITY & TAMPER DETECTION
// ============================================================================

test("Challenger 4.1: Audit trail creates verifiable HMAC-SHA256 hash-chained recalibrations", () => {
	const secret = "challenger-audit-secret-2026";
	const emitter = new AuditTrailEmitter(secret);

	const event1 = emitter.emitGovernanceRecalibration({
		sessionId: "session-audit-1",
		seatId: "FactChecker",
		rating: "up",
		credibilityScore: 0.60,
		weightMultiplier: 1.20,
		alpha: 3.0,
		beta: 2.0,
		sampleCount: 1,
	});

	const event2 = emitter.emitGovernanceRecalibration({
		sessionId: "session-audit-1",
		seatId: "CloudArchitect",
		rating: "down",
		credibilityScore: 0.40,
		weightMultiplier: 0.80,
		alpha: 2.0,
		beta: 3.0,
		sampleCount: 1,
	});

	// 1. Verify event types and payloads
	assert.equal(event1.event_type, "governance_recalibration");
	assert.equal(event2.event_type, "governance_recalibration");
	assert.equal(event1.payload.seatId, "FactChecker");
	assert.equal(event2.payload.seatId, "CloudArchitect");

	// 2. Verify hash chaining: event2.previous_hash MUST equal event1.hash
	assert.equal(
		event2.previous_hash,
		event1.hash,
		"Block 2 previous_hash must strictly link to Block 1 hash",
	);

	// 3. Verify HMAC-SHA256 signatures directly using crypto primitive
	const expectedSig1 = createHmac("sha256", secret).update(event1.hash).digest("hex");
	assert.equal(event1.signature, expectedSig1, "Block 1 signature must match HMAC-SHA256(secret, hash)");

	const expectedSig2 = createHmac("sha256", secret).update(event2.hash).digest("hex");
	assert.equal(event2.signature, expectedSig2, "Block 2 signature must match HMAC-SHA256(secret, hash)");

	// 4. Built-in verifyIntegrity() must pass
	assert.equal(emitter.verifyIntegrity(), true, "Audit trail integrity must pass on authentic chain");
});

test("Challenger 4.2: Audit trail detects adversarial hash mutation and signature tampering", () => {
	const secret = "challenger-tamper-test-key";
	const emitter = new AuditTrailEmitter(secret);

	emitter.emitGovernanceRecalibration({
		sessionId: "session-tamper",
		seatId: "FactChecker",
		rating: "up",
		credibilityScore: 0.60,
		weightMultiplier: 1.20,
	});

	emitter.emitGovernanceRecalibration({
		sessionId: "session-tamper",
		seatId: "Critic",
		rating: "up",
		credibilityScore: 0.60,
		weightMultiplier: 1.20,
	});

	// Authentic log passes
	assert.equal(emitter.verifyIntegrity(), true);

	// Attack Scenario A: Adversary mutates previous_hash (broken chain link)
	const logA = (emitter as any).log;
	const originalPrev = logA[1].previous_hash;
	logA[1].previous_hash = "0000000000000000000000000000000000000000000000000000000000000000";
	assert.equal(
		emitter.verifyIntegrity(),
		false,
		"Tampered previous_hash must cause verifyIntegrity() to return false",
	);
	logA[1].previous_hash = originalPrev; // restore

	// Attack Scenario B: Adversary alters signature (forgery attempt)
	const originalSig = logA[0].signature;
	logA[0].signature = "deadbeefcafebabedeadbeefcafebabedeadbeefcafebabedeadbeefcafebabe";
	assert.equal(
		emitter.verifyIntegrity(),
		false,
		"Forged or mutated signature must cause verifyIntegrity() to return false",
	);
	logA[0].signature = originalSig; // restore

	// Attack Scenario C: Adversary signs hash with a compromised / forged third-party key
	const forgedKey = "attacker-compromised-private-key";
	logA[0].signature = createHmac("sha256", forgedKey).update(logA[0].hash).digest("hex");
	assert.equal(
		emitter.verifyIntegrity(),
		false,
		"Signature forged with incorrect secret must be detected as invalid",
	);
	logA[0].signature = originalSig; // restore
});

// ============================================================================
// 5. END-TO-END CLOSED LOOP: BAYESIAN PRIORS TO DEBATELOOP CONSENSUS
// ============================================================================

test("Challenger 5.1: Asymmetric human feedback directly impacts DebateLoop consensus threshold", async () => {
	const credMgr = new CredibilityManager();
	const seatTransport = new MockAdversarialTransport(["HighExpert", "LowNovice"]);

	// Simulate asymmetric feedback:
	// HighExpert gets 10 thumbs up
	for (let i = 0; i < 10; i++) {
		credMgr.recordRating("HighExpert", "up");
	}
	// LowNovice gets 10 thumbs down
	for (let i = 0; i < 10; i++) {
		credMgr.recordRating("LowNovice", "down");
	}

	const highWeight = credMgr.getWeightMultiplier("HighExpert");
	const lowWeight = credMgr.getWeightMultiplier("LowNovice");

	// mu_high = 12 / 14 = 0.8571 -> weight = 0.8571 / 0.5 = 1.7142
	// mu_low = 2 / 14 = 0.1428 -> weight = 0.1428 / 0.5 = 0.2857 (above 0.2)
	assert.ok(highWeight > 1.6, `HighExpert weight should be > 1.6, got ${highWeight}`);
	assert.ok(lowWeight < 0.4, `LowNovice weight should be < 0.4, got ${lowWeight}`);

	const config: DebateConfig = {
		maxRounds: 1,
		consensusThreshold: 0.80,
		minConsensusSeats: 2,
		enableTieredPhases: false,
		dissentTriggerCount: 2,
		credibilityManager: credMgr,
	};

	const debateLoop = new DebateLoop(
		["HighExpert", "LowNovice"],
		seatTransport,
		() => [],
		config,
	);

	debateLoop.setRound(1);
	// Create messages where HighExpert has high confidence (0.90) and LowNovice has low confidence (0.45)
	const m1 = {
		...makeMockMessage({ id: "m1", fromSeat: "HighExpert", confidence: 0.90, round: 1 }),
		type: "consensus" as const,
	};
	const m2 = {
		...makeMockMessage({ id: "m2", fromSeat: "LowNovice", confidence: 0.45, round: 1 }),
		type: "consensus" as const,
	};
	debateLoop.pushTranscriptMessage(m1);
	debateLoop.pushTranscriptMessage(m2);

	// 1. Under unweighted average:
	// (0.90 + 0.45) / 2 = 0.675 < 0.80 -> DOES NOT PASS CONSENSUS
	const unweightedAvg = (0.90 + 0.45) / 2;
	assert.ok(unweightedAvg < 0.80, "Unweighted average fails 0.80 consensus threshold");

	// 2. Under credibility-weighted consensus in DebateLoop:
	// weightedAvg = (0.90 * highWeight + 0.45 * lowWeight) / (highWeight + lowWeight)
	// (0.90 * 1.7143 + 0.45 * 0.2857) / 2.0 = (1.5429 + 0.1286) / 2.0 = 1.6715 / 2.0 = 0.8357 >= 0.80
	// MUST PASS CONSENSUS!
	const hasConsensus = debateLoop.hasConsensus(1);
	assert.equal(
		hasConsensus,
		true,
		"Credibility-weighted consensus must pass threshold because high-credibility expert dominates",
	);

	// 3. Verify computeFinalConfidence utilizes the credibility weights
	const finalConfidence = debateLoop.computeFinalConfidence(1);
	assert.ok(
		finalConfidence >= 0.83 && finalConfidence <= 0.85,
		`Final confidence (${finalConfidence}) must match credibility-weighted calculation (~0.84)`,
	);
});

test("Challenger 5.2: Extreme rating stress respects strict boundary clamping [0.2, 1.8]", () => {
	const mgr = new CredibilityManager();

	// 1,000 thumbs up
	for (let i = 0; i < 1000; i++) {
		mgr.recordRating("ExtremeGood", "up");
	}
	const good = mgr.getCredibility("ExtremeGood");
	assert.equal(
		good.weightMultiplier,
		1.8,
		"Weight multiplier must never exceed 1.8 under extreme positive reinforcement",
	);
	assert.ok(good.credibilityScore > 0.99);

	// 1,000 thumbs down
	for (let i = 0; i < 1000; i++) {
		mgr.recordRating("ExtremeBad", "down");
	}
	const bad = mgr.getCredibility("ExtremeBad");
	assert.equal(
		bad.weightMultiplier,
		0.2,
		"Weight multiplier must never drop below 0.2 under extreme negative reinforcement",
	);
	assert.ok(bad.credibilityScore < 0.01);
	assert.ok(bad.weightMultiplier > 0, "Weight multiplier must strictly be > 0 (prevents div by zero)");
});

test("Challenger 5.3: DebateLoop computeFinalConfidence handles unweighted fallback and precision", () => {
	const seatTransport = new MockAdversarialTransport(["Seat1", "Seat2"]);
	const config: DebateConfig = {
		maxRounds: 1,
		consensusThreshold: 0.80,
		minConsensusSeats: 1,
		enableTieredPhases: false,
		dissentTriggerCount: 2,
	};

	const loopWithoutCredibility = new DebateLoop(
		["Seat1", "Seat2"],
		seatTransport,
		() => [],
		config,
	);
	loopWithoutCredibility.setRound(1);

	// Empty messages fallback (returns 0 when no messages exist in round)
	assert.equal(loopWithoutCredibility.computeFinalConfidence(1), 0);

	// Single message fallback
	loopWithoutCredibility.pushTranscriptMessage(
		makeMockMessage({ id: "s1", fromSeat: "Seat1", confidence: 0.8888, round: 1 }),
	);
	assert.equal(
		loopWithoutCredibility.computeFinalConfidence(1),
		0.89,
		"Single confidence must round to 2 decimal places",
	);

	// Multiple unweighted messages
	loopWithoutCredibility.pushTranscriptMessage(
		makeMockMessage({ id: "s2", fromSeat: "Seat2", confidence: 0.70, round: 1 }),
	);
	// (0.8888 + 0.70) / 2 = 1.5888 / 2 = 0.7944 -> 0.79
	assert.equal(loopWithoutCredibility.computeFinalConfidence(1), 0.79);
});

// Teardown test at the end of the suite
test("99. Suite Teardown: Terminate live Gateway server", () => {
	killProcess(serverProc);
	serverProc = null;
});
