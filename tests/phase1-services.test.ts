// Phase 1 service tests.
//
// Verifies AI provider registry, external client registry, permission policy
// engine, approval service, and change execution service behavior.

import assert from "node:assert/strict";
import { describe, test, beforeEach, after } from "node:test";
import Database from "better-sqlite3";
import path from "node:path";
import {
	AIProviderRegistry,
	type AIProvider,
	type CreateAIProviderInput,
} from "../apps/gateway/src/services/AIProviderRegistry.js";
import {
	ExternalClientRegistry,
	type CreateExternalClientInput,
} from "../apps/gateway/src/services/ExternalClientRegistry.js";
import {
	PermissionPolicyEngine,
	PERMISSION_HIERARCHY,
	type McpRegistry,
	type ToolRegistration,
} from "../apps/gateway/src/services/PermissionPolicyEngine.js";
import { ApprovalService } from "../apps/gateway/src/services/ApprovalService.js";
import { ChangeExecutionService } from "../apps/gateway/src/services/ChangeExecutionService.js";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");

function resetTables() {
	const db = new Database(TEST_DB_PATH, { readonly: false });
	db.exec(`
		CREATE TABLE IF NOT EXISTS ai_providers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			endpoint TEXT,
			api_key_encrypted TEXT NOT NULL,
			model TEXT,
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS external_clients (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			client_type TEXT NOT NULL,
			user_id TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			approved_at INTEGER,
			revoked_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS client_permissions (
			id TEXT PRIMARY KEY,
			client_id TEXT NOT NULL,
			project_id TEXT,
			permission_level TEXT NOT NULL,
			granted_tools TEXT NOT NULL DEFAULT '[]',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS approval_records (
			id TEXT PRIMARY KEY,
			client_id TEXT NOT NULL,
			change_hash TEXT NOT NULL,
			change_description TEXT NOT NULL,
			project_id TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			approved_by TEXT,
			approved_at INTEGER,
			expires_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS project_artifacts (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			type TEXT NOT NULL,
			title TEXT NOT NULL,
			content TEXT,
			status TEXT NOT NULL DEFAULT 'draft',
			originating_client TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			approved_by TEXT,
			approved_at INTEGER,
			executed_at INTEGER,
			executed_by TEXT
		);
		CREATE TABLE IF NOT EXISTS webhook_configs (
			id TEXT PRIMARY KEY,
			target_url TEXT NOT NULL,
			secret TEXT NOT NULL DEFAULT '',
			events TEXT NOT NULL DEFAULT '[]',
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS webhook_deliveries (
			id TEXT PRIMARY KEY,
			webhook_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			payload TEXT NOT NULL,
			signature TEXT NOT NULL,
			idempotency_key TEXT NOT NULL,
			attempt INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			http_status INTEGER,
			error_message TEXT,
			delivered_at INTEGER,
			created_at INTEGER NOT NULL
		);
		DELETE FROM ai_providers;
		DELETE FROM external_clients;
		DELETE FROM client_permissions;
		DELETE FROM approval_records;
		DELETE FROM project_artifacts;
		DELETE FROM webhook_configs;
		DELETE FROM webhook_deliveries;
	`);
	db.close();
}

function makeRegistry(): McpRegistry {
	return {
		version: "0.1.0",
		servers: [],
		policies: {
			default_rate_limit_per_min: 30,
			audit_all_calls: true,
			tool_overrides: {},
		},
	};
}

function makeTool(name: string): ToolRegistration {
	return {
		definition: {
			name,
			description: `Test tool ${name}`,
			inputSchema: { type: "object", properties: {} },
			riskGate: "rate_limited",
			rateLimit: 30,
		},
		handler: async () => ({ ok: true }),
	};
}

