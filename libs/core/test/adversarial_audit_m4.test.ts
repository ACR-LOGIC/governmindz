import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac } from "node:crypto";
import { AuditTrailEmitter, type AuditEvent } from "../src/engine/AuditTrailEmitter.js";
import {
	AuditChainVerifier,
	type AuditVerificationReport,
	type AuditProofCertificate,
} from "../src/engine/AuditChainVerifier.js";

const MASTER_AUDIT_SECRET = "gov-master-audit-secret-key-prod-2026";
const ATTACKER_FORGED_SECRET = "evil-forged-secret-key-attacker-2026";

/**
 * Helper to build synthetic audit chains of arbitrary length
 */
function buildSyntheticChain(
	count: number,
	secret = MASTER_AUDIT_SECRET,
	sessionId = "session-adv-bench-99",
): AuditEvent[] {
	const emitter = new AuditTrailEmitter(secret);
	for (let i = 0; i < count; i++) {
		emitter.emitEvent({
			event_type: i === count - 1 ? "session_complete" : "governance_recalibration",
			session_id: sessionId,
			timestamp: 1740000000000 + i * 500,
			payload: {
				blockSeq: i,
				seat: i % 3 === 0 ? "FactChecker" : i % 3 === 1 ? "CloudArchitect" : "Synthesizer",
				confidence: 0.75 + (i % 20) * 0.01,
				entropy: Math.sin(i),
				metadata: {
					stage: `round_${Math.floor(i / 10)}`,
					tags: ["empirical", "adversarial", `tag_${i}`],
				},
			},
		});
	}
	return emitter.getLog();
}

// ============================================================================
// 1. Scale & Performance Stress Testing (10,000 Blocks)
// ============================================================================
test("Adversarial M4: 10,000-block massive chain verification and throughput stress", () => {
	const count = 10_000;
	const startTime = Date.now();
	const events = buildSyntheticChain(count, MASTER_AUDIT_SECRET);
	const buildDuration = Date.now() - startTime;

	assert.equal(events.length, count);

	// Verify all 10,000 blocks
	const verifyStart = Date.now();
	const report = AuditChainVerifier.verify(events, MASTER_AUDIT_SECRET);
	const verifyDuration = Date.now() - verifyStart;

	// Empirical assertions
	assert.equal(report.verified, true);
	assert.equal(report.status, "VERIFIED");
	assert.equal(report.totalBlocks, count);
	assert.equal(report.corruptedBlockIndex, null);
	assert.equal(report.corruptedBlockId, null);
	assert.equal(report.details.length, count);
	assert.equal(report.genesisAnchor, AuditChainVerifier.GENESIS_ANCHOR);
	assert.equal(report.terminalHash, events[count - 1].hash);

	// Performance stress assertion: 10,000 blocks verified in under 3500ms
	assert.ok(
		verifyDuration < 3500,
		`Verification of 10,000 blocks took ${verifyDuration}ms, expected < 3500ms`,
	);
});

// ============================================================================
// 2. Empty & Boundary Chain Edge Cases
// ============================================================================
test("Adversarial M4: Empty chain (0 blocks) handles boundary gracefully", () => {
	const report = AuditChainVerifier.verify([], MASTER_AUDIT_SECRET);
	assert.equal(report.verified, true);
	assert.equal(report.totalBlocks, 0);
	assert.equal(report.status, "VERIFIED");
	assert.equal(report.corruptedBlockIndex, null);
	assert.equal(report.corruptedBlockId, null);
	assert.equal(report.details.length, 0);
	assert.equal(report.terminalHash, AuditChainVerifier.GENESIS_ANCHOR);

	// Proof certificate on empty report
	const cert = AuditChainVerifier.generateProofCertificate(report, "empty-session", MASTER_AUDIT_SECRET);
	assert.equal(cert.verificationResult.verified, true);
	assert.equal(cert.verificationResult.totalBlocks, 0);
	assert.equal(cert.blockManifest.length, 0);
	assert.ok(cert.attestationSignature && cert.attestationSignature.length === 64);
});

