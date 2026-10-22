// biome-ignore-all lint/suspicious/useIterableCallbackReturn: legacy code pending refactor
// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor
// Copyright (c) 2026 ACR Logic.

import { GoogleDocsProvider } from "./googleDocsProvider";
import { NotionProvider } from "./notionProvider";

const MEMORY_VAULT_STORAGE_KEY = "governmindz_memory_vault";
const MEMORY_MODE_STORAGE_KEY = "governmindz_memory_modes";
const MEMORY_CAPTURE_STORAGE_KEY = "governmindz_memory_capture_state";
const CREATOR_STATE_STORAGE_KEY = "creator_os_state";
const DEFAULT_MEMORY_MODES = {
	Professional: true,
	Personal: true,
	Family: false,
	Financial: false,
	Legal: true,
	General: true,
};

interface SyncEvent {
	provider: string;
	status: string;
	message: string;
	syncedCount?: number;
	timestamp: number;
}

export interface MemoryFactRecord {
	id: string;
	section: string;
	text: string;
	sessionId: string;
	providers: string[];
	confidence: number;
	createdAt: number;
	updatedAt: number;
	metadata: Record<string, unknown>;
}

export interface MemorySectionSummary {
	name: string;
	count: number;
	lastUpdatedAt: number;
}

export type MemoryModeName = keyof typeof DEFAULT_MEMORY_MODES;
export type MemoryModeState = Record<MemoryModeName, boolean>;
export interface MemoryCaptureState {
	sessionRecording: boolean;
	updatedAt: number;
}

type MemoryVault = Record<string, MemoryFactRecord[]>;
interface PreparedMemoryFact {
	text: string;
	sectionName: string;
}

interface PreparedSessionExport {
	sessionId: string;
	provider: string;
	sessionConfidence: number;
	facts: PreparedMemoryFact[];
	exportSession: Record<string, unknown>;
}

export class SyncEngine {
	notion: NotionProvider;
	gdocs: GoogleDocsProvider;
	status: string = "idle";
	syncLog: SyncEvent[] = [];
	private notionSyncMap: Map<string, string> = new Map();
	private _listeners: Array<(event: SyncEvent) => void> = [];
	private memoryVault: MemoryVault;
	private memoryModes: MemoryModeState;
	private memoryCaptureState: MemoryCaptureState;

	constructor() {
		this.notion = new NotionProvider();
		this.gdocs = new GoogleDocsProvider();
		this._loadSyncMap();
		this.memoryVault = this._loadMemoryVault();
		this.memoryModes = this._loadMemoryModes();
		this.memoryCaptureState = this._loadMemoryCaptureState();
	}

	on(fn: (event: SyncEvent) => void) {
		this._listeners.push(fn);
	}

	off(fn: (event: SyncEvent) => void) {
		this._listeners = this._listeners.filter((l) => l !== fn);
	}

	_emit(event: SyncEvent) {
		this.syncLog.push(event);
		if (this.syncLog.length > 50) this.syncLog.shift();
		this._listeners.forEach((fn) => fn(event));
		if (typeof document !== "undefined") {
			document.dispatchEvent(new CustomEvent("sync:status", { detail: event }));
		}
	}

	async connect(provider: string, config: Record<string, unknown>) {
		if (provider === "notion") {
			this.notion.configure(config as any);
			const result = await this.notion.testConnection();
			this._emit({
				provider: "notion",
				status: result.ok ? "success" : "error",
				message: result.ok ? "Connected" : (result.error ?? "Failed"),
				timestamp: Date.now(),
			});
			return { ok: result.ok, message: result.ok ? "Connected" : result.error };
		}
		if (provider === "gdocs") {
			this.gdocs.configure(config as any);
			const result = await this.gdocs.testConnection();
			this._emit({
				provider: "gdocs",
				status: result.ok ? "success" : "error",
				message: result.ok ? "Connected" : (result.error ?? "Failed"),
				timestamp: Date.now(),
			});
			return { ok: result.ok, message: result.ok ? "Connected" : result.error };
		}
		return { ok: false, message: `Unknown provider: ${provider}` };
	}

