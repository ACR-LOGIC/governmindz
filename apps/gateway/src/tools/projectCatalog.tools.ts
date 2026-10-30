/**
 * GovernMindz Project Catalog Tool
 *
 * Provides agents with read-only access to the locally-synced project catalog
 * (GitHub repositories selected in Settings → GitHub Integration). This turns
 * the native GovernMindz catalog into an agent-accessible research source so
 * agents can reference synchronized project information during debates.
 *
 * All queries are read-only against the local SQLite catalog; no external
 * network calls are made.
 */

import Database from "better-sqlite3";
import path from "node:path";
import type {
	McpRegistry,
	ToolContext,
	ToolDefinition,
	ToolHandler,
	ToolRegistration,
} from "@governmindz/mcp-core";
import { enforcePolicy } from "../middleware/policy.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const CATALOG_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");

let catalogDb: Database.Database | null = null;

function getCatalogDb(): Database.Database {
	if (!catalogDb) {
		catalogDb = new Database(CATALOG_DB_PATH, { readonly: true });
		catalogDb.pragma("journal_mode = WAL");
	}
	return catalogDb;
}

export const GATEWAY_REGISTRY: McpRegistry = {
	version: "0.1.0",
	servers: [],
	policies: {
		default_rate_limit_per_min: 30,
		audit_all_calls: true,
	},
};

export const projectCatalogSearchDefinition: ToolDefinition = {
	name: "project_catalog_search",
	description:
		"Search the locally-synced GovernMindz project catalog for GitHub repositories " +
		"selected in Settings. Returns repository metadata (name, owner, description, " +
		"visibility, default branch, HTML URL) and cached README/content snippets so " +
		"agents can reference authorized project information during debates.",
	inputSchema: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description:
					"Search term matched against repository name, full name, owner, " +
					"and description (case-insensitive substring match).",
			},
			limit: {
				type: "integer",
				minimum: 1,
				maximum: MAX_LIMIT,
				default: DEFAULT_LIMIT,
			},
			provider: {
				type: "string",
				description:
					"Optional provider filter (e.g. 'github'). Defaults to all providers.",
			},
			selectedOnly: {
				type: "boolean",
				description:
					"When true, returns only repositories selected for agent awareness. " +
					"Defaults to true.",
			},
		},
		required: [],
	},
	riskGate: "rate_limited",
	rateLimit: 30,
};

interface ProjectCatalogSearchInput {
	query?: string;
	limit?: number;
	provider?: string;
	selectedOnly?: boolean;
}

function parseInput(input: unknown): ProjectCatalogSearchInput {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("project_catalog_search expects an object input");
	}

	const record = input as Record<string, unknown>;

	const rawLimit = record.limit ?? DEFAULT_LIMIT;
	const limit = Number(rawLimit);
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
		throw new Error(
			`project_catalog_search 'limit' must be an integer between 1 and ${MAX_LIMIT}`,
		);
	}

	const selectedOnly = record.selectedOnly === undefined ? true : Boolean(record.selectedOnly);

	return {
		query:
			typeof record.query === "string" ? record.query.trim() : undefined,
		limit,
		provider:
			typeof record.provider === "string" ? record.provider.trim() : undefined,
		selectedOnly,
	};
}