describe("AIProviderRegistry", () => {
	beforeEach(() => resetTables());
	after(() => resetTables());

	const registry = new AIProviderRegistry();

	test("create and retrieve provider", async () => {
		const input: CreateAIProviderInput = {
			name: "Test OpenAI",
			type: "openai",
			endpoint: "https://api.openai.com/v1",
			apiKey: "sk-test1234567890",
			model: "gpt-4",
			status: "enabled",
		};
		const created = await registry.createProvider(input);
		assert.strictEqual(created.name, "Test OpenAI");
		assert.strictEqual(created.type, "openai");
		assert.strictEqual(created.status, "enabled");
		assert.ok(created.id.startsWith("provider:"));

		const retrieved = registry.getProvider(created.id);
		assert.ok(retrieved);
		assert.strictEqual(retrieved!.name, "Test OpenAI");
		assert.strictEqual(retrieved!.endpoint, "https://api.openai.com/v1");
	});

	test("list providers", async () => {
		await registry.createProvider({
			name: "Provider A",
			type: "anthropic",
			apiKey: "sk-ant-123",
		});
		await registry.createProvider({
			name: "Provider B",
			type: "meterless",
			apiKey: "meterless-token",
		});
		const providers = registry.listProviders();
		assert.strictEqual(providers.length, 2);
	});

	test("update provider", async () => {
		const created = await registry.createProvider({
			name: "Original",
			type: "openai",
			apiKey: "sk-original",
		});
		const updated = await registry.updateProvider(created.id, {
			name: "Updated",
			status: "disabled",
		});
		assert.strictEqual(updated.name, "Updated");
		assert.strictEqual(updated.status, "disabled");
	});

	test("delete provider", async () => {
		const created = await registry.createProvider({
			name: "ToDelete",
			type: "custom",
			apiKey: "sk-temp",
		});
		const deleted = registry.deleteProvider(created.id);
		assert.strictEqual(deleted, true);
		assert.strictEqual(registry.getProvider(created.id), null);
	});

	test("get provider API key", async () => {
		const created = await registry.createProvider({
			name: "KeyTest",
			type: "openrouter",
			apiKey: "sk-or-test-key",
		});
		const key = registry.getProviderApiKey(created.id);
		assert.strictEqual(key, "sk-or-test-key");
	});
});

describe("ExternalClientRegistry", () => {
	beforeEach(() => resetTables());
	after(() => resetTables());

	const registry = new ExternalClientRegistry();

	test("create, approve, and revoke client", async () => {
		const input: CreateExternalClientInput = {
			name: "Claude Desktop",
			clientType: "mcp",
			userId: "user-1",
		};
		const created = await registry.createClient(input);
		assert.strictEqual(created.status, "pending");
		assert.strictEqual(created.name, "Claude Desktop");

		const approved = await registry.approveClient(created.id, "user-1");
		assert.strictEqual(approved.status, "approved");
		assert.ok(approved.approvedAt);

		const revoked = await registry.revokeClient(created.id, "user-1");
		assert.strictEqual(revoked.status, "revoked");
		assert.ok(revoked.revokedAt);
		assert.strictEqual(registry.isClientApproved(created.id), false);
	});

	test("list clients", async () => {
		await registry.createClient({ name: "Client A", clientType: "mcp", userId: "u1" });
		await registry.createClient({ name: "Client B", clientType: "custom_api", userId: "u2" });
		const clients = registry.listClients();
		assert.strictEqual(clients.length, 2);
	});

	test("isClientApproved returns false for pending client", async () => {
		const created = await registry.createClient({
			name: "Pending",
			clientType: "mcp",
			userId: "u1",
		});
		assert.strictEqual(registry.isClientApproved(created.id), false);
	});

	test("approve fails for non-owner", async () => {
		const created = await registry.createClient({
			name: "Owned",
			clientType: "mcp",
			userId: "owner",
		});
		assert.rejects(() => registry.approveClient(created.id, "not-owner"));
	});
});