test("Adversarial M4: Single-block chain (1 block) verification and single-block corruptions", () => {
	const events = buildSyntheticChain(1, MASTER_AUDIT_SECRET);
	const pristineReport = AuditChainVerifier.verify(events, MASTER_AUDIT_SECRET);
	assert.equal(pristineReport.verified, true);
	assert.equal(pristineReport.totalBlocks, 1);
	assert.equal(pristineReport.status, "VERIFIED");

	// Corrupt Block #0 genesis link
	const badGenesis: AuditEvent[] = [{ ...events[0], previous_hash: "wrong_genesis_hash" }];
	const badGenesisReport = AuditChainVerifier.verify(badGenesis, MASTER_AUDIT_SECRET);
	assert.equal(badGenesisReport.verified, false);
	assert.equal(badGenesisReport.status, "GENESIS_MISMATCH");
	assert.equal(badGenesisReport.corruptedBlockIndex, 0);
	assert.equal(badGenesisReport.corruptedBlockId, events[0].id);

	// Corrupt Block #0 payload
	const badPayload: AuditEvent[] = [
		{
			...events[0],
			payload: { ...events[0].payload, unauthorized_mutation: true },
		},
	];
	const badPayloadReport = AuditChainVerifier.verify(badPayload, MASTER_AUDIT_SECRET);
	assert.equal(badPayloadReport.verified, false);
	assert.equal(badPayloadReport.status, "PAYLOAD_HASH_MISMATCH");
	assert.equal(badPayloadReport.corruptedBlockIndex, 0);
	assert.equal(badPayloadReport.corruptedBlockId, events[0].id);

	// Corrupt Block #0 signature
	const badSig: AuditEvent[] = [{ ...events[0], signature: "tampered_signature_hex" }];
	const badSigReport = AuditChainVerifier.verify(badSig, MASTER_AUDIT_SECRET);
	assert.equal(badSigReport.verified, false);
	assert.equal(badSigReport.status, "INVALID_SIGNATURE");
	assert.equal(badSigReport.corruptedBlockIndex, 0);
	assert.equal(badSigReport.corruptedBlockId, events[0].id);
});

// ============================================================================
// 3. Exact Corruption Localization: Block #47 out of 100 Blocks
// ============================================================================
test("Adversarial M4: Exact corruption localization on Block #47 out of 100 blocks (Payload Mutation)", () => {
	const count = 100;
	const targetIdx = 47;
	const events = buildSyntheticChain(count, MASTER_AUDIT_SECRET);

	// Mutate payload of block #47 without updating hash
	const corruptedEvents: AuditEvent[] = events.map((ev, idx) =>
		idx === targetIdx
			? {
					...ev,
					payload: {
						...ev.payload,
						injected_malicious_claim: "Unauthorized modification by adversary",
						confidence: 0.0001,
					},
				}
			: { ...ev },
	);

	const report = AuditChainVerifier.verify(corruptedEvents, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "PAYLOAD_HASH_MISMATCH");
	assert.equal(report.totalBlocks, count);
	assert.equal(report.corruptedBlockIndex, targetIdx);
	assert.equal(report.corruptedBlockId, events[targetIdx].id);

	// Blocks 0..46 must all be VERIFIED
	for (let i = 0; i < targetIdx; i++) {
		assert.equal(report.details[i].status, "VERIFIED");
		assert.equal(report.details[i].signatureValid, true);
	}

	// Block #47 must be PAYLOAD_HASH_MISMATCH
	assert.equal(report.details[targetIdx].status, "PAYLOAD_HASH_MISMATCH");
	assert.ok(report.details[targetIdx].expectedHash !== report.details[targetIdx].actualHash);
	assert.ok(report.details[targetIdx].error?.includes("payload hash mismatch"));
});

test("Adversarial M4: Exact corruption localization on Block #47 out of 100 blocks (Broken Chain Link)", () => {
	const count = 100;
	const targetIdx = 47;
	const events = buildSyntheticChain(count, MASTER_AUDIT_SECRET);

	// Break previous_hash link of block #47
	const corruptedEvents: AuditEvent[] = events.map((ev, idx) =>
		idx === targetIdx
			? {
					...ev,
					previous_hash: "deadbeefcafebabe00112233445566778899aabbccddeeff0011223344556677",
				}
			: { ...ev },
	);

	const report = AuditChainVerifier.verify(corruptedEvents, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "BROKEN_CHAIN_LINK");
	assert.equal(report.corruptedBlockIndex, targetIdx);
	assert.equal(report.corruptedBlockId, events[targetIdx].id);

	// Blocks 0..46 must all be VERIFIED
	for (let i = 0; i < targetIdx; i++) {
		assert.equal(report.details[i].status, "VERIFIED");
	}

	// Block #47 must be BROKEN_CHAIN_LINK
	assert.equal(report.details[targetIdx].status, "BROKEN_CHAIN_LINK");
	assert.ok(
		report.details[targetIdx].expectedPreviousHash !==
			report.details[targetIdx].actualPreviousHash,
	);
	assert.ok(report.details[targetIdx].error?.includes("link broken"));
});

