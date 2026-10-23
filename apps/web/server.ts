import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runDebate } from "../gateway/src/debateRunner.js";
import { auditTrail } from "@governmindz/core/engine/AuditTrailEmitter";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import { zetarisQueryHandler } from "../gateway/src/tools/zetaris.tools.js";

const PORT = Number(process.env.WEB_PORT || 8787);
const ROOT = path.resolve(process.cwd(), "apps/web/public");

interface RunRecord {
	id: string;
	events: Array<Record<string, unknown>>;
	listeners: Set<http.ServerResponse>;
	done: boolean;
	result: any;
	error?: string;
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
	else if (urlPath.startsWith("/assets/")) base = path.resolve(process.cwd(), "assets");
	const rel = urlPath.startsWith("/output_examples/") ? urlPath.slice("/output_examples/".length) : (urlPath.startsWith("/assets/") ? urlPath.slice("/assets/".length) : urlPath);
	const filePath = path.join(base, rel);
	const allowed = base === ROOT ? filePath.startsWith(ROOT) : true;
	if (!allowed || !filePath.startsWith(base)) {
		res.writeHead(403);
		res.end("forbidden");
		return;
	}
	fs.readFile(filePath, (err, data) => {
		if (err) {
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
		if (activeRun && runs.get(activeRun) && !runs.get(activeRun)!.done) {
			sendJson(res, 409, { error: "a run is already in progress" });
			return;
		}
		const runId = randomUUID();
		const run: RunRecord = { id: runId, events: [], listeners: new Set(), done: false, result: null };
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
				if (scenarioPath && !scenarioPath.includes("/") && !scenarioPath.includes("\\\\")) {
					scenarioPath = "input_examples/" + scenarioPath;
				}
				const out = await runDebate({
					mode: params.mode === "live" ? "live" : "sample",
					scenarioPath: scenarioPath,
					topicOverride: params.topic,
					eventSink: sink,
				});
				run.result = out;
				run.done = true;
				const doneEv = { type: "done", runId };
				run.events.push(doneEv);
				for (const r of run.listeners) {
					try {
						r.write("data: " + JSON.stringify(doneEv) + "\n\n");
						r.end();
					} catch {
						// ignore
					}
				}
				run.listeners.clear();
			} catch (err) {
				run.error = err instanceof Error ? err.message : String(err);
				run.done = true;
				const errEv = { type: "error", message: run.error };
				run.events.push(errEv);
				for (const r of run.listeners) {
					try {
						r.write("data: " + JSON.stringify(errEv) + "\n\n");
						r.end();
					} catch {
						// ignore
					}
				}
				run.listeners.clear();
			} finally {
				offAudit();
				if (activeRun === runId) activeRun = null;
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
	let meterless: any = null;
	try {
		meterless = await provider.status();
	} catch (e) {
		meterless = { state: "error", reason: String(e) };
	}
	let zetaris: any = { ok: false };
	try {
		const r = (await zetarisQueryHandler({ query: "SELECT 1", limit: 1 }, { callerRole: "analyst", correlationId: randomUUID() })) as any;
		zetaris = { ok: true, rows: r.rows ? r.rows.length : 0 };
	} catch (e) {
		zetaris = { ok: false, reason: String(e) };
	}
	sendJson(res, 200, { meterless, zetaris });
}

function handleScenarios(_req: http.IncomingMessage, res: http.ServerResponse) {
	const dir = path.resolve(process.cwd(), "input_examples");
	let files: string[] = [];
	try {
		files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".json"));
	} catch {
		files = [];
	}
	const out = files.map((f: string) => {
		try {
			const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
			return { file: f, id: raw.id, topic: raw.topic, rows: raw.zetaris && raw.zetaris.rows ? raw.zetaris.rows.length : 0 };
		} catch {
			return { file: f };
		}
	});
	sendJson(res, 200, out);
}

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
	const url = (req.url || "/").split("?")[0];
	if (req.method === "GET" && url === "/api/health") return handleHealth(req, res);
	if (req.method === "GET" && url === "/api/scenarios") return handleScenarios(req, res);
	if (req.method === "POST" && url === "/api/run") return handleRun(req, res);
	const m = url.match(/^\/api\/run\/([^/]+)\/events$/);
	if (req.method === "GET" && m) return handleSSE(req, res, m[1] as string);
	const m2 = url.match(/^\/api\/run\/([^/]+)\/result$/);
	if (req.method === "GET" && m2) return handleResult(req, res, m2[1] as string);
	if (req.method === "GET") return serveStatic(req, res);
	res.writeHead(405);
	res.end();
});

server.listen(PORT, () => {
	console.log("GOVERNMINDZ web UI: http://127.0.0.1:" + PORT);
});