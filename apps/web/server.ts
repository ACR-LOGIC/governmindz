
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { randomUUID, createHash } from "node:crypto";
import Database from "better-sqlite3";
import { runDebate } from "../gateway/src/debateRunner.js";

const CATALOG_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");
import { RunDebateApplicationService } from "../gateway/src/application/RunDebateApplicationService.js";
import { auditTrail } from "@governmindz/core/engine/AuditTrailEmitter";
import { AuditChainVerifier } from "@governmindz/core/engine/AuditChainVerifier";
import {
	credibilityManager,
	computeCredibilityMetrics,
	COLD_START_PRIORS,
} from "@governmindz/core/kernel/CredibilityManager";
import { HMemService } from "@governmindz/core/memory/HMemService";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import {
	buildConversationExport,
	ExportBuildError,
	type ConversationExportFormat,
	type ExportArtifactFile,
} from "@governmindz/core/exports/ConversationExport";
import { zetarisQueryHandler } from "../gateway/src/tools/zetaris.tools.js";
import { sharedResilientZetarisClient } from "@governmindz/core/integrations/ResilientZetarisClient";
import { GitHubAppClient } from "@governmindz/core/integrations/githubAppClient";
import { executeWebSearch } from "../gateway/src/tools/webSearch.tools.js";
import { voiceService } from "@governmindz/voice";
import {
	aiProviderRegistry,
} from "../gateway/src/services/AIProviderRegistry.js";
import {
	externalClientRegistry,
} from "../gateway/src/services/ExternalClientRegistry.js";
import {
	permissionPolicyEngine,
} from "../gateway/src/services/PermissionPolicyEngine.js";
import {
	approvalService,
} from "../gateway/src/services/ApprovalService.js";
import { getConfigStatus, saveSecureConfig, loadLocalEnvIfPresent } from "../gateway/src/services/cryptoConfig.js";
loadLocalEnvIfPresent();

function getEffectiveAuditSecret(secretOverride?: string): string {
	const secret = (secretOverride ?? process.env.AUDIT_TRAIL_SECRET ?? "").trim();
	if (!secret || secret.length < 16) {
		throw new Error("AUDIT_TRAIL_SECRET is missing or too short; audit verification is disabled.");
	}
	return secret;
}

function validateConfig(): string[] {
	const recommended = ["METERLESS_BASE_URL", "METERLESS_API_KEY", "ZETARIS_ORG_ID", "ZETARIS_API_KEY"];
	const missing = recommended.filter((k) => !process.env[k]?.trim());
	if (missing.length) {
		console.warn(`[config] Missing recommended env vars: ${missing.join(", ")}. Some features may be unavailable.`);
	}
	const auditSecret = process.env.AUDIT_TRAIL_SECRET;
	if (!auditSecret || auditSecret.length < 16) {
		console.warn("[config] AUDIT_TRAIL_SECRET is missing or too short; using insecure default is not recommended.");
		missing.push("AUDIT_TRAIL_SECRET");
	}
	return missing;
}
const CONFIG_MISSING = validateConfig();

const PORT = Number(process.env.WEB_PORT || 8787);

// Resolve static root: prefer built React Vite app in apps/web/dist, fall back to apps/web/public
const DIST_DIR = path.resolve(process.cwd(), "apps/web/dist");
const ROOT = DIST_DIR;
if (!fs.existsSync(DIST_DIR)) {
	console.warn(
		"[GovernMindz] apps/web/dist is missing. Run `npm run build` before starting the web server (npm start/web do this automatically).",
	);
}

