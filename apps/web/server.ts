
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { runDebate } from "../gateway/src/debateRunner.js";
import { auditTrail } from "@governmindz/core/engine/AuditTrailEmitter";
import { AuditChainVerifier } from "@governmindz/core/engine/AuditChainVerifier";
import { credibilityManager, type AgentCredibilityRecord } from "@governmindz/core/kernel/CredibilityManager";
import { HMemService } from "@governmindz/core/memory/HMemService";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import { zetarisQueryHandler } from "../gateway/src/tools/zetaris.tools.js";
import { executeWebSearch } from "../gateway/src/tools/webSearch.tools.js";
import { getConfigStatus, saveSecureConfig, loadLocalEnvIfPresent } from "../gateway/src/services/cryptoConfig.js";
loadLocalEnvIfPresent();

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
const PUBLIC_DIR = path.resolve(process.cwd(), "apps/web/public");
const ROOT = fs.existsSync(DIST_DIR) ? DIST_DIR : PUBLIC_DIR;

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
`);

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
	const stmt = db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC");
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

function updateConversationTitle(id: string, title: string) {
	const stmt = db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?");
	stmt.run(title, Date.now(), id);
}

function removeConversation(id: string) {
	const stmt = db.prepare("DELETE FROM conversations WHERE id = ?");
	stmt.run(id);
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
		const runId = randomUUID();
		const run: RunRecord = {
			id: runId,
			events: [],
			listeners: new Set(),
			done: false,
			result: null,
			conversationId: params.conversationId,
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
				const out = await runDebate({
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

				// Update database persistence if conversation exists
				if (run.conversationId) {
					const existing = getConversationById(run.conversationId);
					if (existing) {
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
						existing.updatedAt = Date.now();
						upsertConversation(existing);
					}
				}

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
loadLocalEnvIfPresent();

function getEffectiveAuditSecret(secretOverride?: string): string {
	const secret = (secretOverride ?? process.env.AUDIT_TRAIL_SECRET ?? "").trim();
	if (!secret || secret.length < 16) {
		throw new Error("AUDIT_TRAIL_SECRET is missing or too short; audit verification is disabled.");
	}
	return secret;
}
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
			zetaris = { ok: true, configured: true, rows: r.rows ? r.rows.length : 0 };
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
		"01-regulatory-risk.json",
		"02-pii-exposure.json",
		"03-clinical-safety.json",
		"01-fragmented-intelligence.json",
		"02-explain-why.json",
		"03-reasoning-architecture.json",
	];

	const titleMap: Record<string, string> = {
		"01-regulatory-risk.json": "1. Regulatory Risk Analysis (SEC + GLEIF + DNS)",
		"02-pii-exposure.json": "2. PII Re-identification & Privacy (NY Taxi)",
		"03-clinical-safety.json": "3. Clinical Trials & Drug Safety (FDA + Trials)",
		"01-fragmented-intelligence.json": "4. Supply Chain Intelligence (Cross-Silo ERP)",
		"02-explain-why.json": "5. Why SMB Churn Rose in Q3 (Telemetry)",
		"03-reasoning-architecture.json": "6. Reasoning Architecture & Policy Gates",
	};

	// Exclude outdated legacy stubs from UI presentation
	const activeFiles = files.filter(
		(f) => !["01-governance-readiness.json", "02-federated-evidence.json", "03-audit-explainability.json"].includes(f)
	);

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

function handleModels(_req: http.IncomingMessage, res: http.ServerResponse) {
	sendJson(res, 200, {
		models: [
			{
				id: "nemotron-3.5-lightning-30b-a3b",
				name: "NVIDIA Nemotron 3.5 Lightning 30B",
				provider: "meterless",
				isDefault: true,
			},
			{
				id: "gemini-3.8-flash",
				name: "Gemini 3.8 Flash (Cloud Fallback)",
				provider: "google",
				isDefault: false,
			},
		],
	});
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
	if (req.method === "GET") {
		const conv = getConversationById(id);
		if (!conv) {
			sendJson(res, 404, { error: "Conversation not found" });
			return;
		}
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
				if (conv && Array.isArray(conv.auditEvents)) {
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
		if (!conv) {
			sendJson(res, 404, { error: "Conversation not found" });
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