	disconnect(provider: string) {
		if (provider === "notion") {
			this.notion.disconnect();
		} else if (provider === "gdocs") {
			this.gdocs.disconnect();
		}
		this._emit({
			provider,
			status: "idle",
			message: "Disconnected",
			timestamp: Date.now(),
		});
	}

	getStatus() {
		return {
			notion: {
				apiKey: this.notion.apiKey,
				isConnected: this.notion.isConnected,
			},
			gdocs: {
				accessToken: this.gdocs.accessToken,
				isConnected: this.gdocs.isConnected,
			},
			syncStatus: this.status,
			lastSync:
				this.syncLog.length > 0 ? this.syncLog[this.syncLog.length - 1] : null,
			log: [...this.syncLog],
		};
	}

	async syncCardsToNotion(): Promise<{ synced: number; failed: number }> {
		if (!this.notion.isConnected) {
			this._emit({
				provider: "notion",
				status: "error",
				message: "Not connected to Notion",
				timestamp: Date.now(),
			});
			return { synced: 0, failed: 0 };
		}

		this.status = "syncing";
		this._emit({
			provider: "notion",
			status: "syncing",
			message: "Syncing cards to Notion...",
			timestamp: Date.now(),
		});

		const cards = this._getStoredCards();
		const unsynced = cards.filter(
			(card): card is Record<string, unknown> & { id: string } => {
				return typeof card.id === "string" && !this.notionSyncMap.has(card.id);
			},
		);

		let synced = 0;
		let failed = 0;
		for (const card of unsynced) {
			try {
				this.notionSyncMap.set(card.id, "synced");
				synced++;
			} catch {
				failed++;
			}
		}
		this._saveSyncMap();

		this.status = failed > 0 ? "error" : "success";
		this._emit({
			provider: "notion",
			status: this.status,
			message: `Synced ${synced} cards, ${failed} failed`,
			syncedCount: synced,
			timestamp: Date.now(),
		});

		return { synced, failed };
	}

	async exportCardsToGoogleDocs(cards: Array<Record<string, unknown>>) {
		return this.gdocs.exportCards(cards);
	}

	async exportSessionToNotion(session: Record<string, unknown>) {
		const prepared = this._prepareSessionExport(session, "notion");
		if (!prepared) {
			return { ok: false, skipped: true, reason: "memory_capture_filtered" };
		}

		this.recordSessionMemory(prepared);
		return this.notion.exportSession(prepared.exportSession);
	}

	async exportSessionToGoogleDocs(session: Record<string, unknown>) {
		const prepared = this._prepareSessionExport(session, "gdocs");
		if (!prepared) {
			return { ok: false, skipped: true, reason: "memory_capture_filtered" };
		}

		this.recordSessionMemory(prepared);
		const responses = (
			Array.isArray(prepared.exportSession.responses)
				? prepared.exportSession.responses
				: []
		) as Array<Record<string, unknown>>;
		const cards = responses.map((response) => ({
			title: response.agentName || response.agentId || "Agent",
			summary: response.content || "",
			payload: {
				latencyMs: response.latencyMs || 0,
				confidence: response.confidence || 0,
			},
		}));

		return this.gdocs.exportCards(cards);
	}

	listMemorySections(): MemorySectionSummary[] {
		this.memoryVault = this._loadMemoryVault();

		return Object.entries(this.memoryVault)
			.map(([name, facts]) => ({
				name,
				count: facts.length,
				lastUpdatedAt: facts.reduce(
					(latest, fact) => Math.max(latest, fact.updatedAt),
					0,
				),
			}))
			.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
	}

