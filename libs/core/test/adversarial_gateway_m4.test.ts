import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import Database from "better-sqlite3";
import { AuditTrailEmitter, type AuditEvent } from "../src/engine/AuditTrailEmitter.js";
import {
	AuditChainVerifier,
	type AuditVerificationReport,
	type AuditProofCertificate,
} from "../src/engine/AuditChainVerifier.js";

const TEST_PORT = 8798;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_AUDIT_SECRET = "test-gateway-secret-2026";

let serverProc: ChildProcess | null = null;
let testConversationId: string = "";
let emptyConversationId: string = "";

function createSampleTrail(count = 3, secret = TEST_AUDIT_SECRET, sessionId = "session-gw-test-1"): AuditEvent[] {
	const emitter = new AuditTrailEmitter(secret);
	for (let i = 0; i < count; i++) {
		emitter.emitEvent({
			event_type: i === count - 1 ? "session_complete" : "governance_recalibration",
			session_id: sessionId,
			timestamp: 1740000000000 + i * 1000,
			payload: {
				step: i,
				seat: i % 2 === 0 ? "FactChecker" : "CloudArchitect",
				confidence: 0.88,
				action: `step_${i}_executed`,
			},
		});
	}
	return emitter.getLog();
}

before(async () => {
	// Seed two test conversations into data/conversations.db
	const db = new Database("data/conversations.db");
	testConversationId = `conv_test_m4_${Date.now()}`;
	emptyConversationId = `conv_test_empty_${Date.now()}`;

	const sampleEvents = createSampleTrail(3, TEST_AUDIT_SECRET, testConversationId);

	db.prepare(`
		INSERT INTO conversations (id, title, created_at, updated_at, topic, mode, status, final_confidence, inquiry_score, data_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		testConversationId,
		"M4 Adversarial Test Conversation",
		Date.now(),
		Date.now(),
		"Testing M4 cryptographic audit verification",
		"sample",
		"completed",
		0.91,
		88,
		JSON.stringify({ messages: [], auditEvents: sampleEvents }),
	);

	db.prepare(`
		INSERT INTO conversations (id, title, created_at, updated_at, topic, mode, status, final_confidence, inquiry_score, data_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		emptyConversationId,
		"M4 Empty Audit Conversation",
		Date.now(),
		Date.now(),
		"Testing M4 empty audit events",
		"sample",
		"completed",
		0.5,
		50,
		JSON.stringify({ messages: [], auditEvents: [] }),
	);

	db.close();

	// Spawn server process on port 8798
	serverProc = spawn("npx", ["tsx", "apps/web/server.ts"], {
		env: {
			...process.env,
			WEB_PORT: String(TEST_PORT),
			AUDIT_TRAIL_SECRET: TEST_AUDIT_SECRET,
		},
		stdio: "pipe",
		shell: true,
	});

	// Wait for server to become responsive
	let ready = false;
	const start = Date.now();
	while (!ready && Date.now() - start < 15000) {
		try {
			const res = await fetch(`${BASE_URL}/api/health`);
			if (res.ok) {
				ready = true;
				break;
			}
		} catch {
			await new Promise((r) => setTimeout(r, 300));
		}
	}

	if (!ready) {
		throw new Error("Failed to start apps/web/server.ts within 15 seconds");
	}
});

after(() => {
	if (serverProc && serverProc.pid) {
		try {
			spawn("taskkill", ["/pid", String(serverProc.pid), "/T", "/F"]);
		} catch {}
		serverProc = null;
	}

	// Clean up seeded records from conversations.db
	try {
		const db = new Database("data/conversations.db");
		db.prepare("DELETE FROM conversations WHERE id IN (?, ?)").run(
			testConversationId,
			emptyConversationId,
		);
		db.close();
	} catch {
		// ignore
	}
});

// ============================================================================
// 1. POST /api/audit/verify Adversarial Tests
// ============================================================================

test("Adversarial M4 Gateway: POST /api/audit/verify with malformed JSON body returns 500 error cleanly without crash", async () => {
	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{ malformed json: not valid ...",
	});

	// Server catches JSON.parse error and responds with status 500 (or 400)
	assert.ok(res.status === 500 || res.status === 400, `Expected 400 or 500, got ${res.status}`);
	const json = await res.json();
	assert.ok(json.error, "Expected error message in response");

	// Verify server remains alive
	const health = await fetch(`${BASE_URL}/api/health`);
	assert.equal(health.status, 200);
});

