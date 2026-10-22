
const STORAGE_KEY = "governmindz_gdocs";
const AUTH_STORAGE_KEY = "governmindz_auth_token";
const GDOCS_API = "https://docs.googleapis.com/v1/documents";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function getAppAuthHeaders(): Record<string, string> {
	if (typeof localStorage === "undefined") {
		return {};
	}

	const token = localStorage.getItem(AUTH_STORAGE_KEY);
	return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface GoogleDocsConfig {
	accessToken?: string;
	folderId?: string;
}

export class GoogleDocsProvider {
	accessToken: string;
	folderId: string;
	isConnected: boolean;

	constructor(config: GoogleDocsConfig = {}) {
		this.accessToken = config.accessToken ?? "";
		this.folderId = config.folderId ?? "";
		this.isConnected = false;
	}

	async testConnection(): Promise<{
		ok: boolean;
		email?: string;
		error?: string;
	}> {
		if (!this.accessToken) {
			return { ok: false, error: "No access token configured" };
		}
		try {
			const res = await fetch(USERINFO_URL, {
				headers: { Authorization: `Bearer ${this.accessToken}` },
			});
			const data = (await res.json()) as Record<string, unknown>;
			if (!res.ok) {
				return { ok: false, error: (data.error as string) ?? "Auth failed" };
			}
			this.isConnected = true;
			return { ok: true, email: data.email as string };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Network error",
			};
		}
	}

	configure(config: GoogleDocsConfig): void {
		if (config.accessToken !== undefined) this.accessToken = config.accessToken;
		if (config.folderId !== undefined) this.folderId = config.folderId;
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					accessToken: this.accessToken,
					folderId: this.folderId,
				}),
			);
		}
	}

	disconnect(): void {
		this.accessToken = "";
		this.folderId = "";
		this.isConnected = false;
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(STORAGE_KEY);
		}
	}

	getConfig(): GoogleDocsConfig {
		return {
			accessToken: this.accessToken || undefined,
			folderId: this.folderId || undefined,
		};
	}

	async listFolders(): Promise<{
		ok: boolean;
		folders?: Array<{ id: string; name: string }>;
		error?: string;
	}> {
		if (!this.accessToken) {
			return { ok: false, error: "No access token configured" };
		}
		try {
			const res = await fetch("/api/integrations/gdocs/folders", {
				headers: {
					...getAppAuthHeaders(),
					"X-GDocs-Access-Token": this.accessToken,
					"Content-Type": "application/json",
				},
			});
			const data = (await res.json()) as Record<string, unknown>;
			if (!res.ok) {
				return {
					ok: false,
					error: (data.error as string) ?? "Failed to list folders",
				};
			}
			const folders = Array.isArray(
				(data as { folders?: Array<{ id: string; name: string }> }).folders,
			)
				? (data as { folders?: Array<{ id: string; name: string }> }).folders
				: [];
			return { ok: true, folders };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Network error",
			};
		}
	}

	async exportCards(
		cards: Array<Record<string, unknown>>,
	): Promise<{ ok: boolean; url?: string; error?: string }> {
		if (!this.accessToken) {
			return { ok: false, error: "No access token configured" };
		}
		try {
			const res = await fetch("/api/integrations/gdocs/exportCards", {
				method: "POST",
				headers: {
					...getAppAuthHeaders(),
					"X-GDocs-Access-Token": this.accessToken,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					cards,
					folderId: this.folderId || undefined,
				}),
			});
			const data = (await res.json()) as Record<string, unknown>;
			if (!res.ok) {
				return {
					ok: false,
					error: (data.error as string) ?? "Failed to export cards",
				};
			}
			return { ok: true, url: data.url as string | undefined };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Network error",
			};
		}
	}

	async syncSession(
		documentId: string,
		session: Record<string, unknown>,
	): Promise<{ ok: boolean; url?: string; error?: string }> {
		if (!this.accessToken) {
			return { ok: false, error: "No access token configured" };
		}
		const requests = this._sessionToRequests(session);
		try {
			const res = await fetch(`${GDOCS_API}/${documentId}:batchUpdate`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ requests }),
			});
			const data = (await res.json()) as Record<string, unknown>;
			if (!res.ok) {
				return { ok: false, error: (data.error as string) ?? "Sync failed" };
			}
			return {
				ok: true,
				url: `https://docs.google.com/document/d/${documentId}/edit`,
			};
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Network error",
			};
		}
	}

	_sessionToRequests(
		session: Record<string, unknown>,
	): Array<Record<string, unknown>> {
		const requests: Array<Record<string, unknown>> = [];
		const responses = Array.isArray(session.responses)
			? (session.responses as Array<Record<string, unknown>>)
			: [];
		const intent = (session.intent as Record<string, unknown>) ?? {};

		const header = `GOVERNMINDZ Session\nPrompt: ${session.prompt ?? ""}\nIntent: ${intent.intent ?? "unknown"} (${intent.confidence ?? 0})\n\n`;
		requests.push({ insertText: { endOfSegmentLocation: {}, text: header } });

		for (const r of responses) {
			const line = `[${r.agentName ?? "Agent"}] (${r.latencyMs ?? 0}ms)\n${r.content ?? ""}\n\n`;
			requests.push({ insertText: { endOfSegmentLocation: {}, text: line } });
		}

		return requests;
	}
}