describe("PermissionPolicyEngine", () => {
	const projectId = "project-1";
	const engine = new PermissionPolicyEngine();

	async function setupApprovedClient() {
		resetTables();
		const clientReg = new ExternalClientRegistry();
		const created = await clientReg.createClient({
			name: "Test Client",
			clientType: "mcp",
			userId: "user-1",
		});
		await clientReg.approveClient(created.id, "user-1");
		return created.id;
	}

	test("grant and check OBSERVE permission", async () => {
		resetTables();
		const clientId = await setupApprovedClient();
		await engine.grantPermission(clientId, projectId, "OBSERVE", [
			"project_catalog_search",
		]);
		const perm = engine.getClientPermission(clientId, projectId);
		assert.ok(perm);
		assert.strictEqual(perm!.permissionLevel, "OBSERVE");
		assert.ok(perm!.grantedTools.includes("project_catalog_search"));
	});

	test("permission hierarchy is correct", () => {
		assert.ok(PERMISSION_HIERARCHY.EXECUTE > PERMISSION_HIERARCHY.PREPARE);
		assert.ok(PERMISSION_HIERARCHY.PREPARE > PERMISSION_HIERARCHY.PROPOSE);
		assert.ok(PERMISSION_HIERARCHY.PROPOSE > PERMISSION_HIERARCHY.OBSERVE);
		assert.strictEqual(PERMISSION_HIERARCHY.OBSERVE, 1);
		assert.strictEqual(PERMISSION_HIERARCHY.PROPOSE, 2);
		assert.strictEqual(PERMISSION_HIERARCHY.PREPARE, 3);
		assert.strictEqual(PERMISSION_HIERARCHY.EXECUTE, 4);
	});

	test("evaluate denies unapproved client", () => {
		const registry = makeRegistry();
		const tool = makeTool("project_catalog_search");
		const context = {
			callerRole: "external_client",
			correlationId: "test-1",
			clientId: "nonexistent",
		};
		const result = engine.evaluate(registry, tool, context);
		assert.strictEqual(result.allowed, false);
		assert.ok(result.reason?.includes("not found"));
	});

	test("evaluate denies insufficient permission level", async () => {
		const clientId = await setupApprovedClient();
		await engine.grantPermission(clientId, projectId, "OBSERVE", []);
		const registry = makeRegistry();
		const tool = makeTool("debate_start"); // requires PROPOSE
		const context = {
			callerRole: "external_client",
			correlationId: "test-2",
			clientId,
			projectId,
		};
		const result = engine.evaluate(registry, tool, context);
		assert.strictEqual(result.allowed, false);
		assert.ok(result.reason?.includes("insufficient"));
	});

	test("evaluate allows sufficient permission level", async () => {
		const clientId = await setupApprovedClient();
		await engine.grantPermission(clientId, projectId, "EXECUTE", [
			"project_catalog_search",
		]);
		const registry = makeRegistry();
		const tool = makeTool("project_catalog_search");
		const context = {
			callerRole: "external_client",
			correlationId: "test-3",
			clientId,
			projectId,
		};
		const result = engine.evaluate(registry, tool, context);
		assert.strictEqual(result.allowed, true);
	});

	test("evaluate denies tool not granted", async () => {
		const clientId = await setupApprovedClient();
		await engine.grantPermission(clientId, projectId, "OBSERVE", [
			"zetaris_query",
		]);
		const registry = makeRegistry();
		const tool = makeTool("project_catalog_search"); // not in granted tools
		const context = {
			callerRole: "external_client",
			correlationId: "test-4",
			clientId,
			projectId,
		};
		const result = engine.evaluate(registry, tool, context);
		assert.strictEqual(result.allowed, false);
		assert.ok(result.reason?.includes("not granted"));
	});
});

describe("ApprovalService", () => {
	beforeEach(() => resetTables());
	after(() => resetTables());

	const service = new ApprovalService();

	test("create, approve, and reject approval", async () => {
		const created = await service.createApproval({
			clientId: "client-1",
			changeHash: "abc123",
			changeDescription: "Add new feature",
			projectId: "project-1",
			expiresInMinutes: 60,
		});
		assert.strictEqual(created.status, "pending");
		assert.strictEqual(created.changeHash, "abc123");
		assert.ok(created.expiresAt);

		const approved = await service.approve(created.id, "user-1");
		assert.strictEqual(approved.status, "approved");
		assert.strictEqual(approved.approvedBy, "user-1");
		assert.ok(approved.approvedAt);

		const fetchAgain = service.getApproval(created.id);
		assert.strictEqual(fetchAgain!.status, "approved");
	});

	test("reject pending approval", async () => {
		const created = await service.createApproval({
			clientId: "client-1",
			changeHash: "def456",
			changeDescription: "Remove feature",
			projectId: "project-1",
		});
		const rejected = await service.reject(created.id, "user-1");
		assert.strictEqual(rejected.status, "rejected");
		assert.strictEqual(rejected.approvedBy, "user-1");
	});

	test("approve already approved throws", async () => {
		const created = await service.createApproval({
			clientId: "client-1",
			changeHash: "ghi789",
			changeDescription: "Test",
		});
		await service.approve(created.id, "user-1");
		assert.rejects(() => service.approve(created.id, "user-1"));
	});

	test("list pending approvals", async () => {
		await service.createApproval({
			clientId: "client-1",
			changeHash: "p1",
			changeDescription: "Pending 1",
		});
		await service.createApproval({
			clientId: "client-2",
			changeHash: "p2",
			changeDescription: "Pending 2",
		});
		const pending = service.listPendingApprovals();
		assert.strictEqual(pending.length, 2);
	});

	test("expire expired approvals", async () => {
		const created = await service.createApproval({
			clientId: "client-1",
			changeHash: "expired1",
			changeDescription: "Expired",
			expiresInMinutes: -1, // already expired
		});
		await service.expireExpiredApprovals();
		const fetchAgain = service.getApproval(created.id);
		assert.strictEqual(fetchAgain!.status, "expired");
	});

	test("getApproval returns null for missing", () => {
		assert.strictEqual(service.getApproval("nonexistent"), null);
	});
});