// ============================================================
// SQLite Conversation Persistence
// ============================================================
const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "conversations.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
	CREATE TABLE IF NOT EXISTS conversations (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		topic TEXT NOT NULL,
		mode TEXT NOT NULL,
		scenario_id TEXT,
		status TEXT NOT NULL,
		final_confidence REAL,
		inquiry_score INTEGER,
		data_json TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS system_preferences (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS message_feedback (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		conversation_id TEXT,
		message_id TEXT,
		seat_id TEXT,
		rating TEXT,
		round INTEGER,
		comment TEXT,
		created_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS agent_credibility (
		seat_id TEXT PRIMARY KEY,
		alpha REAL,
		beta REAL,
		sample_count INTEGER,
		credibility_score REAL,
		weight_multiplier REAL,
		updated_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS evidence_snapshots (
		conversation_id TEXT PRIMARY KEY,
		query TEXT NOT NULL,
		columns_json TEXT NOT NULL,
		rows_json TEXT NOT NULL,
		total INTEGER NOT NULL,
		source TEXT,
		is_synthetic INTEGER NOT NULL DEFAULT 0,
		content_hash TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS project_catalog (
		id TEXT PRIMARY KEY,
		source_id TEXT NOT NULL,
		source_type TEXT NOT NULL,
		provider TEXT NOT NULL,
		name TEXT NOT NULL,
		owner TEXT NOT NULL,
		full_name TEXT NOT NULL,
		description TEXT,
		visibility TEXT,
		html_url TEXT,
		readme TEXT,
		languages TEXT,
		status TEXT NOT NULL,
		selected INTEGER NOT NULL DEFAULT 0,
		last_synced_at INTEGER,
		data_json TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

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
		updated_at INTEGER NOT NULL,
		FOREIGN KEY (client_id) REFERENCES external_clients(id)
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
		updated_at INTEGER NOT NULL,
		FOREIGN KEY (client_id) REFERENCES external_clients(id)
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
		approved_at INTEGER
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
`);

// Demo runs are local-only. Purge any legacy demo/sample rows so server
// storage and audit/evidence lookups contain live runs exclusively.
try {
	db.prepare("DELETE FROM evidence_snapshots WHERE conversation_id NOT IN (SELECT id FROM conversations WHERE mode = 'live')").run();
	const purged = db.prepare("DELETE FROM conversations WHERE mode <> 'live'").run();
	if (purged.changes > 0) {
		console.log(`[GovernMindz] Purged ${purged.changes} legacy demo conversation(s); demo history is local-only.`);
	}
} catch (err) {
	console.warn("[GovernMindz] Demo history cleanup skipped:", err);
}

// Feedback is a live-only signal. Remove legacy demo feedback and recompute
// credibility exclusively from live conversations so demo ratings cannot
// influence live agent weights.
try {
	db.prepare(
		"DELETE FROM message_feedback WHERE conversation_id NOT IN (SELECT id FROM conversations WHERE mode = 'live')",
	).run();
	const feedbackRows = db
		.prepare("SELECT seat_id, rating, COUNT(*) AS count FROM message_feedback GROUP BY seat_id, rating")
		.all() as Array<{ seat_id: string; rating: string; count: number }>;
	const bySeat = new Map<string, { up: number; down: number; total: number }>();
	for (const row of feedbackRows) {
		const entry = bySeat.get(row.seat_id) || { up: 0, down: 0, total: 0 };
		entry.total += Number(row.count);
		if (row.rating === "up") entry.up += Number(row.count);
		if (row.rating === "down") entry.down += Number(row.count);
		bySeat.set(row.seat_id, entry);
	}
	db.prepare("DELETE FROM agent_credibility").run();
	const insertCredibility = db.prepare(`
		INSERT INTO agent_credibility
			(seat_id, alpha, beta, sample_count, credibility_score, weight_multiplier, updated_at)
		VALUES
			(@seat_id, @alpha, @beta, @sample_count, @credibility_score, @weight_multiplier, @updated_at)
	`);
	for (const [seatId, counts] of bySeat) {
		const alpha = COLD_START_PRIORS.alpha + counts.up;
		const beta = COLD_START_PRIORS.beta + counts.down;
		const metrics = computeCredibilityMetrics(alpha, beta);
		insertCredibility.run({
			seat_id: seatId,
			alpha,
			beta,
			sample_count: counts.total,
			credibility_score: metrics.credibilityScore,
			weight_multiplier: metrics.weightMultiplier,
			updated_at: Date.now(),
		});
	}
} catch (err) {
	console.warn("[GovernMindz] Feedback isolation cleanup skipped:", err);
}

const hmem = new HMemService();

function initCredibilityFromDb(): void {
	try {
		const rows = db.prepare("SELECT * FROM agent_credibility").all() as any[];
		for (const row of rows) {
			credibilityManager.setCredibility({
				seatId: row.seat_id,
				alpha: Number(row.alpha),
				beta: Number(row.beta),
				sampleCount: Number(row.sample_count),
				credibilityScore: Number(row.credibility_score),
				weightMultiplier: Number(row.weight_multiplier),
				updatedAt: Number(row.updated_at),
			});
		}
	} catch (e) {
		console.warn("Failed to load agent credibility from db:", e);
	}
}
initCredibilityFromDb();

function getPreference(key: string, defaultValue = ""): string {
	try {
		const row = db.prepare("SELECT value FROM system_preferences WHERE key = ?").get(key) as any;
		return row ? row.value : defaultValue;
	} catch {
		return defaultValue;
	}
}

function setPreference(key: string, value: string): void {
	try {
		db.prepare("INSERT INTO system_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
	} catch (e) {
		console.warn("Failed to set preference:", e);
	}
}

function getAllConversations() {
	const stmt = db.prepare("SELECT * FROM conversations WHERE mode = 'live' ORDER BY updated_at DESC");
	const rows = stmt.all() as any[];
	return rows.map((r) => {
		try {
			const parsed = JSON.parse(r.data_json);
			return {
				id: r.id,
				title: r.title,
				createdAt: r.created_at,
				updatedAt: r.updated_at,
				topic: r.topic,
				mode: r.mode,
				scenarioId: r.scenario_id,
				status: r.status,
				finalConfidence: r.final_confidence,
				inquiryScore: r.inquiry_score,
				messages: parsed.messages || [],
				auditEvents: parsed.auditEvents || [],
				zetarisData: parsed.zetarisData || null,
				workflowEvents: parsed.workflowEvents || [],
				agentAssignments: parsed.agentAssignments || null,
				webSearchData: parsed.webSearchData || null,
				contract: parsed.contract || null,
				primaryArtifact: parsed.primaryArtifact || null,
				additionalArtifacts: parsed.additionalArtifacts || [],
				evidenceExport: parsed.evidenceExport || null,
				supervisorResponse: parsed.supervisorResponse || null,
				supervisorDecision: parsed.supervisorDecision || null,
				dataCrewReport: parsed.dataCrewReport || null,
				webCrewReport: parsed.webCrewReport || null,
			};
		} catch {
			return {
				id: r.id,
				title: r.title,
				createdAt: r.created_at,
				updatedAt: r.updated_at,
				topic: r.topic,
				mode: r.mode,
				status: r.status,
				messages: [],
				auditEvents: [],
			};
		}
	});
}

function getConversationById(id: string) {
	const stmt = db.prepare("SELECT * FROM conversations WHERE id = ?");
	const r = stmt.get(id) as any;
	if (!r) return null;
	try {
		const parsed = JSON.parse(r.data_json);
		return {
			id: r.id,
			title: r.title,
			createdAt: r.created_at,
			updatedAt: r.updated_at,
			topic: r.topic,
			mode: r.mode,
			scenarioId: r.scenario_id,
			status: r.status,
			finalConfidence: r.final_confidence,
			inquiryScore: r.inquiry_score,
			messages: parsed.messages || [],
			auditEvents: parsed.auditEvents || [],
			zetarisData: parsed.zetarisData || null,
			workflowEvents: parsed.workflowEvents || [],
			agentAssignments: parsed.agentAssignments || null,
			webSearchData: parsed.webSearchData || null,
			contract: parsed.contract || null,
			primaryArtifact: parsed.primaryArtifact || null,
			additionalArtifacts: parsed.additionalArtifacts || [],
			evidenceExport: parsed.evidenceExport || null,
			supervisorResponse: parsed.supervisorResponse || null,
			supervisorDecision: parsed.supervisorDecision || null,
			dataCrewReport: parsed.dataCrewReport || null,
			webCrewReport: parsed.webCrewReport || null,
		};
	} catch {
		return null;
	}
}

function upsertConversation(conv: any) {
	const stmt = db.prepare(`
		INSERT INTO conversations (id, title, created_at, updated_at, topic, mode, scenario_id, status, final_confidence, inquiry_score, data_json)
		VALUES (@id, @title, @created_at, @updated_at, @topic, @mode, @scenario_id, @status, @final_confidence, @inquiry_score, @data_json)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			updated_at = excluded.updated_at,
			topic = excluded.topic,
			mode = excluded.mode,
			scenario_id = excluded.scenario_id,
			status = excluded.status,
			final_confidence = excluded.final_confidence,
			inquiry_score = excluded.inquiry_score,
			data_json = excluded.data_json
	`);

	const payload = {
		messages: conv.messages || [],
		auditEvents: conv.auditEvents || [],
		zetarisData: conv.zetarisData || null,
		workflowEvents: conv.workflowEvents || [],
		agentAssignments: conv.agentAssignments || null,
		webSearchData: conv.webSearchData || null,
		contract: conv.contract || null,
		primaryArtifact: conv.primaryArtifact || null,
		additionalArtifacts: conv.additionalArtifacts || [],
		evidenceExport: conv.evidenceExport || null,
		supervisorResponse: conv.supervisorResponse || null,
		supervisorDecision: conv.supervisorDecision || null,
		dataCrewReport: conv.dataCrewReport || null,
		webCrewReport: conv.webCrewReport || null,
	};

	stmt.run({
		id: conv.id,
		title: conv.title || "AI Debate",
		created_at: conv.createdAt || Date.now(),
		updated_at: conv.updatedAt || Date.now(),
		topic: conv.topic || "",
		mode: conv.mode || "sample",
		scenario_id: conv.scenarioId || null,
		status: conv.status || "idle",
		final_confidence: conv.finalConfidence ?? null,
		inquiry_score: conv.inquiryScore ?? null,
		data_json: JSON.stringify(payload),
	});
}

const runDebateApplication = new RunDebateApplicationService(
	{ execute: runDebate },
	{
		saveCompleted(conversationId, out) {
			if (out.zetaris) {
				saveEvidenceSnapshot(conversationId, out.zetaris);
			}
			const existing = getConversationById(conversationId);
			if (!existing) return;

			existing.status = "completed";
			existing.finalConfidence = out.result?.finalConfidence;
			existing.contract = out.contract || null;
			existing.primaryArtifact = out.primaryArtifact || null;
			existing.additionalArtifacts = out.additionalArtifacts || [];
			existing.evidenceExport = out.evidenceExport || null;
			existing.supervisorResponse = out.supervisorResponse || null;
			existing.supervisorDecision = out.supervisorDecision || null;
			existing.dataCrewReport = out.dataCrewReport || null;
			existing.webCrewReport = out.webCrewReport || null;
			if (!existing.messages || existing.messages.length === 0) {
				existing.messages = Array.isArray(out.result?.transcript) ? out.result.transcript : [];
			}
			if (!existing.auditEvents || existing.auditEvents.length === 0) {
				existing.auditEvents = out.auditEvents || [];
			}
			if (!existing.zetarisData && out.zetaris) {
				existing.zetarisData = out.zetaris;
			}
			existing.updatedAt = Date.now();
			upsertConversation(existing);
		},
		saveFailed(conversationId) {
			const existing = getConversationById(conversationId);
			if (!existing) return;
			existing.status = "error";
			existing.updatedAt = Date.now();
			upsertConversation(existing);
		},
	},
);

function updateConversationTitle(id: string, title: string) {
	const stmt = db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?");
	stmt.run(title, Date.now(), id);
}

function removeConversation(id: string) {
	const stmt = db.prepare("DELETE FROM conversations WHERE id = ?");
	stmt.run(id);
	try {
		db.prepare("DELETE FROM evidence_snapshots WHERE conversation_id = ?").run(id);
	} catch {
		// evidence table may not exist in older databases; ignore
	}
}

// ============================================================
// Verifiable Zetaris Evidence Snapshots
// ============================================================
interface EvidenceSnapshot {
	conversationId: string;
	query: string;
	columns: string[];
	rows: unknown[][];
	total: number;
	source: string;
	isSynthetic: boolean;
	contentHash: string;
	createdAt: number;
}

function computeEvidenceHash(payload: {
	query: string;
	columns: string[];
	rows: unknown[][];
	total: number;
}): string {
	return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function saveEvidenceSnapshot(
	conversationId: string,
	zetaris: { query?: string; columns?: unknown[]; rows?: unknown[][]; total?: number; isSynthetic?: boolean; evidenceSource?: string },
): EvidenceSnapshot | null {
	if (!conversationId || !zetaris?.query || !Array.isArray(zetaris.rows)) return null;
	const canonical = {
		query: String(zetaris.query),
		columns: Array.isArray(zetaris.columns) ? zetaris.columns.map(String) : [],
		rows: zetaris.rows,
		total: Number(zetaris.total ?? zetaris.rows.length),
	};
	const contentHash = computeEvidenceHash(canonical);
	const createdAt = Date.now();
	const source = String(zetaris.evidenceSource || (zetaris.isSynthetic ? "synthetic_fallback" : "zetaris_lightning"));
	db.prepare(`
		INSERT INTO evidence_snapshots
			(conversation_id, query, columns_json, rows_json, total, source, is_synthetic, content_hash, created_at)
		VALUES
			(@conversation_id, @query, @columns_json, @rows_json, @total, @source, @is_synthetic, @content_hash, @created_at)
		ON CONFLICT(conversation_id) DO UPDATE SET
			query = excluded.query,
			columns_json = excluded.columns_json,
			rows_json = excluded.rows_json,
			total = excluded.total,
			source = excluded.source,
			is_synthetic = excluded.is_synthetic,
			content_hash = excluded.content_hash,
			created_at = excluded.created_at
	`).run({
		conversation_id: conversationId,
		query: canonical.query,
		columns_json: JSON.stringify(canonical.columns),
		rows_json: JSON.stringify(canonical.rows),
		total: canonical.total,
		source,
		is_synthetic: zetaris.isSynthetic ? 1 : 0,
		content_hash: contentHash,
		created_at: createdAt,
	});
	return {
		conversationId,
		...canonical,
		source,
		isSynthetic: Boolean(zetaris.isSynthetic),
		contentHash,
		createdAt,
	};
}

function getEvidenceSnapshot(conversationId: string): EvidenceSnapshot | null {
	const conv = getConversationById(conversationId);
	if (!conv || conv.mode !== "live") return null;
	const row = db.prepare("SELECT * FROM evidence_snapshots WHERE conversation_id = ?").get(conversationId) as any;
	if (row) {
		return {
			conversationId: row.conversation_id,
			query: row.query,
			columns: JSON.parse(row.columns_json),
			rows: JSON.parse(row.rows_json),
			total: row.total,
			source: row.source,
			isSynthetic: Boolean(row.is_synthetic),
			contentHash: row.content_hash,
			createdAt: row.created_at,
		};
	}
	// Backfill snapshots for conversations created before evidence capture existed.
	if (conv.zetarisData?.query && Array.isArray(conv.zetarisData.rows)) {
		return saveEvidenceSnapshot(conversationId, conv.zetarisData);
	}
	return null;
}

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// ============================================================
// Run Management
// ============================================================
interface RunRecord {
	id: string;
	events: Array<Record<string, unknown>>;
	listeners: Set<http.ServerResponse>;
	done: boolean;
	result: any;
	error?: string;
	conversationId?: string;
}

const runs = new Map<string, RunRecord>();
let activeRun: string | null = null;

function sendJson(res: http.ServerResponse, status: number, data: any) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(data));
}

let serverCatalogDb: Database.Database | null = null;

function getCatalogDbForServer(): Database.Database {
	if (!serverCatalogDb) {
		serverCatalogDb = new Database(CATALOG_DB_PATH, { readonly: false });
		serverCatalogDb.pragma("journal_mode = WAL");
	}
	return serverCatalogDb;
}

function createHashForServer(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

const EXPORT_BODY_LIMIT_BYTES = 15 * 1024 * 1024;

function readJsonBody(req: http.IncomingMessage, maxBytes = EXPORT_BODY_LIMIT_BYTES): Promise<any> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let tooLarge = false;
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > maxBytes) {
				tooLarge = true;
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (tooLarge) {
				reject(new ExportBuildError("Export request is too large.", 413));
				return;
			}
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolve(raw ? JSON.parse(raw) : {});
			} catch {
				reject(new ExportBuildError("Export request must contain valid JSON.", 400));
			}
		});
		req.on("error", () => reject(new ExportBuildError("Unable to read export request.", 400)));
	});
}

function contentDisposition(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
	".pdf": "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".csv": "text/csv; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
};

function collectReferencedArtifacts(conversation: any): {
	files: ExportArtifactFile[];
	warnings: string[];
} {
	const descriptors = [
		conversation?.primaryArtifact,
		conversation?.evidenceExport,
		...(Array.isArray(conversation?.additionalArtifacts) ? conversation.additionalArtifacts : []),
	].filter(Boolean) as Array<Record<string, unknown>>;
	const files: ExportArtifactFile[] = [];
	const warnings: string[] = [];
	const seen = new Set<string>();
	for (const descriptor of descriptors) {
		const rawFilename = typeof descriptor.filename === "string" ? descriptor.filename : "";
		const filename = path.basename(rawFilename);
		if (!rawFilename || filename !== rawFilename) {
			warnings.push(`Skipped an artifact with an unsafe filename: ${rawFilename || "(missing)"}.`);
			continue;
		}
		if (seen.has(filename)) continue;
		seen.add(filename);
		const extension = path.extname(filename).toLowerCase();
		const contentType = ARTIFACT_CONTENT_TYPES[extension];
		if (!contentType) {
			warnings.push(`Skipped unsupported artifact type: ${filename}.`);
			continue;
		}
		const filePath = path.join(ARTIFACTS_DIR, filename);
		if (!filePath.startsWith(ARTIFACTS_DIR + path.sep)) {
			warnings.push(`Skipped artifact outside the approved directory: ${filename}.`);
			continue;
		}
		try {
			const stat = fs.statSync(filePath);
			if (!stat.isFile() || stat.size === 0) {
				warnings.push(`Skipped empty or invalid artifact: ${filename}.`);
				continue;
			}
			if (stat.size > 25 * 1024 * 1024) {
				warnings.push(`Skipped artifact larger than 25 MB: ${filename}.`);
				continue;
			}
			files.push({
				filename,
				data: Buffer.from(fs.readFileSync(filePath)),
				contentType,
				title: typeof descriptor.title === "string" ? descriptor.title : filename,
				sourceId: typeof descriptor.id === "string" ? descriptor.id : undefined,
				kind: typeof descriptor.type === "string" ? descriptor.type : undefined,
			});
		} catch {
			warnings.push(`Referenced artifact is not available on this server: ${filename}.`);
		}
	}
	return { files, warnings };
}

async function handleExports(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "Use POST to build a conversation export." });
		return;
	}
	try {
		const payload = await readJsonBody(req);
		const allowedFormats: ConversationExportFormat[] = [
			"pdf",
			"docx",
			"xlsx",
			"csv",
			"json",
			"markdown",
			"jsonl",
			"zip",
		];
		const format = payload?.format as ConversationExportFormat;
		if (!allowedFormats.includes(format)) {
			throw new ExportBuildError(`Unsupported export format: ${String(payload?.format)}`);
		}
		if (!payload?.conversation || typeof payload.conversation !== "object") {
			throw new ExportBuildError("A conversation payload is required.");
		}
		const artifacts =
			format === "zip" ? collectReferencedArtifacts(payload.conversation) : { files: [], warnings: [] };
		const generated = await buildConversationExport(payload.conversation, format, {
			artifactFiles: artifacts.files,
			artifactWarnings: artifacts.warnings,
		});
		res.writeHead(200, {
			"Content-Type": generated.contentType,
			"Content-Disposition": contentDisposition(generated.filename),
			"Content-Length": String(generated.data.length),
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"X-Export-Warnings": String(artifacts.warnings.length),
		});
		res.end(generated.data);
	} catch (error) {
		if (res.headersSent) {
			res.end();
			return;
		}
		const statusCode = error instanceof ExportBuildError ? error.statusCode : 500;
		sendJson(res, statusCode, {
			error: error instanceof Error ? error.message : "Export failed.",
		});
	}
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
	let urlPath = (req.url || "/").split("?")[0];
	if (urlPath === "/") urlPath = "/index.html";
	let base = ROOT;
	if (urlPath.startsWith("/output_examples/")) base = path.resolve(process.cwd(), "output_examples");
	else if (urlPath.startsWith("/assets/")) {
		// Check both ROOT/assets and process.cwd()/assets
		base = fs.existsSync(path.join(ROOT, urlPath)) ? ROOT : path.resolve(process.cwd(), "assets");
	}
	const rel = urlPath.startsWith("/output_examples/")
		? urlPath.slice("/output_examples/".length)
		: urlPath.startsWith("/assets/") && base !== ROOT
			? urlPath.slice("/assets/".length)
			: urlPath;
	const filePath = path.join(base, rel);
	const allowed = base === ROOT ? filePath.startsWith(ROOT) : true;
	if (!allowed || !filePath.startsWith(base)) {
		res.writeHead(403);
		res.end("forbidden");
		return;
	}
	fs.readFile(filePath, (err, data) => {
		if (err) {
			// SPA fallback: for HTML requests, serve index.html
			const indexPath = path.join(ROOT, "index.html");
			if (fs.existsSync(indexPath)) {
				fs.readFile(indexPath, (_err2, indexData) => {
					res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
					res.end(indexData);
				});
				return;
			}
			res.writeHead(404);
			res.end("not found");
			return;
		}
		const ext = path.extname(filePath).toLowerCase();
		const types: Record<string, string> = {
			".html": "text/html; charset=utf-8",
			".css": "text/css; charset=utf-8",
			".js": "application/javascript; charset=utf-8",
			".json": "application/json; charset=utf-8",
			".png": "image/png",
			".gif": "image/gif",
			".svg": "image/svg+xml",
			".ico": "image/x-icon",
		};
		res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
		res.end(data);
	});
}

const ARTIFACTS_DIR = path.resolve(process.cwd(), "data", "artifacts");

function serveArtifact(req: http.IncomingMessage, res: http.ServerResponse, filename: string) {
	const safeName = path.basename(decodeURIComponent(filename || ""));
	if (!safeName || safeName === "." || safeName === "..") {
		sendJson(res, 400, { error: "invalid artifact name" });
		return;
	}
	const filePath = path.join(ARTIFACTS_DIR, safeName);
	if (!filePath.startsWith(ARTIFACTS_DIR + path.sep)) {
		sendJson(res, 403, { error: "forbidden" });
		return;
	}
	const parsedUrl = new URL(req.url || "/", "http://localhost");
	const download = parsedUrl.searchParams.get("download") === "true";

	fs.readFile(filePath, (err, data) => {
		if (err) {
			sendJson(res, 404, { error: "artifact not found" });
			return;
		}
		const ext = path.extname(filePath).toLowerCase();
		const types: Record<string, string> = {
			".pdf": "application/pdf",
			".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			".csv": "text/csv; charset=utf-8",
			".svg": "image/svg+xml",
			".json": "application/json; charset=utf-8",
			".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			".txt": "text/plain; charset=utf-8",
		};
		const headers: Record<string, string> = {
			"Content-Type": types[ext] || "application/octet-stream",
			"Cache-Control": "no-store",
		};
		if (download) {
			headers["Content-Disposition"] = `attachment; filename="${safeName.replace(/"/g, "")}"`;
		}
		res.writeHead(200, headers);
		res.end(data);
	});
}