test("Adversarial M4 Gateway: POST /api/audit/verify with nonexistent conversationId verifies empty events cleanly", async () => {
	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ conversationId: "nonexistent-conversation-uuid-99999" }),
	});

	assert.equal(res.status, 200);
	const report: AuditVerificationReport = await res.json();
	assert.equal(report.verified, true);
	assert.equal(report.totalBlocks, 0);
	assert.equal(report.status, "VERIFIED");
	assert.equal(report.terminalHash, AuditChainVerifier.GENESIS_ANCHOR);
});

test("Adversarial M4 Gateway: POST /api/audit/verify with empty events array returns verified report", async () => {
	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ auditEvents: [] }),
	});

	assert.equal(res.status, 200);
	const report: AuditVerificationReport = await res.json();
	assert.equal(report.verified, true);
	assert.equal(report.totalBlocks, 0);
	assert.equal(report.details.length, 0);
});

test("Adversarial M4 Gateway: POST /api/audit/verify handles oversized payload (1,000 blocks)", async () => {
	const largeChain = createSampleTrail(1000, TEST_AUDIT_SECRET, "large-session-perf");
	const start = Date.now();

	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ auditEvents: largeChain, secret: TEST_AUDIT_SECRET }),
	});

	const duration = Date.now() - start;
	assert.equal(res.status, 200);
	const report: AuditVerificationReport = await res.json();
	assert.equal(report.verified, true);
	assert.equal(report.totalBlocks, 1000);
	assert.ok(duration < 4000, `Large payload verification took ${duration}ms, expected < 4000ms`);
});

test("Adversarial M4 Gateway: POST /api/audit/verify detects PAYLOAD_HASH_MISMATCH when auditEvents tampered", async () => {
	const events = createSampleTrail(4, TEST_AUDIT_SECRET);
	const tampered = events.map((e, idx) =>
		idx === 2 ? { ...e, payload: { ...e.payload, tampered: true } } : e,
	);

	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ auditEvents: tampered, secret: TEST_AUDIT_SECRET }),
	});

	assert.equal(res.status, 200);
	const report: AuditVerificationReport = await res.json();
	assert.equal(report.verified, false);
	assert.equal(report.status, "PAYLOAD_HASH_MISMATCH");
	assert.equal(report.corruptedBlockIndex, 2);
	assert.equal(report.corruptedBlockId, events[2].id);
});

test("Adversarial M4 Gateway: POST /api/audit/verify detects BROKEN_CHAIN_LINK when previous_hash tampered", async () => {
	const events = createSampleTrail(4, TEST_AUDIT_SECRET);
	const tampered = events.map((e, idx) =>
		idx === 2 ? { ...e, previous_hash: "00000000broken00000000broken00000000" } : e,
	);

	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ auditEvents: tampered, secret: TEST_AUDIT_SECRET }),
	});

	assert.equal(res.status, 200);
	const report: AuditVerificationReport = await res.json();
	assert.equal(report.verified, false);
	assert.equal(report.status, "BROKEN_CHAIN_LINK");
	assert.equal(report.corruptedBlockIndex, 2);
});

test("Adversarial M4 Gateway: POST /api/audit/verify detects INVALID_SIGNATURE when signature forged", async () => {
	const events = createSampleTrail(4, TEST_AUDIT_SECRET);
	const tampered = events.map((e, idx) =>
		idx === 1 ? { ...e, signature: "forged_signature_1234567890abcdef" } : e,
	);

	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ auditEvents: tampered, secret: TEST_AUDIT_SECRET }),
	});

	assert.equal(res.status, 200);
	const report: AuditVerificationReport = await res.json();
	assert.equal(report.verified, false);
	assert.equal(report.status, "INVALID_SIGNATURE");
	assert.equal(report.corruptedBlockIndex, 1);
});

