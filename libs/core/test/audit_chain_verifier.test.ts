import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac } from "node:crypto";
import { AuditTrailEmitter, type AuditEvent } from "../src/engine/AuditTrailEmitter.js";
import {
	AuditChainVerifier,
	type AuditVerificationReport,
	type AuditProofCertificate,
} from "../src/engine/AuditChainVerifier.js";

const TEST_SECRET = "test-cryptographic-audit-secret-2026";

function createSampleAuditTrail(count = 4, secret = TEST_SECRET): { emitter: AuditTrailEmitter; events: AuditEvent[] } {
	const emitter = new AuditTrailEmitter(secret);
	for (let i = 0; i < count; i++) {
		emitter.emitEvent({
			event_type: i === count - 1 ? "session_complete" : "governance_recalibration",
			session_id: "session-test-audit-uuid",
			timestamp: 1740000000000 + i * 1000,
			payload: {
				step: i,
				seat: i % 2 === 0 ? "FactChecker" : "CloudArchitect",
				confidence: 0.85 + i * 0.02,
				consensus_reached: i === count - 1,
			},
		});
	}
	return { emitter, events: emitter.getLog() };
}

test("AuditChainVerifier: verifies valid unbroken audit chain with 100% integrity", () => {
	const { events } = createSampleAuditTrail(5);
	const report = AuditChainVerifier.verify(events, TEST_SECRET);

	assert.equal(report.verified, true);
	assert.equal(report.status, "VERIFIED");
	assert.equal(report.totalBlocks, 5);
	assert.equal(report.corruptedBlockIndex, null);
	assert.equal(report.corruptedBlockId, null);
	assert.equal(report.details.length, 5);
	assert.equal(report.genesisAnchor, AuditChainVerifier.GENESIS_ANCHOR);
	assert.equal(report.terminalHash, events[events.length - 1].hash);

	for (let i = 0; i < report.details.length; i++) {
		const detail = report.details[i];
		assert.equal(detail.index, i);
		assert.equal(detail.id, events[i].id);
		assert.equal(detail.status, "VERIFIED");
		assert.equal(detail.signatureValid, true);
		assert.equal(detail.actualHash, detail.expectedHash);
		assert.equal(detail.actualPreviousHash, detail.expectedPreviousHash);
	}
});

test("AuditChainVerifier: detects genesis anchor mismatch on Block #0", () => {
	const { events } = createSampleAuditTrail(4);
	// Clone and corrupt genesis anchor
	const corruptedEvents: AuditEvent[] = events.map((e, idx) =>
		idx === 0
			? {
					...e,
					previous_hash: "0000000000000000000000000000000000000000000000000000000000000000",
				}
			: { ...e },
	);

	const report = AuditChainVerifier.verify(corruptedEvents, TEST_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "GENESIS_MISMATCH");
	assert.equal(report.corruptedBlockIndex, 0);
	assert.equal(report.corruptedBlockId, events[0].id);
	assert.equal(report.details[0].status, "GENESIS_MISMATCH");
});

test("AuditChainVerifier: detects payload mutation and localizes exact corrupted block (PAYLOAD_HASH_MISMATCH)", () => {
	const { events } = createSampleAuditTrail(4);
	const targetIdx = 2;
	// Clone and tamper with the payload without updating the event hash or signature
	const corruptedEvents: AuditEvent[] = events.map((e, idx) =>
		idx === targetIdx
			? {
					...e,
					payload: {
						...e.payload,
						confidence: 0.05,
						consensus_reached: false,
						unauthorized_flag: true,
					},
				}
			: { ...e },
	);

	const report = AuditChainVerifier.verify(corruptedEvents, TEST_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "PAYLOAD_HASH_MISMATCH");
	assert.equal(report.corruptedBlockIndex, targetIdx);
	assert.equal(report.corruptedBlockId, events[targetIdx].id);

	const targetDetail = report.details[targetIdx];
	assert.equal(targetDetail.status, "PAYLOAD_HASH_MISMATCH");
	assert.ok(targetDetail.expectedHash !== targetDetail.actualHash);
	assert.ok(targetDetail.error?.includes("payload hash mismatch"));
});