function handleSSE(req: http.IncomingMessage, res: http.ServerResponse, runId: string) {
	const run = runs.get(runId);
	if (!run) {
		res.writeHead(404);
		res.end();
		return;
	}
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	res.write(":ok\n\n");
	for (const ev of run.events) {
		res.write("data: " + JSON.stringify(ev) + "\n\n");
	}
	if (run.done) {
		res.end();
		return;
	}
	run.listeners.add(res);
	const hb = setInterval(() => {
		try {
			res.write(":hb\n\n");
		} catch {
			// ignore
		}
	}, 15000);
	req.on("close", () => {
		clearInterval(hb);
		run.listeners.delete(res);
	});
}

async function handleRun(req: http.IncomingMessage, res: http.ServerResponse) {
	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", async () => {
		let params: any = {};
		try {
			params = body ? JSON.parse(body) : {};
		} catch {
			sendJson(res, 400, { error: "invalid json" });
			return;
		}
		if (activeRun) {
			const current = runs.get(activeRun);
			if (!current || current.done) {
				activeRun = null;
			} else {
				sendJson(res, 409, { error: "a run is already in progress" });
				return;
			}
		}

		const isLive = params.mode === "live";
		if (params.conversationId) {
			const conv = getConversationById(params.conversationId);
			if (conv && (conv.mode === "live") !== isLive) {
				sendJson(res, 400, {
					error: "Mode mismatch: demo conversations cannot run in live mode and live conversations cannot run in demo mode.",
				});
				return;
			}
		}

		// Live mode must prove both providers are actually reachable before any
		// agent output is generated. Never start a live run that would silently
		// fall back to demo or synthetic data.
		if (isLive) {
			const provider = new MeterlessProvider();
			const meterless = await provider.status();
			if (meterless.state !== "online") {
				sendJson(res, 503, {
					error: `Live mode unavailable: Meterless is ${meterless.state}${meterless.reason ? ` (${meterless.reason})` : ""}. Configure the Nightshift endpoint and token in Settings.`,
				});
				return;
			}
			const hasZetaris = Boolean(
				(process.env.ZETARIS_HOST || process.env.ZETARIS_REST_URL || process.env.ZETARIS_JDBC_URL)?.trim(),
			);
			if (!hasZetaris) {
				sendJson(res, 503, {
					error: "Live mode unavailable: Zetaris credentials are missing. Configure ZETARIS_REST_URL and ZETARIS_API_KEY in Settings.",
				});
				return;
			}
			try {
				sharedResilientZetarisClient.reset();
				const probeQuery = process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES";
				const probe = (await zetarisQueryHandler(
					{ query: probeQuery, limit: 1 },
					{ callerRole: "analyst", correlationId: randomUUID() },
				)) as any;
				if (probe?.isSynthetic) {
					sendJson(res, 503, {
						error:
							"Live mode unavailable: Zetaris returned a synthetic fallback. No demo or synthetic data is permitted in live mode.",
					});
					return;
				}
			} catch (err: any) {
				sendJson(res, 503, {
					error: `Live mode unavailable: Zetaris connection failed (${err?.message || "unknown error"}). No synthetic fallback is used in live mode.`,
				});
				return;
			}
		}

		const runId = randomUUID();
		const run: RunRecord = {
			id: runId,
			events: [],
			listeners: new Set(),
			done: false,
			result: null,
			conversationId: isLive ? params.conversationId : undefined,
		};
		runs.set(runId, run);
		activeRun = runId;

		const sink = (ev: Record<string, unknown>) => {
			run.events.push(ev);
			for (const r of run.listeners) {
				try {
					r.write("data: " + JSON.stringify(ev) + "\n\n");
				} catch {
					// ignore
				}
			}
		};

		const offAudit = auditTrail.onEmit((ae) => {
			const ev = { type: "audit", event: ae };
			run.events.push(ev);
			for (const r of run.listeners) {
				try {
					r.write("data: " + JSON.stringify(ev) + "\n\n");
				} catch {
					// ignore
				}
			}
		});

		(async () => {
			try {
				let scenarioPath = params.scenario;
				if (scenarioPath && !scenarioPath.includes("/") && !scenarioPath.includes("\\")) {
					scenarioPath = "input_examples/" + scenarioPath;
				}
				const out = await runDebateApplication.execute({
					mode: params.mode === "live" ? "live" : "sample",
					scenarioPath: scenarioPath,
					topicOverride: params.topic,
					eventSink: sink,
					searchModes: params.searchModes,
					model: params.model,
					attachments: params.attachments,
					conversationId: params.conversationId,
				});
				run.result = out;
				run.done = true;

				const completeEv = {
					type: "complete",
					runId,
					result: out.result,
					auditEvents: out.auditEvents,
					auditIntegrity: out.auditIntegrity,
					contract: out.contract,
					primaryArtifact: out.primaryArtifact,
					additionalArtifacts: out.additionalArtifacts,
					evidenceExport: out.evidenceExport,
					supervisorResponse: out.supervisorResponse,
					supervisorDecision: out.supervisorDecision,
					dataCrewReport: out.dataCrewReport,
					webCrewReport: out.webCrewReport,
				};
				run.events.push(completeEv);
				for (const r of run.listeners) {
					try {
						r.write("data: " + JSON.stringify(completeEv) + "\n\n");
					} catch {
						// ignore
					}
				}

				const doneEv = { type: "done", runId };
				run.events.push(doneEv);
				for (const r of run.listeners) {
					try {
						r.write("data: " + JSON.stringify(doneEv) + "\n\n");
					} catch {
						// ignore
					}
				}

				setTimeout(() => {
					for (const r of run.listeners) {
						try {
							r.end();
						} catch {
							// ignore
						}
					}
					run.listeners.clear();
				}, 500);
			} catch (err) {
				run.error = err instanceof Error ? err.message : String(err);
				run.done = true;
				const errEv = { type: "error", message: run.error };
				run.events.push(errEv);
				for (const r of run.listeners) {
					try {
						r.write("data: " + JSON.stringify(errEv) + "\n\n");
					} catch {
						// ignore
					}
				}
				setTimeout(() => {
					for (const r of run.listeners) {
						try {
							r.end();
						} catch {
							// ignore
						}
					}
					run.listeners.clear();
				}, 500);
			} finally {
				offAudit();
				activeRun = null;
			}
		})();

		sendJson(res, 202, { runId });
	});
}

function handleResult(req: http.IncomingMessage, res: http.ServerResponse, runId: string) {
	const run = runs.get(runId);
	if (!run) {
		sendJson(res, 404, { error: "unknown run" });
		return;
	}
	if (!run.done) {
		sendJson(res, 202, { status: "running" });
		return;
	}
	if (run.error) {
		sendJson(res, 500, { error: run.error });
		return;
	}
	sendJson(res, 200, run.result);
}

async function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse) {
	const provider = new MeterlessProvider();
	const hasMeterless = Boolean((process.env.METERLESS_BASE_URL || process.env.METERLESS_ENDPOINT)?.trim());
	const hasZetaris = Boolean(
		(process.env.ZETARIS_HOST || process.env.ZETARIS_REST_URL || process.env.ZETARIS_JDBC_URL)?.trim()
	);

	let meterless: any = null;
	try {
		meterless = await provider.status();
		if (meterless) {
			meterless.configured = hasMeterless;
		}
	} catch (e) {
		meterless = { state: "error", configured: hasMeterless, reason: String(e) };
	}

	let zetaris: any = { ok: false, configured: hasZetaris };
	if (hasZetaris) {
		try {
			sharedResilientZetarisClient.reset();
			const probeQuery = process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES";
			const r = (await zetarisQueryHandler(
				{ query: probeQuery, limit: 1 },
				{ callerRole: "analyst", correlationId: randomUUID() },
			)) as any;
			zetaris = r?.isSynthetic
				? {
						ok: false,
						configured: true,
						rows: 0,
						reason:
							r?.fallbackReason ||
							"Zetaris is unreachable; the provider returned synthetic fallback data.",
					}
				: { ok: true, configured: true, rows: r.rows ? r.rows.length : 0 };
		} catch (e) {
			zetaris = { ok: false, configured: true, reason: String(e) };
		}
	} else {
		zetaris = { ok: false, configured: false, reason: "Zetaris host not configured" };
	}

	const currentMissing = ["METERLESS_BASE_URL", "METERLESS_API_KEY", "ZETARIS_ORG_ID", "ZETARIS_API_KEY"].filter(
		(k) => !process.env[k]?.trim(),
	);
	if (!process.env.AUDIT_TRAIL_SECRET || process.env.AUDIT_TRAIL_SECRET.length < 16) {
		currentMissing.push("AUDIT_TRAIL_SECRET");
	}

	sendJson(res, 200, { meterless, zetaris, missingCapabilities: currentMissing });
}

function handleVoiceStatus(_req: http.IncomingMessage, res: http.ServerResponse) {
	sendJson(res, 200, { configured: voiceService.isConfigured() });
}

async function handleVoiceConfigure(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "Use POST to configure ElevenLabs." });
		return;
	}
	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", async () => {
		try {
			const payload = JSON.parse(body || "{}");
			const apiKey = String(payload.apiKey ?? "").trim();
			if (!apiKey) {
				sendJson(res, 400, { error: "API key is required." });
				return;
			}
			// Persist to .env.local so it survives restarts
			try {
				const envContent = fs.readFileSync(".env.local", "utf-8");
				const lines = envContent.split("\n");
				const updatedLines = lines.map((line: string) => {
					if (line.startsWith("ELEVENLABS_API_KEY=")) {
						return `ELEVENLABS_API_KEY=${apiKey}`;
					}
					return line;
				});
				fs.writeFileSync(".env.local", updatedLines.join("\n") + "\n");
			} catch {
				// If .env.local doesn't exist, create it
				try {
					fs.writeFileSync(".env.local", `ELEVENLABS_API_KEY=${apiKey}\n`);
				} catch {
					// ignore; key still stored in memory below
				}
			}
			// Also set in process env for immediate effect (no restart needed)
			process.env.ELEVENLABS_API_KEY = apiKey;
			sendJson(res, 200, { success: true, message: "ElevenLabs API key configured." });
		} catch {
			sendJson(res, 500, { error: "Failed to parse configuration." });
		}
	});
}