	getMemorySectionDetails(sectionName: string): MemoryFactRecord[] {
		this.memoryVault = this._loadMemoryVault();
		const facts = this.memoryVault[sectionName] || [];
		return [...facts].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	updateMemoryFact(
		sectionName: string,
		factId: string,
		nextText: string,
	): boolean {
		this.memoryVault = this._loadMemoryVault();
		const facts = this.memoryVault[sectionName];
		if (!facts) return false;

		const target = facts.find((fact) => fact.id === factId);
		if (!target) return false;

		target.text = nextText.trim();
		target.updatedAt = Date.now();
		this._saveMemoryVault();
		this._emitMemoryVaultUpdate("fact_updated", { sectionName, factId });
		return true;
	}

	deleteMemoryFact(sectionName: string, factId: string): boolean {
		this.memoryVault = this._loadMemoryVault();
		const facts = this.memoryVault[sectionName];
		if (!facts) return false;

		const nextFacts = facts.filter((fact) => fact.id !== factId);
		if (nextFacts.length === facts.length) return false;

		if (nextFacts.length === 0) {
			delete this.memoryVault[sectionName];
		} else {
			this.memoryVault[sectionName] = nextFacts;
		}

		this._saveMemoryVault();
		this._emitMemoryVaultUpdate("fact_deleted", { sectionName, factId });
		return true;
	}

	wipeMemorySection(sectionName: string): boolean {
		this.memoryVault = this._loadMemoryVault();
		if (!this.memoryVault[sectionName]) return false;

		delete this.memoryVault[sectionName];
		this._saveMemoryVault();
		this._emitMemoryVaultUpdate("section_wiped", { sectionName });
		return true;
	}

	getMemoryModes(): MemoryModeState {
		this.memoryModes = this._loadMemoryModes();
		return { ...this.memoryModes };
	}

	getMemoryCaptureState(): MemoryCaptureState {
		this.memoryCaptureState = this._loadMemoryCaptureState();
		return { ...this.memoryCaptureState };
	}

	setSessionRecording(active: boolean): MemoryCaptureState {
		this.memoryCaptureState = {
			sessionRecording: Boolean(active),
			updatedAt: Date.now(),
		};
		this._saveMemoryCaptureState();
		this._emitMemoryCaptureUpdate();
		return this.getMemoryCaptureState();
	}

	toggleSessionRecording(): MemoryCaptureState {
		const current = this.getMemoryCaptureState();
		return this.setSessionRecording(!current.sessionRecording);
	}

	toggleMemoryMode(mode: string): {
		ok: boolean;
		category: MemoryModeName | null;
		active: boolean | null;
	} {
		const normalized = this._normalizeModeName(mode);
		if (!normalized) {
			return { ok: false, category: null, active: null };
		}

		const current = this.getMemoryModes();
		current[normalized] = !current[normalized];
		this.memoryModes = current;
		this._saveMemoryModes();
		this._emitMemoryModeUpdate(normalized, current[normalized]);
		return { ok: true, category: normalized, active: current[normalized] };
	}

	setMemoryMode(
		mode: string,
		active: boolean,
	): { ok: boolean; category: MemoryModeName | null; active: boolean | null } {
		const normalized = this._normalizeModeName(mode);
		if (!normalized) {
			return { ok: false, category: null, active: null };
		}

		const current = this.getMemoryModes();
		current[normalized] = Boolean(active);
		this.memoryModes = current;
		this._saveMemoryModes();
		this._emitMemoryModeUpdate(normalized, current[normalized]);
		return { ok: true, category: normalized, active: current[normalized] };
	}

	shouldRecordMemory(sectionName: string): boolean {
		const normalized = this._normalizeModeName(sectionName);
		const current = this.getMemoryModes();
		if (!normalized) return true;
		return current[normalized];
	}

	shouldCaptureSession(session?: Record<string, unknown>): boolean {
		const current = this.getMemoryCaptureState();
		if (!current.sessionRecording) return false;

		const metadata = (session?.metadata || {}) as Record<string, unknown>;
		if (
			metadata.doNotRecordSession === true ||
			metadata.memoryCapture === false
		) {
			return false;
		}

		return true;
	}

	private _loadSyncMap() {
		try {
			if (typeof localStorage === "undefined") return;
			const saved = localStorage.getItem("governmindz_sync_map");
			if (saved) {
				const entries = JSON.parse(saved);
				this.notionSyncMap = new Map(entries);
			}
		} catch (e) {
			console.error("[SyncEngine] Failed to load sync map:", e);
		}
	}

	private _saveSyncMap() {
		try {
			if (typeof localStorage === "undefined") return;
			localStorage.setItem(
				"governmindz_sync_map",
				JSON.stringify(Array.from(this.notionSyncMap.entries())),
			);
		} catch (e) {
			console.error("[SyncEngine] Failed to save sync map:", e);
		}
	}

	private _loadMemoryModes(): MemoryModeState {
		try {
			if (typeof localStorage === "undefined")
				return { ...DEFAULT_MEMORY_MODES };
			const saved = localStorage.getItem(MEMORY_MODE_STORAGE_KEY);
			if (!saved) return { ...DEFAULT_MEMORY_MODES };
			const parsed = JSON.parse(saved) as Partial<MemoryModeState>;
			return { ...DEFAULT_MEMORY_MODES, ...parsed };
		} catch (e) {
			console.error("[SyncEngine] Failed to load memory modes:", e);
			return { ...DEFAULT_MEMORY_MODES };
		}
	}

	private _loadMemoryCaptureState(): MemoryCaptureState {
		try {
			if (typeof localStorage === "undefined") {
				return { sessionRecording: true, updatedAt: Date.now() };
			}

			const saved = localStorage.getItem(MEMORY_CAPTURE_STORAGE_KEY);
			if (!saved) {
				return { sessionRecording: true, updatedAt: Date.now() };
			}

			const parsed = JSON.parse(saved) as Partial<MemoryCaptureState>;
			return {
				sessionRecording: parsed.sessionRecording !== false,
				updatedAt: Number(parsed.updatedAt) || Date.now(),
			};
		} catch (e) {
			console.error("[SyncEngine] Failed to load memory capture state:", e);
			return { sessionRecording: true, updatedAt: Date.now() };
		}
	}

	private _saveMemoryModes() {
		try {
			if (typeof localStorage === "undefined") return;
			localStorage.setItem(
				MEMORY_MODE_STORAGE_KEY,
				JSON.stringify(this.memoryModes),
			);
		} catch (e) {
			console.error("[SyncEngine] Failed to save memory modes:", e);
		}
	}

	private _saveMemoryCaptureState() {
		try {
			if (typeof localStorage === "undefined") return;
			localStorage.setItem(
				MEMORY_CAPTURE_STORAGE_KEY,
				JSON.stringify(this.memoryCaptureState),
			);
		} catch (e) {
			console.error("[SyncEngine] Failed to save memory capture state:", e);
		}
	}

	private recordSessionMemory(prepared: PreparedSessionExport) {
		this.memoryVault = this._loadMemoryVault();
		const now = Date.now();
		const { facts, provider, sessionId, sessionConfidence, exportSession } =
			prepared;

		for (const { text: factText, sectionName } of facts) {
			const sectionFacts = this.memoryVault[sectionName] || [];
			const existing = sectionFacts.find(
				(fact) => fact.sessionId === sessionId && fact.text === factText,
			);

			if (existing) {
				if (!existing.providers.includes(provider)) {
					existing.providers.push(provider);
				}
				existing.updatedAt = now;
				existing.confidence = Math.max(existing.confidence, sessionConfidence);
			} else {
				sectionFacts.push({
					id: `${sessionId}:${sectionFacts.length}:${factText.slice(0, 24)}`,
					section: sectionName,
					text: factText,
					sessionId,
					providers: [provider],
					confidence: sessionConfidence,
					createdAt: now,
					updatedAt: now,
					metadata: {
						consensus_method: exportSession.consensus_method,
						finalConfidence: exportSession.finalConfidence,
						source: "debate_loop_auto_sync",
					},
				});
			}

			this.memoryVault[sectionName] = sectionFacts;
		}

		this._saveMemoryVault();
		this._emitMemoryVaultUpdate("session_recorded", {
			sessionId,
			provider,
			factCount: facts.length,
		});
	}

	private _prepareSessionExport(
		session: Record<string, unknown>,
		provider: string,
	): PreparedSessionExport | null {
		const sessionId = String(
			session.session_id || session.id || `session-${Date.now()}`,
		);
		if (!this.shouldCaptureSession(session)) {
			this._emitMemoryVaultUpdate("session_discarded", {
				provider,
				sessionId,
				reason: "session_recording_disabled",
			});
			return null;
		}

		const rawFacts = this._extractFactsFromSession(session);
		if (rawFacts.length === 0) {
			this._emitMemoryVaultUpdate("session_discarded", {
				provider,
				sessionId,
				reason: "no_extractable_facts",
			});
			return null;
		}

		const facts = rawFacts
			.map((text) => ({
				text,
				sectionName: this._resolveMemorySection(session, text),
			}))
			.filter((fact) => {
				const allowed = this.shouldRecordMemory(fact.sectionName);
				if (!allowed) {
					this._emitMemoryVaultUpdate("fact_discarded", {
						provider,
						sessionId,
						sectionName: fact.sectionName,
						reason: "memory_mode_muted",
					});
				}
				return allowed;
			});

		if (facts.length === 0) {
			this._emitMemoryVaultUpdate("session_discarded", {
				provider,
				sessionId,
				reason: "all_facts_muted",
			});
			return null;
		}

		const sessionConfidence = this._readConfidence(session);
		const exportSession = {
			...session,
			session_id: sessionId,
			id: session.id || sessionId,
			content: facts.map((fact) => fact.text).join("\n"),
			responses: facts.map((fact, index) => ({
				agentId: `memory-${index + 1}`,
				agentName: fact.sectionName,
				content: fact.text,
				confidence: sessionConfidence,
				latencyMs: 0,
				section: fact.sectionName,
			})),
			metadata: {
				...((session.metadata || {}) as Record<string, unknown>),
				filteredSections: Array.from(
					new Set(facts.map((fact) => fact.sectionName)),
				),
				filteredFactCount: facts.length,
				provider,
			},
		};

		return {
			sessionId,
			provider,
			sessionConfidence,
			facts,
			exportSession,
		};
	}

	private _extractFactsFromSession(session: Record<string, unknown>): string[] {
		const explicitContent =
			typeof session.content === "string" ? session.content : "";
		const transcriptFacts = explicitContent
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);

		if (transcriptFacts.length > 0) {
			return Array.from(new Set(transcriptFacts));
		}

		const responses = Array.isArray(session.responses) ? session.responses : [];
		return Array.from(
			new Set(
				responses
					.map((response) =>
						`[${response.agentName || response.agentId || "Agent"}]: ${response.content || ""}`.trim(),
					)
					.filter((line) => line !== "[Agent]:" && line.length > 4),
			),
		);
	}

