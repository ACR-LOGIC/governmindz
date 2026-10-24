// biome-ignore-all lint/style/noNonNullAssertion: legacy code pending refactor

import Database from "better-sqlite3";
import { AuditEvent, AuditTrailEmitter, auditTrail } from "./AuditTrailEmitter";
import { randomUUID } from "node:crypto";
import { createHash, createHmac } from "node:crypto";

let DB_PATH = "audit.db";

// ============================================================
// SQLite schema management
// ============================================================

function initializeDatabase(dbPath: string = DB_PATH): Database.Database {
	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("synchronous = FULL");

	db.exec(`
		CREATE TABLE IF NOT EXISTS runs (
			run_id TEXT PRIMARY KEY,
			config_fingerprint TEXT,
			start_time INTEGER NOT NULL,
			end_time INTEGER,
			terminal_status TEXT NOT NULL DEFAULT 'RUNNING'
		);

		CREATE TABLE IF NOT EXISTS audit_events (
			id TEXT PRIMARY KEY,
			run_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			previous_hash TEXT NOT NULL,
			hash TEXT NOT NULL,
			signature TEXT NOT NULL,
			payload TEXT NOT NULL,
			linked_decay_hash TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_audit_events_run_id ON audit_events(run_id);
		CREATE INDEX IF NOT EXISTS idx_audit_events_seq ON audit_events(timestamp ASC);

		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at INTEGER NOT NULL,
			migration_text TEXT
		);
	`);

	return db;
}

// ============================================================
// Audit persistence adapter
// ============================================================

interface PersistEventOptions {
	runId: string;
	eventType: AuditEvent["event_type"];
	sessionId: AuditEvent["session_id"];
	timestamp: AuditEvent["timestamp"];
	payload: AuditEvent["payload"];
	previousHash: AuditEvent["previous_hash"];
	linkedDecayHash?: AuditEvent["linked_decay_hash"];
	secret?: string;
}

