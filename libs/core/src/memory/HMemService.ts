import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

export type HMemLayer = "short_term" | "working" | "long_term";

export interface HMemProvenance {
	origin: "mined" | "manual" | "derived" | "imported";
	learnedAt: number;
	label: string;
	refs?: string[];
}

export interface HMemEntry {
	id: string;
	domain: string;
	category: string;
	trace: string;
	episode: string;
	source: string;
	confidence: number;
	createdAt: number;
	updatedAt: number;
	lastAccessed?: number;
	accessCount?: number;
	tags?: string[];
	derivedFrom?: string[];
	relatedTo?: string[];
	supersedes?: string;
	supersededBy?: string;
	layer?: HMemLayer;
	type?: "personal" | "factual" | "preference" | "general";
	entities?: string[];
	namespace?: string;
	provenance?: HMemProvenance;
}

export interface HMemRetrieveResult {
	entries: HMemEntry[];
	context: string;
	scores?: Array<{ id: string; score: number }>;
}

export interface HMemConflict {
	a: string;
	b: string;
	reason: string;
	confidence: number;
}

export interface HMemAuditEntry {
	id: string;
	memoryId: string;
	action: string;
	actor: string;
	timestamp: number;
	details?: Record<string, unknown>;
	previousState?: Partial<HMemEntry>;
	newState?: Partial<HMemEntry>;
}

export interface DreamProposal {
	id: string;
	type: "insight" | "domain" | "invariant";
	summary: string;
	sourceIds: string[];
	status: "pending" | "approved" | "rejected";
	createdAt: number;
}

export interface SleepPreview {
	toConsolidate: string[];
	toArchive: string[];
	toSynthesize: string[][];
}

export interface SleepReport {
	backupId: string;
	consolidated: number;
	archived: number;
	synthesized: number;
	timestamp: number;
}

