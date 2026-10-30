/**
 * Change Execution Service
 *
 * Governs the lifecycle of proposed changes from external AI clients.
 * All proposed changes must be separated from actual execution. The workflow:
 *   1. External AI proposes a modification (via project_artifacts, status='draft')
 *   2. GovernMindz prepares the change (diff generation, risk checks)
 *   3. An approval record is created (bound to exact change hash + project + scope + version)
 *   4. User reviews and explicitly approves or rejects
 *   5. On approval, authorization is revalidated immediately before execution
 *   6. The approved change is executed; results and metadata are recorded
 *   7. Any material modification after approval invalidates that approval
 *
 * Read-only GitHub synchronization policy is preserved — no Git push
 * permissions are granted through this service.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { approvalService } from "./ApprovalService.js";
import { externalClientRegistry } from "./ExternalClientRegistry.js";
import { permissionPolicyEngine } from "./PermissionPolicyEngine.js";

const CATALOG_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");
const PROJECT_ROOT = process.cwd();
const BACKUP_ROOT = path.resolve(PROJECT_ROOT, ".governmindz-backups");
let catalogDb: Database.Database | null = null;

function getCatalogDb(): Database.Database {
	if (!catalogDb) {
		catalogDb = new Database(CATALOG_DB_PATH, { readonly: false });
		catalogDb.pragma("journal_mode = WAL");
	}
	return catalogDb;
}

/* ----------------------------------------------------------------
   Backup / apply / rollback helpers
----------------------------------------------------------------- */

