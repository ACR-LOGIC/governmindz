// biome-ignore-all lint/style/noNonNullAssertion: legacy code pending refactor
// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor

const STORAGE_KEY = "governmindz_notion";
const AUTH_STORAGE_KEY = "governmindz_auth_token";

function getAppAuthHeaders(): Record<string, string> {
	if (typeof localStorage === "undefined") {
		return {};
	}

	const token = localStorage.getItem(AUTH_STORAGE_KEY);
	return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface NotionConfig {
	apiKey?: string;
	databaseId?: string;
	pageId?: string;
}

export class NotionProvider {
	public apiKey: string;
	public databaseId: string;
	public pageId: string;
	public isConnected = false;

	constructor(config: NotionConfig = {}) {
		this.apiKey = config.apiKey || "";
		this.databaseId = config.databaseId || "";
		this.pageId = config.pageId || "";
		this._loadConfig();
	}

	async testConnection() {
		if (!this.apiKey) {
			return { ok: false, error: "No API key provided" };
		}

		try {
			const response = await fetch("/api/integrations/notion/test", {
				method: "POST",
				headers: {
					...getAppAuthHeaders(),
					"Content-Type": "application/json",
					"X-Notion-Token": this.apiKey,
				},
				body: JSON.stringify({ apiKey: this.apiKey }),
			});

			const payload = await response.json();
			if (!response.ok) {
				return {
					ok: false,
					error: payload.message || payload.error || `HTTP ${response.status}`,
				};
			}

			this.isConnected = true;
			return { ok: true, user: payload.name || payload.user || "Connected" };
		} catch (error: any) {
			return { ok: false, error: error.message };
		}
	}

	async syncCard(card: any) {
		if (!this.databaseId) {
			return { ok: false, error: "No database configured" };
		}

		try {
			const response = await fetch("/api/integrations/notion/syncCard", {
				method: "POST",
				headers: {
					...getAppAuthHeaders(),
					"Content-Type": "application/json",
					"X-Notion-Token": this.apiKey,
				},
				body: JSON.stringify({
					card,
					databaseId: this.databaseId,
					properties: this._cardToProperties(card),
				}),
			});

			const payload = await response.json();
			if (!response.ok) {
				return {
					ok: false,
					error: payload.message || payload.error || "Failed to sync card",
				};
			}

			return {
				ok: true,
				notionPageId: payload.notionPageId || payload.id || "mock-page",
			};
		} catch (error: any) {
			return { ok: false, error: error.message };
		}
	}

	async listDatabases() {
		if (!this.apiKey) {
			return { ok: false, error: "No API key provided" };
		}

		try {
			const response = await fetch("/api/integrations/notion/databases", {
				method: "POST",
				headers: {
					...getAppAuthHeaders(),
					"Content-Type": "application/json",
					"X-Notion-Token": this.apiKey,
				},
				body: JSON.stringify({ apiKey: this.apiKey }),
			});

			const payload = await response.json();
			if (!response.ok) {
				return {
					ok: false,
					error: payload.message || payload.error || `HTTP ${response.status}`,
				};
			}

			const databases = payload.databases || payload.results || [];
			return { ok: true, databases };
		} catch (error: any) {
			return { ok: false, error: error.message };
		}
	}

	async syncCards(cards: any[] = []) {
		let synced = 0;
		let failed = 0;
		const errors: string[] = [];
		const results: any[] = [];

		for (const card of cards) {
			const result = await this.syncCard(card);
			if (result.ok) {
				synced += 1;
				results.push({ cardId: card.id, notionPageId: result.notionPageId });
			} else {
				failed += 1;
				errors.push(result.error!);
			}
		}

		return { synced, failed, errors, results };
	}

	async exportSession(session: any) {
		if (!this.pageId && !this.databaseId) {
			return { ok: false, error: "No destination configured" };
		}

		return {
			ok: true,
			pageUrl: `https://notion.so/${this.pageId || this.databaseId || "session-export"}`,
			session,
		};
	}

	configure(config: NotionConfig = {}) {
		if (config.apiKey !== undefined) this.apiKey = config.apiKey;
		if (config.databaseId !== undefined) this.databaseId = config.databaseId;
		if (config.pageId !== undefined) this.pageId = config.pageId;
		this._saveConfig();
	}

	getConfig() {
		const suffix = this.apiKey ? this.apiKey.slice(-4) : "";
		const masked = this.apiKey ? "â¢â¢â¢â¢" + suffix : "";

		return {
			apiKey: masked,
			databaseId: this.databaseId,
			pageId: this.pageId,
			isConnected: this.isConnected,
		};
	}

	disconnect() {
		this.apiKey = "";
		this.databaseId = "";
		this.pageId = "";
		this.isConnected = false;
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(STORAGE_KEY);
		}
	}

	private _cardToProperties(card: any = {}) {
		return {
			Name: { title: [{ text: { content: card.title || "Untitled" } }] },
			Type: { select: { name: card.type || "NOTE" } },
			Status: { select: { name: card.status || "inbox" } },
			Tags: {
				multi_select: (card.tags || []).map((tag: string) => ({ name: tag })),
			},
			Priority: { number: card.urgency ?? 5 },
		};
	}

	private _loadConfig() {
		if (typeof localStorage === "undefined") return;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;

		try {
			const saved = JSON.parse(raw);
			this.apiKey = saved.apiKey || this.apiKey;
			this.databaseId = saved.databaseId || this.databaseId;
			this.pageId = saved.pageId || this.pageId;
		} catch (error) {
			console.error("[NotionProvider] Failed to load config:", error);
		}
	}

	private _saveConfig() {
		if (typeof localStorage === "undefined") return;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				apiKey: this.apiKey,
				databaseId: this.databaseId,
				pageId: this.pageId,
			}),
		);
	}
}
