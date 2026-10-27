
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import Database from "better-sqlite3";
import { runDebate } from "../gateway/src/debateRunner.js";
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
import { zetarisQueryHandler } from "../gateway/src/tools/zetaris.tools.js";
import { executeWebSearch } from "../gateway/src/tools/webSearch.tools.js";
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
				const probe = (await zetarisQueryHandler(
					{ query: "SELECT 1", limit: 1 },
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
			const r = (await zetarisQueryHandler(
				{ query: "SELECT 1", limit: 1 },
				{ callerRole: "analyst", correlationId: randomUUID() },
			)) as any;
			zetaris = r?.isSynthetic
				? {
						ok: false,
						configured: true,
						rows: 0,
						reason: "Zetaris is unreachable; the provider returned synthetic fallback data.",
					}
				: { ok: true, configured: true, rows: r.rows ? r.rows.length : 0 };
		} catch (e) {
			zetaris = { ok: false, configured: true, reason: String(e) };
		}
	} else {
		zetaris = { ok: false, configured: false, reason: "Zetaris host not configured" };
	}

	sendJson(res, 200, { meterless, zetaris, missingCapabilities: CONFIG_MISSING });
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