function persistEvent(db: Database.Database, opts: PersistEventOptions): AuditEvent {
	const event: AuditEvent = {
		id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
		event_type: opts.eventType,
		session_id: opts.sessionId,
		timestamp: opts.timestamp,
		payload: opts.payload,
		previous_hash: opts.previousHash,
		hash: "",
		signature: "",
		linked_decay_hash: opts.linkedDecayHash,
	};

	// Calculate hash (excluding signature)
	event.hash = calculateHash(event);

	// Sign the hash
	event.signature = opts.secret ? signHash(event.hash, opts.secret) : "";

	// Insert into database
	const stmt = db.prepare(`
		INSERT INTO audit_events (id, run_id, event_type, timestamp, previous_hash, hash, signature, payload, linked_decay_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	stmt.run(
		event.id,
		opts.runId,
		event.event_type,
		event.timestamp,
		event.previous_hash,
		event.hash,
		event.signature,
		JSON.stringify(event.payload),
		event.linked_decay_hash,
	);

	return event;
}

// ============================================================
// Hash chain utilities
// ============================================================

function calculateHash(event: AuditEvent): string {
	const { hash, signature, ...rest } = event as any;
	return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function signHash(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("hex");
}

// ============================================================
// Persistence adapter class
// ============================================================

export class SqliteAuditPersistence {
	private db: Database.Database;
	private secret: string;
	private headHash: string;
	private currentRunId: string | null = null;

	constructor(secret: string, dbPath?: string) {
		this.secret = secret;
		if (dbPath) {
			DB_PATH = dbPath;
		}
		this.db = initializeDatabase(dbPath ?? DB_PATH);
		this.headHash = this.hashGenesis();
	}

	setSecret(secret: string): void {
		this.secret = secret.trim();
	}

	// Start a new run
	startRun(runId: string, configFingerprint: string): void {
		this.currentRunId = runId;
		const stmt = this.db.prepare(
			`INSERT OR REPLACE INTO runs (run_id, config_fingerprint, start_time, terminal_status) VALUES (?, ?, ?, 'RUNNING')`,
		);
		stmt.run(runId, configFingerprint, Date.now());
	}

	endRun(runId: string, terminalStatus: string): void {
		if (!this.currentRunId) return;
		const stmt = this.db.prepare(
			`UPDATE runs SET end_time = ?, terminal_status = ? WHERE run_id = ?`,
		);
		stmt.run(Date.now(), terminalStatus, runId);
		this.currentRunId = null;
	}

	// Persist a single audit event
	persistEvent(
		eventType: AuditEvent["event_type"],
		sessionId: AuditEvent["session_id"],
		timestamp: AuditEvent["timestamp"],
		payload: AuditEvent["payload"],
		previousHash: AuditEvent["previous_hash"],
		linkedDecayHash?: AuditEvent["linked_decay_hash"],
	): AuditEvent {
		if (!this.currentRunId) {
			throw new Error("No active run. Call startRun() first.");
		}

		const opts: PersistEventOptions = {
			runId: this.currentRunId,
			eventType,
			sessionId,
			timestamp,
			payload,
			previousHash,
			linkedDecayHash,
			secret: this.secret,
		};

		return persistEvent(this.db, opts);
	}

	// Verify integrity of the stored chain
	verifyIntegrity(): boolean {
		let prev = this.hashGenesis();

		const events = this.db
			.prepare(`SELECT id, previous_hash, hash, signature FROM audit_events ORDER BY timestamp ASC`)
			.all() as { id: string; previous_hash: string; hash: string; signature: string }[];

		for (const event of events) {
			if (event.previous_hash !== prev) return false;

			// Verify signature
			const expectedSig = signHash(event.hash, this.secret);
			if (event.signature !== expectedSig) return false;

			prev = event.hash;
		}
		return true;
	}

	getLog(): AuditEvent[] {
		const rows = this.db
			.prepare(
				`SELECT id, run_id, event_type, timestamp, previous_hash, hash, signature, payload, linked_decay_hash FROM audit_events ORDER BY timestamp ASC`,
			)
			.all() as Array<{
				id: string;
				run_id: string;
				event_type: string;
				timestamp: number;
				previous_hash: string;
				hash: string;
				signature: string;
				payload: string;
				linked_decay_hash: string | null;
			}>;

		return rows.map((row) => ({
			id: row.id,
			event_type: row.event_type as AuditEvent["event_type"],
			session_id: row.run_id,
			timestamp: row.timestamp,
			payload: JSON.parse(row.payload),
			previous_hash: row.previous_hash,
			hash: row.hash,
			signature: row.signature,
			linked_decay_hash: row.linked_decay_hash ?? undefined,
		}));
	}

	hashGenesis(): string {
		return createHash("sha256").update("genesis:audit-trail").digest("hex");
	}

	close(): void {
		this.db.close();
	}
}

// Export a singleton instance backed by the existing in-memory auditTrail
// so downstream code (orchestrator, workflow state machine) continues to work
// without any interface changes.
export const sqliteAudit = new SqliteAuditPersistence(
	process.env.AUDIT_TRAIL_SECRET ?? "",
);

// Public API compatibility: delegate to in-memory trail but also persist
// every emit so the on-disk log stays in sync with what the orchestrator
// sees. This means zero interface changes for existing consumers.
export function persistCurrentEvent(
	event: AuditEvent,
	runId: string,
	forceNewHash = false,
): void {
	// Update the in-memory head hash to match the new event
	const existingHead = (auditTrail as any)["headHash"] as string;
	const eventCopy = { ...event };
	eventCopy.previous_hash = existingHead;
	eventCopy.hash = (auditTrail as any).calculateHash(eventCopy);
	eventCopy.signature = (auditTrail as any).sign(eventCopy.hash);
	(auditTrail as any)["headHash"] = eventCopy.hash as string;

	// Ensure SQLite has an active run
	if (!(sqliteAudit as any).currentRunId) {
		sqliteAudit.startRun(runId, "auto-started");
	}

	// Also persist to SQLite
	sqliteAudit.persistEvent(
		eventCopy.event_type,
		eventCopy.session_id,
		eventCopy.timestamp,
		eventCopy.payload,
		eventCopy.previous_hash,
		eventCopy.linked_decay_hash,
	);
}

// Export the verifyIntegrity function from the SQLite layer so that
// callers can independently confirm the on-disk chain matches expectations.
export function verifySqliteIntegrity(): boolean {
	return sqliteAudit.verifyIntegrity();
}

// When the module loads, ensure the database is initialized and
// register a hook that persists every event the in-memory emitter emits.
// This keeps the on-disk log in lockstep without any API changes.
if (typeof window === "undefined") {
	// Node environment: hook into the global auditTrail emit
	const emitter = auditTrail as any;
	if (emitter._emits) {
		// Already hooked or no listener array — skip
	} else {
		const originalEmit = emitter.emit.bind(emitter);
		emitter.emit = function (params: any) {
			const result = originalEmit(params);
			try {
				persistCurrentEvent(
					params as AuditEvent,
					(params as any).session_id || "unknown",
				);
			} catch (_e) {
				// best‑effort only; never break the emit path
			}
			return result;
		};
	}
}