function tokenize(s: string): string[] {
	return (s || "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 2);
}

function deriveDomain(topic: string): string {
	const t = (topic || "").toLowerCase();
	if (/(govern|compliance|policy|audit)/.test(t)) return "governance";
	if (/(zetaris|data|federat|database)/.test(t)) return "data";
	if (/(agent|debate|seat)/.test(t)) return "agents";
	return "general";
}

function extractEntities(text: string): string[] {
	const out = new Set<string>();
	const tech = [
		"react",
		"python",
		"typescript",
		"javascript",
		"bigquery",
		"postgres",
		"redis",
		"docker",
		"kubernetes",
		"azure",
		"aws",
		"gcp",
		"hipaa",
		"oauth",
		"jwt",
	];
	const lower = (text || "").toLowerCase();
	for (const t of tech) if (lower.includes(t)) out.add(t);
	for (const m of (text || "").match(/\b[A-Z][a-zA-Z]{3,}\b/g) || []) {
		out.add(m.toLowerCase());
	}
	return [...out].slice(0, 10);
}

function jaccard(a: string[], b: string[]): number {
	const sa = new Set(a);
	const sb = new Set(b);
	if (sa.size === 0 || sb.size === 0) return 0;
	let inter = 0;
	for (const t of sa) if (sb.has(t)) inter++;
	const union = new Set([...sa, ...sb]).size;
	return union === 0 ? 0 : inter / union;
}

function dbPathFor(filePath: string): string {
	if (filePath.endsWith(".json")) return filePath.replace(/\.json$/, ".db");
	if (filePath.endsWith(".db")) return filePath;
	return filePath + ".db";
}

export class HMemService {
	private dbPath: string;
	private entries: HMemEntry[];
	private audit: HMemAuditEntry[];
	private proposals: DreamProposal[];
	private backups: Array<{ id: string; entries: HMemEntry[]; timestamp: number }>;


	private openDb(): Database.Database {
		const dir = path.dirname(this.dbPath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const db = new Database(this.dbPath);
		db.pragma("journal_mode = DELETE");
		db.exec(`
			CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, domain TEXT, category TEXT, layer TEXT, type TEXT, confidence REAL, created_at INTEGER, updated_at INTEGER, last_accessed INTEGER, access_count INTEGER, superseded_by TEXT, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, memory_id TEXT, action TEXT, actor TEXT, timestamp INTEGER, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, status TEXT, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, timestamp INTEGER, data TEXT NOT NULL);
		`);
		return db;
	}

	constructor(filePath?: string) {
		const base =
			filePath || path.resolve(process.cwd(), "logs", "hmem.json");
		this.dbPath = dbPathFor(base);
		const db = this.openDb();
		this.entries = this.loadEntries(db);
		this.audit = this.loadAudit(db);
		this.proposals = this.loadProposals(db);
		this.backups = this.loadBackups(db);
		db.close();
	}

	private loadEntries(db: Database.Database): HMemEntry[] {
		try {
			const rows = db.prepare("SELECT data FROM entries").all() as Array<{ data: string }>;
			return rows.map((r) => JSON.parse(r.data) as HMemEntry);
		} catch {
			return [];
		}
	}

	private loadAudit(db: Database.Database): HMemAuditEntry[] {
		try {
			const rows = db.prepare("SELECT data FROM audit").all() as Array<{ data: string }>;
			return rows.map((r) => JSON.parse(r.data) as HMemAuditEntry);
		} catch {
			return [];
		}
	}

	private loadProposals(db: Database.Database): DreamProposal[] {
		try {
			const rows = db.prepare("SELECT data FROM proposals").all() as Array<{ data: string }>;
			return rows.map((r) => JSON.parse(r.data) as DreamProposal);
		} catch {
			return [];
		}
	}

	private loadBackups(db: Database.Database): Array<{ id: string; entries: HMemEntry[]; timestamp: number }> {
		try {
			const rows = db.prepare("SELECT id, timestamp, data FROM backups").all() as Array<{ id: string; timestamp: number; data: string }>;
			return rows.map((r) => ({ id: r.id, timestamp: r.timestamp, entries: JSON.parse(r.data) as HMemEntry[] }));
		} catch {
			return [];
		}
	}

	private saveEntries(): void {
		const db = this.openDb();
		try {
			const tx = db.transaction(() => {
				db.prepare("DELETE FROM entries").run();
				const stmt = db.prepare(
					"INSERT INTO entries (id, domain, category, layer, type, confidence, created_at, updated_at, last_accessed, access_count, superseded_by, data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
				);
				for (const e of this.entries) {
					stmt.run(
						e.id,
						e.domain,
						e.category,
						e.layer || "working",
						e.type || "general",
						e.confidence,
						e.createdAt,
						e.updatedAt,
						e.lastAccessed || e.updatedAt,
						e.accessCount || 0,
						e.supersededBy || null,
						JSON.stringify(e),
					);
				}
			});
			tx();
		} finally {
			db.close();
		}
	}

	private saveAudit(): void {
		const db = this.openDb();
		try {
			const tx = db.transaction(() => {
				db.prepare("DELETE FROM audit").run();
				const stmt = db.prepare("INSERT INTO audit (id, memory_id, action, actor, timestamp, data) VALUES (?,?,?,?,?,?)");
				for (const a of this.audit) {
					stmt.run(a.id, a.memoryId, a.action, a.actor, a.timestamp, JSON.stringify(a));
				}
			});
			tx();
		} finally {
			db.close();
		}
	}

	private saveProposals(): void {
		const db = this.openDb();
		try {
			const tx = db.transaction(() => {
				db.prepare("DELETE FROM proposals").run();
				const stmt = db.prepare("INSERT INTO proposals (id, status, data) VALUES (?,?,?)");
				for (const p of this.proposals) {
					stmt.run(p.id, p.status, JSON.stringify(p));
				}
			});
			tx();
		} finally {
			db.close();
		}
	}

	private saveBackups(): void {
		const db = this.openDb();
		try {
			const tx = db.transaction(() => {
				db.prepare("DELETE FROM backups").run();
				const stmt = db.prepare("INSERT INTO backups (id, timestamp, data) VALUES (?,?,?)");
				for (const b of this.backups) {
					stmt.run(b.id, b.timestamp, JSON.stringify(b.entries));
				}
			});
			tx();
		} finally {
			db.close();
		}
	}

	private auditLog(
		action: string,
		memoryId: string,
		actor = "system",
		details?: Record<string, unknown>,
		previousState?: Partial<HMemEntry>,
		newState?: Partial<HMemEntry>,
	): void {
		const entry: HMemAuditEntry = {
			id: randomUUID(),
			memoryId,
			action,
			actor,
			timestamp: Date.now(),
			details,
			previousState,
			newState,
		};
		this.audit.push(entry);
		if (this.audit.length > 5000) this.audit = this.audit.slice(this.audit.length - 5000);
		this.saveAudit();
	}

	getAuditLog(): HMemAuditEntry[] {
		return [...this.audit];
	}

	private cap(): void {
		if (this.entries.length > 500) {
			this.entries = this.entries.slice(this.entries.length - 500);
		}
	}

	// ---- same methods as before (mine, retrieve, etc.) ----
	// I'll include all methods from previous version unchanged in logic.

	mine(params: {
		sessionId: string;
		topic: string;
		finalAnswer: string;
		seatPositions: Array<{ seatId: string; position: string; confidence: number }>;
	}): number {
		const domain = deriveDomain(params.topic);
		const now = Date.now();
		let added = 0;
		const summaryEntities = extractEntities(`${params.topic} ${params.finalAnswer}`);
		const summary: HMemEntry = {
			id: randomUUID(),
			domain,
			category: "summary",
			trace: params.topic.slice(0, 80),
			episode: `Topic: ${params.topic}\nFinal: ${params.finalAnswer}`,
			source: params.sessionId,
			confidence: 0.8,
			createdAt: now,
			updatedAt: now,
			lastAccessed: now,
			accessCount: 0,
			layer: "working",
			type: "factual",
			entities: summaryEntities,
			provenance: {
				origin: "mined",
				learnedAt: now,
				label: `mined from session ${params.sessionId}`,
				refs: [params.sessionId],
			},
			derivedFrom: [],
		};
		this.entries.push(summary);
		this.enrich(summary);
		this.auditLog("create", summary.id, "miner", { event: "chat_message" }, undefined, summary);
		added++;

		for (const sp of params.seatPositions) {
			const entry: HMemEntry = {
				id: randomUUID(),
				domain,
				category: sp.seatId,
				trace: sp.position.slice(0, 80),
				episode: `[${sp.seatId}] ${sp.position}`,
				source: params.sessionId,
				confidence: sp.confidence,
				createdAt: now,
				updatedAt: now,
				lastAccessed: now,
				accessCount: 0,
				layer: "working",
				type: "factual",
				entities: extractEntities(sp.position),
				provenance: {
					origin: "mined",
					learnedAt: now,
					label: `mined from seat ${sp.seatId}`,
					refs: [params.sessionId],
				},
			};
			this.entries.push(entry);
			this.enrich(entry);
			this.auditLog("create", entry.id, "miner", { event: "model_response" }, undefined, entry);
			added++;
		}
		this.cap();
		this.saveEntries();
		this.saveAudit();
		return added;
	}

	mineEvent(eventType: string, payload: { sessionId?: string; content: string; tags?: string[] }): HMemEntry | null {
		const valid = new Set([
			"chat_message",
			"user_correction",
			"file_save",
			"file_open",
			"file_edit",
			"model_response",
			"plan_completion",
		]);
		if (!valid.has(eventType)) return null;
		const now = Date.now();
		const domain = deriveDomain(payload.content);
		const entry: HMemEntry = {
			id: randomUUID(),
			domain,
			category: eventType,
			trace: payload.content.slice(0, 80),
			episode: payload.content,
			source: payload.sessionId || "unknown",
			confidence: eventType === "user_correction" ? 0.9 : 0.7,
			createdAt: now,
			updatedAt: now,
			lastAccessed: now,
			accessCount: 0,
			layer: "short_term",
			type: eventType === "user_correction" ? "preference" : "factual",
			tags: [...(payload.tags || []), eventType],
			provenance: { origin: "mined", learnedAt: now, label: `event:${eventType}`, refs: payload.sessionId ? [payload.sessionId] : [] },
		};
		this.entries.push(entry);
		this.enrich(entry);
		this.auditLog("create", entry.id, "event-miner", { event: eventType });
		this.cap();
		this.saveEntries();
		return entry;
	}

	mineDocument(params: { source: string; fileName: string; text: string }): number {
		const truncated = (params.text || "").slice(0, 4000);
		const now = Date.now();
		const domain = deriveDomain(`${params.fileName} ${truncated.slice(0, 200)}`);
		const items = truncated
			.split(/[.\n]/)
			.map((s) => s.trim())
			.filter((s) => s.length >= 20)
			.slice(0, 20);
		let added = 0;
		for (const it of items) {
			const entry: HMemEntry = {
				id: randomUUID(),
				domain,
				category: "document",
				trace: it.slice(0, 80),
				episode: it,
				source: params.source,
				confidence: 0.7,
				createdAt: now,
				updatedAt: now,
				lastAccessed: now,
				accessCount: 0,
				layer: "working",
				type: "factual",
				entities: extractEntities(it),
				tags: ["document", params.fileName],
				provenance: { origin: "imported", learnedAt: now, label: `doc:${params.fileName}`, refs: [params.source] },
			};
			this.entries.push(entry);
			this.enrich(entry);
			this.auditLog("create", entry.id, "doc-miner", { event: "file_save", fileName: params.fileName });
			added++;
		}
		this.cap();
		this.saveEntries();
		return added;
	}

	enrich(entry: HMemEntry): void {
		entry.entities = entry.entities || extractEntities(`${entry.trace} ${entry.episode}`);
		if (!entry.namespace) entry.namespace = `${entry.domain}/general`;
		const related: string[] = [];
		for (const other of this.entries) {
			if (other.id === entry.id) continue;
			if (other.domain !== entry.domain) continue;
			const shared = (entry.entities || []).filter((e) => (other.entities || []).includes(e));
			if (shared.length > 0 || jaccard(tokenize(entry.episode), tokenize(other.episode)) >= 0.5) {
				if (!related.includes(other.id) && related.length < 5) related.push(other.id);
			}
		}
		entry.relatedTo = [...new Set([...(entry.relatedTo || []), ...related])].slice(0, 5);
		for (const rid of entry.relatedTo) {
			const other = this.entries.find((e) => e.id === rid);
			if (other) {
				other.relatedTo = other.relatedTo || [];
				if (!other.relatedTo.includes(entry.id) && other.relatedTo.length < 5) other.relatedTo.push(entry.id);
			}
		}
		const correctionLang = /\b(correct|update|replace|instead|actually|revised)\b/i;
		if (correctionLang.test(`${entry.trace} ${entry.episode}`)) {
			for (const other of this.entries) {
				if (other.id === entry.id) continue;
				if (other.domain !== entry.domain) continue;
				const ta = tokenize(`${entry.trace} ${entry.episode}`);
				const tb = tokenize(`${other.trace} ${other.episode}`);
				if (jaccard(ta, tb) >= 0.6) {
					entry.supersedes = other.id;
					other.supersededBy = entry.id;
					break;
				}
			}
		}
	}

	retrieve(query: string, topN = 5): HMemRetrieveResult {
		const qTokens = tokenize(query);
		const qSet = new Set(qTokens);
		const qTop = qTokens.slice(0, 8);
		const queryDomain = deriveDomain(query);
		const queryEntities = extractEntities(query);

		if (qSet.size === 0 || this.entries.length === 0) {
			return { entries: [], context: "", scores: [] };
		}

		const now = Date.now();
		const scored = this.entries.map((e) => {
			const layer = e.layer || "working";
			const layerWeight = layer === "long_term" ? 1.0 : layer === "working" ? 0.8 : 0.6;
			const memoryTokens = tokenize(`${e.domain} ${e.category} ${e.trace} ${e.episode}`);
			const keyword = jaccard(qTop, memoryTokens.slice(0, 8));
			const tagOverlap = (e.tags || []).filter((t) => qSet.has(t.toLowerCase())).length;
			const tag = Math.min(1, tagOverlap / Math.max(1, (e.tags || []).length || 1));
			const domain = e.domain === queryDomain ? 1 : 0;
			const entityOverlap = jaccard(queryEntities, e.entities || []);
			const entity = Math.min(1, entityOverlap);
			const last = e.lastAccessed || e.updatedAt || e.createdAt || now;
			const ageDays = Math.max(0, (now - last) / (1000 * 60 * 60 * 24));
			const recency = Math.exp(-ageDays / 14);
			const superseded = e.supersededBy ? 1 : 0;
			const semantic = 0;
			let raw =
				0.35 * semantic +
				0.20 * keyword +
				0.10 * tag +
				0.10 * domain +
				0.15 * entity +
				0.05 * layerWeight +
				0.05 * recency -
				0.20 * superseded;
			if (raw < 0) raw = 0;
			if (raw > 1) raw = 1;
			const score = raw * (typeof e.confidence === "number" ? e.confidence : 0.7);
			return { e, score };
		});

		scored.sort((a, b) => b.score - a.score);
		const thresholded = scored.filter((s) => s.score >= 0.35);
		const filtered = thresholded.length > 0 ? thresholded : scored.filter((s) => s.score > 0);
		const pool = filtered.length > 0 ? filtered : scored;
		const top = pool.slice(0, topN).map((s) => s.e);

		const selectedIds = new Set(top.map((e) => e.id));
		for (const e of this.entries) {
			if (selectedIds.has(e.id)) {
				e.accessCount = (e.accessCount || 0) + 1;
				e.lastAccessed = now;
			}
		}
		this.saveEntries();

		const context =
			top.length === 0
				? ""
				: "Relevant memory from prior debates:\n" +
				  top
						.map((e) => `- [${e.domain}/${e.category}] ${e.episode.slice(0, 200)}`)
						.join("\n");

		this.auditLog("read", top.map((e) => e.id).join(","), "retriever", {
			query,
			count: top.length,
		});

		return {
			entries: top,
			context,
			scores: top.map((e) => ({
				id: e.id,
				score: scored.find((s) => s.e.id === e.id)?.score || 0,
			})),
		};
	}

	list(): HMemEntry[] {
		return [...this.entries];
	}

	count(): number {
		return this.entries.length;
	}

	recordFeedback(
		sessionId: string,
		messageId: string,
		seatId: string,
		rating: "up" | "down" | "wrong",
	): HMemEntry | null {
		let matches = this.entries.filter(
			(e) =>
				(messageId && e.id === messageId) ||
				(sessionId &&
					e.source === sessionId &&
					(e.category === seatId || e.category === "summary" || !seatId)),
		);

		if (matches.length === 0 && (sessionId || messageId)) {
			matches = this.entries.filter(
				(e) =>
					(sessionId && e.source === sessionId) ||
					(messageId && e.id === messageId),
			);
		}

		if (matches.length === 0) {
			const now = Date.now();
			const entry: HMemEntry = {
				id: messageId || randomUUID(),
				domain: deriveDomain(seatId || "governance"),
				category: seatId || "feedback",
				trace: `Feedback ${rating} for ${seatId}`,
				episode: `Feedback ${rating} recorded for seat ${seatId} in session ${sessionId}`,
				source: sessionId || "unknown",
				confidence: rating === "up" ? 0.9 : rating === "wrong" ? 0.4 : 0.6,
				createdAt: now,
				updatedAt: now,
				lastAccessed: now,
				accessCount: 0,
				layer: "working",
				type: "preference",
				tags: [
					rating === "up"
						? "approved_precedent"
						: rating === "wrong"
							? "review"
							: "disputed_precedent",
				],
				provenance: {
					origin: "mined",
					learnedAt: now,
					label: `feedback ${rating}`,
					refs: [sessionId || "unknown"],
				},
			};
			this.entries.push(entry);
			this.enrich(entry);
			this.auditLog("create", entry.id, "feedback", { rating }, undefined, entry);
			this.cap();
			this.saveEntries();
			return entry;
		}

		for (const e of matches) {
			const prev = { ...e };
			e.tags = e.tags || [];
			if (rating === "up") {
				e.tags = e.tags.filter((t) => t !== "disputed_precedent" && t !== "review");
				if (!e.tags.includes("approved_precedent")) {
					e.tags.push("approved_precedent");
				}
				e.confidence = Math.min(
					1.0,
					Math.max(0.1, Math.round((e.confidence + 0.05) * 100) / 100),
				);
			} else if (rating === "wrong") {
				e.tags = e.tags.filter((t) => t !== "approved_precedent");
				if (!e.tags.includes("review")) e.tags.push("review");
				e.confidence = Math.min(
					1.0,
					Math.max(0.1, Math.round((e.confidence - 0.2) * 100) / 100),
				);
			} else {
				e.tags = e.tags.filter((t) => t !== "approved_precedent");
				if (!e.tags.includes("disputed_precedent")) {
					e.tags.push("disputed_precedent");
				}
				e.confidence = Math.min(
					1.0,
					Math.max(0.1, Math.round((e.confidence - 0.03) * 100) / 100),
				);
			}
			e.updatedAt = Date.now();
			e.lastAccessed = Date.now();
			this.auditLog("feedback", e.id, "feedback", { rating }, prev, e);
		}

		this.cap();
		this.saveEntries();
		return matches.find((m) => m.category === seatId) || matches[0] || null;
	}

	detectConflicts(): HMemConflict[] {
		const out: HMemConflict[] = [];
		const neg = (s: string) => /\b(never|disable|not|no|deny|reject)\b/i.test(s);
		for (let i = 0; i < this.entries.length; i++) {
			for (let j = i + 1; j < this.entries.length; j++) {
				const a = this.entries[i];
				const b = this.entries[j];
				if (a.domain !== b.domain) continue;
				const ta = tokenize(`${a.trace} ${a.episode}`);
				const tb = tokenize(`${b.trace} ${b.episode}`);
				const sim = jaccard(ta, tb);
				if (sim < 0.4) continue;
				const aNeg = neg(`${a.trace} ${a.episode}`);
				const bNeg = neg(`${b.trace} ${b.episode}`);
				if (aNeg === bNeg) continue;
				const conf = Math.min(1, sim + 0.2);
				out.push({ a: a.id, b: b.id, reason: "opposing polarity on similar claim", confidence: conf });
				this.auditLog("conflict_detected", `${a.id},${b.id}`, "conflict-detector", {
					reason: "opposing polarity",
					confidence: conf,
				});
			}
		}
		return out;
	}

	autoResolveConflicts(actor = "system"): number {
		const conflicts = this.detectConflicts();
		let resolved = 0;
		for (const c of conflicts) {
			const a = this.entries.find((e) => e.id === c.a);
			const b = this.entries.find((e) => e.id === c.b);
			if (!a || !b) continue;
			if (c.confidence < 0.7) continue;
			let keepA = true;
			const aUser = a.provenance?.origin === "mined" && /correction/i.test(a.provenance.label || "") ? 1 : 0;
			const bUser = b.provenance?.origin === "mined" && /correction/i.test(b.provenance.label || "") ? 1 : 0;
			if (bUser > aUser) keepA = false;
			else if (aUser === bUser) {
				if ((b.updatedAt || 0) > (a.updatedAt || 0)) keepA = false;
				else if (b.updatedAt === a.updatedAt) {
					if (b.confidence > a.confidence) keepA = false;
					else if (b.confidence === a.confidence) {
						if ((b.accessCount || 0) > (a.accessCount || 0)) keepA = false;
					}
				}
			}
			this.resolveConflict(a.id, b.id, keepA ? "keep_a" : "keep_b", actor);
			resolved++;
		}
		return resolved;
	}

	resolveConflict(
		aId: string,
		bId: string,
		strategy: "keep_a" | "keep_b" | "keep_both" | "merge" | "delete_both",
		actor = "operator",
	): void {
		const a = this.entries.find((e) => e.id === aId);
		const b = this.entries.find((e) => e.id === bId);
		if (!a || !b) return;
		if (strategy === "keep_a") {
			b.supersededBy = a.id;
			a.supersedes = b.id;
		} else if (strategy === "keep_b") {
			a.supersededBy = b.id;
			b.supersedes = a.id;
		} else if (strategy === "delete_both") {
			this.entries = this.entries.filter((e) => e.id !== aId && e.id !== bId);
		} else if (strategy === "merge") {
			a.episode = `${a.episode}\n---merged---\n${b.episode}`;
			a.tags = [...new Set([...(a.tags || []), ...(b.tags || [])])];
			a.entities = [...new Set([...(a.entities || []), ...(b.entities || [])])].slice(0, 10);
			a.derivedFrom = [...new Set([...(a.derivedFrom || []), b.id])];
			b.supersededBy = a.id;
		}
		this.auditLog("conflict_resolved", `${aId},${bId}`, actor, { strategy });
		this.saveEntries();
	}

	isProtected(e: HMemEntry): boolean {
		if (e.derivedFrom && e.derivedFrom.length) return true;
		if (e.supersedes) return true;
		if (e.supersededBy) return true;
		if (this.entries.some((o) => (o.derivedFrom || []).includes(e.id) || (o.relatedTo || []).includes(e.id) || o.supersedes === e.id)) return true;
		return false;
	}

	previewSleep(): SleepPreview {
		const now = Date.now();
		const DAY = 1000 * 60 * 60 * 24;
		const toConsolidate: string[] = [];
		const toArchive: string[] = [];
		for (const e of this.entries) {
			const last = e.lastAccessed || e.updatedAt || e.createdAt;
			const age = (now - last) / DAY;
			if ((e.layer || "working") === "short_term" && age >= 7) toConsolidate.push(e.id);
			const protectedMem = this.isProtected(e);
			if (age >= 30 && (e.accessCount || 0) <= 2 && !protectedMem) toArchive.push(e.id);
		}
		const toSynthesize: string[][] = [];
		const used = new Set<string>();
		for (let i = 0; i < this.entries.length; i++) {
			if (used.has(this.entries[i].id)) continue;
			const group = [this.entries[i].id];
			for (let j = i + 1; j < this.entries.length; j++) {
				if (used.has(this.entries[j].id)) continue;
				const ta = tokenize(`${this.entries[i].trace} ${this.entries[i].episode}`);
				const tb = tokenize(`${this.entries[j].trace} ${this.entries[j].episode}`);
				if (jaccard(ta, tb) >= 0.82) group.push(this.entries[j].id);
			}
			if (group.length >= 2) {
				group.forEach((id) => used.add(id));
				toSynthesize.push(group);
			}
		}
		return { toConsolidate, toArchive, toSynthesize };
	}

	runSleep(actor = "system"): SleepReport {
		const preview = this.previewSleep();
		const backupId = randomUUID();
		this.backups.push({ id: backupId, entries: this.entries.map((e) => ({ ...e })), timestamp: Date.now() });
		if (this.backups.length > 10) this.backups = this.backups.slice(this.backups.length - 10);
		this.saveBackups();

		let consolidated = 0;
		let archived = 0;
		let synthesized = 0;

		for (const id of preview.toConsolidate) {
			const e = this.entries.find((x) => x.id === id);
			if (e) {
				e.layer = "long_term";
				e.updatedAt = Date.now();
				consolidated++;
				this.auditLog("sleep_consolidate", id, actor, {});
			}
		}

		for (const group of preview.toSynthesize) {
			const srcs = group.map((id) => this.entries.find((e) => e.id === id)).filter(Boolean) as HMemEntry[];
			if (srcs.length < 2) continue;
			const now = Date.now();
			const merged: HMemEntry = {
				id: randomUUID(),
				domain: srcs[0].domain,
				category: "synthesized",
				trace: srcs.map((e) => e.trace).join("; ").slice(0, 80),
				episode: srcs.map((e) => e.episode).join("\n---\n"),
				source: "sleep",
				confidence: Math.max(...srcs.map((e) => e.confidence)),
				createdAt: now,
				updatedAt: now,
				lastAccessed: now,
				accessCount: 0,
				layer: "long_term",
				type: srcs[0].type,
				tags: [...new Set(srcs.flatMap((e) => e.tags || []))],
				entities: [...new Set(srcs.flatMap((e) => e.entities || []))].slice(0, 10),
				derivedFrom: [...srcs.map((e) => e.id)],
				provenance: { origin: "derived", learnedAt: now, label: "sleep synthesis", refs: srcs.map((e) => e.id) },
			};
			this.entries.push(merged);
			for (const s of srcs) s.supersededBy = merged.id;
			synthesized++;
			this.auditLog("sleep_synthesize", merged.id, actor, { sources: srcs.map((e) => e.id) });
		}

		const archiveSet = new Set(preview.toArchive);
		this.entries = this.entries.filter((e) => {
			if (archiveSet.has(e.id)) {
				archived++;
				this.auditLog("sleep_archive", e.id, actor, {});
				return false;
			}
			return true;
		});

		this.cap();
		this.saveEntries();
		const report: SleepReport = { backupId, consolidated, archived, synthesized, timestamp: Date.now() };
		this.auditLog("sleep_consolidate", backupId, actor, { report });
		return report;
	}

	restoreSleep(backupId: string): boolean {
		const b = this.backups.find((x) => x.id === backupId);
		if (!b) return false;
		this.entries = b.entries.map((e) => ({ ...e }));
		this.auditLog("restore", backupId, "system", {});
		this.saveEntries();
		return true;
	}

	listBackups(): Array<{ id: string; timestamp: number; count: number }> {
		return this.backups.map((b) => ({ id: b.id, timestamp: b.timestamp, count: b.entries.length }));
	}

	// ---- Dreaming ----
	private relatedness(a: HMemEntry, b: HMemEntry): number {
		const ta = tokenize(`${a.trace} ${a.episode}`);
		const tb = tokenize(`${b.trace} ${b.episode}`);
		const content = jaccard(ta, tb);
		const tags = jaccard(a.tags || [], b.tags || []);
		const domain = a.domain === b.domain ? 1 : 0;
		const type = a.type && a.type === b.type ? 1 : 0;
		const entity = jaccard(a.entities || [], b.entities || []);
		return 0.35 * content + 0.2 * tags + 0.15 * domain + 0.1 * type + 0.2 * entity;
	}

	dream(): DreamProposal[] {
		const clusters: HMemEntry[][] = [];
		const used = new Set<string>();
		for (let i = 0; i < this.entries.length; i++) {
			if (used.has(this.entries[i].id)) continue;
			const cluster = [this.entries[i]];
			used.add(this.entries[i].id);
			for (let j = i + 1; j < this.entries.length; j++) {
				if (used.has(this.entries[j].id)) continue;
				if (this.relatedness(this.entries[i], this.entries[j]) >= 0.35) {
					cluster.push(this.entries[j]);
					used.add(this.entries[j].id);
				}
			}
			if (cluster.length >= 2) clusters.push(cluster);
		}

		const newProposals: DreamProposal[] = [];
		for (const c of clusters.slice(0, 8)) {
			const ids = c.map((e) => e.id);
			const content = c.map((e) => e.episode.slice(0, 120)).join(" | ");
			newProposals.push({
				id: randomUUID(),
				type: "insight",
				summary: `Synthesized insight from ${c.length} memories: ${content.slice(0, 240)}`,
				sourceIds: ids,
				status: "pending",
				createdAt: Date.now(),
			});
		}
		const general = this.entries.filter((e) => !e.domain || e.domain === "general").slice(0, 8);
		if (general.length >= 2) {
			newProposals.push({
				id: randomUUID(),
				type: "domain",
				summary: `Suggest reclassifying ${general.length} general memories into a specific domain.`,
				sourceIds: general.map((e) => e.id),
				status: "pending",
				createdAt: Date.now(),
			});
		}
		const pref = this.entries.filter((e) => e.type === "preference" || (e.tags || []).includes("approved_precedent")).slice(0, 8);
		if (pref.length >= 2) {
			newProposals.push({
				id: randomUUID(),
				type: "invariant",
				summary: `Stable rule derived from ${pref.length} preference/correction signals.`,
				sourceIds: pref.map((e) => e.id),
				status: "pending",
				createdAt: Date.now(),
			});
		}

		this.proposals.push(...newProposals);
		if (this.proposals.length > 200) this.proposals = this.proposals.slice(this.proposals.length - 200);
		this.saveProposals();
		for (const p of newProposals) this.auditLog("dream_proposed", p.id, "dreamer", { type: p.type });
		return newProposals;
	}

	getDreamProposals(status?: DreamProposal["status"]): DreamProposal[] {
		return status ? this.proposals.filter((p) => p.status === status) : [...this.proposals];
	}

	approveDream(proposalId: string, actor = "operator"): HMemEntry | null {
		const p = this.proposals.find((x) => x.id === proposalId);
		if (!p || p.status !== "pending") return null;
		p.status = "approved";
		const now = Date.now();
		const type = p.type === "invariant" ? "preference" : "factual";
		const entry: HMemEntry = {
			id: randomUUID(),
			domain: "general",
			category: p.type,
			trace: p.summary.slice(0, 80),
			episode: p.summary,
			source: "dream",
			confidence: 0.75,
			createdAt: now,
			updatedAt: now,
			lastAccessed: now,
			accessCount: 0,
			layer: "long_term",
			type,
			derivedFrom: [...p.sourceIds],
			provenance: { origin: "derived", learnedAt: now, label: `dream ${p.type}`, refs: p.sourceIds },
		};
		const domains = new Set(this.entries.filter((e) => p.sourceIds.includes(e.id)).map((e) => e.domain));
		if (domains.size === 1) entry.domain = [...domains][0];
		this.entries.push(entry);
		this.enrich(entry);
		this.auditLog("dream_approved", p.id, actor, { memoryId: entry.id });
		this.cap();
		this.saveEntries();
		this.saveProposals();
		return entry;
	}

	rejectDream(proposalId: string, actor = "operator"): void {
		const p = this.proposals.find((x) => x.id === proposalId);
		if (!p || p.status !== "pending") return;
		p.status = "rejected";
		this.auditLog("dream_rejected", p.id, actor, {});
		this.saveProposals();
	}
}

export default HMemService;
