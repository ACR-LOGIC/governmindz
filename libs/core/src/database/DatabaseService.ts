// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor

import { randomUUID } from "node:crypto";
import { Logger } from "../kernel/Logger";

export type RunStatus =
	| "queued"
	| "running"
	| "leased"
	| "succeeded"
	| "failed";
export type UsageResourceType = "tokens" | "api_call" | "storage_bytes";

export interface QueryExecutor {
	query<T extends object = Record<string, unknown>>(
		text: string,
		params?: readonly unknown[],
	): Promise<{ rows: T[]; rowCount: number }>;
}

export interface DatabaseRunRecord {
	id: string;
	tenantId: string;
	createdBy: string;
	status: RunStatus;
	inputJson: string;
	snapshotJson?: string;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface DatabaseRunStepRecord {
	id: string;
	runId: string;
	stepKey: string;
	agentName: string;
	status: RunStatus;
	outputJson?: string;
	errorJson?: string;
	leaseOwner?: string;
	leaseExpiresAt?: Date;
	attempt: number;
	version: number;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface CreateRunStepInput {
	id?: string;
	runId: string;
	stepKey: string;
	agentName: string;
	role?: string;
	provider?: string;
	model?: string;
	status?: RunStatus;
}

export interface LeaseStepInput {
	runId: string;
	stepKey: string;
	workerId: string;
	leaseDurationMinutes?: number;
}

export interface CompleteStepInput {
	stepId: string;
	expectedVersion: number;
	outputJson: string;
}

export interface FailedStepInput {
	stepId: string;
	errorJson: string;
}

export interface UsageLedgerRecord {
	id: string;
	tenantId: string;
	userId: string;
	runId: string | null;
	resourceType: UsageResourceType;
	quantity: number;
	unit: string;
	metadataJson: string;
	createdAt?: Date;
}

// â”€â”€â”€ Debate transcript persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DebateSessionRecord {
	session_id: string;
	topic: string;
	agents: string[];
	transcript: unknown[];
	consensus_method: string;
	final_confidence: number;
	rounds: number;
	consensus_reached: boolean;
	halted: boolean;
	halt_reason?: string;
	transport_mode: string;
}

export interface TranscriptRepository {
	persistDebateSession(session: DebateSessionRecord): Promise<void>;
}

// â”€â”€â”€ Execution database â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ExecutionDatabase {
	createRun(run: DatabaseRunRecord): Promise<void>;
	getRun(runId: string): Promise<DatabaseRunRecord | null>;
	getRunSteps(runId: string): Promise<DatabaseRunStepRecord[]>;
	createRunStep(step: CreateRunStepInput): Promise<DatabaseRunStepRecord>;
	leaseRunStep(input: LeaseStepInput): Promise<DatabaseRunStepRecord | null>;
	completeRunStep(input: CompleteStepInput): Promise<void>;
	failRunStep(input: FailedStepInput): Promise<void>;
	updateRunStatus(runId: string, status: RunStatus): Promise<void>;
	updateRunSnapshot(runId: string, snapshotJson: string): Promise<void>;
	recoverExpiredRunStepLeases(referenceTime?: Date): Promise<number>;
	insertUsageLedgerEntry(entry: UsageLedgerRecord): Promise<void>;
	getTenantUsageTotal(
		tenantId: string,
		resourceType: UsageResourceType,
		windowStart: Date,
	): Promise<number>;
	query<T extends object = Record<string, unknown>>(
		text: string,
		params?: readonly unknown[],
	): Promise<{ rows: T[]; rowCount: number }>;
}

type InMemoryState = {
	runs: Map<string, DatabaseRunRecord>;
	runSteps: Map<string, DatabaseRunStepRecord>;
	usageLedger: UsageLedgerRecord[];
	notionSnapshots: Map<
		string,
		{
			debate_id: string;
			page_id: string;
			content_hash: string;
			raw_content: string;
		}
	>;
};

type ParameterizedStatement = {
	text: string;
	params: readonly unknown[];
};

/**
 * DatabaseService owns the persistence boundary for kernel execution.
 * All SQL is defined here with positional parameters, and a lightweight
 * in-memory fallback keeps local tests and dev runs functional without PG.
 */
export class DatabaseService implements ExecutionDatabase {
	private static instance: DatabaseService;
	private client: QueryExecutor | null;
	private readonly fallbackState: InMemoryState = {
		runs: new Map(),
		runSteps: new Map(),
		usageLedger: [],
		notionSnapshots: new Map(),
	};

	private constructor(client: QueryExecutor | null = null) {
		this.client = client;
	}

	public static getInstance(): DatabaseService {
		if (!DatabaseService.instance) {
			DatabaseService.instance = new DatabaseService();
		}
		return DatabaseService.instance;
	}