async function handleVoiceTts(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "Use POST to synthesize speech." });
		return;
	}
	if (!voiceService.isConfigured()) {
		sendJson(res, 503, { error: "ElevenLabs voice is not configured on this server." });
		return;
	}
	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", async () => {
		try {
			const payload = JSON.parse(body || "{}");
			const out = await voiceService.synthesizeStream({
				text: String(payload.text ?? ""),
				voiceId: String(payload.voiceId ?? ""),
				modelId: payload.modelId ? String(payload.modelId) : undefined,
				outputFormat: payload.outputFormat ? String(payload.outputFormat) : undefined,
			});
			res.writeHead(200, {
				"Content-Type": "audio/mpeg",
				"Cache-Control": "no-store",
				"X-Content-Type-Options": "nosniff",
			});
			const nodeStream = Readable.fromWeb(out as any);
			nodeStream.pipe(res);
			nodeStream.on("error", () => {
				try {
					res.end();
				} catch {
					// ignore
				}
			});
		} catch (err: any) {
			if (res.headersSent) {
				try {
					res.end();
				} catch {
					// ignore
				}
				return;
			}
			const message = err instanceof Error ? err.message : "Speech synthesis failed.";
			const status = message.includes("character limit") ? 413 : message.includes("voice") ? 400 : 502;
			sendJson(res, status, { error: message });
		}
	});
}

async function handleVoiceCatalog(_req: http.IncomingMessage, res: http.ServerResponse) {
	if (!voiceService.isConfigured()) {
		sendJson(res, 503, { error: "ElevenLabs voice is not configured on this server." });
		return;
	}
	try {
		sendJson(res, 200, { voices: await voiceService.listVoices() });
	} catch (err: any) {
		sendJson(res, 502, { error: err?.message || "Failed to load the ElevenLabs voice catalog." });
	}
}

async function handleScribeToken(_req: http.IncomingMessage, res: http.ServerResponse) {
	if (!voiceService.isConfigured()) {
		sendJson(res, 503, { error: "ElevenLabs voice is not configured on this server." });
		return;
	}
	try {
		sendJson(res, 200, { token: await voiceService.createScribeSingleUseToken() });
	} catch (err: any) {
		sendJson(res, 502, { error: err?.message || "Failed to create a scribe token." });
	}
}

/* -------------------------------------------------------------------------- */
/* GitHub App integration                                                     */
/* -------------------------------------------------------------------------- */

const GITHUB_ENV_KEYS = [
	"GITHUB_APP_ID",
	"GITHUB_APP_CLIENT_ID",
	"GITHUB_APP_SLUG",
	"GITHUB_APP_PRIVATE_KEY_B64",
	"GITHUB_WEBHOOK_SECRET",
	"GITHUB_INSTALLATION_ID",
	"GITHUB_INSTALLATION_ACCOUNT",
	"GITHUB_INSTALLATION_ACCOUNT_TYPE",
];

function readEnvLocalFile(): string {
	try {
		return fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf-8") : "";
	} catch {
		return "";
	}
}

function writeEnvLocalFile(content: string): void {
	try {
		fs.writeFileSync(".env.local", content, "utf-8");
	} catch (err) {
		console.warn("[GovernMindz] Failed to write .env.local:", err);
	}
}

function setEnvLocal(key: string, value: string): void {
	let lines = readEnvLocalFile() ? readEnvLocalFile().split(/\r?\n/) : [];
	lines = lines.filter((line) => {
		const trimmed = line.trim();
		return (
			!trimmed ||
			trimmed.startsWith("#") ||
			!trimmed.startsWith(`${key}=`)
		);
	});
	lines.push(`${key}=${value}`);
	writeEnvLocalFile(lines.join("\n") + "\n");
	process.env[key] = value;
}

function removeEnvLocal(key: string): void {
	let lines = readEnvLocalFile() ? readEnvLocalFile().split(/\r?\n/) : [];
	lines = lines.filter((line) => {
		const trimmed = line.trim();
		return (
			!trimmed ||
			trimmed.startsWith("#") ||
			!trimmed.startsWith(`${key}=`)
		);
	});
	writeEnvLocalFile(lines.join("\n") + "\n");
	delete process.env[key];
}

function clientFromEnv(): GitHubAppClient | null {
	const cfg = {
		appId: process.env.GITHUB_APP_ID,
		clientId: process.env.GITHUB_APP_CLIENT_ID,
		slug: process.env.GITHUB_APP_SLUG,
		privateKey: process.env.GITHUB_APP_PRIVATE_KEY_B64
			? Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY_B64, "base64").toString("utf8")
			: undefined,
		webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
		installationId: process.env.GITHUB_INSTALLATION_ID,
		accountLogin: process.env.GITHUB_INSTALLATION_ACCOUNT,
		accountType: process.env.GITHUB_INSTALLATION_ACCOUNT_TYPE,
	};
	if (!cfg.appId && !cfg.clientId) return null;
	if (!cfg.slug || !cfg.privateKey) return null;
	return new GitHubAppClient(cfg);
}

async function handleGitHubAppConfig(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method === "GET") {
		const cfg = clientFromEnv();
		const installed = Boolean(process.env.GITHUB_INSTALLATION_ID?.trim());
		const configured = Boolean(clientFromEnv());
		sendJson(res, 200, {
			configured,
			installed,
			account: process.env.GITHUB_INSTALLATION_ACCOUNT
				? {
						login: process.env.GITHUB_INSTALLATION_ACCOUNT,
						type: (process.env.GITHUB_INSTALLATION_ACCOUNT_TYPE as
							| "User"
							| "Organization") ?? "User",
				  }
				: null,
			slug: process.env.GITHUB_APP_SLUG || null,
			appId: process.env.GITHUB_APP_ID || null,
			clientId: process.env.GITHUB_APP_CLIENT_ID || null,
		});
		return;
	}

	if (req.method !== "POST") {
		sendJson(res, 405, { error: "Use GET or POST." });
		return;
	}

	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", async () => {
		try {
			const payload = JSON.parse(body || "{}");
			const {
				appId,
				clientId,
				slug,
				privateKey,
				webhookSecret,
			} = payload as Record<string, string>;
			if (!slug || !privateKey || !(appId || clientId)) {
				sendJson(res, 400, {
					error:
						"appId/clientId, slug, and privateKey are required.",
				});
				return;
			}
			const client = new GitHubAppClient({
				appId,
				clientId,
				slug,
				privateKey,
				webhookSecret,
			});
			try {
				await client.validateApp();
			} catch (err: any) {
				sendJson(res, 400, {
					error: `Invalid GitHub App credentials: ${err?.message ?? "validation failed"}`,
				});
				return;
			}
			// Persist app credentials to .env.local (private key base64-encoded).
			if (appId) setEnvLocal("GITHUB_APP_ID", appId);
			if (clientId) setEnvLocal("GITHUB_APP_CLIENT_ID", clientId);
			setEnvLocal("GITHUB_APP_SLUG", slug);
			setEnvLocal(
				"GITHUB_APP_PRIVATE_KEY_B64",
				Buffer.from(privateKey, "utf8").toString("base64"),
			);
			if (webhookSecret) setEnvLocal("GITHUB_WEBHOOK_SECRET", webhookSecret);
			// Reload env so the in-memory client picks up the new keys.
			loadLocalEnvIfPresent();
			sendJson(res, 200, {
				success: true,
				configured: true,
				message: "GitHub App credentials saved.",
			});
		} catch (err) {
			sendJson(res, 500, {
				error: err instanceof Error ? err.message : "Failed to configure GitHub App.",
			});
		}
	});
}

async function handleGitHubInstallUrl(
	_req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	const client = clientFromEnv();
	if (!client) {
		sendJson(res, 400, {
			error: "GitHub App is not configured. Add App credentials first.",
		});
		return;
	}
	try {
		const { authorizationUrl, state, expiresAt } = client.beginAuthorization();
		sendJson(res, 200, { authorizationUrl, state, expiresAt });
	} catch (err: any) {
		sendJson(res, 500, {
			error: err instanceof Error ? err.message : "Failed to build installation URL.",
		});
	}
}

async function handleGitHubCallback(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method !== "GET") {
		sendJson(res, 405, { error: "Use GET for the GitHub callback." });
		return;
	}
	const parsedUrl = new URL(req.url || "/", "http://localhost");
	const installationId = parsedUrl.searchParams.get("installation_id");
	const setupAction = parsedUrl.searchParams.get("setup_action");
	const state = parsedUrl.searchParams.get("state");

	const client = clientFromEnv();
	if (!client || !installationId || !state) {
		res.writeHead(302, { Location: "/?github=error" });
		res.end();
		return;
	}
	if (!client.consumeState(state)) {
		res.writeHead(302, { Location: "/?github=error" });
		res.end();
		return;
	}

		try {
			const tokenResult = await client.exchangeInstallationToken(
				Number(installationId),
			);
			const account = await client.getInstallation(tokenResult.token);
		setEnvLocal("GITHUB_INSTALLATION_ID", String(account.installationId));
		setEnvLocal("GITHUB_INSTALLATION_ACCOUNT", account.account.login);
		setEnvLocal(
			"GITHUB_INSTALLATION_ACCOUNT_TYPE",
			account.account.type,
		);
		loadLocalEnvIfPresent();
		// Redirect the browser back to the app after a successful install.
		res.writeHead(302, { Location: `/?github=connected&setup=${encodeURIComponent(setupAction ?? "")}` });
		res.end();
	} catch (err: any) {
		res.writeHead(302, { Location: "/?github=error" });
		res.end();
	}
}

async function handleGitHubStatus(
	_req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	const client = clientFromEnv();
	const installed = Boolean(process.env.GITHUB_INSTALLATION_ID?.trim());
	let repositoriesCount = 0;
	let tokenValid = false;
	if (client && installed) {
		try {
			const token = await client.installationToken();
			const { totalCount } = await client.listInstallationRepositories(token);
			repositoriesCount = totalCount;
			tokenValid = true;
		} catch {
			// Token may be expired/mint-failed; still report installed.
		}
	}
	sendJson(res, 200, {
		configured: Boolean(client),
		installed,
		account: process.env.GITHUB_INSTALLATION_ACCOUNT
			? {
					login: process.env.GITHUB_INSTALLATION_ACCOUNT,
					type: (process.env.GITHUB_INSTALLATION_ACCOUNT_TYPE as
						| "User"
						| "Organization") ?? "User",
			  }
			: null,
		installationId: process.env.GITHUB_INSTALLATION_ID || null,
		repositoryCount: repositoriesCount,
		tokenValid,
	});
}

async function handleGitHubRepositories(
	_req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	const client = clientFromEnv();
	if (!client || !process.env.GITHUB_INSTALLATION_ID) {
		sendJson(res, 200, {
			repositories: [],
			repositoryCount: 0,
			status: "not_installed",
		});
		return;
	}
	try {
		const token = await client.installationToken();
		const result = await client.listInstallationRepositories(token);
		sendJson(res, 200, {
			repositories: result.repositories,
			repositoryCount: result.totalCount,
			repositorySelection: result.repositorySelection,
			status: "connected",
		});
	} catch (err: any) {
		sendJson(res, 502, {
			repositories: [],
			status: "error",
			message: err?.message || "Failed to list repositories.",
		});
	}
}

