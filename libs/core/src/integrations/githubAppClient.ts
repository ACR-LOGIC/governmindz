// GovernMindz GitHub App client.
//
// Implements the GitHub App installation flow referenced by the connector
// contract at src/connectors/github/github-connector.ts:
//
//   beginAuthorization   -> returns a GitHub App installation URL with a
//                           single-use state nonce
//   completeAuthorization -> exchanges an installation_id for an installation
//                            access token via a GitHub App JWT
//   listAccessibleRepositories -> GET /installation/repositories
//
// Tokens are short-lived (1 hour) and minted on demand from the app's private
// key; GovernMindz persists only the app credentials and the installation id,
// never a long-lived access token.

import {
	createHash,
	createHmac,
	createSign,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubAppConfig {
	appId?: string;
	clientId?: string;
	slug?: string;
	privateKey?: string; // PEM
	webhookSecret?: string;
	installationId?: string;
	accountLogin?: string;
	accountType?: string;
}

export interface GitHubInstallationToken {
	token: string;
	expiresAt: string;
	permissions: Record<string, string>;
	repositorySelection: string;
}

export interface GitHubRepositoryReference {
	id: number;
	nodeId?: string;
	owner: string;
	name: string;
	description?: string;
	fullName: string;
	defaultBranch: string;
	visibility: "public" | "private" | "internal";
	archived: boolean;
	disabled: boolean;
	fork: boolean;
	htmlUrl: string;
	apiUrl?: string;
	pushedAt?: string;
	updatedAt?: string;
}

export interface GitHubConnectedAccount {
	id: string;
	installationId: number;
	account: {
		id: number;
		login: string;
		type: "User" | "Organization";
		avatarUrl?: string;
		profileUrl?: string;
	};
	repositorySelection: string;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PendingState {
	nonce: string;
	expiresAt: number;
}

export class GitHubAppClient {
	private config: GitHubAppConfig;
	private pendingStates = new Map<string, PendingState>();
	private tokenCache: {
		token: string;
		expiresAt: number;
	} | null = null;

	constructor(
		config: GitHubAppConfig,
		private fetchImpl: typeof fetch = fetch,
	) {
		this.config = config;
	}

	/* ------------------------------------------------------------------ */
	/* Authorization                                                      */
	/* ------------------------------------------------------------------ */

	beginAuthorization(): {
		authorizationUrl: string;
		state: string;
		expiresAt: string;
	} {
		const slug = this.config.slug;
		if (!slug) {
			throw new Error("GITHUB_APP_SLUG is not configured.");
		}
		const nonce = randomBytes(16).toString("hex");
		const expiresAt = Date.now() + STATE_TTL_MS;
		this.pendingStates.set(nonce, { nonce, expiresAt });
		const authorizationUrl = `https://github.com/apps/${encodeURIComponent(
			slug,
		)}/installations/new?state=${encodeURIComponent(nonce)}`;
		return { authorizationUrl, state: nonce, expiresAt: new Date(expiresAt).toISOString() };
	}

	consumeState(state: string): boolean {
		const pending = this.pendingStates.get(state);
		if (!pending) return false;
		if (Date.now() >= pending.expiresAt) {
			this.pendingStates.delete(state);
			return false;
		}
		this.pendingStates.delete(state);
		return true;
	}

	async validateApp(): Promise<{ id: number; slug: string; name: string }> {
		const jwt = this.signAppJwt(Math.floor(Date.now() / 1000));
		const response = await this.fetchImpl(`${GITHUB_API_BASE}/app`, {
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2026-03-10",
				"User-Agent": "GovernMindz",
			},
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`Failed to validate GitHub App credentials: ${response.status} ${response.statusText} ${body}`,
			);
		}
		const data = (await response.json()) as { id: number; slug: string; name: string };
		return data;
	}

	/* ------------------------------------------------------------------ */
	/* JWT + installation token                                           */
	/* ------------------------------------------------------------------ */

	/* ------------------------------------------------------------------ */
	/* JWT + installation token                                           */
	/* ------------------------------------------------------------------ */

	private base64Url(input: string): string {
		return Buffer.from(input, "utf8")
			.toString("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	}

	private signAppJwt(nowSeconds: number): string {
		const issuer = this.config.clientId ?? this.config.appId;
		if (!issuer || !this.config.privateKey) {
			throw new Error("GitHub App client id and private key are required.");
		}
		const header = this.base64Url(
			JSON.stringify({ alg: "RS256", typ: "JWT" }),
		);
		const payload = this.base64Url(
			JSON.stringify({
				iat: nowSeconds - 60,
				exp: nowSeconds + 600,
				iss: issuer,
			}),
		);
		const signingInput = `${header}.${payload}`;
		const signer = createSign("RSA-SHA256");
		signer.update(signingInput);
		const signature = this.base64Url(
			signer.sign(this.config.privateKey).toString("base64"),
		);
		return `${signingInput}.${signature}`;
	}

	async exchangeInstallationToken(
		installationId: number,
	): Promise<GitHubInstallationToken> {
		const jwt = this.signAppJwt(Math.floor(Date.now() / 1000));
		const response = await this.fetchImpl(
			`${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${jwt}`,
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2026-03-10",
					"User-Agent": "GovernMindz",
				},
			},
		);
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`Failed to mint GitHub installation token: ${response.status} ${response.statusText} ${body}`,
			);
		}
		return (await response.json()) as GitHubInstallationToken;
	}

	async installationToken(): Promise<string> {
		const now = Date.now();
		if (
			this.tokenCache &&
			this.tokenCache.expiresAt - now > 60_000 // refresh 1 minute early
		) {
			return this.tokenCache.token;
		}
		if (!this.config.installationId) {
			throw new Error(
				"GitHub App is not installed. Complete the installation flow first.",
			);
		}
		const data = await this.exchangeInstallationToken(
			Number(this.config.installationId!),
		);
		this.tokenCache = {
			token: data.token,
			expiresAt: new Date(data.expiresAt).getTime(),
		};
		return data.token;
	}

	/* ------------------------------------------------------------------ */
	/* GitHub API                                                         */
	/* ------------------------------------------------------------------ */

	private async githubRequest<T>(
		path: string,
		token: string,
	): Promise<T> {
		const response = await this.fetchImpl(`${GITHUB_API_BASE}${path}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2026-03-10",
				"User-Agent": "GovernMindz",
			},
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`GitHub API error ${response.status} ${response.statusText} for ${path}: ${body}`,
			);
		}
		return (await response.json()) as T;
	}

	async getInstallation(token: string): Promise<GitHubConnectedAccount> {
		const data = await this.githubRequest<{
			id: number;
			account: {
				id: number;
				login: string;
				type: string;
				avatar_url?: string;
				html_url?: string;
			};
			repository_selection: string;
			permissions: Record<string, string>;
		}>("/installation", token);
		return {
			id: String(data.id),
			installationId: data.id,
			account: {
				id: data.account.id,
				login: data.account.login,
				type: data.account.type as "User" | "Organization",
				avatarUrl: data.account.avatar_url,
				profileUrl: data.account.html_url,
			},
			repositorySelection: data.repository_selection,
		};
	}

	async listInstallationRepositories(token: string): Promise<{
		totalCount: number;
		repositories: GitHubRepositoryReference[];
		repositorySelection: string;
	}> {
		const data = await this.githubRequest<{
			total_count: number;
			repositories: Array<{
				id: number;
				node_id?: string;
				name: string;
				full_name: string;
				owner: { login: string };
				default_branch: string;
				private: boolean;
				visibility?: string;
				archived: boolean;
				disabled: boolean;
				fork: boolean;
				html_url: string;
				url?: string;
				pushed_at?: string;
				updated_at?: string;
			}>;
			repository_selection: string;
		}>("/installation/repositories?per_page=100", token);
		return {
			totalCount: data.total_count,
			repositorySelection: data.repository_selection,
			repositories: data.repositories.map((r) => ({
				id: r.id,
				nodeId: r.node_id,
				owner: r.owner.login,
				name: r.name,
				fullName: r.full_name,
				defaultBranch: r.default_branch || "main",
				visibility: (r.visibility ??
					(r.private ? "private" : "public")) as
					| "public"
					| "private"
					| "internal",
				archived: r.archived,
				disabled: r.disabled,
				fork: r.fork,
				htmlUrl: r.html_url,
				apiUrl: r.url,
				pushedAt: r.pushed_at,
				updatedAt: r.updated_at,
			})),
		};
	}

	async revokeInstallationToken(token: string): Promise<void> {
		const response = await this.fetchImpl(`${GITHUB_API_BASE}/installation/token`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2026-03-10",
				"User-Agent": "GovernMindz",
			},
		});
		// Revocation is best-effort: a 204/404 both mean the token is no longer usable.
		if (response.ok || response.status === 404) {
			this.tokenCache = null;
			return;
		}
		const body = await response.text().catch(() => "");
		throw new Error(
			`Failed to revoke GitHub installation token: ${response.status} ${response.statusText} ${body}`,
		);
	}

	async getRepositoryContents(
		token: string,
		owner: string,
		repo: string,
		path: string,
	): Promise<any> {
		return this.githubRequest<any>(
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
				repo,
			)}/contents/${encodeURIComponent(path)}`,
			token,
		);
	}

	async getRepositoryReadme(token: string, owner: string, repo: string) {
		try {
			return await this.githubRequest<any>(
				`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
					repo,
				)}/readme`,
				token,
			);
		} catch {
			return null;
		}
	}

	async searchCode(
		token: string,
		query: string,
	): Promise<{ total_count: number; items: Array<any> }> {
		return this.githubRequest(
			`/search/code?q=${encodeURIComponent(query)}&per_page=30`,
			token,
		);
	}

	/* ------------------------------------------------------------------ */
	/* Helpers                                                            */
	/* ------------------------------------------------------------------ */

	static validateWebhookSignature(
		rawBody: Uint8Array,
		signature256: string | undefined,
		webhookSecret: string,
	): boolean {
		if (!signature256?.startsWith("sha256=")) return false;
		const expected = `sha256=${createHmac(
			"sha256",
			webhookSecret,
		)
			.update(rawBody)
			.digest("hex")}`;
		const expectedBuffer = Buffer.from(expected, "utf8");
		const suppliedBuffer = Buffer.from(signature256, "utf8");
		if (expectedBuffer.length !== suppliedBuffer.length) return false;
		return timingSafeEqual(expectedBuffer, suppliedBuffer);
	}

	static createStateNonce(): string {
		return randomBytes(16).toString("hex");
	}
}

export function loadGitHubAppConfigFromEnv(): GitHubAppConfig {
	return {
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
}