test("Adversarial M4 Gateway: EMPIRICAL FINDING — POST /api/audit/verify with both conversationId and tampered auditEvents overwrites client auditEvents with DB events", async () => {
	// When TrustEvidenceView simulates tamper on a saved conversation, it passes both:
	// { auditEvents: mutatedEvents, conversationId: conversation.id }
	const events = createSampleTrail(3, TEST_AUDIT_SECRET, testConversationId);
	const tamperedEvents = events.map((e, idx) =>
		idx === 1 ? { ...e, payload: { ...e.payload, consensus_reached: false, unauthorized_mutation: true } } : e,
	);

	const res = await fetch(`${BASE_URL}/api/audit/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			conversationId: testConversationId,
			auditEvents: tamperedEvents,
			secret: TEST_AUDIT_SECRET,
		}),
	});

	assert.equal(res.status, 200);
	const report: AuditVerificationReport = await res.json();

	// EMPIRICAL OBSERVATION:
	// Because server.ts line 848-853 checks:
	// if (conversationId) { const conv = getConversationById(conversationId); if (conv && conv.auditEvents) events = conv.auditEvents; }
	// The server overwrites the client's tampered events with the pristine database events!
	// Therefore report.verified is TRUE instead of FALSE!
	console.log("[EMPIRICAL FINDING] POST /api/audit/verify with both conversationId and tampered events result:", {
		verified: report.verified,
		status: report.status,
		totalBlocks: report.totalBlocks,
	});

	// We document this empirical behavior:
	assert.equal(
		report.verified,
		true,
		"Empirically observed: server overwrites client auditEvents when conversationId is present in DB",
	);
});

test("Adversarial M4 Gateway: POST /api/audit/verify method enforcement (PUT returns 405, GET returns SPA fallback)", async () => {
	const putRes = await fetch(`${BASE_URL}/api/audit/verify`, { method: "PUT" });
	assert.equal(putRes.status, 405, "PUT /api/audit/verify must return 405 Method Not Allowed");

	const getRes = await fetch(`${BASE_URL}/api/audit/verify`, { method: "GET" });
	assert.equal(getRes.status, 200, "GET /api/audit/verify falls through to SPA index.html");
	const text = await getRes.text();
	assert.ok(text.includes("<html") || text.includes("<!DOCTYPE") || text.includes("<div id=\"root\""));
});

// ============================================================================
// 2. GET /api/conversations/:id/audit-certificate Adversarial Tests
// ============================================================================

test("Adversarial M4 Gateway: GET /api/conversations/:id/audit-certificate returns 404 for nonexistent conversation", async () => {
	const res = await fetch(`${BASE_URL}/api/conversations/nonexistent-conv-id-9999/audit-certificate`);
	assert.equal(res.status, 404);
	const json = await res.json();
	assert.equal(json.error, "Conversation not found");
});

test("Adversarial M4 Gateway: GET /api/conversations/:id/audit-certificate returns 404 on directory traversal attempts", async () => {
	const res = await fetch(`${BASE_URL}/api/conversations/..%2f..%2fpackage.json/audit-certificate`);
	assert.equal(res.status, 404);
});

test("Adversarial M4 Gateway: GET /api/conversations/:id/audit-certificate generates compliant certificate for valid conversation", async () => {
	const res = await fetch(`${BASE_URL}/api/conversations/${testConversationId}/audit-certificate`);
	assert.equal(res.status, 200);

	const cert: AuditProofCertificate = await res.json();
	assert.equal(cert.certificateVersion, "1.0");
	assert.equal(cert.standard, "RFC-6962 / NIST SP 800-92 Tamper-Evident Chaining");
	assert.equal(cert.issuer, "GovernMindz Enterprise Cryptographic Authority");
	assert.equal(cert.sessionId, testConversationId);
	assert.equal(cert.verificationResult.verified, true);
	assert.equal(cert.verificationResult.status, "VERIFIED");
	assert.equal(cert.verificationResult.totalBlocks, 3);
	assert.equal(cert.blockManifest.length, 3);
	assert.ok(cert.attestationSignature && cert.attestationSignature.length === 64);

	// Verify cryptographic attestation signature
	const { attestationSignature, ...body } = cert;
	const expectedSig = createHmac("sha256", TEST_AUDIT_SECRET)
		.update(JSON.stringify(body))
		.digest("hex");
	assert.equal(attestationSignature, expectedSig, "Attestation signature must cryptographically seal certificate");
});

test("Adversarial M4 Gateway: GET /api/conversations/:id/audit-certificate handles conversation with empty audit trail", async () => {
	const res = await fetch(`${BASE_URL}/api/conversations/${emptyConversationId}/audit-certificate`);
	assert.equal(res.status, 200);

	const cert: AuditProofCertificate = await res.json();
	assert.equal(cert.sessionId, emptyConversationId);
	assert.equal(cert.verificationResult.totalBlocks, 0);
	assert.equal(cert.verificationResult.verified, true);
	assert.equal(cert.blockManifest.length, 0);
	assert.ok(cert.attestationSignature && cert.attestationSignature.length === 64);
});

test("Adversarial M4 Gateway: GET /api/conversations/:id/audit-certificate method enforcement (POST returns 405)", async () => {
	const res = await fetch(`${BASE_URL}/api/conversations/${testConversationId}/audit-certificate`, {
		method: "POST",
	});
	assert.equal(res.status, 405);
});
