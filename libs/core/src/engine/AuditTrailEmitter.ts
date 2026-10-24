// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor

/**
 * AuditTrailEmitter.ts
 *
 * Implements Claim 43: Signed, hash-chained audit records.
 * This version introduces cross-chain linkage by including the latest
 * head_hash of the memory decay chain in each governance event.
 */

import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DebateResult } from "../debate/DebateLoop";
import type { RuntimeInterrupt } from "../kernel/InterruptManager";

function resolveAuditTrailSecret(): string {
	const configuredSecret = process.env.AUDIT_TRAIL_SECRET?.trim();
	if (configuredSecret) {
		return configuredSecret;
	}

	try {
		const envPath = path.resolve(process.cwd(), ".env.local");
		if (fs.existsSync(envPath)) {
			const envLines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
			for (const line of envLines) {
				const trimmed = line.trim();
				if (trimmed.startsWith("AUDIT_TRAIL_SECRET=")) {
					const val = trimmed.slice("AUDIT_TRAIL_SECRET=".length).trim();
					if (val) {
						process.env.AUDIT_TRAIL_SECRET = val;
						return val;
					}
				}
			}
		}
	} catch {
		// ignore
	}

	throw new Error(
		"AUDIT_TRAIL_SECRET is required; refusing to sign audit trail with a default key.",
	);
}

export interface AuditEvent {
	id: string;
	event_type:
		| "session_complete"
		| "interrupt"
		| "governance_recalibration"
		| "consensus_reached"
		| "decay_sync";
	session_id: string;
	timestamp: number;
	payload: Record<string, unknown>;

	// Claim 43: Chaining and Signing
	previous_hash: string;
	hash: string;
	signature: string;

	// Novel Feature: Cross-Chain Linkage
	linked_decay_hash?: string;
}

export class AuditTrailEmitter {
	private log: AuditEvent[] = [];
	private headHash: string = "";
	private secret: string;
	private listeners: Array<(event: AuditEvent) => void> = [];

	constructor(secret = resolveAuditTrailSecret()) {
		this.secret = secret;
		this.headHash = this.hashGenesis();
	}

	onEmit(listener: (event: AuditEvent) => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	setSecret(secret: string): void {
		const trimmedSecret = secret.trim();
		if (!trimmedSecret) {
			throw new Error("Audit trail secret must not be empty.");
		}

		this.secret = trimmedSecret;
	}

	emitSessionComplete(result: DebateResult, linkedDecayHash?: string): void {
		this.emit({
			event_type: "session_complete",
			session_id: result.session_id,
			timestamp: result.timestamp || Date.now(),
			linked_decay_hash: linkedDecayHash,
			payload: {
				rounds: result.rounds,
				consensus_reached: result.consensusReached,
				final_confidence: result.finalConfidence,
				seat_vote_count: result.seat_votes
					? Object.keys(result.seat_votes).length
					: 0,
			},
		});
	}

	emitInterrupt(interrupt: RuntimeInterrupt, linkedDecayHash?: string): void {
		this.emit({
			event_type: "interrupt",
			session_id: (interrupt.payload?.runId as string) || "unknown",
			timestamp: interrupt.timestamp,
			linked_decay_hash: linkedDecayHash,
			payload: {
				interrupt_class: interrupt.class,
				source: interrupt.source,
				reason: interrupt.reason,
			},
		});
	}

	private emit(
		params: Omit<AuditEvent, "id" | "previous_hash" | "hash" | "signature">,
	): void {
		const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

		const event: AuditEvent = {
			...params,
			id,
			previous_hash: this.headHash,
			hash: "",
			signature: "",
		};

		// 1. Calculate Hash of the event (excluding signature)
		event.hash = this.calculateHash(event);

		// 2. Sign the Hash
		event.signature = this.sign(event.hash);

		// 3. Advance Head
		this.headHash = event.hash;

		this.log.push(event);
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				// ignore
			}
		}
		console.log(
			`[AuditTrail][${event.event_type}] Hash: ${event.hash.substr(0, 8)}... LinkedDecay: ${event.linked_decay_hash?.substr(0, 8) || "none"}`,
		);
	}

	private hashGenesis(): string {
		return createHash("sha256").update("genesis:audit-trail").digest("hex");
	}

	private calculateHash(event: Omit<AuditEvent, "hash" | "signature">): string {
		const { hash, signature, ...rest } = event as any;
		return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
	}

	private sign(payload: string): string {
		return createHmac("sha256", this.secret).update(payload).digest("hex");
	}

	getLog(): AuditEvent[] {
		return [...this.log];
	}

	/**
	 * Public emit for external orchestration workflows.
	 */
	emitEvent(params: Omit<AuditEvent, "id" | "previous_hash" | "hash" | "signature">): void {
		this.emit(params);
	}

	verifyIntegrity(): boolean {
		let prev = this.hashGenesis();
		for (const event of this.log) {
			if (event.previous_hash !== prev) return false;
			if (this.sign(event.hash) !== event.signature) return false;
			prev = event.hash;
		}
		return true;
	}
}

export const auditTrail = new AuditTrailEmitter();