test("Adversarial M4: Exact corruption localization on Block #47 out of 100 blocks (Forged Signature)", () => {
	const count = 100;
	const targetIdx = 47;
	const events = buildSyntheticChain(count, MASTER_AUDIT_SECRET);

	// Mutate signature of block #47
	const corruptedEvents: AuditEvent[] = events.map((ev, idx) =>
		idx === targetIdx
			? {
					...ev,
					signature: "00000000000000000000000000000000forgedsignature1234567890abcdef",
				}
			: { ...ev },
	);

	const report = AuditChainVerifier.verify(corruptedEvents, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "INVALID_SIGNATURE");
	assert.equal(report.corruptedBlockIndex, targetIdx);
	assert.equal(report.corruptedBlockId, events[targetIdx].id);
	assert.equal(report.details[targetIdx].signatureValid, false);
	assert.equal(report.details[targetIdx].status, "INVALID_SIGNATURE");
	assert.ok(report.details[targetIdx].error?.includes("HMAC signature forged"));
});

// ============================================================================
// 4. Multiple Simultaneous Corruptions & Earliest Failure Isolation
// ============================================================================
test("Adversarial M4: Multiple simultaneous corruptions correctly isolates earliest root failure", () => {
	const count = 100;
	const events = buildSyntheticChain(count, MASTER_AUDIT_SECRET);

	// Introduce corruptions at #18 (payload), #52 (broken link), #84 (forged signature)
	const corruptedEvents: AuditEvent[] = events.map((ev, idx) => {
		if (idx === 18) {
			return { ...ev, payload: { ...ev.payload, injected_tamper: true } };
		}
		if (idx === 52) {
			return { ...ev, previous_hash: "bad_prev_hash_link_at_52" };
		}
		if (idx === 84) {
			return { ...ev, signature: "bad_sig_at_84" };
		}
		return { ...ev };
	});

	const report = AuditChainVerifier.verify(corruptedEvents, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, false);
	// Root failure must be isolated to block #18
	assert.equal(report.status, "PAYLOAD_HASH_MISMATCH");
	assert.equal(report.corruptedBlockIndex, 18);
	assert.equal(report.corruptedBlockId, events[18].id);

	// Granular verification checks on each block
	assert.equal(report.details[18].status, "PAYLOAD_HASH_MISMATCH");
	assert.equal(report.details[52].status, "BROKEN_CHAIN_LINK");
	assert.equal(report.details[84].status, "INVALID_SIGNATURE");

	// Uncorrupted blocks must reflect their respective state
	for (let i = 0; i < 18; i++) {
		assert.equal(report.details[i].status, "VERIFIED");
	}
});

// ============================================================================
// 5. Chain Truncation & Splicing Attacks
// ============================================================================
test("Adversarial M4: Head truncation attack (dropping Block #0) triggers GENESIS_MISMATCH", () => {
	const events = buildSyntheticChain(20, MASTER_AUDIT_SECRET);
	// Drop block #0 (events[0]), leaving blocks [1..19]
	const headTruncated = events.slice(1);

	const report = AuditChainVerifier.verify(headTruncated, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, false);
	// Block #1 now sits at index 0, but its previous_hash does NOT match GENESIS_ANCHOR
	assert.equal(report.status, "GENESIS_MISMATCH");
	assert.equal(report.corruptedBlockIndex, 0);
	assert.equal(report.corruptedBlockId, headTruncated[0].id);
	assert.equal(report.details[0].status, "GENESIS_MISMATCH");
});

test("Adversarial M4: Interior splicing attack (deleting an internal block) triggers BROKEN_CHAIN_LINK", () => {
	const events = buildSyntheticChain(30, MASTER_AUDIT_SECRET);
	// Delete block #12 (splice out index 12)
	const spliced = [...events.slice(0, 12), ...events.slice(13)];

	const report = AuditChainVerifier.verify(spliced, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, false);
	// What was previously block #13 is now at index 12, whose previous_hash points to deleted block #12
	assert.equal(report.status, "BROKEN_CHAIN_LINK");
	assert.equal(report.corruptedBlockIndex, 12);
	assert.equal(report.corruptedBlockId, spliced[12].id);
});

test("Adversarial M4: Tail truncation creates a strictly valid prefix", () => {
	const events = buildSyntheticChain(50, MASTER_AUDIT_SECRET);
	// Retain only prefix of 20 blocks
	const prefix = events.slice(0, 20);

	const report = AuditChainVerifier.verify(prefix, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, true);
	assert.equal(report.status, "VERIFIED");
	assert.equal(report.totalBlocks, 20);
	assert.equal(report.terminalHash, prefix[19].hash);
});

