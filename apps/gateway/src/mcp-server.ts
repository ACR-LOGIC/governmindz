/**
 * GovernMindz MCP Server — stdio transport
 *
 * Exposes GovernMindz project intelligence and governance capabilities to
 * approved external AI clients (Claude Desktop, Cursor, VS Code, etc.) via
 * the Model Context Protocol. All access is governed by the existing
 * `enforcePolicy` permission engine — no tool is exposed without explicit
 * authorization.
 *
 * Transport: stdio (local-first). HTTP transport is optional future work.
 */

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import path from "node:path";
import {
	projectCatalogSearchHandler,
	projectCatalogSearchDefinition,
	GATEWAY_REGISTRY as CATALOG_REGISTRY,
} from "./tools/projectCatalog.tools.js";
import {
	zetarisQueryHandler,
	zetarisQueryDefinition,
} from "./tools/zetaris.tools.js";
import { executeWebSearch } from "./tools/webSearch.tools.js";
import { enforcePolicy } from "./middleware/policy.js";
import { runDebate } from "./debateRunner.js";

const CATALOG_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");
let catalogDb: Database.Database | null = null;

function getCatalogDb(): Database.Database {
	if (!catalogDb) {
		catalogDb = new Database(CATALOG_DB_PATH, { readonly: true });
		catalogDb.pragma("journal_mode = WAL");
	}
	return catalogDb;
}

const WEB_SEARCH_DEFINITION = {
	name: "web_search",
	description:
		"Perform web research for factual verification, regulatory checks, and " +
		"domain research when information is not present in local databases. " +
		"Returns structured research results with verification status.",
	inputSchema: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "Web search query",
			},
			limit: {
				type: "integer",
				minimum: 1,
				maximum: 20,
				default: 10,
			},
		},
		required: ["query"],
	},
	riskGate: "rate_limited",
	rateLimit: 30,
} as const;

const server = new Server(
	{
		name: "governmindz",
		version: "0.1.0",
	},
	{
		capabilities: {
			resources: {},
			tools: {},
		},
	},
);

/* ----------------------------------------------------------------
   Tools
----------------------------------------------------------------- */

server.setRequestHandler(
	ListToolsRequestSchema,
	async () => ({
		tools: [
			{
				name: "project_catalog_search",
				description:
					"Search the locally-synced GovernMindz project catalog for GitHub " +
					"repositories and connected local projects selected for agent " +
					"awareness. Returns repository metadata (name, owner, description, " +
					"visibility, HTML URL) and cached README snippets so agents can " +
					"reference authorized project information during debates.",
				inputSchema: {
					type: "object",
					properties: {
						query: {
							type: "string",
							description:
								"Search term matched against repository name, full name, " +
								"owner, and description (case-insensitive substring match).",
						},
						limit: {
							type: "integer",
							minimum: 1,
							maximum: 100,
							default: 20,
						},
						provider: {
							type: "string",
							description:
								"Optional provider filter (e.g. 'github' or 'local'). " +
								"Defaults to all providers.",
						},
						selectedOnly: {
							type: "boolean",
							description:
								"When true, returns only items selected for agent " +
								"awareness. Defaults to true.",
						},
					},
				},
			},
			{
				name: "zetaris_query",
				description:
					"Run a single read-only SQL statement against Zetaris Lightning " +
					"and return columns and rows. DDL/DML is blocked by the " +
					"underlying client — this is read-only governance evidence access.",
				inputSchema: {
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "A read-only SQL statement",
						},
						limit: {
							type: "integer",
							minimum: 1,
							maximum: 1000,
							default: 100,
						},
					},
					required: ["query"],
				},
			},
			{
				name: "web_search",
				description:
					"Perform web research for factual verification, regulatory " +
					"checks, and domain research when information is not present " +
					"in local databases. Returns structured research results with " +
					"verification status.",
				inputSchema: {
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "Web search query",
						},
						limit: {
							type: "integer",
							minimum: 1,
							maximum: 20,
							default: 10,
						},
					},
					required: ["query"],
				},
			},
			{
				name: "debate_start",
				description:
					"Request a GovernMindz multi-agent investigation or debate " +
					"on a project topic. Runs the existing debate pipeline " +
					"(DataCrew, WebSearchCrew, adversarial DebateLoop, " +
					"RivalChallenger, Thinker, Supervisor). Returns a run " +
					"identifier that can be used to retrieve the result via " +
					"the debate://{runId}/result resource.",
				inputSchema: {
					type: "object",
					properties: {
						topic: {
							type: "string",
							description: "The debate topic or question to investigate",
						},
						mode: {
							type: "string",
							enum: ["sample", "live"],
							default: "sample",
							description:
								"Execution mode: 'sample' uses local demo data; " +
								"'live' requires Zetaris and Meterless connectivity.",
						},
					},
					required: ["topic"],
				},
			},
			{
				name: "debate_result",
				description:
					"Retrieve a completed GovernMindz debate result and its " +
					"deliverables by run identifier. Enforces project and " +
					"client permissions.",
				inputSchema: {
					type: "object",
					properties: {
						runId: {
							type: "string",
							description: "The run identifier returned by debate_start",
						},
					},
					required: ["runId"],
				},
			},
		],
	}),
);