test("AuditChainVerifier: detects broken link between blocks (BROKEN_CHAIN_LINK)", () => {
	const { events } = createSampleAuditTrail(4);
	const targetIdx = 2;
	// Alter the previous_hash link
	const corruptedEvents: AuditEvent[] = events.map((e, idx) =>
		idx === targetIdx
			? {
					...e,
					previous_hash: "deadbeefcafebabe1122334455667788deadbeefcafebabe1122334455667788",
				}
			: { ...e },
	);

	const report = AuditChainVerifier.verify(corruptedEvents, TEST_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "BROKEN_CHAIN_LINK");
	assert.equal(report.corruptedBlockIndex, targetIdx);
	assert.equal(report.corruptedBlockId, events[targetIdx].id);
	assert.equal(report.details[targetIdx].status, "BROKEN_CHAIN_LINK");
	assert.ok(report.details[targetIdx].error?.includes("link broken"));
});

test("AuditChainVerifier: detects forged or invalid HMAC signature (INVALID_SIGNATURE)", () => {
	const { events } = createSampleAuditTrail(4);
	const targetIdx = 1;
	// Forged signature
	const corruptedEvents: AuditEvent[] = events.map((e, idx) =>
		idx === targetIdx
			? {
					...e,
					signature: "forged_hmac_signature_value_not_matching_key_1234567890",
				}
			: { ...e },
	);

	const report = AuditChainVerifier.verify(corruptedEvents, TEST_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "INVALID_SIGNATURE");
	assert.equal(report.corruptedBlockIndex, targetIdx);
	assert.equal(report.corruptedBlockId, events[targetIdx].id);
	assert.equal(report.details[targetIdx].signatureValid, false);
	assert.equal(report.details[targetIdx].status, "INVALID_SIGNATURE");
});

test("AuditChainVerifier: generates RFC-6962 / NIST SP 800-92 proof certificate with attestation signature", () => {
	const { events } = createSampleAuditTrail(3);
	const report = AuditChainVerifier.verify(events, TEST_SECRET);
	const sessionId = "session-audit-proof-test-99";

	const certificate: AuditProofCertificate = AuditChainVerifier.generateProofCertificate(
		report,
		sessionId,
		TEST_SECRET,
	);

	assert.equal(certificate.certificateVersion, "1.0");
	assert.equal(certificate.standard, "RFC-6962 / NIST SP 800-92 Tamper-Evident Chaining");
	assert.equal(certificate.issuer, "GovernMindz Enterprise Cryptographic Authority");
	assert.equal(certificate.sessionId, sessionId);
	assert.ok(certificate.certificateId.startsWith("cert_"));
	assert.equal(certificate.verificationResult.verified, true);
	assert.equal(certificate.verificationResult.status, "VERIFIED");
	assert.equal(certificate.verificationResult.totalBlocks, 3);
	assert.equal(certificate.verificationResult.hmacAlgorithm, "HMAC-SHA256");
	assert.equal(certificate.blockManifest.length, 3);
	assert.ok(certificate.attestationSignature && certificate.attestationSignature.length === 64);

	// Verify the attestation signature can be verified with HMAC-SHA256 of the certificate body
	const { attestationSignature, ...certBody } = certificate;
	const expectedAttestation = createHmac("sha256", TEST_SECRET)
		.update(JSON.stringify(certBody))
		.digest("hex");
	assert.equal(attestationSignature, expectedAttestation);
});

test("AuditChainVerifier: gracefully handles empty event list", () => {
	const report = AuditChainVerifier.verify([], TEST_SECRET);
	assert.equal(report.verified, true);
	assert.equal(report.totalBlocks, 0);
	assert.equal(report.status, "VERIFIED");
	assert.equal(report.corruptedBlockIndex, null);
	assert.equal(report.details.length, 0);
});

test("AuditChainVerifier: server endpoint logic for POST /api/audit/verify validates auditEvents and localized failure", () => {
	const { events } = createSampleAuditTrail(3);
	// Valid request payload
	const validReq = { auditEvents: events, secret: TEST_SECRET };
	const validReport = AuditChainVerifier.verify(validReq.auditEvents, validReq.secret);
	assert.equal(validReport.verified, true);
	assert.equal(validReport.totalBlocks, 3);
	assert.equal(validReport.status, "VERIFIED");

	// Tampered request payload (payload modified)
	const tamperedReq = {
		auditEvents: events.map((e, idx) =>
			idx === 1 ? { ...e, payload: { ...e.payload, corrupted: true } } : e,
		),
		secret: TEST_SECRET,
	};
	const tamperedReport = AuditChainVerifier.verify(tamperedReq.auditEvents, tamperedReq.secret);
	assert.equal(tamperedReport.verified, false);
	assert.equal(tamperedReport.status, "PAYLOAD_HASH_MISMATCH");
	assert.equal(tamperedReport.corruptedBlockIndex, 1);
	assert.equal(tamperedReport.corruptedBlockId, events[1].id);
});