	public setClient(client: QueryExecutor | null): void {
		this.client = client;
	}

	async query<T extends object = Record<string, unknown>>(
		text: string,
		params: readonly unknown[] = [],
	): Promise<{ rows: T[]; rowCount: number }> {
		Logger.debug("database.query", {
			text,
			paramCount: params.length,
			hasClient: Boolean(this.client),
		});

		if (!this.client) {
			// LIGHTWEIGHT IN-MEMORY MOCK FOR CLAIM 50 TESTS
			const lowerSql = text.toLowerCase();
			if (
				lowerSql.includes("select content_hash") &&
				lowerSql.includes("notion_snapshots")
			) {
				const rid = params[0] as string;
				const pid = params[1] as string;
				const key = `${rid}_${pid}`;
				const val = this.fallbackState.notionSnapshots.get(key);
				return val
					? { rows: [val as any], rowCount: 1 }
					: { rows: [], rowCount: 0 };
			}
			if (lowerSql.includes("insert into notion_snapshots")) {
				const rid = params[0] as string;
				const pid = params[1] as string;
				const content = params[2] as string;
				const hash = params[3] as string;
				this.fallbackState.notionSnapshots.set(`${rid}_${pid}`, {
					debate_id: rid,
					page_id: pid,
					content_hash: hash,
					raw_content: content,
				});
				return { rows: [], rowCount: 1 };
			}

			return { rows: [], rowCount: 0 };
		}

		return this.client.query<T>(text, params);
	}

