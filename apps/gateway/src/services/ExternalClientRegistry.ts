/**
 * External Client Registry
 *
 * Manages external AI application/client connections (Claude Desktop, Cursor,
 * VS Code, etc.). Clients are distinct from AI inference providers — a client
 * is an application that connects to GovernMindz via MCP or another protocol
 * and must be separately approved before it can access project data.
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

export type ExternalClientType = "mcp" | "custom_api" | "oauth";
export type ExternalClientStatus = "pending" | "approved" | "revoked";

export interface ExternalClient {
	id: string;
	name: string;
	clientType: ExternalClientType;
	userId: string;
	status: ExternalClientStatus;
	approvedAt?: number;
	revokedAt?: number;
	createdAt: number;
	updatedAt: number;
}

export interface CreateExternalClientInput {
	name: string;
	clientType: ExternalClientType;
	userId: string;
}

export class ExternalClientRegistry {
	async createClient(input: CreateExternalClientInput): Promise<ExternalClient> {
		const id = `client:${createHash("sha256")
			.update(`${input.name}:${input.userId}:${Date.now()}`)
			.digest("hex")
			.slice(0, 24)}`;
		const now = Date.now();
		const db = getCatalogDb();
		const stmt = db.prepare(`
			INSERT INTO external_clients (id, name, client_type, user_id, status, created_at, updated_at)
			VALUES (@id, @name, @client_type, @user_id, 'pending', @created_at, @updated_at)
		`);
		stmt.run({
			id,
			name: input.name,
			client_type: input.clientType,
			user_id: input.userId,
			created_at: now,
			updated_at: now,
		});
		return this.getClient(id)!;
	}

	getClient(id: string): ExternalClient | null {
		const db = getCatalogDb();
		const row = db
			.prepare("SELECT * FROM external_clients WHERE id = ?")
			.get(id) as any | undefined;
		if (!row) return null;
		return this.mapRow(row);
	}

	listClients(): ExternalClient[] {
		const db = getCatalogDb();
		const rows = db
			.prepare("SELECT * FROM external_clients ORDER BY updated_at DESC")
			.all() as any[];
		return rows.map((r) => this.mapRow(r));
	}

	async approveClient(id: string, userId: string): Promise<ExternalClient> {
		const db = getCatalogDb();
		const now = Date.now();
		const stmt = db.prepare(`
			UPDATE external_clients
			SET status = 'approved', approved_at = @now, updated_at = @now
			WHERE id = @id AND user_id = @userId
		`);
		const result = stmt.run({ id, now, userId });
		if (result.changes === 0) {
			throw new Error(`External client not found or not owned by user: ${id}`);
		}
		return this.getClient(id)!;
	}

	async revokeClient(id: string, userId: string): Promise<ExternalClient> {
		const db = getCatalogDb();
		const now = Date.now();
		const stmt = db.prepare(`
			UPDATE external_clients
			SET status = 'revoked', revoked_at = @now, updated_at = @now
			WHERE id = @id AND user_id = @userId
		`);
		const result = stmt.run({ id, now, userId });
		if (result.changes === 0) {
			throw new Error(`External client not found or not owned by user: ${id}`);
		}
		return this.getClient(id)!;
	}

	async disableClient(id: string, userId: string): Promise<ExternalClient> {
		return this.revokeClient(id, userId);
	}

	isClientApproved(id: string): boolean {
		const client = this.getClient(id);
		return client?.status === "approved";
	}

	private mapRow(row: any): ExternalClient {
		return {
			id: row.id,
			name: row.name,
			clientType: row.client_type,
			userId: row.user_id,
			status: row.status,
			approvedAt: row.approved_at ?? undefined,
			revokedAt: row.revoked_at ?? undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}
}

export const externalClientRegistry = new ExternalClientRegistry();
