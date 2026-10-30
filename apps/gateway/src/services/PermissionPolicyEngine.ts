/**
 * Permission Policy Engine
 *
 * Extends the existing `enforcePolicy` middleware to support client identity,
 * user identity, project scope, permission levels, and tool-level
 * authorization for external AI clients.
 *
 * Permission levels (per the master directive):
 *   Level 1 — OBSERVE: Read-only access to project metadata, catalog, debate results, evidence.
 *   Level 2 — PROPOSE: Submit ideas, plans, proposals, request debates.
 *   Level 3 — PREPARE: Generate code patches, draft configuration changes (pending approval).
 *   Level 4 — EXECUTE: Apply approved changes, run commands (explicit authorization required).
 */

import { createHash } from "node:crypto";
import type {
	McpRegistry,
	ToolContext,
	ToolRegistration,
} from "@governmindz/mcp-core";
import { enforcePolicy } from "../middleware/policy.js";
import { externalClientRegistry } from "./ExternalClientRegistry.js";
import Database from "better-sqlite3";
import path from "node:path";

const CATALOG_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");
let catalogDb: Database.Database | null = null;

function getCatalogDb(): Database.Database {
	if (!catalogDb) {
		catalogDb = new Database(CATALOG_DB_PATH, { readonly: true });
		catalogDb.pragma("journal_mode = WAL");
	}
	return catalogDb;
}

export type PermissionLevel = "OBSERVE" | "PROPOSE" | "PREPARE" | "EXECUTE";

export const PERMISSION_LEVELS: PermissionLevel[] = [
	"OBSERVE",
	"PROPOSE",
	"PREPARE",
	"EXECUTE",
];

export const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
	OBSERVE: 1,
	PROPOSE: 2,
	PREPARE: 3,
	EXECUTE: 4,
};

export type ToolPermission = "read" | "propose" | "prepare" | "execute";

export const TOOL_PERMISSION_LEVELS: Record<string, ToolPermission> = {
	project_catalog_search: "read",
	zetaris_query: "read",
	web_search: "read",
	debate_start: "propose",
	debate_result: "read",
};

export interface ClientPermission {
	clientId: string;
	projectId?: string;
	permissionLevel: PermissionLevel;
	grantedTools: string[];
}

export interface PolicyEngineDecision {
	allowed: boolean;
	reason?: string;
	requiresApproval?: boolean;
	permissionLevel?: PermissionLevel;
}

export class PermissionPolicyEngine {
	/**
	 * Evaluate whether a client can call a tool, considering:
	 * 1. Client exists and is approved
	 * 2. Client has permission for the project (if scoped)
	 * 3. Client's permission level covers the tool's required level
	 * 4. Existing enforcePolicy rules (role allowlist, approval gate, rate limit)
	 */
	evaluate(
		registry: McpRegistry,
		tool: ToolRegistration,
		context: ToolContext & {
			clientId?: string;
			userId?: string;
			projectId?: string;
		},
	): PolicyEngineDecision {
		const toolName = tool.definition.name;

		// 1. Client must exist and be approved
		if (context.clientId) {
			const client = externalClientRegistry.getClient(context.clientId);
			if (!client) {
				return {
					allowed: false,
					reason: `External client not found: ${context.clientId}`,
				};
			}
			if (client.status !== "approved") {
				return {
					allowed: false,
					reason: `External client not approved: ${client.status}`,
				};
			}
		}

		// 2. Check project-scoped permission
		if (context.clientId && context.projectId) {
			const perm = this.getClientPermission(context.clientId, context.projectId);
			if (!perm) {
				return {
					allowed: false,
					reason: `Client ${context.clientId} has no permission for project ${context.projectId}`,
				};
			}

			// 3. Check permission level covers tool requirement
			const requiredLevel = TOOL_PERMISSION_LEVELS[toolName];
			if (requiredLevel) {
				const requiredNum = PERMISSION_HIERARCHY[requiredLevel as PermissionLevel];
				const clientNum = PERMISSION_HIERARCHY[perm.permissionLevel];
				if (clientNum < requiredNum) {
					return {
						allowed: false,
						reason: `Permission level '${perm.permissionLevel}' insufficient for '${toolName}' (requires '${requiredLevel}')`,
						permissionLevel: perm.permissionLevel,
					};
				}
			}

			// 4. Check granted tools (if tool-level restrictions exist)
			if (perm.grantedTools.length > 0 && !perm.grantedTools.includes(toolName)) {
				return {
					allowed: false,
					reason: `Tool '${toolName}' not granted to client for project ${context.projectId}`,
				};
			}
		}

		// 5. Delegate to existing enforcePolicy for role/approval/rate-limit
		const decision = enforcePolicy(registry, tool, context);
		if (!decision.allowed) {
			return {
				allowed: false,
				reason: decision.reason ?? "Policy denied",
				requiresApproval: decision.requiresApproval,
			};
		}

		return { allowed: true };
	}

	getClientPermission(clientId: string, projectId: string): ClientPermission | null {
		const db = getCatalogDb();
		const row = db
			.prepare(
				"SELECT * FROM client_permissions WHERE client_id = ? AND (project_id = ? OR project_id IS NULL) ORDER BY project_id DESC LIMIT 1",
			)
			.get(clientId, projectId) as any | undefined;
		if (!row) return null;
		return {
			clientId: row.client_id,
			projectId: row.project_id ?? undefined,
			permissionLevel: row.permission_level as PermissionLevel,
			grantedTools: JSON.parse(row.granted_tools),
		};
	}

	async grantPermission(
		clientId: string,
		projectId: string | undefined,
		permissionLevel: PermissionLevel,
		grantedTools: string[] = [],
	): Promise<void> {
		const id = `perm:${createHash("sha256")
			.update(`${clientId}:${projectId ?? "global"}:${Date.now()}`)
			.digest("hex")
			.slice(0, 24)}`;
		const now = Date.now();
		const db = getCatalogDb();
		const stmt = db.prepare(`
			INSERT INTO client_permissions (id, client_id, project_id, permission_level, granted_tools, created_at, updated_at)
			VALUES (@id, @client_id, @project_id, @permission_level, @granted_tools, @created_at, @updated_at)
		`);
		stmt.run({
			id,
			client_id: clientId,
			project_id: projectId ?? null,
			permission_level: permissionLevel,
			granted_tools: JSON.stringify(grantedTools),
			created_at: now,
			updated_at: now,
		});
	}

	listPermissionsForClient(clientId: string): ClientPermission[] {
		const db = getCatalogDb();
		const rows = db
			.prepare("SELECT * FROM client_permissions WHERE client_id = ? ORDER BY updated_at DESC")
			.all(clientId) as any[];
		return rows.map((r) => ({
			clientId: r.client_id,
			projectId: r.project_id ?? undefined,
			permissionLevel: r.permission_level as PermissionLevel,
			grantedTools: JSON.parse(r.granted_tools),
		}));
	}
}

export const permissionPolicyEngine = new PermissionPolicyEngine();
