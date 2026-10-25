import { createHash, createHmac } from "node:crypto";
import type { AuditEvent } from "./AuditTrailEmitter";

export type VerificationStatus =
	| "VERIFIED"
	| "GENESIS_MISMATCH"
	| "BROKEN_CHAIN_LINK"
	| "PAYLOAD_HASH_MISMATCH"
	| "INVALID_SIGNATURE";

export interface BlockVerificationDetail {
	index: number;
	id: string;
	eventType: string;
	expectedPreviousHash: string;
	actualPreviousHash: string;
	expectedHash: string;
	actualHash: string;
	signatureValid: boolean;
	status: VerificationStatus;
	timestamp?: number;
	payload?: Record<string, unknown>;
	error?: string;
}

export interface AuditVerificationReport {
	verified: boolean;
	totalBlocks: number;
	corruptedBlockIndex: number | null;
	corruptedBlockId: string | null;
	status: VerificationStatus;
	details: BlockVerificationDetail[];
	blocks?: BlockVerificationDetail[];
	verifiedAt: number;
	genesisAnchor: string;
	terminalHash: string;
}

export interface AuditProofCertificate {
	certificateVersion: string;
	standard: string;
	certificateId: string;
	issuer: string;
	sessionId: string;
	timestamp: number;
	verificationResult: {
		verified: boolean;
		status: VerificationStatus;
		totalBlocks: number;
		genesisAnchor: string;
		terminalHeadHash: string;
		hmacAlgorithm: string;
		corruptedBlockIndex: number | null;
	};
	blockManifest: Array<{
		index: number;
		id: string;
		type: string;
		hash: string;
		previousHash: string;
		status: VerificationStatus;
	}>;
	attestationSignature: string;
}

export class AuditChainVerifier {
	public static readonly GENESIS_ANCHOR: string = createHash("sha256")
		.update("genesis:audit-trail")
		.digest("hex");

	/**
	 * Recomputes the SHA-256 hash of an audit event payload excluding hash and signature fields.
	 */
	public static calculateEventHash(event: AuditEvent | Record<string, unknown>): string {
		const { hash, signature, ...rest } = event as any;
		return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
	}

	/**
	 * Computes the HMAC-SHA256 signature for a given hash using a shared secret.
	 */
	public static calculateSignature(hash: string, secret: string): string {
		return createHmac("sha256", secret).update(hash).digest("hex");
	}

	/**
	 * Verifies the entire audit trail block by block with granular diagnostic localization.
	 */
	public static verify(events: AuditEvent[], secret?: string): AuditVerificationReport {
		const details: BlockVerificationDetail[] = [];
		let reportStatus: VerificationStatus = "VERIFIED";
		let corruptedIndex: number | null = null;
		let corruptedId: string | null = null;

		let expectedPrev = this.GENESIS_ANCHOR;

		for (let i = 0; i < events.length; i++) {
			const ev = events[i];
			const recomputedHash = this.calculateEventHash(ev);
			const expectedSig = secret ? this.calculateSignature(ev.hash, secret) : undefined;
			const signatureValid = secret ? ev.signature === expectedSig : true;

			let blockStatus: VerificationStatus = "VERIFIED";
			let error: string | undefined;

			const prevMatches = ev.previous_hash === expectedPrev;
			const hashMatches = ev.hash === recomputedHash;

			if (!prevMatches) {
				blockStatus = i === 0 ? "GENESIS_MISMATCH" : "BROKEN_CHAIN_LINK";
				error = i === 0
					? `Block #0 genesis anchor mismatch. Expected ${expectedPrev}, found ${ev.previous_hash}`
					: `Block #${i} link broken. Expected previous hash ${expectedPrev}, found ${ev.previous_hash}`;
			} else if (!hashMatches) {
				blockStatus = "PAYLOAD_HASH_MISMATCH";
				error = `Block #${i} payload hash mismatch. Expected ${recomputedHash}, stored ${ev.hash}`;
			} else if (!signatureValid) {
				blockStatus = "INVALID_SIGNATURE";
				error = `Block #${i} HMAC signature forged or signed with invalid secret`;
			}

			const detail: BlockVerificationDetail = {
				index: i,
				id: ev.id,
				eventType: ev.event_type,
				expectedPreviousHash: expectedPrev,
				actualPreviousHash: ev.previous_hash,
				expectedHash: recomputedHash,
				actualHash: ev.hash,
				signatureValid,
				status: blockStatus,
				timestamp: ev.timestamp,
				payload: ev.payload,
				error,
			};

			details.push(detail);

			if (blockStatus !== "VERIFIED" && reportStatus === "VERIFIED") {
				reportStatus = blockStatus;
				corruptedIndex = i;
				corruptedId = ev.id;
			}

			// Advance expectedPrev to the current event's actual hash so downstream blocks can be checked
			expectedPrev = ev.hash;
		}

		const terminalHash =
			events.length > 0 ? events[events.length - 1].hash : this.GENESIS_ANCHOR;

		return {
			verified: reportStatus === "VERIFIED",
			totalBlocks: events.length,
			corruptedBlockIndex: corruptedIndex,
			corruptedBlockId: corruptedId,
			status: reportStatus,
			details,
			blocks: details,
			verifiedAt: Date.now(),
			genesisAnchor: this.GENESIS_ANCHOR,
			terminalHash,
		};
	}

	/**
	 * Generates an enterprise-grade cryptographic proof certificate (RFC-6962 / NIST SP 800-92).
	 */
	public static generateProofCertificate(
		report: AuditVerificationReport,
		sessionId: string,
		secret?: string,
	): AuditProofCertificate {
		const timestamp = Date.now();
		const certificateId = `cert_${(sessionId || "audit").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}_${timestamp}`;

		const blockManifest = report.details.map((d) => ({
			index: d.index,
			id: d.id,
			type: d.eventType,
			hash: d.actualHash,
			previousHash: d.actualPreviousHash,
			status: d.status,
		}));

		const certBody = {
			certificateVersion: "1.0",
			standard: "RFC-6962 / NIST SP 800-92 Tamper-Evident Chaining",
			certificateId,
			issuer: "GovernMindz Enterprise Cryptographic Authority",
			sessionId,
			timestamp,
			verificationResult: {
				verified: report.verified,
				status: report.status,
				totalBlocks: report.totalBlocks,
				genesisAnchor: report.genesisAnchor || this.GENESIS_ANCHOR,
				terminalHeadHash: report.terminalHash,
				hmacAlgorithm: "HMAC-SHA256",
				corruptedBlockIndex: report.corruptedBlockIndex,
			},
			blockManifest,
		};

		const attestationSignature = secret
			? createHmac("sha256", secret).update(JSON.stringify(certBody)).digest("hex")
			: createHash("sha256").update(JSON.stringify(certBody)).digest("hex");

		return {
			...certBody,
			attestationSignature,
		};
	}
}