function ensureBackupDir(): string {
	const ts = Date.now();
	const dir = path.join(BACKUP_ROOT, String(ts));
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function resolveTargetFile(targetFile: string): string {
	const resolved = path.resolve(PROJECT_ROOT, targetFile);
	if (resolved !== PROJECT_ROOT && !resolved.startsWith(PROJECT_ROOT + path.sep)) {
		throw new Error(`Target file outside project root: ${targetFile}`);
	}
	return resolved;
}

function backupFiles(targetFiles: string[], backupDir: string): string[] {
	const backedUp: string[] = [];
	for (const tf of targetFiles) {
		const resolved = resolveTargetFile(tf);
		if (!fs.existsSync(resolved)) continue;
		const rel = path.relative(PROJECT_ROOT, resolved);
		const dest = path.join(backupDir, rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(resolved, dest);
		backedUp.push(rel);
	}
	return backedUp;
}

function runGitApply(diff: string): { success: boolean; error?: string } {
	try {
		execFileSync("git", ["apply", "--check", "-"], {
			input: diff,
			encoding: "utf8",
			cwd: PROJECT_ROOT,
			maxBuffer: 10 * 1024 * 1024,
		});
		execFileSync("git", ["apply", "-"], {
			input: diff,
			encoding: "utf8",
			cwd: PROJECT_ROOT,
			maxBuffer: 10 * 1024 * 1024,
		});
		return { success: true };
	} catch (err: any) {
		return { success: false, error: err?.message || String(err) };
	}
}

function runNpmInstall(): { success: boolean; error?: string } {
	try {
		execFileSync("npm", ["install"], {
			cwd: PROJECT_ROOT,
			encoding: "utf8",
			maxBuffer: 20 * 1024 * 1024,
		});
		return { success: true };
	} catch (err: any) {
		return { success: false, error: err?.message || String(err) };
	}
}

function restoreBackup(backupDir: string): { restored: string[]; errors: string[] } {
	const restored: string[] = [];
	const errors: string[] = [];
	if (!fs.existsSync(backupDir)) return { restored, errors };

	function walk(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else {
				const rel = path.relative(backupDir, full);
				const target = path.join(PROJECT_ROOT, rel);
				try {
					fs.mkdirSync(path.dirname(target), { recursive: true });
					fs.copyFileSync(full, target);
					restored.push(rel);
				} catch (err: any) {
					errors.push(`${rel}: ${err?.message || String(err)}`);
				}
			}
		}
	}
	walk(backupDir);
	return { restored, errors };
}

export type ChangeType =
	| "code_patch"
	| "config_change"
	| "dependency_change"
	| "migration"
	| "deployment_change"
	| "file_modification"
	| "other";

export type ChangeStatus =
	| "draft"
	| "submitted"
	| "under_review"
	| "approved"
	| "in_progress"
	| "completed"
	| "rejected"
	| "deferred"
	| "cancelled"
	| "rolled_back";

export const HIGH_RISK_CHANGE_TYPES: ChangeType[] = [
	"deployment_change",
	"migration",
];

export interface PreparedChange {
	id: string;
	projectId: string;
	type: ChangeType;
	description: string;
	diff: string;
	targetFiles: string[];
	riskLevel: "low" | "medium" | "high";
	status: ChangeStatus;
	preparedBy: string; // clientId
	preparedAt: number;
	approvalId?: string;
	changeHash: string;
	version: number;
	executedAt?: number;
	executedBy?: string;
	executionResult?: string;
	rollbackInfo?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PrepareChangeInput {
	projectId: string;
	type: ChangeType;
	description: string;
	diff: string;
	targetFiles: string[];
	preparedBy: string; // clientId
}

export interface ExecuteChangeInput {
	changeId: string;
	executedBy: string; // userId — must be the project owner, not the client
}

export class ChangeExecutionService {
	/**
	 * Prepare a change for review. Generates a change hash, assesses risk,
	 * and stores the change as a pending draft. Does NOT apply any changes.
	 */
	async prepareChange(input: PrepareChangeInput): Promise<PreparedChange> {
		const id = `change:${createHash("sha256")
			.update(`${input.projectId}:${input.description}:${Date.now()}`)
			.digest("hex")
			.slice(0, 24)}`;
		const now = Date.now();
		const changeHash = createHash("sha256")
			.update(`${input.diff}:${JSON.stringify(input.targetFiles)}:${now}`)
			.digest("hex");
		const riskLevel = this.assessRisk(input.type, input.diff, input.targetFiles);

		const db = getCatalogDb();
		const stmt = db.prepare(`
			INSERT INTO project_artifacts (id, project_id, type, title, content, status, originating_client, created_at, updated_at)
			VALUES (@id, @project_id, @type, @title, @content, 'draft', @originating_client, @created_at, @updated_at)
		`);
		stmt.run({
			id,
			project_id: input.projectId,
			type: input.type,
			title: input.description,
			content: JSON.stringify({
				diff: input.diff,
				targetFiles: input.targetFiles,
				changeHash,
				version: 1,
				riskLevel,
			}),
			originating_client: input.preparedBy,
			created_at: now,
			updated_at: now,
		});

		return this.getChange(id)!;
	}

	/**
	 * Submit a prepared change for review. Creates an approval record that
	 * the user must explicitly approve before execution.
	 */
	async submitForReview(changeId: string): Promise<{ change: PreparedChange; approvalId: string }> {
		const change = this.getChange(changeId);
		if (!change) throw new Error(`Change not found: ${changeId}`);
		if (change.status !== "draft") {
			throw new Error(`Change is not in draft status (current: ${change.status})`);
		}

		// Create approval record bound to the exact change hash
		const approval = await approvalService.createApproval({
			clientId: change.preparedBy,
			changeHash: change.changeHash,
			changeDescription: change.description,
			projectId: change.projectId,
			expiresInMinutes: 60 * 24 * 7, // 7 days
		});

		// Update artifact status to submitted
		const db = getCatalogDb();
		db.prepare(
			"UPDATE project_artifacts SET status = 'submitted', updated_at = @now WHERE id = @id",
		).run({ now: Date.now(), id: changeId });

		return {
			change: { ...change, status: "submitted" },
			approvalId: approval.id,
		};
	}

	/**
	 * Get a prepared change by ID.
	 */
	getChange(id: string): PreparedChange | null {
		const db = getCatalogDb();
		const row = db
			.prepare("SELECT * FROM project_artifacts WHERE id = ? AND type IN ('code_patch', 'config_change', 'dependency_change', 'migration', 'deployment_change', 'file_modification', 'other')")
			.get(id) as any | undefined;
		if (!row) return null;
		return this.mapRow(row);
	}

	/**
	 * List changes for a project, optionally filtered by status.
	 */
	listChanges(projectId: string, status?: ChangeStatus): PreparedChange[] {
		const db = getCatalogDb();
		let rows: any[];
		if (status) {
			rows = db
				.prepare(
					"SELECT * FROM project_artifacts WHERE project_id = ? AND status = ? AND type IN ('code_patch', 'config_change', 'dependency_change', 'migration', 'deployment_change', 'file_modification', 'other') ORDER BY updated_at DESC",
				)
				.all(projectId, status) as any[];
		} else {
			rows = db
				.prepare(
					"SELECT * FROM project_artifacts WHERE project_id = ? AND type IN ('code_patch', 'config_change', 'dependency_change', 'migration', 'deployment_change', 'file_modification', 'other') ORDER BY updated_at DESC",
				)
				.all(projectId) as any[];
		}
		return rows.map((r) => this.mapRow(r));
	}

	/**
	 * Execute an approved change. Revalidates authorization immediately before
	 * execution. Only the project owner (executedBy) can execute — not the
	 * external client that prepared it.
	 */
	async executeChange(input: ExecuteChangeInput): Promise<{
		change: PreparedChange;
		result: string;
	}> {
		const change = this.getChange(input.changeId);
		if (!change) throw new Error(`Change not found: ${input.changeId}`);
		if (change.status !== "submitted" && change.status !== "approved") {
			throw new Error(
				`Change is not ready for execution (current: ${change.status})`,
			);
		}

		// Revalidate authorization: the executor must be authorized at EXECUTE level
		const perm = permissionPolicyEngine.getClientPermission(
			input.executedBy,
			change.projectId,
		);
		if (!perm || perm.permissionLevel !== "EXECUTE") {
			throw new Error(
				`User ${input.executedBy} does not have EXECUTE permission for project ${change.projectId}`,
			);
		}

		// Verify the approval is still valid and matches this change
		const approval = this.findApprovalForChange(input.changeId);
		if (!approval || approval.status !== "approved") {
			throw new Error("No valid approval found for this change");
		}
		if (approval.changeHash !== change.changeHash) {
			throw new Error(
				"Change has been modified since approval — re-approval required",
			);
		}

		// HIGH_RISK changes always require explicit user execution
		if (HIGH_RISK_CHANGE_TYPES.includes(change.type as ChangeType)) {
			// Already checked EXECUTE permission above — that's the gate
		}

		const now = Date.now();
		const db = getCatalogDb();

		// Mark change as in_progress before execution
		db.prepare(
			"UPDATE project_artifacts SET status = 'in_progress', updated_at = @now WHERE id = @id",
		).run({ now, id: input.changeId });

		// Create backup before any file system changes
		let backupDir: string | null = null;
		let backedUpFiles: string[] = [];
		let rollbackInfo: string | undefined = undefined;

		try {
			backupDir = ensureBackupDir();
			backedUpFiles = backupFiles(change.targetFiles, backupDir);

			let applyResult: { success: boolean; error?: string };

			switch (change.type) {
				case "code_patch":
				case "config_change":
				case "file_modification": {
					applyResult = runGitApply(change.diff);
					break;
				}
				case "dependency_change": {
					applyResult = runNpmInstall();
					break;
				}
				case "migration":
				case "deployment_change": {
					// High-risk: do not auto-execute. Record intent only.
					applyResult = {
						success: false,
						error: `${change.type} changes require manual execution — GovernMindz prepares but does not apply migrations or deployments automatically.`,
					};
					break;
				}
				default: {
					applyResult = {
						success: false,
						error: `Unsupported change type for auto-execution: ${change.type}`,
					};
				}
			}

			if (!applyResult.success) {
				// Rollback: restore files from backup
				const restore = backupDir ? restoreBackup(backupDir) : { restored: [], errors: [] };
				db.prepare(
					"UPDATE project_artifacts SET status = 'rejected', executed_at = @now, content = @content, updated_at = @now WHERE id = @id",
				).run({
					now,
					content: JSON.stringify({
						diff: change.diff,
						targetFiles: change.targetFiles,
						changeHash: change.changeHash,
						version: change.version,
						riskLevel: "low",
						executionResult: JSON.stringify({
							status: "failed",
							error: applyResult.error,
							restored: restore.restored,
							errors: restore.errors,
						}),
					}),
					id: input.changeId,
				});
				return {
					change: {
						...change,
						status: "rejected",
						executedAt: now,
						executedBy: input.executedBy,
						executionResult: JSON.stringify({
							status: "failed",
							error: applyResult.error,
							restored: restore.restored,
							errors: restore.errors,
						}),
					},
					result: JSON.stringify({
						status: "failed",
						error: applyResult.error,
						restored: restore.restored,
						errors: restore.errors,
					}),
				};
			}

			// Success — record execution with rollback info
			rollbackInfo = backupDir ? JSON.stringify({ backupDir, backedUpFiles }) : undefined;
			const executionResult = JSON.stringify({
				status: "executed",
				executedAt: now,
				executedBy: input.executedBy,
				changeId: input.changeId,
				targetFiles: change.targetFiles,
				message: "Change executed successfully.",
				rollbackInfo,
			});

			// Record execution
			db.prepare(`
				UPDATE project_artifacts
				SET status = 'completed', executed_at = @now, executed_by = @executedBy,
					content = @content, updated_at = @now
				WHERE id = @id
			`).run({
				now,
				executedBy: input.executedBy,
				content: JSON.stringify({
					diff: change.diff,
					targetFiles: change.targetFiles,
					changeHash: change.changeHash,
					version: change.version,
					riskLevel: "low",
					executionResult,
				}),
				id: input.changeId,
			});

			return {
				change: {
					...change,
					status: "completed",
					executedAt: now,
					executedBy: input.executedBy,
					executionResult,
					rollbackInfo,
				},
				result: executionResult,
			};
		} catch (err: any) {
			// Unexpected error — attempt rollback
			if (backupDir) {
				const restore = restoreBackup(backupDir);
				rollbackInfo = (JSON.stringify({
					backupDir,
					restored: restore.restored,
					errors: restore.errors,
					emergencyRollback: true,
				}) as string);
			}
			db.prepare(
				"UPDATE project_artifacts SET status = 'rejected', executed_at = @now, content = @content, updated_at = @now WHERE id = @id",
			).run({
				now: Date.now(),
				content: JSON.stringify({
					diff: change.diff,
					targetFiles: change.targetFiles,
					changeHash: change.changeHash,
					version: change.version,
					riskLevel: "low",
					executionResult: JSON.stringify({
						status: "error",
						error: err?.message || String(err),
						rollbackInfo,
					}),
				}),
				id: input.changeId,
			});
			throw err;
		}
	}

	/**
	 * Reject a prepared change (before approval).
	 */
	async rejectChange(changeId: string, rejectedBy: string): Promise<void> {
		const change = this.getChange(changeId);
		if (!change) throw new Error(`Change not found: ${changeId}`);
		if (change.status !== "draft" && change.status !== "submitted") {
			throw new Error(`Cannot change in status ${change.status}`);
		}

		const db = getCatalogDb();
		db.prepare(
			"UPDATE project_artifacts SET status = 'rejected', updated_at = @now WHERE id = @id",
		).run({ now: Date.now(), id: changeId });
	}

	/**
	 * Cancel a change.
	 */
	async cancelChange(changeId: string): Promise<void> {
		const change = this.getChange(changeId);
		if (!change) throw new Error(`Change not found: ${changeId}`);
		if (!["draft", "submitted", "under_review"].includes(change.status)) {
			throw new Error(`Cannot cancel change in status ${change.status}`);
		}

	const db = getCatalogDb();
	db.prepare(
		"UPDATE project_artifacts SET status = 'cancelled', updated_at = @now WHERE id = @id",
	).run({ now: Date.now(), id: changeId });
	}

	/**
	 * Roll back a completed change by restoring files from the backup stored
	 * in rollbackInfo. Only completed changes can be rolled back.
	 */
	async rollbackChange(changeId: string): Promise<void> {
		const change = this.getChange(changeId);
		if (!change) throw new Error(`Change not found: ${changeId}`);
		if (change.status !== "completed") {
			throw new Error(`Cannot roll back change in status ${change.status}`);
		}
		if (!change.rollbackInfo) {
			throw new Error(`No rollback information available for change ${changeId}`);
		}

		let rollbackData: { backupDir?: string; backedUpFiles?: string[] };
		try {
			rollbackData = JSON.parse(change.rollbackInfo);
		} catch {
			throw new Error(`Invalid rollback information for change ${changeId}`);
		}

		if (!rollbackData.backupDir) {
			throw new Error(`No backup directory recorded for change ${changeId}`);
		}

		const restore = restoreBackup(rollbackData.backupDir);

		const db = getCatalogDb();
		db.prepare(
			"UPDATE project_artifacts SET status = 'rolled_back', updated_at = @now, content = @content WHERE id = @id",
		).run({
			now: Date.now(),
			content: JSON.stringify({
				rollbackRestored: restore.restored,
				rollbackErrors: restore.errors,
				rolledBackAt: Date.now(),
			}),
			id: changeId,
		});

		if (restore.errors.length > 0) {
			throw new Error(
				`Rollback completed with errors: ${restore.errors.join(", ")}`,
			);
		}
	}

	/**
	 * Assess risk level based on change type and content.
	 */
	private assessRisk(
		type: ChangeType,
		diff: string,
		targetFiles: string[],
	): "low" | "medium" | "high" {
		if (HIGH_RISK_CHANGE_TYPES.includes(type)) return "high";
		if (diff.length > 10000) return "high";
		if (targetFiles.some((f) => f.match(/\.(env|key|secret|pem|json)$/i))) {
			return "high";
		}
		if (diff.length > 1000) return "medium";
		return "low";
	}

	/**
	 * Find the approval record associated with a change.
	 */
	private findApprovalForChange(changeId: string): any {
		const change = this.getChange(changeId);
		if (!change) return null;
		const approvals = approvalService.listApprovalsForClient(change.preparedBy);
		return approvals.find(
			(a) => a.changeHash === change.changeHash && a.status === "approved",
		) ?? null;
	}

	private mapRow(row: any): PreparedChange {
		let content: any = {};
		try {
			content = row.content ? JSON.parse(row.content) : {};
		} catch {
			content = {};
		}
		return {
			id: row.id,
			projectId: row.project_id,
			type: row.type,
			description: row.title,
			diff: content.diff ?? "",
			targetFiles: content.targetFiles ?? [],
			riskLevel: content.riskLevel ?? "low",
			status: row.status,
			preparedBy: row.originating_client,
			preparedAt: row.created_at,
			approvalId: undefined, // set separately
			changeHash: content.changeHash ?? "",
			version: content.version ?? 1,
			executedAt: row.executed_at ?? undefined,
			executedBy: row.executed_by ?? undefined,
			executionResult: content.executionResult ?? undefined,
			rollbackInfo: content.rollbackInfo ?? undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}
}

export const changeExecutionService = new ChangeExecutionService();