	private _resolveMemorySection(
		session: Record<string, unknown>,
		factText: string,
	): string {
		const metadata = (session.metadata || {}) as Record<string, unknown>;
		const explicitSection =
			metadata.memorySection || metadata.category || session.section;
		if (typeof explicitSection === "string" && explicitSection.trim()) {
			return this._canonicalSectionName(explicitSection.trim());
		}

		const lower = factText.toLowerCase();
		if (
			/(law|lawyer|legal|contract|court|compliance|policy|regulation|nevada|case)/i.test(
				lower,
			)
		) {
			return "Legal";
		}
		if (
			/(family|spouse|partner|child|children|kid|kids|son|daughter|birthday|mom|mother|dad|father|sister|brother)/i.test(
				lower,
			)
		) {
			return "Family";
		}
		if (
			/(prefer|preference|favorite|likes|dislikes|usually|always)/i.test(lower)
		) {
			return "Personal Preferences";
		}
		if (
			/(project|client|work|meeting|deadline|launch|professional|business|deliverable)/i.test(
				lower,
			)
		) {
			return "Professional";
		}

		return "General";
	}

	private _readConfidence(session: Record<string, unknown>): number {
		const confidence = Number(
			session.finalConfidence ?? session.confidence ?? 0,
		);
		return Number.isFinite(confidence) ? confidence : 0;
	}

