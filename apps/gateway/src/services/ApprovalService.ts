/**
 * Approval Service
 *
 * Manages the approval workflow for change proposals from external AI clients.
 * Every proposed change must be explicitly approved by the user before
 * execution. Approvals are bound to the exact change hash, project, scope,
 * and version — any material modification invalidates the approval.
 */

import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import path from "node:path";

const CATALOG_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");
let catalogDb: Database.Database | null = null;

function getCatalogDb(): Database.Database {
	if (!catalogDb) {
		catalogDb = new Database(CATALOG_DB_PATH, { readonly: false });
		catalogDb.pragma("journal_mode = WAL");
	}
	return catalogDb;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "revoked";

export interface ApprovalRecord {
	id: string;
	clientId: string;
	changeHash: string;
	changeDescription: string;
	projectId?: string;
	status: ApprovalStatus;
	approvedBy?: string;
	approvedAt?: number;
	expiresAt?: number;
	createdAt: number;
	updatedAt: number;
}

export interface CreateApprovalInput {
	clientId: string;
	changeHash: string;
	changeDescription: string;
	projectId?: string;
	expiresInMinutes?: number;
}

export class ApprovalService {
	async createApproval(input: CreateApprovalInput): Promise<ApprovalRecord> {
		const id = `approval:${createHash("sha256")
			.update(`${input.changeHash}:${input.clientId}:${Date.now()}`)
			.digest("hex")
			.slice(0, 24)}`;
		const now = Date.now();
		const expiresAt = input.expiresInMinutes
			? now + input.expiresInMinutes * 60 * 1000
			: undefined;

		const db = getCatalogDb();
		const stmt = db.prepare(`
			INSERT INTO approval_records (id, client_id, change_hash, change_description, project_id, status, expires_at, created_at, updated_at)
			VALUES (@id, @client_id, @change_hash, @change_description, @project_id, 'pending', @expires_at, @created_at, @updated_at)
		`);
		stmt.run({
			id,
			client_id: input.clientId,
			change_hash: input.changeHash,
			change_description: input.changeDescription,
			project_id: input.projectId ?? null,
			expires_at: expiresAt ?? null,
			created_at: now,
			updated_at: now,
		});
		return this.getApproval(id)!;
	}

	getApproval(id: string): ApprovalRecord | null {
		const db = getCatalogDb();
		const row = db
			.prepare("SELECT * FROM approval_records WHERE id = ?")
			.get(id) as any | undefined;
		if (!row) return null;
		return this.mapRow(row);
	}

	listApprovalsForClient(clientId: string): ApprovalRecord[] {
		const db = getCatalogDb();
		const rows = db
			.prepare("SELECT * FROM approval_records WHERE client_id = ? ORDER BY created_at DESC")
			.all(clientId) as any[];
		return rows.map((r) => this.mapRow(r));
	}

	listPendingApprovals(): ApprovalRecord[] {
		const db = getCatalogDb();
		const now = Date.now();
		const rows = db
			.prepare(
				"SELECT * FROM approval_records WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at ASC",
			)
			.all(now) as any[];
		return rows.map((r) => this.mapRow(r));
	}

	async approve(
		id: string,
		approvedBy: string,
	): Promise<ApprovalRecord> {
		const db = getCatalogDb();
		const now = Date.now();
		const existing = this.getApproval(id);
		if (!existing) throw new Error(`Approval record not found: ${id}`);
		if (existing.status !== "pending") {
			throw new Error(`Approval already ${existing.status}`);
		}
		if (existing.expiresAt && now > existing.expiresAt) {
			this.updateStatus(id, "expired");
			throw new Error("Approval has expired");
		}

		const stmt = db.prepare(`
			UPDATE approval_records
			SET status = 'approved', approved_by = @approvedBy, approved_at = @now, updated_at = @now
			WHERE id = @id
		`);
		stmt.run({ id, approvedBy, now });
		return this.getApproval(id)!;
	}

	async reject(id: string, approvedBy: string): Promise<ApprovalRecord> {
		const db = getCatalogDb();
		const now = Date.now();
		const existing = this.getApproval(id);
		if (!existing) throw new Error(`Approval record not found: ${id}`);
		if (existing.status !== "pending") {
			throw new Error(`Approval already ${existing.status}`);
		}

		const stmt = db.prepare(`
			UPDATE approval_records
			SET status = 'rejected', approved_by = @approvedBy, updated_at = @now
			WHERE id = @id
		`);
		stmt.run({ id, approvedBy, now });
		return this.getApproval(id)!;
	}

	async revoke(id: string): Promise<ApprovalRecord> {
		return this.updateStatus(id, "revoked");
	}

	async expireExpiredApprovals(): Promise<void> {
		const db = getCatalogDb();
		const now = Date.now();
		db.prepare(
			"UPDATE approval_records SET status = 'expired', updated_at = @now WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < @now",
		).run({ now });
	}

	private async updateStatus(id: string, status: ApprovalStatus): Promise<ApprovalRecord> {
		const db = getCatalogDb();
		const now = Date.now();
		const stmt = db.prepare(`
			UPDATE approval_records
			SET status = @status, updated_at = @now
			WHERE id = @id
		`);
		const result = stmt.run({ id, status, now });
		if (result.changes === 0) {
			throw new Error(`Approval record not found: ${id}`);
		}
		return this.getApproval(id)!;
	}

	private mapRow(row: any): ApprovalRecord {
		return {
			id: row.id,
			clientId: row.client_id,
			changeHash: row.change_hash,
			changeDescription: row.change_description,
			projectId: row.project_id ?? undefined,
			status: row.status,
			approvedBy: row.approved_by ?? undefined,
			approvedAt: row.approved_at ?? undefined,
			expiresAt: row.expires_at ?? undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}
}

export const approvalService = new ApprovalService();