	async createRun(run: DatabaseRunRecord): Promise<void> {
		const now = new Date();
		const persisted: DatabaseRunRecord = {
			...run,
			createdAt: run.createdAt ?? now,
			updatedAt: run.updatedAt ?? now,
		};

		const statement: ParameterizedStatement = {
			text: `
                INSERT INTO runs (id, tenant_id, created_by, status, input_json, snapshot_json, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
			params: [
				persisted.id,
				persisted.tenantId,
				persisted.createdBy,
				persisted.status,
				persisted.inputJson,
				persisted.snapshotJson ?? null,
				persisted.createdAt,
				persisted.updatedAt,
			],
		};

		await this.executeVoid(statement, () => {
			this.fallbackState.runs.set(persisted.id, persisted);
		});
	}

	async getRun(runId: string): Promise<DatabaseRunRecord | null> {
		const statement: ParameterizedStatement = {
			text: `SELECT * FROM runs WHERE id = $1`,
			params: [runId],
		};

		return this.executeOneOrNull(statement, () => {
			return this.fallbackState.runs.get(runId) ?? null;
		});
	}

	async getRunSteps(runId: string): Promise<DatabaseRunStepRecord[]> {
		const statement: ParameterizedStatement = {
			text: `SELECT * FROM run_steps WHERE run_id = $1 ORDER BY created_at ASC`,
			params: [runId],
		};

		return this.executeMany(statement, () => {
			return Array.from(this.fallbackState.runSteps.values())
				.filter((s) => s.runId === runId)
				.sort(
					(a, b) =>
						(a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
				);
		});
	}

	async createRunStep(
		step: CreateRunStepInput,
	): Promise<DatabaseRunStepRecord> {
		const now = new Date();
		const persisted: DatabaseRunStepRecord = {
			id: step.id ?? randomUUID(),
			runId: step.runId,
			stepKey: step.stepKey,
			agentName: step.agentName,
			status: step.status ?? "queued",
			attempt: 0,
			version: 1,
			createdAt: now,
			updatedAt: now,
		};

		const statement: ParameterizedStatement = {
			text: `
                INSERT INTO run_steps (
                    id,
                    run_id,
                    step_key,
                    agent_name,
                    status,
                    attempt,
                    version,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (run_id, step_key) DO NOTHING
                RETURNING *
            `,
			params: [
				persisted.id,
				persisted.runId,
				persisted.stepKey,
				persisted.agentName,
				persisted.status,
				persisted.attempt,
				persisted.version,
				persisted.createdAt,
				persisted.updatedAt,
			],
		};

		return this.executeOne(statement, () => {
			this.fallbackState.runSteps.set(persisted.id, persisted);
			return persisted;
		});
	}

	async leaseRunStep(
		input: LeaseStepInput,
	): Promise<DatabaseRunStepRecord | null> {
		const leaseUntil = new Date(
			Date.now() + (input.leaseDurationMinutes ?? 5) * 60_000,
		);
		const now = new Date();

		const statement: ParameterizedStatement = {
			text: `
                UPDATE run_steps
                   SET status = $3,
                       lease_owner = $4,
                       lease_expires_at = $5,
                       attempt = attempt + 1,
                       updated_at = $6,
                       version = version + 1
                 WHERE run_id = $1
                   AND step_key = $2
                   AND (
                       status = $7
                       OR (
                           status IN ($8, $9)
                           AND lease_expires_at < $10
                       )
                   )
                 RETURNING *
            `,
			params: [
				input.runId,
				input.stepKey,
				"leased",
				input.workerId,
				leaseUntil,
				now,
				"queued",
				"leased",
				"running",
				now,
			],
		};

		return this.executeOneOrNull(statement, () => {
			const candidate = this.findFallbackStep(input.runId, input.stepKey);
			if (!candidate) {
				return null;
			}

			const isAvailable =
				candidate.status === "queued" ||
				((candidate.status === "leased" || candidate.status === "running") &&
					Boolean(
						candidate.leaseExpiresAt &&
							candidate.leaseExpiresAt.getTime() < now.getTime(),
					));

			if (!isAvailable) {
				return null;
			}

			const leased: DatabaseRunStepRecord = {
				...candidate,
				status: "leased",
				leaseOwner: input.workerId,
				leaseExpiresAt: leaseUntil,
				attempt: candidate.attempt + 1,
				version: candidate.version + 1,
				updatedAt: now,
			};
			this.fallbackState.runSteps.set(leased.id, leased);
			return leased;
		});
	}

	async completeRunStep(input: CompleteStepInput): Promise<void> {
		const now = new Date();
		const statement: ParameterizedStatement = {
			text: `
                UPDATE run_steps
                   SET status = $3,
                       output_json = $4,
                       version = version + 1,
                       updated_at = $5
                 WHERE id = $1
                   AND version = $2
                   AND status IN ($6, $7)
                 RETURNING id
            `,
			params: [
				input.stepId,
				input.expectedVersion,
				"succeeded",
				input.outputJson,
				now,
				"leased",
				"running",
			],
		};

		const completed = await this.executeOneOrNull(statement, () => {
			const existing = this.fallbackState.runSteps.get(input.stepId);
			if (!existing) {
				return null;
			}

			const versionMatches = existing.version === input.expectedVersion;
			const leaseStateValid =
				existing.status === "leased" || existing.status === "running";
			if (!versionMatches || !leaseStateValid) {
				return null;
			}

			const updated: DatabaseRunStepRecord = {
				...existing,
				status: "succeeded",
				outputJson: input.outputJson,
				version: existing.version + 1,
				updatedAt: now,
			};
			this.fallbackState.runSteps.set(updated.id, updated);
			return { id: updated.id };
		});

		if (!completed) {
			throw new Error("STEP_VERSION_CONFLICT");
		}
	}

	async failRunStep(input: FailedStepInput): Promise<void> {
		const now = new Date();
		const statement: ParameterizedStatement = {
			text: `
                UPDATE run_steps
                   SET status = $2,
                       error_json = $3,
                       updated_at = $4
                 WHERE id = $1
            `,
			params: [input.stepId, "failed", input.errorJson, now],
		};

		await this.executeVoid(statement, () => {
			const existing = this.fallbackState.runSteps.get(input.stepId);
			if (!existing) {
				return;
			}

			this.fallbackState.runSteps.set(input.stepId, {
				...existing,
				status: "failed",
				errorJson: input.errorJson,
				updatedAt: now,
			});
		});
	}

	async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
		const now = new Date();
		const statement: ParameterizedStatement = {
			text: `
                UPDATE runs
                   SET status = $1,
                       updated_at = $2
                 WHERE id = $3
            `,
			params: [status, now, runId],
		};

		await this.executeVoid(statement, () => {
			const existing = this.fallbackState.runs.get(runId);
			if (!existing) {
				return;
			}

			this.fallbackState.runs.set(runId, {
				...existing,
				status,
				updatedAt: now,
			});
		});
	}

	async updateRunSnapshot(runId: string, snapshotJson: string): Promise<void> {
		const now = new Date();
		const statement: ParameterizedStatement = {
			text: `
                UPDATE runs
                   SET snapshot_json = $1,
                       updated_at = $2
                 WHERE id = $3
            `,
			params: [snapshotJson, now, runId],
		};

		await this.executeVoid(statement, () => {
			const existing = this.fallbackState.runs.get(runId);
			if (!existing) {
				return;
			}

			this.fallbackState.runs.set(runId, {
				...existing,
				snapshotJson,
				updatedAt: now,
			});
		});
	}

	async recoverExpiredRunStepLeases(
		referenceTime: Date = new Date(),
	): Promise<number> {
		const statement: ParameterizedStatement = {
			text: `
                UPDATE run_steps
                   SET status = $1,
                       lease_owner = NULL,
                       lease_expires_at = NULL,
                       updated_at = $2
                 WHERE status IN ($3, $4)
                   AND lease_expires_at < $2
                 RETURNING id
            `,
			params: ["queued", referenceTime, "leased", "running"],
		};

		const recovered = await this.executeMany(statement, () => {
			const updates: Array<{ id: string }> = [];

			for (const [id, step] of this.fallbackState.runSteps.entries()) {
				const isExpired =
					(step.status === "leased" || step.status === "running") &&
					Boolean(
						step.leaseExpiresAt &&
							step.leaseExpiresAt.getTime() < referenceTime.getTime(),
					);

				if (!isExpired) {
					continue;
				}

				this.fallbackState.runSteps.set(id, {
					...step,
					status: "queued",
					leaseOwner: undefined,
					leaseExpiresAt: undefined,
					updatedAt: referenceTime,
				});
				updates.push({ id });
			}

			return updates;
		});

		return recovered.length;
	}

	async insertUsageLedgerEntry(entry: UsageLedgerRecord): Promise<void> {
		const now = entry.createdAt ?? new Date();
		const persisted: UsageLedgerRecord = {
			...entry,
			createdAt: now,
		};

		const statement: ParameterizedStatement = {
			text: `
                INSERT INTO usage_ledger (
                    id,
                    tenant_id,
                    user_id,
                    run_id,
                    resource_type,
                    quantity,
                    unit,
                    metadata,
                    created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
			params: [
				persisted.id,
				persisted.tenantId,
				persisted.userId,
				persisted.runId,
				persisted.resourceType,
				persisted.quantity,
				persisted.unit,
				persisted.metadataJson,
				persisted.createdAt,
			],
		};

		await this.executeVoid(statement, () => {
			this.fallbackState.usageLedger.push(persisted);
		});
	}

	async getTenantUsageTotal(
		tenantId: string,
		resourceType: UsageResourceType,
		windowStart: Date,
	): Promise<number> {
		const statement: ParameterizedStatement = {
			text: `
                SELECT COALESCE(SUM(quantity), 0) AS total
                  FROM usage_ledger
                 WHERE tenant_id = $1
                   AND resource_type = $2
                   AND created_at >= $3
            `,
			params: [tenantId, resourceType, windowStart],
		};

		const result = await this.executeOne(statement, () => {
			const total = this.fallbackState.usageLedger
				.filter(
					(entry) =>
						entry.tenantId === tenantId &&
						entry.resourceType === resourceType &&
						Boolean(
							entry.createdAt &&
								entry.createdAt.getTime() >= windowStart.getTime(),
						),
				)
				.reduce((sum, entry) => sum + entry.quantity, 0);

			return { total };
		});

		return Number(result.total ?? 0);
	}

	private async executeVoid(
		statement: ParameterizedStatement,
		fallback: () => void,
	): Promise<void> {
		if (!this.client) {
			fallback();
			return;
		}

		await this.client.query(statement.text, statement.params);
	}

	private async executeOne<T extends object>(
		statement: ParameterizedStatement,
		fallback: () => T,
	): Promise<T> {
		if (!this.client) {
			return fallback();
		}

		const result = await this.client.query<T>(statement.text, statement.params);
		return result.rows[0] as T;
	}

	private async executeOneOrNull<T extends object>(
		statement: ParameterizedStatement,
		fallback: () => T | null,
	): Promise<T | null> {
		if (!this.client) {
			return fallback();
		}

		const result = await this.client.query<T>(statement.text, statement.params);
		return (result.rows[0] as T) ?? null;
	}

	private async executeMany<T extends object>(
		statement: ParameterizedStatement,
		fallback: () => T[],
	): Promise<T[]> {
		if (!this.client) {
			return fallback();
		}

		const result = await this.client.query<T>(statement.text, statement.params);
		return result.rows;
	}

	private findFallbackStep(
		runId: string,
		stepKey: string,
	): DatabaseRunStepRecord | undefined {
		return Array.from(this.fallbackState.runSteps.values()).find(
			(step) => step.runId === runId && step.stepKey === stepKey,
		);
	}

	// â”€â”€â”€ Transcript persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	async persistDebateSession(session: DebateSessionRecord): Promise<void> {
		const statement: ParameterizedStatement = {
			text: `
                INSERT INTO debate_sessions (
                    session_id,
                    topic,
                    agents,
                    transcript,
                    consensus_method,
                    final_confidence,
                    rounds,
                    consensus_reached,
                    halted,
                    halt_reason,
                    transport_mode,
                    created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                ON CONFLICT (session_id) DO NOTHING
            `,
			params: [
				session.session_id,
				session.topic,
				JSON.stringify(session.agents),
				JSON.stringify(session.transcript),
				session.consensus_method,
				session.final_confidence,
				session.rounds,
				session.consensus_reached,
				session.halted,
				session.halt_reason ?? null,
				session.transport_mode,
			],
		};

		await this.executeVoid(statement, () => {
			// In-memory fallback: nothing to persist, debate data is ephemeral in tests
		});
	}
}