const handler: ToolHandler = async (rawInput, context: ToolContext) => {
	if (!context?.callerRole?.trim()) {
		throw new Error("project_catalog_search requires ToolContext.callerRole");
	}

	const decision = enforcePolicy(
		GATEWAY_REGISTRY,
		projectCatalogSearchRegistration,
		context,
	);
	if (!decision.allowed) {
		if (decision.requiresApproval) {
			throw new Error(
				decision.reason ?? "project_catalog_search requires explicit approval",
			);
		}
		throw new Error(decision.reason ?? "project_catalog_search denied by policy");
	}

	const input = parseInput(rawInput);
	console.info(
		JSON.stringify({
			event: "tool.invoke",
			tool: "project_catalog_search",
			callerRole: context.callerRole,
			query: input.query,
			ts: Date.now(),
		}),
	);

	let db: Database.Database;
	try {
		db = getCatalogDb();
	} catch (err) {
		console.warn(
			`[GovernMindz] project_catalog_search: unable to open catalog DB: ${err}`,
		);
		return {
			query: input.query ?? "",
			results: [],
			total: 0,
			source: "project_catalog",
			status: "unavailable",
			message:
				"Project catalog database is not available. Connect a GitHub integration in Settings first.",
			timestamp: Date.now(),
		};
	}

	try {
		let sql = `
			SELECT id, source_id, source_type, provider, name, owner, full_name,
			       description, visibility, html_url, readme, languages, status,
			       selected, last_synced_at, data_json, created_at, updated_at
			FROM project_catalog
			WHERE 1 = 1
		`;
		const params: unknown[] = [];

		if (input.selectedOnly) {
			sql += ` AND selected = 1`;
		}

		if (input.provider) {
			sql += ` AND provider = ?`;
			params.push(input.provider);
		}

		if (input.query) {
			sql += ` AND (
				name LIKE ? OR
				full_name LIKE ? OR
				owner LIKE ? OR
				description LIKE ?
			)`;
			const like = `%${input.query}%`;
			params.push(like, like, like, like);
		}

		sql += ` ORDER BY selected DESC, updated_at DESC LIMIT ?`;
		params.push(input.limit);

		const stmt = db.prepare(sql);
		const rows = stmt.all(params) as Array<{
			id: string;
			source_id: string;
			source_type: string;
			provider: string;
			name: string;
			owner: string;
			full_name: string;
			description: string | null;
			visibility: string | null;
			html_url: string | null;
			readme: string | null;
			languages: string | null;
			status: string;
			selected: number;
			last_synced_at: number | null;
			data_json: string | null;
			created_at: number;
			updated_at: number;
		}>;

		const totalCountStmt = db.prepare(
			`SELECT COUNT(*) AS cnt FROM project_catalog WHERE 1 = 1` +
				(input.selectedOnly ? ` AND selected = 1` : "") +
				(input.provider ? ` AND provider = ?` : "") +
				(input.query
					? ` AND (name LIKE ? OR full_name LIKE ? OR owner LIKE ? OR description LIKE ?)`
					: ""),
		);
		const totalParams: unknown[] = [];
		if (input.provider) totalParams.push(input.provider);
		if (input.query) {
			const like = `%${input.query}%`;
			totalParams.push(like, like, like, like);
		}
		const totalRow = totalCountStmt.get(totalParams) as { cnt: number };

		const results = rows.map((row) => {
			let data: Record<string, unknown> = {};
			try {
				data = row.data_json ? JSON.parse(row.data_json) : {};
			} catch {
				data = {};
			}
			return {
				id: row.id,
				sourceId: row.source_id,
				sourceType: row.source_type,
				provider: row.provider,
				name: row.name,
				owner: row.owner,
				fullName: row.full_name,
				description: row.description,
				visibility: row.visibility,
				htmlUrl: row.html_url,
				readme: row.readme,
				languages: row.languages,
				status: row.status,
				selected: Boolean(row.selected),
				lastSyncedAt: row.last_synced_at,
				data,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			};
		});

		return {
			query: input.query ?? "",
			results,
			total: totalRow.cnt,
			source: "project_catalog",
			status: "connected",
			timestamp: Date.now(),
		};
	} catch (err: any) {
		console.error(
			"[GovernMindz] project_catalog_search query failed:",
			err?.message || err,
		);
		return {
			query: input.query ?? "",
			results: [],
			total: 0,
			source: "project_catalog",
			status: "error",
			message: err?.message || "Project catalog search failed.",
			timestamp: Date.now(),
		};
	}
};

export const projectCatalogSearchRegistration: ToolRegistration = {
	definition: projectCatalogSearchDefinition,
	handler,
};

export const projectCatalogSearchHandler = handler;