describe("ChangeExecutionService", () => {
	beforeEach(() => resetTables());
	after(() => resetTables());

	const service = new ChangeExecutionService();

	test("prepare and submit change for review", async () => {
		const change = await service.prepareChange({
			projectId: "project-1",
			type: "code_patch",
			description: "Fix null pointer in parser",
			diff: "--- a/src/parser.ts\n+++ b/src/parser.ts\n-if (x == null)\n+if (x == null || x === undefined)",
			targetFiles: ["src/parser.ts"],
			preparedBy: "client-1",
		});
		assert.strictEqual(change.status, "draft");
		assert.strictEqual(change.projectId, "project-1");
		assert.ok(change.changeHash);

		const result = await service.submitForReview(change.id);
		assert.strictEqual(result.change.status, "submitted");
		assert.ok(result.approvalId);
		assert.ok(result.approvalId.startsWith("approval:"));
	});

	test("list changes for project", async () => {
		await service.prepareChange({
			projectId: "project-1",
			type: "config_change",
			description: "Update config",
			diff: "key: value",
			targetFiles: ["config.yaml"],
			preparedBy: "client-1",
		});
		await service.prepareChange({
			projectId: "project-2",
			type: "code_patch",
			description: "Fix bug",
			diff: "fix",
			targetFiles: ["src/fix.ts"],
			preparedBy: "client-1",
		});
		const changes = service.listChanges("project-1");
		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].projectId, "project-1");
	});

	test("getChange returns null for missing", () => {
		assert.strictEqual(service.getChange("nonexistent"), null);
	});

	test("reject change", async () => {
		const change = await service.prepareChange({
			projectId: "project-1",
			type: "file_modification",
			description: "Temp change",
			diff: "temp",
			targetFiles: ["temp.txt"],
			preparedBy: "client-1",
		});
		await service.rejectChange(change.id, "user-1");
		const fetchAgain = service.getChange(change.id);
		assert.strictEqual(fetchAgain!.status, "rejected");
	});

	test("cancel change", async () => {
		const change = await service.prepareChange({
			projectId: "project-1",
			type: "dependency_change",
			description: "Update dep",
			diff: "dep@1.0.0",
			targetFiles: ["package.json"],
			preparedBy: "client-1",
		});
		await service.cancelChange(change.id);
		const fetchAgain = service.getChange(change.id);
		assert.strictEqual(fetchAgain!.status, "cancelled");
	});

	test("risk assessment for high-risk types", async () => {
		const change = await service.prepareChange({
			projectId: "project-1",
			type: "migration",
			description: "DB migration",
			diff: "ALTER TABLE",
			targetFiles: ["migration.sql"],
			preparedBy: "client-1",
		});
		assert.strictEqual(change.riskLevel, "high");
	});

	test("execute change requires EXECUTE permission", async () => {
		const change = await service.prepareChange({
			projectId: "project-1",
			type: "code_patch",
			description: "Fix",
			diff: "fix",
			targetFiles: ["src/x.ts"],
			preparedBy: "client-1",
		});
		await service.submitForReview(change.id);

		// Without EXECUTE permission, execution should fail
		assert.rejects(() =>
			service.executeChange({ changeId: change.id, executedBy: "user-1" }),
		);
	});

	test("execute change with valid approval and permission", async () => {
		const change = await service.prepareChange({
			projectId: "project-1",
			type: "code_patch",
			description: "Fix",
			diff: "fix",
			targetFiles: ["src/x.ts"],
			preparedBy: "client-1",
		});
		const { approvalId } = await service.submitForReview(change.id);

		// Grant EXECUTE permission to user-1
		const engine = new PermissionPolicyEngine();
		await engine.grantPermission("user-1", "project-1", "EXECUTE", [
			"project_change_execute",
		]);

		// Approve the approval
		const approvalService = new ApprovalService();
		await approvalService.approve(approvalId, "user-1");

		const result = await service.executeChange({
			changeId: change.id,
			executedBy: "user-1",
		});
		assert.strictEqual(result.change.status, "completed");
		assert.ok(result.result);
	});
});
