import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
	tags?: string[];
	derivedFrom?: string[];
	relatedTo?: string[];
}

export interface HMemRetrieveResult {
	entries: HMemEntry[];
	context: string;
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

export class HMemService {
	private filePath: string;
	private entries: HMemEntry[];

	constructor(filePath?: string) {
		this.filePath =
			filePath ||
			path.resolve(process.cwd(), "logs", "hmem.json");
		this.entries = this.load();
	}

	private load(): HMemEntry[] {
		try {
			if (!fs.existsSync(this.filePath)) return [];
			const raw = fs.readFileSync(this.filePath, "utf8");
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	private save(): void {
		try {
			const dir = path.dirname(this.filePath);
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), "utf8");
		} catch {
			// degrade gracefully
		}
	}

	mine(params: {
		sessionId: string;
		topic: string;
		finalAnswer: string;
		seatPositions: Array<{ seatId: string; position: string; confidence: number }>;
	}): number {
		const domain = deriveDomain(params.topic);
		const now = Date.now();
		let added = 0;
		// Domain-level summary entry
		this.entries.push({
			id: randomUUID(),
			domain,
			category: "summary",
			trace: params.topic.slice(0, 80),
			episode: `Topic: ${params.topic}\nFinal: ${params.finalAnswer}`,
			source: params.sessionId,
			confidence: 0.8,
			createdAt: now,
			updatedAt: now,
			derivedFrom: [],
		});
		added++;
		for (const sp of params.seatPositions) {
			this.entries.push({
				id: randomUUID(),
				domain,
				category: sp.seatId,
				trace: sp.position.slice(0, 80),
				episode: `[${sp.seatId}] ${sp.position}`,
				source: params.sessionId,
				confidence: sp.confidence,
				createdAt: now,
				updatedAt: now,
			});
			added++;
		}
		// cap growth
		if (this.entries.length > 500) {
			this.entries = this.entries.slice(this.entries.length - 500);
		}
		this.save();
		return added;
	}

	retrieve(query: string, topN = 5): HMemRetrieveResult {
		const qTokens = new Set(tokenize(query));
		if (qTokens.size === 0 || this.entries.length === 0) {
			return { entries: [], context: "" };
		}
		const scored = this.entries.map((e) => {
			const hay = tokenize(`${e.domain} ${e.category} ${e.trace} ${e.episode}`);
			let score = 0;
			for (const t of qTokens) {
				if (hay.includes(t)) score += 1;
			}
			// recency boost
			score += Math.min(0.5, (e.updatedAt - 0) / 1e12);
			return { e, score };
		});
		scored.sort((a, b) => b.score - a.score);
		const top = scored
			.filter((s) => s.score > 0)
			.slice(0, topN)
			.map((s) => s.e);
		const context =
			top.length === 0
				? ""
				: "Relevant memory from prior debates:\n" +
				  top
						.map(
							(e) =>
								`- [${e.domain}/${e.category}] ${e.episode.slice(0, 200)}`,
						)
						.join("\n");
		return { entries: top, context };
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
		rating: "up" | "down",
	): HMemEntry | null {
		// Look up matching entries
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
				confidence: rating === "up" ? 0.9 : 0.6,
				createdAt: now,
				updatedAt: now,
				tags: [rating === "up" ? "approved_precedent" : "disputed_precedent"],
			};
			this.entries.push(entry);
			if (this.entries.length > 500) {
				this.entries = this.entries.slice(this.entries.length - 500);
			}
			this.save();
			return entry;
		}

		for (const e of matches) {
			e.tags = e.tags || [];
			if (rating === "up") {
				e.tags = e.tags.filter((t) => t !== "disputed_precedent");
				if (!e.tags.includes("approved_precedent")) {
					e.tags.push("approved_precedent");
				}
				e.confidence = Math.min(
					1.0,
					Math.max(0.1, Math.round((e.confidence + 0.1) * 100) / 100),
				);
			} else {
				e.tags = e.tags.filter((t) => t !== "approved_precedent");
				if (!e.tags.includes("disputed_precedent")) {
					e.tags.push("disputed_precedent");
				}
				e.confidence = Math.min(
					1.0,
					Math.max(0.1, Math.round((e.confidence - 0.2) * 100) / 100),
				);
			}
			e.updatedAt = Date.now();
		}

		this.save();
		return matches.find((m) => m.category === seatId) || matches[0] || null;
	}
}