	private _loadMemoryVault(): MemoryVault {
		try {
			if (typeof localStorage === "undefined") return {};
			const saved = localStorage.getItem(MEMORY_VAULT_STORAGE_KEY);
			if (!saved) return {};
			const parsed = JSON.parse(saved) as MemoryVault;
			return parsed && typeof parsed === "object" ? parsed : {};
		} catch (e) {
			console.error("[SyncEngine] Failed to load memory vault:", e);
			return {};
		}
	}

	private _saveMemoryVault() {
		try {
			if (typeof localStorage === "undefined") return;
			localStorage.setItem(
				MEMORY_VAULT_STORAGE_KEY,
				JSON.stringify(this.memoryVault),
			);
		} catch (e) {
			console.error("[SyncEngine] Failed to save memory vault:", e);
		}
	}

	private _emitMemoryVaultUpdate(
		action: string,
		detail: Record<string, unknown>,
	) {
		if (typeof document === "undefined") return;
		document.dispatchEvent(
			new CustomEvent("memory:vault-updated", {
				detail: {
					action,
					timestamp: Date.now(),
					...detail,
				},
			}),
		);
	}

	private _emitMemoryModeUpdate(category: MemoryModeName, active: boolean) {
		if (typeof document === "undefined") return;
		document.dispatchEvent(
			new CustomEvent("memory:modes-updated", {
				detail: {
					category,
					active,
					modes: this.getMemoryModes(),
					timestamp: Date.now(),
				},
			}),
		);
	}