server.setRequestHandler(
	CallToolRequestSchema,
	async (request) => {
		const { name, arguments: args } = request.params;
		const toolContext: any = {
			callerRole: "external_client",
			correlationId: randomUUID(),
		};

		switch (name) {
			case "project_catalog_search": {
				const decision = enforcePolicy(
					CATALOG_REGISTRY,
					{
						definition: projectCatalogSearchDefinition,
						handler: projectCatalogSearchHandler,
					} as any,
					toolContext,
				);
				if (!decision.allowed) {
					if (decision.requiresApproval) {
						throw new Error(
							`project_catalog_search requires explicit approval: ${decision.reason}`,
						);
					}
					throw new Error(
						decision.reason ?? "project_catalog_search denied by policy",
					);
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								await projectCatalogSearchHandler(args ?? {}, toolContext),
								null,
								2,
							),
						},
					],
				};
			}

			case "zetaris_query": {
				const decision = enforcePolicy(
					CATALOG_REGISTRY,
					{ definition: zetarisQueryDefinition, handler: zetarisQueryHandler } as any,
					toolContext,
				);
				if (!decision.allowed) {
					if (decision.requiresApproval) {
						throw new Error(
							`zetaris_query requires explicit approval: ${decision.reason}`,
						);
					}
					throw new Error(
						decision.reason ?? "zetaris_query denied by policy",
					);
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								await zetarisQueryHandler(args ?? {}, toolContext),
								null,
								2,
							),
						},
					],
				};
			}

			case "web_search": {
				const decision = enforcePolicy(
					CATALOG_REGISTRY,
					{ definition: WEB_SEARCH_DEFINITION, handler: executeWebSearchWrapper } as any,
					toolContext,
				);
				if (!decision.allowed) {
					if (decision.requiresApproval) {
						throw new Error(
							`web_search requires explicit approval: ${decision.reason}`,
						);
					}
					throw new Error(decision.reason ?? "web_search denied by policy");
				}
				const parsed = parseWebSearchInput(args ?? {});
				const result = await executeWebSearch(
					parsed.query,
					parsed.limit,
					toolContext.callerRole,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case "debate_start": {
				const topic =
					args && typeof args === "object" && "topic" in args
						? String((args as any).topic)
						: undefined;
				const mode =
					args && typeof args === "object" && "mode" in args
						? (args as any).mode
						: "sample";
				if (!topic) {
					throw new Error("debate_start requires a non-empty 'topic'");
				}
				const runId = randomUUID();
				try {
					void runDebate({
						eventSink: () => {},
						mode,
						topic,
						runId,
					} as any);
				} catch (err: any) {
					throw new Error(
						`debate_start failed: ${err?.message || String(err)}`,
					);
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ runId, topic, mode, status: "started" },
								null,
								2,
							),
						},
					],
				};
			}

			case "debate_result": {
				const runId =
					args && typeof args === "object" && "runId" in args
						? String((args as any).runId)
						: undefined;
				if (!runId) {
					throw new Error("debate_result requires a non-empty 'runId'");
				}
				const result = await getDebateResult(runId);
				if (!result) {
					throw new Error(`debate result not found for runId: ${runId}`);
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			default:
				throw new Error(`Unknown MCP tool: ${name}`);
		}
	},
);