// ============================================================================
// 6. Cryptographic Secret Tampering & Fail-Closed Behavior
// ============================================================================
test("Adversarial M4: Wrong secret verification fails closed immediately (INVALID_SIGNATURE on Block #0)", () => {
	const events = buildSyntheticChain(25, MASTER_AUDIT_SECRET);

	// Verify with attacker's wrong secret
	const report = AuditChainVerifier.verify(events, ATTACKER_FORGED_SECRET);

	assert.equal(report.verified, false);
	assert.equal(report.status, "INVALID_SIGNATURE");
	assert.equal(report.corruptedBlockIndex, 0);
	assert.equal(report.corruptedBlockId, events[0].id);

	// All blocks evaluated with wrong secret must have signatureValid = false
	for (const detail of report.details) {
		assert.equal(detail.signatureValid, false);
	}
});

test("Adversarial M4: Single-character bitflip in HMAC secret fails verification closed", () => {
	const events = buildSyntheticChain(10, MASTER_AUDIT_SECRET);
	// Flip one character in secret
	const bitFlippedSecret = MASTER_AUDIT_SECRET.slice(0, -1) + "7";

	const report = AuditChainVerifier.verify(events, bitFlippedSecret);

	assert.equal(report.verified, false);
	assert.equal(report.status, "INVALID_SIGNATURE");
	assert.equal(report.corruptedBlockIndex, 0);
});

// ============================================================================
// 7. Proof Certificate Anti-Forgery & Tamper Resistance
// ============================================================================
test("Adversarial M4: Proof certificate attestation signature resists forgery and field tampering", () => {
	const events = buildSyntheticChain(20, MASTER_AUDIT_SECRET);
	const report = AuditChainVerifier.verify(events, MASTER_AUDIT_SECRET);
	const sessionId = "session-audit-tamper-cert-888";

	const certificate = AuditChainVerifier.generateProofCertificate(report, sessionId, MASTER_AUDIT_SECRET);

	// 1. Independent auditor verification function
	const verifyCertificateAttestation = (cert: AuditProofCertificate, secret: string): boolean => {
		const { attestationSignature, ...body } = cert;
		const expectedSig = createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
		return attestationSignature === expectedSig;
	};

	// Baseline certificate must verify
	assert.equal(verifyCertificateAttestation(certificate, MASTER_AUDIT_SECRET), true);

	// Forgery Attack 1: Verify with attacker's secret fails
	assert.equal(verifyCertificateAttestation(certificate, ATTACKER_FORGED_SECRET), false);

	// Forgery Attack 2: Tamper terminal head hash in certificate
	const tamperedHeadCert: AuditProofCertificate = {
		...certificate,
		verificationResult: {
			...certificate.verificationResult,
			terminalHeadHash: "tampered_terminal_head_hash_hex_00000000000000000000000000000000",
		},
	};
	assert.equal(verifyCertificateAttestation(tamperedHeadCert, MASTER_AUDIT_SECRET), false);

	// Forgery Attack 3: Tamper totalBlocks count
	const tamperedCountCert: AuditProofCertificate = {
		...certificate,
		verificationResult: {
			...certificate.verificationResult,
			totalBlocks: 9999,
		},
	};
	assert.equal(verifyCertificateAttestation(tamperedCountCert, MASTER_AUDIT_SECRET), false);

	// Forgery Attack 4: Tamper block manifest entry
	const tamperedManifestCert: AuditProofCertificate = {
		...certificate,
		blockManifest: certificate.blockManifest.map((b, idx) =>
			idx === 5 ? { ...b, hash: "tampered_block_hash" } : b,
		),
	};
	assert.equal(verifyCertificateAttestation(tamperedManifestCert, MASTER_AUDIT_SECRET), false);

	// Forgery Attack 5: Tamper session ID
	const tamperedSessionCert: AuditProofCertificate = {
		...certificate,
		sessionId: "forged-session-id-999",
	};
	assert.equal(verifyCertificateAttestation(tamperedSessionCert, MASTER_AUDIT_SECRET), false);
});

// ============================================================================
// 8. Complex Nested Payload & Canonical Serialization Consistency
// ============================================================================
test("Adversarial M4: Complex unicode, nulls, and nested arrays in payloads maintain canonical hash integrity", () => {
	const emitter = new AuditTrailEmitter(MASTER_AUDIT_SECRET);
	emitter.emitEvent({
		event_type: "governance_recalibration",
		session_id: "session-unicode-test",
		timestamp: 1740000000000,
		payload: {
			unicodeTitle: "🏛️ Governmindz ⚡ Délibération 🔒 Multi-Agent",
			nested: {
				arr: [1, null, true, "string", { k: "v" }],
				emptyObj: {},
				zero: 0,
				negative: -42.5,
			},
		},
	});

	const events = emitter.getLog();
	const report = AuditChainVerifier.verify(events, MASTER_AUDIT_SECRET);

	assert.equal(report.verified, true);
	assert.equal(report.status, "VERIFIED");
	assert.equal(report.details[0].expectedHash, events[0].hash);
	assert.equal(report.details[0].signatureValid, true);
});