async function handleGitHubSelectRepositories(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "Use POST." });
		return;
	}
	const client = clientFromEnv();
	if (!client || !process.env.GITHUB_INSTALLATION_ID) {
		sendJson(res, 400, { error: "GitHub App is not installed." });
		return;
	}
	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", async () => {
		try {
			const payload = JSON.parse(body || "{}");
			const { repositoryIds } = payload as { repositoryIds?: number[] };
			if (!Array.isArray(repositoryIds) || repositoryIds.length === 0) {
				sendJson(res, 400, {
					error: "repositoryIds (non-empty array) is required.",
				});
				return;
			}
			const token = await client.installationToken();
			const now = Date.now();
			const upsert = db.prepare(`
				INSERT INTO project_catalog
					(id, source_id, source_type, provider, name, owner, full_name,
					 description, visibility, html_url, readme, languages, status,
					 selected, last_synced_at, data_json, created_at, updated_at)
				VALUES
					(@id, @source_id, @source_type, @provider, @name, @owner, @full_name,
					 @description, @visibility, @html_url, @readme, @languages, @status,
					 @selected, @last_synced_at, @data_json, @created_at, @updated_at)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					owner = excluded.owner,
					full_name = excluded.full_name,
					description = excluded.description,
					visibility = excluded.visibility,
					html_url = excluded.html_url,
					readme = excluded.readme,
					languages = excluded.languages,
					status = excluded.status,
					selected = excluded.selected,
					last_synced_at = excluded.last_synced_at,
					data_json = excluded.data_json,
					updated_at = excluded.updated_at
			`);
			const selectAll = db.prepare(
				"UPDATE project_catalog SET selected = 0 WHERE provider = 'github'",
			);
			selectAll.run();
			for (const repoId of repositoryIds) {
				try {
					const repo = await (async () => {
						// Re-fetch full list to find this repo (simple, correct).
						const t = await client.installationToken();
						const result = await client.listInstallationRepositories(t);
						return result.repositories.find((r) => r.id === repoId);
					})();
					if (!repo) continue;
					const readme = await client.getRepositoryReadme(
						token,
						repo.owner,
						repo.name,
					);
					const readmeText =
						readme && typeof readme.content === "string"
							? Buffer.from(readme.content, "base64").toString("utf8")
							: null;
					const id = `gh:${repo.id}`;
					upsert.run({
						id,
						source_id: String(repo.id),
						source_type: "github_repository",
						provider: "github",
						name: repo.name,
						owner: repo.owner,
						full_name: repo.fullName,
						description: repo.description ?? null,
						visibility: repo.visibility,
						html_url: repo.htmlUrl,
						readme: readmeText ?? null,
						languages: null,
						status: "active",
						selected: 1,
						last_synced_at: now,
						data_json: JSON.stringify({
							archived: repo.archived,
							disabled: repo.disabled,
							fork: repo.fork,
							pushed_at: repo.pushedAt,
							updated_at: repo.updatedAt,
							default_branch: repo.defaultBranch,
						}),
						created_at: now,
						updated_at: now,
					});
				} catch (repoErr) {
					console.warn(
						`[GovernMindz] Failed to sync repo ${repoId}:`,
						repoErr,
					);
				}
			}
			sendJson(res, 200, {
				success: true,
				selected: repositoryIds.length,
				message: "Repositories selected and synced to the project catalog.",
			});
		} catch (err) {
			sendJson(res, 500, {
				error: err instanceof Error ? err.message : "Failed to select repositories.",
			});
		}
	});
}

async function handleGitHubDisconnect(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "Use POST." });
		return;
	}
	const client = clientFromEnv();
	if (client && process.env.GITHUB_INSTALLATION_ID) {
		try {
			const token = await client.installationToken();
			await client.revokeInstallationToken(token);
		} catch {
			// Revocation is best-effort; proceed to clear local state regardless.
		}
	}
	for (const key of [
		"GITHUB_INSTALLATION_ID",
		"GITHUB_INSTALLATION_ACCOUNT",
		"GITHUB_INSTALLATION_ACCOUNT_TYPE",
	]) {
		removeEnvLocal(key);
	}
	db.prepare("DELETE FROM project_catalog WHERE provider = 'github'").run();
	loadLocalEnvIfPresent();
	sendJson(res, 200, {
		success: true,
		message: "GitHub integration disconnected.",
	});
}

/* ----------------------------------------------------------------
   Read-only local project connection (Option A — no clone, no write)
   Reads git metadata from a local folder via fixed git subcommands only.
   Never clones, pulls, pushes, or writes to the local filesystem.
----------------------------------------------------------------- */

const ALLOWED_ROOT = fs.realpathSync(process.cwd());

function isPathAllowed(canonicalPath: string): boolean {
	return canonicalPath === ALLOWED_ROOT || canonicalPath.startsWith(ALLOWED_ROOT + path.sep);
}

function runGit(canonicalPath: string, args: string[]): string {
	try {
		return execFileSync("git", ["-C", canonicalPath, ...args], {
			encoding: "utf8",
			maxBuffer: 1024 * 1024,
			windowsHide: true,
		}).trim();
	} catch {
		return "";
	}
}

function readLocalGitMetadata(localPath: string) {
	const canonicalPath = fs.realpathSync(localPath);
	if (!isPathAllowed(canonicalPath)) {
		throw new Error("Local project path is outside the allowed root.");
	}
	const stat = fs.statSync(canonicalPath);
	if (!stat.isDirectory()) {
		throw new Error("Path is not a directory.");
	}
	// Confirm it is a git repository.
	if (!runGit(canonicalPath, ["rev-parse", "--is-inside-work-tree"])) {
		throw new Error("Not a git repository.");
	}

	const remoteUrls = runGit(canonicalPath, ["remote", "-v"]);
	const originMatch = remoteUrls.match(/origin\t(.+)\s+\(fetch\)/);
	const branch = runGit(canonicalPath, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
	const porcelain = runGit(canonicalPath, ["status", "--porcelain"]);
	const workingTreeClean = porcelain.length === 0;

	let ahead = 0;
	let behind = 0;
	try {
		const aheadStr = runGit(canonicalPath, ["rev-list", "--count", "HEAD..@{upstream}"]);
		const behindStr = runGit(canonicalPath, ["rev-list", "--count", "@{upstream}..HEAD"]);
		ahead = Number(aheadStr) || 0;
		behind = Number(behindStr) || 0;
	} catch {
		// No upstream configured: ahead/behind unavailable.
	}

	const dirName = path.basename(canonicalPath);
	const remoteUrl = originMatch ? originMatch[1].trim() : undefined;

	return {
		canonicalPath,
		name: dirName,
		fullName: remoteUrl ? dirName : dirName,
		owner: "local",
		description: remoteUrl ? `Local project — ${remoteUrl}` : "Local project (no remote)",
		visibility: "private",
		htmlUrl: remoteUrl,
		status: workingTreeClean ? "clean" : "dirty",
		branch,
		ahead,
		behind,
		workingTreeClean,
		lastSyncedAt: Date.now(),
	};
}

async function handleConnectLocalProject(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", async () => {
		try {
			const payload = JSON.parse(body || "{}");
			const { localPath } = payload as { localPath?: string };
			if (typeof localPath !== "string" || !localPath.trim()) {
				sendJson(res, 400, { error: "localPath is required." });
				return;
			}
			const meta = readLocalGitMetadata(localPath.trim());
			const now = Date.now();
			const id = `local:${createHash("sha256").update(meta.canonicalPath).digest("hex").slice(0, 24)}`;
			const upsert = db.prepare(`
				INSERT INTO project_catalog
					(id, source_id, source_type, provider, name, owner, full_name,
					 description, visibility, html_url, readme, languages, status,
					 selected, last_synced_at, data_json, created_at, updated_at)
				VALUES
					(@id, @source_id, @source_type, @provider, @name, @owner, @full_name,
					 @description, @visibility, @html_url, @readme, @languages, @status,
					 @selected, @last_synced_at, @data_json, @created_at, @updated_at)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					owner = excluded.owner,
					full_name = excluded.full_name,
					description = excluded.description,
					visibility = excluded.visibility,
					html_url = excluded.html_url,
					readme = excluded.readme,
					languages = excluded.languages,
					status = excluded.status,
					last_synced_at = excluded.last_synced_at,
					data_json = excluded.data_json,
					updated_at = excluded.updated_at
			`);
			upsert.run({
				id,
				source_id: meta.canonicalPath,
				source_type: "local_project",
				provider: "local",
				name: meta.name,
				owner: meta.owner,
				full_name: meta.fullName,
				description: meta.description,
				visibility: meta.visibility,
				html_url: meta.htmlUrl,
				readme: null,
				languages: null,
				status: meta.status,
				selected: 1,
				last_synced_at: meta.lastSyncedAt,
				data_json: JSON.stringify({
					branch: meta.branch,
					ahead: meta.ahead,
					behind: meta.behind,
					workingTreeClean: meta.workingTreeClean,
					canonicalPath: meta.canonicalPath,
					remoteUrl: meta.htmlUrl,
				}),
				created_at: now,
				updated_at: now,
			});
			sendJson(res, 200, {
				success: true,
				id,
				name: meta.name,
				status: meta.status,
				branch: meta.branch,
				ahead: meta.ahead,
				behind: meta.behind,
				workingTreeClean: meta.workingTreeClean,
				remoteUrl: meta.htmlUrl,
			});
		} catch (err: any) {
			sendJson(res, 400, {
				error: err?.message || "Failed to connect local project.",
			});
		}
	});
}

async function handleListLocalProjects(
	_req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	try {
		const rows = db
			.prepare(
				"SELECT * FROM project_catalog WHERE provider = 'local' ORDER BY updated_at DESC",
			)
			.all() as any[];
		const projects = rows.map((row) => {
			let data: Record<string, unknown> = {};
			try {
				data = row.data_json ? JSON.parse(row.data_json) : {};
			} catch {
				data = {};
			}
			return {
				id: row.id,
				name: row.name,
				fullName: row.full_name,
				description: row.description,
				status: row.status,
				branch: data.branch,
				ahead: data.ahead,
				behind: data.behind,
				workingTreeClean: data.workingTreeClean,
				remoteUrl: row.html_url,
				canonicalPath: row.source_id,
				lastSyncedAt: row.last_synced_at,
				updatedAt: row.updated_at,
			};
		});
		sendJson(res, 200, { projects });
	} catch (err: any) {
		sendJson(res, 500, {
			error: err?.message || "Failed to list local projects.",
		});
	}
}

async function handleDisconnectLocalProject(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method !== "DELETE") {
		res.writeHead(405);
		res.end();
		return;
	}
	try {
		const row = db
			.prepare("SELECT id, provider FROM project_catalog WHERE id = ?")
			.get(id) as { id: string; provider: string } | undefined;
		if (!row || row.provider !== "local") {
			sendJson(res, 404, { error: "Local project not found." });
			return;
		}
		db.prepare("DELETE FROM project_catalog WHERE id = ?").run(id);
		sendJson(res, 200, { success: true });
	} catch (err: any) {
		sendJson(res, 500, {
			error: err?.message || "Failed to disconnect local project.",
		});
	}
}

/* ----------------------------------------------------------------
   AI Provider Registry API
----------------------------------------------------------------- */