/* ----------------------------------------------------------------
   Resources
----------------------------------------------------------------- */

server.setRequestHandler(
	ListResourcesRequestSchema,
	async () => ({
		resources: [
			{
				uri: "debate://{runId}/result",
				name: "Debate Result",
				description:
					"Retrieve a completed GovernMindz debate result and its " +
					"deliverables by run identifier.",
				mimeType: "application/json",
			},
			{
				uri: "project://{projectId}/context",
				name: "Project Context",
				description:
					"Retrieve the current project context: architecture, " +
					"technologies, decisions, and known issues.",
				mimeType: "application/json",
			},
			{
				uri: "project://{projectId}/architecture",
				name: "Project Architecture",
				description: "Retrieve the project architecture summary.",
				mimeType: "application/json",
			},
			{
				uri: "project://{projectId}/decisions",
				name: "Project Decisions",
				description:
					"Retrieve recorded architecture and implementation decisions.",
				mimeType: "application/json",
			},
		],
	}),
);

server.setRequestHandler(
	ReadResourceRequestSchema,
	async (request) => {
		const u = String(request.params.uri);
		if (u.startsWith("debate://")) {
			const runId = u.replace("debate://", "").replace("/result", "");
			const result = await getDebateResult(runId);
			if (!result) {
				throw new Error(`debate result not found: ${runId}`);
			}
			return {
				contents: [
					{
						uri: u,
						mimeType: "application/json",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		}
		if (u.startsWith("project://")) {
			const parts = u.replace("project://", "").split("/");
			const projectId = parts[0];
			const kind = parts[1] || "context";
			const context = await getProjectContext(projectId, kind);
			return {
				contents: [
					{
						uri: u,
						mimeType: "application/json",
						text: JSON.stringify(context, null, 2),
					},
				],
			};
		}
		throw new Error(`Unknown resource URI: ${u}`);
	},
);

/* ----------------------------------------------------------------
   Helpers
----------------------------------------------------------------- */

interface WebSearchInput {
	query: string;
	limit: number;
}

function parseWebSearchInput(args: unknown): WebSearchInput {
	if (!args || typeof args !== "object" || Array.isArray(args)) {
		throw new Error("web_search expects an object input");
	}
	const record = args as Record<string, unknown>;
	if (typeof record.query !== "string" || !record.query.trim()) {
		throw new Error("web_search requires a non-empty 'query' string");
	}
	const rawLimit = record.limit ?? 10;
	const limit = Number(rawLimit);
	if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
		throw new Error("web_search 'limit' must be an integer between 1 and 20");
	}
	return { query: record.query.trim(), limit };
}

async function executeWebSearchWrapper(
	input: unknown,
	context: any,
): Promise<unknown> {
	const parsed = parseWebSearchInput(input);
	return executeWebSearch(parsed.query, parsed.limit, context.callerRole);
}

async function getDebateResult(runId: string): Promise<any | null> {
	let db: Database.Database;
	try {
		db = getCatalogDb();
	} catch {
		return null;
	}
	try {
		const row = db
			.prepare(
				"SELECT id, topic, mode, status, data_json, created_at, updated_at FROM conversations WHERE id = ?",
			)
			.get(runId) as
			| {
				id: string;
				topic: string;
				mode: string;
				status: string;
				data_json: string | null;
				created_at: number;
				updated_at: number;
			}
			| undefined;
		if (!row) return null;
		return {
			runId: row.id,
			topic: row.topic,
			mode: row.mode,
			status: row.status,
			result: row.data_json ? JSON.parse(row.data_json) : null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	} catch {
		return null;
	}
}

async function getProjectContext(
	projectId: string,
	kind: string,
): Promise<any> {
	const rows = getCatalogDb()
		.prepare(
			"SELECT * FROM project_catalog WHERE id = ? OR source_id = ? OR full_name = ?",
		)
		.all(projectId, projectId, projectId);
	return {
		projectId,
		kind,
		sources: rows,
		source: "project_catalog",
		timestamp: Date.now(),
	};
}

/* ----------------------------------------------------------------
   Start
----------------------------------------------------------------- */

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("[GovernMindz MCP] stdio server ready");
}

main().catch((err) => {
	console.error("[GovernMindz MCP] fatal:", err);
	process.exit(1);
});
