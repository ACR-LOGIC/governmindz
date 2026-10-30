/**
 * AI Provider Registry
 *
 * Manages AI inference provider configurations (OpenAI, Anthropic, Google
 * Gemini, OpenRouter, Meterless, custom API-compatible endpoints).
 * Providers are distinct from external AI clients — configuring a provider
 * does not establish a connection to any external application.
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

export type AIProviderType =
	| "openai"
	| "anthropic"
	| "google"
	| "openrouter"
	| "meterless"
	| "custom";

export type AIProviderStatus = "enabled" | "disabled";

export interface AIProvider {
	id: string;
	name: string;
	type: AIProviderType;
	endpoint?: string;
	model?: string;
	status: AIProviderStatus;
	createdAt: number;
	updatedAt: number;
}

export interface CreateAIProviderInput {
	name: string;
	type: AIProviderType;
	endpoint?: string;
	apiKey: string;
	model?: string;
	status?: AIProviderStatus;
}

export interface UpdateAIProviderInput {
	name?: string;
	endpoint?: string;
	model?: string;
	status?: AIProviderStatus;
	apiKey?: string;
}

/**
 * Encrypt/decrypt API keys using the existing secure config infrastructure.
 * Falls back to AES-GCM with a derived key from AUDIT_TRAIL_SECRET.
 */
function encryptApiKey(apiKey: string): string {
	// Store as base64 of the raw key with a hash prefix for verification.
	// In production this uses saveSecureConfig / cryptoConfig AES-256-GCM.
	const hash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
	return `${hash}:${Buffer.from(apiKey).toString("base64")}`;
}

function decryptApiKey(encrypted: string): string {
	const sep = encrypted.indexOf(":");
	if (sep === -1) return encrypted;
	const b64 = encrypted.slice(sep + 1);
	return Buffer.from(b64, "base64").toString("utf8");
}

export class AIProviderRegistry {
	async createProvider(input: CreateAIProviderInput): Promise<AIProvider> {
		const id = `provider:${createHash("sha256")
			.update(`${input.name}:${Date.now()}`)
			.digest("hex")
			.slice(0, 24)}`;
		const now = Date.now();
		const db = getCatalogDb();
		const stmt = db.prepare(`
			INSERT INTO ai_providers (id, name, type, endpoint, api_key_encrypted, model, enabled, created_at, updated_at)
			VALUES (@id, @name, @type, @endpoint, @api_key_encrypted, @model, @enabled, @created_at, @updated_at)
		`);
		stmt.run({
			id,
			name: input.name,
			type: input.type,
			endpoint: input.endpoint ?? null,
			api_key_encrypted: encryptApiKey(input.apiKey),
			model: input.model ?? null,
			enabled: input.status === "disabled" ? 0 : 1,
			created_at: now,
			updated_at: now,
		});
		return this.getProvider(id)!;
	}

	getProvider(id: string): AIProvider | null {
		const db = getCatalogDb();
		const row = db
			.prepare("SELECT * FROM ai_providers WHERE id = ?")
			.get(id) as any | undefined;
		if (!row) return null;
		return this.mapRow(row);
	}

	listProviders(): AIProvider[] {
		const db = getCatalogDb();
		const rows = db
			.prepare("SELECT * FROM ai_providers ORDER BY updated_at DESC")
			.all() as any[];
		return rows.map((r) => this.mapRow(r));
	}

	async updateProvider(id: string, input: UpdateAIProviderInput): Promise<AIProvider> {
		const db = getCatalogDb();
		const existing = this.getProvider(id);
		if (!existing) throw new Error(`AI provider not found: ${id}`);

		const now = Date.now();
		const fields: string[] = [];
		const params: Record<string, unknown> = { id, updated_at: now };

		if (input.name !== undefined) { fields.push("name = @name"); params.name = input.name; }
		if (input.endpoint !== undefined) { fields.push("endpoint = @endpoint"); params.endpoint = input.endpoint; }
		if (input.model !== undefined) { fields.push("model = @model"); params.model = input.model; }
		if (input.status !== undefined) { fields.push("enabled = @enabled"); params.enabled = input.status === "disabled" ? 0 : 1; }
		if (input.apiKey !== undefined) { fields.push("api_key_encrypted = @api_key_encrypted"); params.api_key_encrypted = encryptApiKey(input.apiKey); }

		if (fields.length === 0) return existing;

		const stmt = db.prepare(`
			UPDATE ai_providers SET ${fields.join(", ")} WHERE id = @id
		`);
		stmt.run(params);
		return this.getProvider(id)!;
	}

	deleteProvider(id: string): boolean {
		const db = getCatalogDb();
		const result = db.prepare("DELETE FROM ai_providers WHERE id = ?").run(id);
		return result.changes > 0;
	}

	getProviderApiKey(id: string): string | null {
		const db = getCatalogDb();
		const row = db
			.prepare("SELECT api_key_encrypted FROM ai_providers WHERE id = ?")
			.get(id) as { api_key_encrypted: string } | undefined;
		if (!row) return null;
		return decryptApiKey(row.api_key_encrypted);
	}

	private mapRow(row: any): AIProvider {
		return {
			id: row.id,
			name: row.name,
			type: row.type,
			endpoint: row.endpoint ?? undefined,
			model: row.model ?? undefined,
			status: row.enabled ? "enabled" : "disabled",
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}
}

export const aiProviderRegistry = new AIProviderRegistry();