async function handleAIProviders(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method === "GET") {
		const providers = aiProviderRegistry.listProviders();
		sendJson(res, 200, { providers });
		return;
	}
	if (req.method === "POST") {
		try {
			const payload = await readJsonBody(req);
			const { name, type, endpoint, apiKey, model, status } = payload as {
				name?: string;
				type?: string;
				endpoint?: string;
				apiKey?: string;
				model?: string;
				status?: string;
			};
			if (!name || !type || !apiKey) {
				sendJson(res, 400, {
					error: "name, type, and apiKey are required.",
				});
				return;
			}
			const provider = await aiProviderRegistry.createProvider({
				name,
				type: type as any,
				endpoint,
				apiKey,
				model,
				status: status as any,
			});
			sendJson(res, 201, { provider });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to create provider." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleSingleAIProvider(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method === "GET") {
		const provider = aiProviderRegistry.getProvider(id);
		if (!provider) {
			sendJson(res, 404, { error: "AI provider not found." });
			return;
		}
		sendJson(res, 200, { provider });
		return;
	}
	if (req.method === "PATCH") {
		try {
			const payload = await readJsonBody(req);
			const provider = await aiProviderRegistry.updateProvider(id, payload as any);
			sendJson(res, 200, { provider });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to update provider." });
		}
		return;
	}
	if (req.method === "DELETE") {
		try {
			const deleted = aiProviderRegistry.deleteProvider(id);
			if (!deleted) {
				sendJson(res, 404, { error: "AI provider not found." });
				return;
			}
			sendJson(res, 200, { success: true });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to delete provider." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

/* ----------------------------------------------------------------
   External Client Registry API
----------------------------------------------------------------- */

async function handleExternalClients(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method === "GET") {
		const clients = externalClientRegistry.listClients();
		sendJson(res, 200, { clients });
		return;
	}
	if (req.method === "POST") {
		try {
			const payload = await readJsonBody(req);
			const { name, clientType, userId } = payload as {
				name?: string;
				clientType?: string;
				userId?: string;
			};
			if (!name || !clientType || !userId) {
				sendJson(res, 400, {
					error: "name, clientType, and userId are required.",
				});
				return;
			}
			const client = await externalClientRegistry.createClient({
				name,
				clientType: clientType as any,
				userId,
			});
			sendJson(res, 201, { client });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to create client." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleSingleExternalClient(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method === "GET") {
		const client = externalClientRegistry.getClient(id);
		if (!client) {
			sendJson(res, 404, { error: "External client not found." });
			return;
		}
		sendJson(res, 200, { client });
		return;
	}
	if (req.method === "DELETE") {
		try {
			const payload = await readJsonBody(req);
			const { userId } = payload as { userId?: string };
			if (!userId) {
				sendJson(res, 400, { error: "userId is required." });
				return;
			}
			await externalClientRegistry.revokeClient(id, userId);
			sendJson(res, 200, { success: true });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to revoke client." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleApproveExternalClient(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}
	try {
		const payload = await readJsonBody(req);
		const { userId } = payload as { userId?: string };
		if (!userId) {
			sendJson(res, 400, { error: "userId is required." });
			return;
		}
		const client = await externalClientRegistry.approveClient(id, userId);
		sendJson(res, 200, { client });
	} catch (err: any) {
		sendJson(res, 500, { error: err?.message || "Failed to approve client." });
	}
}

async function handleRevokeExternalClient(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}
	try {
		const payload = await readJsonBody(req);
		const { userId } = payload as { userId?: string };
		if (!userId) {
			sendJson(res, 400, { error: "userId is required." });
			return;
		}
		await externalClientRegistry.revokeClient(id, userId);
		sendJson(res, 200, { success: true });
	} catch (err: any) {
		sendJson(res, 500, { error: err?.message || "Failed to revoke client." });
	}
}

/* ----------------------------------------------------------------
   Client Permissions API
----------------------------------------------------------------- */

async function handleClientPermissions(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method === "GET") {
		const payload = await readJsonBody(req);
		const { clientId } = payload as { clientId?: string };
		if (!clientId) {
			sendJson(res, 400, { error: "clientId is required." });
			return;
		}
		const permissions = permissionPolicyEngine.listPermissionsForClient(clientId);
		sendJson(res, 200, { permissions });
		return;
	}
	if (req.method === "POST") {
		try {
			const payload = await readJsonBody(req);
			const { clientId, projectId, permissionLevel, grantedTools } = payload as {
				clientId?: string;
				projectId?: string;
				permissionLevel?: string;
				grantedTools?: string[];
			};
			if (!clientId || !permissionLevel) {
				sendJson(res, 400, {
					error: "clientId and permissionLevel are required.",
				});
				return;
			}
			await permissionPolicyEngine.grantPermission(
				clientId,
				projectId,
				permissionLevel as any,
				grantedTools,
			);
			sendJson(res, 201, { success: true });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to grant permission." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleSingleClientPermission(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method !== "DELETE") {
		res.writeHead(405);
		res.end();
		return;
	}
	try {
		const db = getCatalogDbForServer();
		const result = db
			.prepare("DELETE FROM client_permissions WHERE id = ?")
			.run(id);
		if (result.changes === 0) {
			sendJson(res, 404, { error: "Permission not found." });
			return;
		}
		sendJson(res, 200, { success: true });
	} catch (err: any) {
		sendJson(res, 500, { error: err?.message || "Failed to delete permission." });
	}
}

/* ----------------------------------------------------------------
   Approval Records API
----------------------------------------------------------------- */

async function handleApprovals(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method === "GET") {
		const approvals = approvalService.listPendingApprovals();
		sendJson(res, 200, { approvals });
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleSingleApproval(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method === "GET") {
		const approval = approvalService.getApproval(id);
		if (!approval) {
			sendJson(res, 404, { error: "Approval not found." });
			return;
		}
		sendJson(res, 200, { approval });
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleApproveApproval(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}
	try {
		const payload = await readJsonBody(req);
		const { approvedBy } = payload as { approvedBy?: string };
		if (!approvedBy) {
			sendJson(res, 400, { error: "approvedBy is required." });
			return;
		}
		const approval = await approvalService.approve(id, approvedBy);
		sendJson(res, 200, { approval });
	} catch (err: any) {
		sendJson(res, 500, { error: err?.message || "Failed to approve." });
	}
}

async function handleRejectApproval(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}
	try {
		const payload = await readJsonBody(req);
		const { approvedBy } = payload as { approvedBy?: string };
		if (!approvedBy) {
			sendJson(res, 400, { error: "approvedBy is required." });
			return;
		}
		const approval = await approvalService.reject(id, approvedBy);
		sendJson(res, 200, { approval });
	} catch (err: any) {
		sendJson(res, 500, { error: err?.message || "Failed to reject." });
	}
}

/* ----------------------------------------------------------------
   Project Artifacts API
----------------------------------------------------------------- */

async function handleProjectArtifacts(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method === "GET") {
		const db = getCatalogDbForServer();
		const rows = db
			.prepare("SELECT * FROM project_artifacts ORDER BY updated_at DESC")
			.all() as any[];
		sendJson(res, 200, { artifacts: rows });
		return;
	}
	if (req.method === "POST") {
		try {
			const payload = await readJsonBody(req);
			const { projectId, type, title, content, status, originatingClient } = payload as {
				projectId?: string;
				type?: string;
				title?: string;
				content?: string;
				status?: string;
				originatingClient?: string;
			};
			if (!projectId || !type || !title) {
				sendJson(res, 400, {
					error: "projectId, type, and title are required.",
				});
				return;
			}
			const id = `artifact:${createHashForServer(`${projectId}:${title}:${Date.now()}`).slice(0, 24)}`;
			const now = Date.now();
			db.prepare(`
				INSERT INTO project_artifacts (id, project_id, type, title, content, status, originating_client, created_at, updated_at)
				VALUES (@id, @project_id, @type, @title, @content, @status, @originating_client, @created_at, @updated_at)
			`).run({
				id,
				project_id: projectId,
				type,
				title,
				content: content ?? null,
				status: status ?? "draft",
				originating_client: originatingClient ?? null,
				created_at: now,
				updated_at: now,
			});
			sendJson(res, 201, { success: true, id });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to create artifact." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleSingleProjectArtifact(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	const db = getCatalogDbForServer();
	if (req.method === "GET") {
		const row = db
			.prepare("SELECT * FROM project_artifacts WHERE id = ?")
			.get(id) as any | undefined;
		if (!row) {
			sendJson(res, 404, { error: "Artifact not found." });
			return;
		}
		sendJson(res, 200, { artifact: row });
		return;
	}
	if (req.method === "PATCH") {
		try {
			const payload = await readJsonBody(req);
			const { status, approvedBy } = payload as {
				status?: string;
				approvedBy?: string;
			};
			const fields: string[] = [];
			const params: Record<string, unknown> = { id };
			if (status !== undefined) {
				fields.push("status = @status");
				params.status = status;
			}
			if (approvedBy !== undefined) {
				fields.push("approved_by = @approvedBy, approved_at = @now");
				params.approvedBy = approvedBy;
				params.now = Date.now();
			}
			params.updated_at = Date.now();
			fields.push("updated_at = @updated_at");
			db.prepare(`UPDATE project_artifacts SET ${fields.join(", ")} WHERE id = @id`).run(params);
			sendJson(res, 200, { success: true });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to update artifact." });
		}
		return;
	}
	if (req.method === "DELETE") {
		try {
			const result = db.prepare("DELETE FROM project_artifacts WHERE id = ?").run(id);
			if (result.changes === 0) {
				sendJson(res, 404, { error: "Artifact not found." });
				return;
			}
			sendJson(res, 200, { success: true });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to delete artifact." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

/* ----------------------------------------------------------------
   Outgoing Webhooks API
----------------------------------------------------------------- */

async function handleWebhooks(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method === "GET") {
		const db = getCatalogDbForServer();
		const rows = db
			.prepare("SELECT * FROM webhook_configs ORDER BY updated_at DESC")
			.all() as any[];
		sendJson(res, 200, { webhooks: rows });
		return;
	}
	if (req.method === "POST") {
		try {
			const payload = await readJsonBody(req);
			const { targetUrl, secret, events, enabled } = payload as {
				targetUrl?: string;
				secret?: string;
				events?: string[];
				enabled?: boolean;
			};
			if (!targetUrl) {
				sendJson(res, 400, { error: "targetUrl is required." });
				return;
			}
			// SSRF protection: block localhost and private ranges
			try {
				const url = new URL(targetUrl);
				const host = url.hostname;
				if (
					host === "localhost" ||
					host === "127.0.0.1" ||
					host === "::1" ||
					host.endsWith(".local") ||
					host.match(/^10\./) ||
					host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
					host.match(/^192\.168\./) ||
					url.protocol !== "https:"
				) {
					sendJson(res, 400, {
						error: "Webhook target must be a public HTTPS URL.",
					});
					return;
				}
			} catch {
				sendJson(res, 400, { error: "Invalid targetUrl." });
				return;
			}

			const id = `webhook:${createHashForServer(`${targetUrl}:${Date.now()}`).slice(0, 24)}`;
			const now = Date.now();
			db.prepare(`
				INSERT INTO webhook_configs (id, target_url, secret, events, enabled, created_at, updated_at)
				VALUES (@id, @target_url, @secret, @events, @enabled, @created_at, @updated_at)
			`).run({
				id,
				target_url: targetUrl,
				secret: secret ?? "",
				events: JSON.stringify(events ?? ["debate.completed"]),
				enabled: enabled !== false ? 1 : 0,
				created_at: now,
				updated_at: now,
			});
			sendJson(res, 201, { success: true, id });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to create webhook." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleSingleWebhook(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): Promise<void> {
	const db = getCatalogDbForServer();
	if (req.method === "GET") {
		const row = db
			.prepare("SELECT * FROM webhook_configs WHERE id = ?")
			.get(id) as any | undefined;
		if (!row) {
			sendJson(res, 404, { error: "Webhook not found." });
			return;
		}
		sendJson(res, 200, { webhook: row });
		return;
	}
	if (req.method === "PATCH") {
		try {
			const payload = await readJsonBody(req);
			const { secret, events, enabled } = payload as {
				secret?: string;
				events?: string[];
				enabled?: boolean;
			};
			const fields: string[] = [];
			const params: Record<string, unknown> = { id };
			if (secret !== undefined) {
				fields.push("secret = @secret");
				params.secret = secret;
			}
			if (events !== undefined) {
				fields.push("events = @events");
				params.events = JSON.stringify(events);
			}
			if (enabled !== undefined) {
				fields.push("enabled = @enabled");
				params.enabled = enabled ? 1 : 0;
			}
			params.updated_at = Date.now();
			fields.push("updated_at = @updated_at");
			db.prepare(`UPDATE webhook_configs SET ${fields.join(", ")} WHERE id = @id`).run(params);
			sendJson(res, 200, { success: true });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to update webhook." });
		}
		return;
	}
	if (req.method === "DELETE") {
		try {
			const result = db.prepare("DELETE FROM webhook_configs WHERE id = ?").run(id);
			if (result.changes === 0) {
				sendJson(res, 404, { error: "Webhook not found." });
				return;
			}
			sendJson(res, 200, { success: true });
		} catch (err: any) {
			sendJson(res, 500, { error: err?.message || "Failed to delete webhook." });
		}
		return;
	}
	res.writeHead(405);
	res.end();
}

async function handleGitHubSearch(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	const client = clientFromEnv();
	if (!client || !process.env.GITHUB_INSTALLATION_ID) {
		sendJson(res, 200, {
			results: [],
			totalCount: 0,
			status: "not_installed",
		});
		return;
	}
	const parsedUrl = new URL(req.url || "/", "http://localhost");
	const query = parsedUrl.searchParams.get("q") || "";
	if (!query) {
		sendJson(res, 400, { error: "Query parameter 'q' is required." });
		return;
	}
	try {
		const token = await client.installationToken();
		// Search across repositories the installation can access.
		const searchQuery = `${query} ${process.env.GITHUB_INSTALLATION_ACCOUNT ? `user:${process.env.GITHUB_INSTALLATION_ACCOUNT}` : ""}`;
		const result = await client.searchCode(token, searchQuery);
		sendJson(res, 200, {
			results: result.items,
			totalCount: result.total_count,
			status: "connected",
		});
	} catch (err: any) {
		sendJson(res, 502, {
			results: [],
			totalCount: 0,
			status: "error",
			message: err?.message || "GitHub code search failed.",
		});
	}
}

function handleCatalog(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): void {
	if (req.method === "GET") {
		const rows = db
			.prepare(
				"SELECT * FROM project_catalog ORDER BY selected DESC, updated_at DESC",
			)
			.all() as any[];
		sendJson(res, 200, { sources: rows });
		return;
	}
	res.writeHead(405);
	res.end();
}

function handleSingleCatalog(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
): void {
	if (req.method === "DELETE") {
		db.prepare("DELETE FROM project_catalog WHERE id = ?").run(id);
		sendJson(res, 200, { success: true });
		return;
	}
	res.writeHead(405);
	res.end();
}

function handleScenarios(_req: http.IncomingMessage, res: http.ServerResponse) {
	const dir = path.resolve(process.cwd(), "input_examples");
	let files: string[] = [];
	try {
		files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".json"));
	} catch {
		files = [];
	}

	const PREFERRED_ORDER = [
		"01-fragmented-intelligence.json",
		"02-explain-why.json",
		"03-reasoning-architecture.json",
	];

	const titleMap: Record<string, string> = {
		"01-fragmented-intelligence.json": "1. Solving Fragmented Intelligence (Cross-Silo ERP)",
		"02-explain-why.json": "2. The Agent That Can Explain Why (SMB Churn)",
		"03-reasoning-architecture.json": "3. Reasoning Architecture (Policy Gates & H-MEM)",
	};

	// Only expose the three track demos. Stale benchmark scenarios are ignored
	// even if an old copy remains on disk.
	const activeFiles = files.filter((f) => PREFERRED_ORDER.includes(f));

	activeFiles.sort((a, b) => {
		const idxA = PREFERRED_ORDER.indexOf(a);
		const idxB = PREFERRED_ORDER.indexOf(b);
		if (idxA !== -1 && idxB !== -1) return idxA - idxB;
		if (idxA !== -1) return -1;
		if (idxB !== -1) return 1;
		return a.localeCompare(b);
	});

	const out = activeFiles.map((f: string) => {
		try {
			const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
			return {
				file: f,
				id: raw.id,
				title: titleMap[f] || raw.title || raw.id,
				topic: raw.topic,
				rows: raw.zetaris && raw.zetaris.rows ? raw.zetaris.rows.length : 0,
			};
		} catch {
			return { file: f, title: f };
		}
	});
	sendJson(res, 200, out);
}

async function handleMeterlessDetect(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}
	try {
		const provider = new MeterlessProvider();
		const status = await provider.autoDetect();
		if (!status) {
			sendJson(res, 404, {
				error:
					"No Nightshift endpoint found on 127.0.0.1/localhost ports 8088, 8090, 8787, or 11434. Start Nightshift or set METERLESS_BASE_URL.",
			});
			return;
		}
		if (status.state === "online") {
			process.env.METERLESS_BASE_URL = status.baseUrl;
			try {
				saveSecureConfig({ meterlessHost: status.baseUrl });
			} catch {
				// Detection still succeeded in memory even if persistence fails.
			}
		}
		sendJson(res, status.state === "online" ? 200 : 409, {
			state: status.state,
			baseUrl: status.baseUrl,
			models: status.models?.length ?? 0,
			reason: status.reason,
			persisted: status.state === "online",
		});
	} catch (err: any) {
		sendJson(res, 500, { error: err?.message || "Nightshift auto-detection failed" });
	}
}

async function handleModels(_req: http.IncomingMessage, res: http.ServerResponse) {
	const fallback = [
		{
			id: "meterless/auto",
			name: "Meterless Auto",
			provider: "meterless",
			isDefault: true,
		},
		{
			id: "meterless/fast",
			name: "Meterless Fast",
			provider: "meterless",
			isDefault: false,
		},
	];
	try {
		const provider = new MeterlessProvider();
		const status = await provider.status();
		const ids = (status.models || []).filter(Boolean);
		if (ids.length === 0) {
			sendJson(res, 200, { models: fallback, state: status.state, source: "fallback" });
			return;
		}
		const seen = new Set<string>();
		const models = ids.map((id) => {
			seen.add(id);
			const leaf = id.split("/").pop() || id;
			const prettyLeaf = leaf.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
			const providerLabel = id.startsWith("meterless/")
				? "meterless"
				: id.startsWith("nvidia/")
					? "nvidia (via Nightshift)"
					: id.startsWith("openai/") || id.startsWith("gpt-")
						? "openai (via Nightshift)"
						: id.startsWith("claude-") || id.startsWith("anthropic/")
							? "anthropic (via Nightshift)"
							: id.startsWith("gemini-")
								? "google (via Nightshift)"
								: "nightshift cloud";
			return {
				id,
				name: id.startsWith("meterless/") ? `Meterless ${prettyLeaf}` : prettyLeaf,
				provider: providerLabel,
				isDefault: id === "meterless/auto",
			};
		});
		for (const f of fallback) {
			if (!seen.has(f.id)) models.push(f);
		}
		models.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
		sendJson(res, 200, {
			models,
			state: status.state,
			source: "nightshift",
			baseUrl: status.baseUrl,
		});
	} catch (err: any) {
		sendJson(res, 200, {
			models: fallback,
			state: "offline",
			source: "fallback",
			error: err?.message || "Meterless model discovery failed",
		});
	}
}

function handleConversations(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method === "GET") {
		const list = getAllConversations();
		sendJson(res, 200, list);
		return;
	}

	if (req.method === "POST") {
		let body = "";
		req.on("data", (c: any) => (body += c));
		req.on("end", () => {
			try {
				const conv = JSON.parse(body);
				if (conv?.mode !== "live") {
					sendJson(res, 400, {
						error: "Demo conversations are local-only and are not stored on the server.",
					});
					return;
				}
				upsertConversation(conv);
				sendJson(res, 200, { success: true });
			} catch {
				sendJson(res, 400, { error: "invalid json" });
			}
		});
		return;
	}

	res.writeHead(405);
	res.end();
}

function handleSingleConversation(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
	const conv = getConversationById(id);
	if (!conv || conv.mode !== "live") {
		sendJson(res, 404, { error: "Live conversation not found" });
		return;
	}
	if (req.method === "GET") {
		sendJson(res, 200, conv);
		return;
	}

	if (req.method === "PATCH") {
		let body = "";
		req.on("data", (c: any) => (body += c));
		req.on("end", () => {
			try {
				const { title } = JSON.parse(body);
				if (title) {
					updateConversationTitle(id, title);
				}
				sendJson(res, 200, { success: true });
			} catch {
				sendJson(res, 400, { error: "invalid json" });
			}
		});
		return;
	}

	if (req.method === "DELETE") {
		removeConversation(id);
		sendJson(res, 200, { success: true });
		return;
	}

	res.writeHead(405);
	res.end();
}

async function handleWebSearch(req: http.IncomingMessage, res: http.ServerResponse) {
	let query = "";
	if (req.method === "GET") {
		const parsedUrl = new URL(req.url || "/", "http://localhost");
		query = parsedUrl.searchParams.get("q") || "";
	} else if (req.method === "POST") {
		let body = "";
		req.on("data", (c: any) => (body += c));
		await new Promise<void>((resolve) => req.on("end", () => resolve()));
		try {
			const parsed = JSON.parse(body || "{}");
			query = parsed.query || parsed.q || "";
		} catch {
			query = "";
		}
	}

	try {
		const results = await executeWebSearch(query, 5);
		sendJson(res, 200, results);
	} catch (err: any) {
		sendJson(res, 500, { error: err.message || "Web search failed" });
	}
}

function handlePreferences(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method === "GET") {
		const launchMode = getPreference("launch_mode", "demo");
		const futureLaunchPreference = getPreference("future_launch_preference", "demo");
		const tourCompleted = getPreference("tour_completed", "false") === "true";
		sendJson(res, 200, {
			launchMode,
			futureLaunchPreference,
			tourCompleted,
		});
		return;
	}

	if (req.method === "POST") {
		let body = "";
		req.on("data", (c: any) => (body += c));
		req.on("end", () => {
			try {
				const { launchMode, futureLaunchPreference, tourCompleted } = JSON.parse(body || "{}");
				if (launchMode !== undefined) setPreference("launch_mode", String(launchMode));
				if (futureLaunchPreference !== undefined) setPreference("future_launch_preference", String(futureLaunchPreference));
				if (tourCompleted !== undefined) setPreference("tour_completed", String(tourCompleted));
				sendJson(res, 200, { success: true });
			} catch {
				sendJson(res, 400, { error: "invalid json" });
			}
		});
		return;
	}

	res.writeHead(405);
	res.end();
}

function handleConfig(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method === "GET") {
		const status = getConfigStatus();
		sendJson(res, 200, status);
		return;
	}

	if (req.method === "POST") {
		let body = "";
		req.on("data", (c: any) => (body += c));
		req.on("end", () => {
			try {
				const payload = JSON.parse(body || "{}");
				saveSecureConfig(payload);
				sharedResilientZetarisClient.reset();
				sendJson(res, 200, {
					success: true,
					message: "Credentials saved securely and encrypted at rest.",
					status: getConfigStatus(),
				});
			} catch (err: any) {
				sendJson(res, 500, { error: err.message || "Failed to save configuration" });
			}
		});
		return;
	}

	res.writeHead(405);
	res.end();
}

function handleFeedback(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}

	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", () => {
		try {
			const payload = JSON.parse(body || "{}");
			const { conversationId, messageId, seatId, rating, round, userComment } = payload;
			if (!conversationId || !messageId || !seatId || !rating) {
				sendJson(res, 400, { error: "Missing required fields: conversationId, messageId, seatId, rating" });
				return;
			}
			if (rating !== "up" && rating !== "down" && rating !== "wrong") {
				sendJson(res, 400, { error: "rating must be 'up', 'down', or 'wrong'" });
				return;
			}

			const feedbackConversation = getConversationById(conversationId);
			if (!feedbackConversation || feedbackConversation.mode !== "live") {
				sendJson(res, 400, {
					error: "Feedback is only recorded for live conversations. Demo feedback stays local.",
				});
				return;
			}

			// 1. Insert into message_feedback table
			const insertStmt = db.prepare(`
				INSERT INTO message_feedback (conversation_id, message_id, seat_id, rating, round, comment, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);
			const now = Date.now();
			insertStmt.run(conversationId, messageId, seatId, rating, round ?? null, userComment ?? null, now);

			// 2. Update CredibilityManager
			const updated = credibilityManager.recordRating(seatId, rating, round);

			// 3. Upsert into agent_credibility table
			const upsertStmt = db.prepare(`
				INSERT INTO agent_credibility (seat_id, alpha, beta, sample_count, credibility_score, weight_multiplier, updated_at)
				VALUES (@seat_id, @alpha, @beta, @sample_count, @credibility_score, @weight_multiplier, @updated_at)
				ON CONFLICT(seat_id) DO UPDATE SET
					alpha = excluded.alpha,
					beta = excluded.beta,
					sample_count = excluded.sample_count,
					credibility_score = excluded.credibility_score,
					weight_multiplier = excluded.weight_multiplier,
					updated_at = excluded.updated_at
			`);
			upsertStmt.run({
				seat_id: updated.seatId,
				alpha: updated.alpha,
				beta: updated.beta,
				sample_count: updated.sampleCount,
				credibility_score: updated.credibilityScore,
				weight_multiplier: updated.weightMultiplier,
				updated_at: updated.updatedAt,
			});

			// 4. Update HMemService
			hmem.recordFeedback(conversationId, messageId, seatId, rating);

			// 5. Emit governance_recalibration audit event
			auditTrail.emitGovernanceRecalibration({
				sessionId: conversationId,
				seatId,
				rating,
				credibilityScore: updated.credibilityScore,
				weightMultiplier: updated.weightMultiplier,
				alpha: updated.alpha,
				beta: updated.beta,
				sampleCount: updated.sampleCount,
			});

			// 6. Return response
			sendJson(res, 200, { success: true, updatedCredibility: updated });
		} catch (err: any) {
			sendJson(res, 500, { error: err.message || "Feedback processing failed" });
		}
	});
}

function handleAuditVerify(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}

	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", () => {
		try {
			const payload = JSON.parse(body || "{}");
			const { conversationId, secret } = payload;
			let events = payload.auditEvents;

			if (!Array.isArray(events) && conversationId) {
				const conv = getConversationById(conversationId);
				if (!conv || conv.mode !== "live") {
					sendJson(res, 400, { error: "Audit chains are only served for live conversations." });
					return;
				}
				if (Array.isArray(conv.auditEvents)) {
					events = conv.auditEvents;
				}
			}

			if (!Array.isArray(events)) {
				events = [];
			}

			const effectiveSecret = getEffectiveAuditSecret(secret);
			const report = AuditChainVerifier.verify(events, effectiveSecret);
			sendJson(res, 200, report);
		} catch (err: any) {
			sendJson(res, 500, { error: err.message || "Audit verification failed" });
		}
	});
}

function handleAuditCertificate(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
	if (req.method !== "GET") {
		res.writeHead(405);
		res.end();
		return;
	}

	try {
		const conv = getConversationById(id);
		if (!conv || conv.mode !== "live") {
			sendJson(res, 404, { error: "Live conversation not found" });
			return;
		}

		const events = Array.isArray(conv.auditEvents) ? conv.auditEvents : [];
		const effectiveSecret = getEffectiveAuditSecret();
		const report = AuditChainVerifier.verify(events, effectiveSecret);
		const certificate = AuditChainVerifier.generateProofCertificate(report, id, effectiveSecret);
		sendJson(res, 200, certificate);
	} catch (err: any) {
		sendJson(res, 500, { error: err.message || "Failed to generate audit certificate" });
	}
}

function handleEvidenceJson(req: http.IncomingMessage, res: http.ServerResponse, id: string, canonicalOnly: boolean) {
	if (req.method !== "GET") {
		res.writeHead(405);
		res.end();
		return;
	}
	const snapshot = getEvidenceSnapshot(id);
	if (!snapshot) {
		sendJson(res, 404, { error: "Evidence snapshot not found for this conversation" });
		return;
	}
	const canonical = {
		query: snapshot.query,
		columns: snapshot.columns,
		rows: snapshot.rows,
		total: snapshot.total,
	};
	if (canonicalOnly) {
		res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
		res.end(JSON.stringify(canonical));
		return;
	}
	sendJson(res, 200, {
		...snapshot,
		verification: {
			algorithm: "SHA-256",
			canonicalization: "JSON.stringify({query,columns,rows,total})",
			contentHash: snapshot.contentHash,
			canonicalUrl: `/api/evidence/${encodeURIComponent(id)}/canonical`,
		},
		links: {
			self: `/api/evidence/${encodeURIComponent(id)}`,
			humanReadable: `/evidence/${encodeURIComponent(id)}`,
		},
	});
}

function serveEvidencePage(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
	if (req.method !== "GET") {
		res.writeHead(405);
		res.end();
		return;
	}
	const snapshot = getEvidenceSnapshot(id);
	if (!snapshot) {
		res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
		res.end(`<!doctype html><html><body style="background:#0a0e1a;color:#e8ecf7;font-family:system-ui;padding:48px">
			<h1>Evidence snapshot not found</h1>
			<p>No captured Zetaris dataset exists for conversation <code>${escapeHtml(id)}</code>.</p>
			</body></html>`);
		return;
	}

	const rowsHtml = snapshot.rows
		.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
		.join("");
	const headersHtml = snapshot.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
	const capturedAt = new Date(snapshot.createdAt).toISOString();
	const sourceLabel =
		snapshot.source === "sample_scenario"
			? "Sample scenario dataset (deterministic demo)"
			: snapshot.isSynthetic
				? "Synthetic fallback (live Zetaris unavailable)"
				: "Live Zetaris Lightning query";

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Zetaris Evidence — GovernMindz</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<style>
	:root { color-scheme: dark; }
	* { box-sizing: border-box; }
	body { margin:0; background:#0a0e1a; color:#e8ecf7; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
	.wrap { max-width:1100px; margin:0 auto; padding:32px 20px 64px; }
	.brand { display:flex; align-items:center; gap:12px; margin-bottom:28px; }
	.brand img { width:44px; height:44px; border-radius:999px; box-shadow:0 0 20px rgba(59,130,246,.4); }
	.brand h1 { font-size:18px; margin:0; letter-spacing:.02em; }
	.brand small { color:#8b96b3; display:block; font-size:11px; margin-top:2px; }
	.card { background:#111827; border:1px solid #1e2842; border-radius:16px; padding:20px; margin-bottom:18px; }
	.card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:#5eead4; margin:0 0 12px; }
	.meta { display:grid; gap:8px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); font-size:12px; color:#aab4d0; }
	.meta b { color:#e8ecf7; display:block; font-size:13px; margin-top:2px; word-break:break-word; }
	pre { background:#070b14; border:1px solid #1e2842; border-radius:10px; padding:14px; overflow:auto; color:#fbbf24; font-size:12px; }
	table { width:100%; border-collapse:collapse; font-size:12px; }
	th { text-align:left; background:#18203a; color:#9fb0d0; padding:10px 12px; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
	td { padding:10px 12px; border-top:1px solid #1e2842; color:#dbe3f5; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
	tr:hover td { background:#141d33; }
	.hash { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px; word-break:break-all; color:#f4b942; }
	.actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
	.btn { display:inline-flex; align-items:center; gap:6px; padding:8px 12px; border-radius:8px; border:1px solid #2c385c; background:#18203a; color:#5eead4; text-decoration:none; font-size:11px; font-weight:700; }
	.btn:hover { background:#252e4d; }
	.note { color:#8b96b3; font-size:11px; line-height:1.6; }
</style>
</head>
<body>
	<div class="wrap">
		<div class="brand">
			<img src="/governmindz-logo.png" alt="GovernMindz logo" />
			<div>
				<h1>Verifiable Zetaris Evidence</h1>
				<small>Captured dataset behind the final GovernMindz decision</small>
			</div>
		</div>

		<div class="card">
			<h2>Snapshot</h2>
			<div class="meta">
				<div>Conversation<b>${escapeHtml(snapshot.conversationId)}</b></div>
				<div>Captured at<b>${escapeHtml(capturedAt)}</b></div>
				<div>Source<b>${escapeHtml(sourceLabel)}</b></div>
				<div>Rows<b>${escapeHtml(snapshot.total)} (${snapshot.rows.length} rendered)</b></div>
			</div>
		</div>

		<div class="card">
			<h2>Exact SQL query</h2>
			<pre id="sql">${escapeHtml(snapshot.query)}</pre>
			<div class="actions">
				<button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('sql').textContent)">Copy SQL</button>
				<a class="btn" href="/api/evidence/${encodeURIComponent(id)}/canonical" target="_blank" rel="noreferrer">Canonical JSON (hash input)</a>
				<a class="btn" href="/api/evidence/${encodeURIComponent(id)}" target="_blank" rel="noreferrer">Download JSON</a>
			</div>
			<p class="note">Run this exact read-only statement in your own Zetaris Lightning client to reproduce the dataset. GovernMindz blocks writes, DDL, and multi-statement SQL before dispatch.</p>
		</div>

		<div class="card">
			<h2>Captured result set</h2>
			<div style="overflow:auto; border:1px solid #1e2842; border-radius:10px;">
				<table>
					<thead><tr>${headersHtml}</tr></thead>
					<tbody>${rowsHtml || `<tr><td>No rows returned</td></tr>`}</tbody>
				</table>
			</div>
		</div>

		<div class="card">
			<h2>Integrity proof</h2>
			<p class="note">SHA-256 over the canonical JSON payload <code>JSON.stringify({query,columns,rows,total})</code>:</p>
			<div class="hash" id="hash">${escapeHtml(snapshot.contentHash)}</div>
			<div class="actions">
				<button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('hash').textContent.trim())">Copy hash</button>
			</div>
			<p class="note">To independently verify, download the canonical JSON, compute its SHA-256, and compare it with the hash above. Any change to the query, columns, or captured rows produces a different hash.</p>
		</div>
	</div>
</body>
</html>`;
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
	res.end(html);
}

const server = http.createServer((req, res) => {
	const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
	const pathname = parsedUrl.pathname;

	if (pathname === "/api/health") {
		handleHealth(req, res);
	} else if (pathname === "/api/scenarios") {
		handleScenarios(req, res);
	} else if (pathname === "/api/models") {
		handleModels(req, res);
	} else if (pathname === "/api/meterless/detect") {
		handleMeterlessDetect(req, res);
	} else if (pathname === "/api/exports") {
		void handleExports(req, res);
	} else if (pathname === "/api/conversations") {
		handleConversations(req, res);
	} else if (pathname.startsWith("/api/conversations/")) {
		const id = pathname.slice("/api/conversations/".length);
		handleSingleConversation(req, res, id);
	} else if (pathname === "/api/run") {
		handleRun(req, res);
	} else if (
		pathname.startsWith("/api/run/") &&
		(pathname.endsWith("/sse") || pathname.endsWith("/events"))
	) {
		const parts = pathname.split("/");
		const runId = parts[3];
		handleSSE(req, res, runId);
	} else if (pathname.startsWith("/api/run/") && pathname.endsWith("/result")) {
		const parts = pathname.split("/");
		const runId = parts[3];
		handleResult(req, res, runId);
	} else if (pathname === "/api/web-search") {
		handleWebSearch(req, res);
	} else if (pathname === "/api/voice/status") {
		handleVoiceStatus(req, res);
	} else if (pathname === "/api/voice/tts") {
		void handleVoiceTts(req, res);
	} else if (pathname === "/api/voice/voices") {
		void handleVoiceCatalog(req, res);
	} else if (pathname === "/api/voice/scribe-token") {
		void handleScribeToken(req, res);
	} else if (pathname === "/api/voice/configure") {
		void handleVoiceConfigure(req, res);
	} else if (pathname === "/api/github/app-config") {
		void handleGitHubAppConfig(req, res);
	} else if (pathname === "/api/github/install-url") {
		void handleGitHubInstallUrl(req, res);
	} else if (pathname === "/api/github/callback") {
		void handleGitHubCallback(req, res);
	} else if (pathname === "/api/github/status") {
		void handleGitHubStatus(req, res);
	} else if (pathname === "/api/github/repositories") {
		void handleGitHubRepositories(req, res);
	} else if (pathname === "/api/github/select-repositories") {
		void handleGitHubSelectRepositories(req, res);
	} else if (pathname === "/api/github/disconnect") {
		void handleGitHubDisconnect(req, res);
	} else if (pathname === "/api/github/connect-local-project") {
		void handleConnectLocalProject(req, res);
	} else if (pathname === "/api/github/local-projects") {
		void handleListLocalProjects(req, res);
	} else if (pathname.startsWith("/api/github/local-projects/")) {
		const id = pathname.slice("/api/github/local-projects/".length);
		void handleDisconnectLocalProject(req, res, id);
	} else if (pathname === "/api/github/search") {
		void handleGitHubSearch(req, res);
	} else if (pathname === "/api/ai-providers") {
		void handleAIProviders(req, res);
	} else if (pathname.startsWith("/api/ai-providers/")) {
		const id = pathname.slice("/api/ai-providers/".length);
		void handleSingleAIProvider(req, res, id);
	} else if (pathname === "/api/external-clients") {
		void handleExternalClients(req, res);
	} else if (pathname.startsWith("/api/external-clients/")) {
		const rest = pathname.slice("/api/external-clients/".length);
		if (rest.endsWith("/approve")) {
			const id = rest.slice(0, -"/approve".length);
			void handleApproveExternalClient(req, res, id);
		} else if (rest.endsWith("/revoke")) {
			const id = rest.slice(0, -"/revoke".length);
			void handleRevokeExternalClient(req, res, id);
		} else {
			const id = rest;
			void handleSingleExternalClient(req, res, id);
		}
	} else if (pathname === "/api/client-permissions") {
		void handleClientPermissions(req, res);
	} else if (pathname.startsWith("/api/client-permissions/")) {
		const id = pathname.slice("/api/client-permissions/".length);
		void handleSingleClientPermission(req, res, id);
	} else if (pathname === "/api/approvals") {
		void handleApprovals(req, res);
	} else if (pathname.startsWith("/api/approvals/")) {
		const rest = pathname.slice("/api/approvals/".length);
		if (rest.endsWith("/approve")) {
			const id = rest.slice(0, -"/approve".length);
			void handleApproveApproval(req, res, id);
		} else if (rest.endsWith("/reject")) {
			const id = rest.slice(0, -"/reject".length);
			void handleRejectApproval(req, res, id);
		} else {
			const id = rest;
			void handleSingleApproval(req, res, id);
		}
	} else if (pathname === "/api/project-artifacts") {
		void handleProjectArtifacts(req, res);
	} else if (pathname.startsWith("/api/project-artifacts/")) {
		const id = pathname.slice("/api/project-artifacts/".length);
		void handleSingleProjectArtifact(req, res, id);
	} else if (pathname === "/api/webhooks") {
		void handleWebhooks(req, res);
	} else if (pathname.startsWith("/api/webhooks/")) {
		const id = pathname.slice("/api/webhooks/".length);
		void handleSingleWebhook(req, res, id);
	} else if (pathname === "/api/catalog") {
		handleCatalog(req, res);
	} else if (pathname.startsWith("/api/catalog/")) {
		const id = pathname.slice("/api/catalog/".length);
		handleSingleCatalog(req, res, id);
	} else if (pathname === "/api/preferences") {
		handlePreferences(req, res);
	} else if (pathname === "/api/config") {
		handleConfig(req, res);
	} else if (pathname === "/api/feedback") {
		handleFeedback(req, res);
	} else if (pathname === "/api/audit/verify") {
		handleAuditVerify(req, res);
	} else if (pathname.startsWith("/api/audit/certificate/")) {
		const id = pathname.slice("/api/audit/certificate/".length);
		handleAuditCertificate(req, res, id);
	} else if (pathname.startsWith("/api/evidence/")) {
		let rest = pathname.slice("/api/evidence/".length);
		const canonical = rest.endsWith("/canonical");
		if (canonical) rest = rest.slice(0, -"/canonical".length);
		handleEvidenceJson(req, res, decodeURIComponent(rest), canonical);
	} else if (pathname.startsWith("/evidence/")) {
		const id = decodeURIComponent(pathname.slice("/evidence/".length));
		serveEvidencePage(req, res, id);
	} else if (pathname.startsWith("/api/artifacts/")) {
		const filename = pathname.slice("/api/artifacts/".length);
		serveArtifact(req, res, filename);
	} else {
		serveStatic(req, res);
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`[GovernMindz Web] Server running at http://127.0.0.1:${PORT}`);
});