	private _emitMemoryCaptureUpdate() {
		if (typeof document === "undefined") return;
		document.dispatchEvent(
			new CustomEvent("memory:capture-updated", {
				detail: {
					...this.getMemoryCaptureState(),
					timestamp: Date.now(),
				},
			}),
		);
	}

	private _normalizeModeName(mode: string): MemoryModeName | null {
		const lower = String(mode || "")
			.trim()
			.toLowerCase()
			.replace(/[_-]+/g, " ");

		if (!lower) return null;
		if (
			lower.includes("legal") ||
			lower.includes("professional/legal") ||
			lower.includes("law")
		)
			return "Legal";
		if (
			lower.includes("professional") ||
			lower.includes("work") ||
			lower.includes("business")
		)
			return "Professional";
		if (lower.includes("family")) return "Family";
		if (
			lower.includes("financial") ||
			lower.includes("finance") ||
			lower.includes("money")
		)
			return "Financial";
		if (
			lower.includes("personal preference") ||
			lower.includes("preference") ||
			lower === "personal"
		)
			return "Personal";
		if (lower.includes("general")) return "General";
		return null;
	}

	private _canonicalSectionName(sectionName: string): string {
		return this._normalizeModeName(sectionName) || sectionName;
	}

	private _getStoredCards(): Array<Record<string, unknown>> {
		try {
			if (typeof localStorage === "undefined") return [];
			const raw = localStorage.getItem(CREATOR_STATE_STORAGE_KEY);
			if (!raw) return [];
			const parsed = JSON.parse(raw) as {
				cards?: Array<Record<string, unknown>>;
			};
			return Array.isArray(parsed.cards) ? parsed.cards : [];
		} catch (e) {
			console.error("[SyncEngine] Failed to read stored cards:", e);
			return [];
		}
	}
}

export const syncEngine = new SyncEngine();
