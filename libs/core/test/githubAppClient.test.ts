// GovernMindz GitHub App client tests.
//
// Verifies the GitHub App installation flow referenced by the connector
// contract at src/connectors/github/github-connector.ts:
//
//   - JWT signing (RS256) for app authentication
//   - install-url generation with a single-use state nonce
//   - installation access token exchange
//   - repository enumeration from an installation

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import {
	GitHubAppClient,
	loadGitHubAppConfigFromEnv,
	type GitHubAppConfig,
} from "../src/integrations/githubAppClient.js";

function b64urlDecode(input: string): string {
	return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
		"utf8",
	);
}

function decodeJwt(jwt: string): { header: any; payload: any; signature: string } {
	const [headerB64, payloadB64, signature] = jwt.split(".");
	return {
		header: JSON.parse(b64urlDecode(headerB64)),
		payload: JSON.parse(b64urlDecode(payloadB64)),
		signature,
	};
}

function makeClient(
	config: Partial<GitHubAppConfig> = {},
	fetchImpl?: typeof fetch,
) {
	const cfg: GitHubAppConfig = {
		appId: "123456",
		clientId: "Iv1.abcdef1234567890",
		slug: "governmindz-app",
		privateKey: "",
		...config,
	};
	return new GitHubAppClient(cfg, fetchImpl);
}

function mockFetch(handler: (req: Request) => Response | Promise<Response>) {
	const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
		const req = new Request(input as string, init);
		fn.lastRequest = req;
		return handler(req);
	}) as typeof fetch & { lastRequest: Request | null };
	fn.lastRequest = null;
	return fn;
}

const appKey = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	publicKeyEncoding: { type: "spki", format: "pem" },
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("GitHubAppClient", () => {
	test("signs an RS256 JWT with the expected claims", async () => {
		const fetchImpl = mockFetch(() => {
			return new Response(JSON.stringify({ id: 1, slug: "a", name: "A" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});
		const client = makeClient(
			{
				appId: "123456",
				clientId: "Iv1.abcdef",
				slug: "governmindz-app",
				privateKey: appKey.privateKey as string,
			},
			fetchImpl,
		);
		await client.validateApp();
		assert.ok(fetchImpl.lastRequest, "expect a fetch call to have been made");
		const auth = fetchImpl.lastRequest!.headers.get("authorization");
		assert.ok(auth?.startsWith("Bearer "), "Authorization header is a Bearer JWT");
		const jwt = auth!.slice("Bearer ".length);
		const parts = jwt.split(".");
		assert.equal(parts.length, 3, "JWT must have header.payload.signature");
		const { header, payload } = decodeJwt(jwt);
		assert.equal(header.alg, "RS256");
		assert.equal(header.typ, "JWT");
		assert.equal(payload.iss, "Iv1.abcdef");
		assert.ok(payload.iat, "iat must be set");
		assert.ok(payload.exp, "exp must be set");
		assert.ok(payload.exp > payload.iat, "exp must be after iat");
		assert.ok(
			payload.exp - payload.iat <= 660,
			"JWT must live <= 11 minutes (iat 60s in past, exp <= 10min future)",
		);
	});

	test("beginAuthorization returns the GitHub install URL with state", async () => {
		const client = makeClient({ slug: "governmindz-app" });
		const { authorizationUrl, state, expiresAt } = client.beginAuthorization();
		assert.ok(
			authorizationUrl.startsWith(
				"https://github.com/apps/governmindz-app/installations/new?state=",
			),
		);
		assert.equal(state.length, 32, "state nonce is 16 bytes hex");
		assert.ok(expiresAt, "expiresAt is set");
	});

	test("state nonce is single-use", async () => {
		const client = makeClient({ slug: "governmindz-app" });
		const { state } = client.beginAuthorization();
		assert.equal(client["consumeState"](state), true, "first use succeeds");
		assert.equal(client["consumeState"](state), false, "second use is rejected");
		assert.equal(
			client["consumeState"]("unknown-state"),
			false,
			"unknown state rejected",
		);
	});

	test("exchangeInstallationToken POSTs a JWT and returns the token", async () => {
		const fetchImpl = mockFetch(() => {
			return new Response(
				JSON.stringify({
					token: "v1.1f2d3e4f",
					expires_at: "2099-01-01T00:00:00Z",
					permissions: { contents: "read" },
					repository_selection: "selected",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		});
		const client = makeClient(
			{
				appId: "123456",
				clientId: "Iv1.abcdef",
				slug: "governmindz-app",
				privateKey: appKey.privateKey as string,
			},
			fetchImpl,
		);
		const token = await client.exchangeInstallationToken(777);
		assert.equal(token.token, "v1.1f2d3e4f");
		assert.equal(fetchImpl.lastRequest!.method, "POST");
		assert.ok(
			fetchImpl.lastRequest!.url.endsWith(
				"/app/installations/777/access_tokens",
			),
			"hits the installation token endpoint",
		);
		assert.ok(
			fetchImpl.lastRequest!
				.headers.get("authorization")
			?.startsWith("Bearer "),
			"authorizes with a Bearer JWT",
		);
		const authHeader = fetchImpl.lastRequest!.headers.get("authorization")!;
		const jwt = authHeader.slice("Bearer ".length);
		assert.equal(decodeJwt(jwt).payload.iss, "Iv1.abcdef");
		assert.equal(decodeJwt(jwt).payload.iss, "Iv1.abcdef");
	});

	test("listInstallationRepositories maps repo refs", async () => {
		const fetchImpl = mockFetch(() => {
			return new Response(
				JSON.stringify({
					total_count: 2,
					repository_selection: "selected",
					repositories: [
						{
							id: 111,
							node_id: "R_111",
							name: "repo-one",
							full_name: "acme/repo-one",
							owner: { login: "acme" },
							default_branch: "main",
							private: true,
							visibility: "private",
							archived: false,
							disabled: false,
							fork: false,
							html_url: "https://github.com/acme/repo-one",
							url: "https://api.github.com/repos/acme/repo-one",
							pushed_at: "2024-01-01T00:00:00Z",
							updated_at: "2024-01-02T00:00:00Z",
						},
						{
							id: 222,
							node_id: "R_222",
							name: "repo-two",
							full_name: "acme/repo-two",
							owner: { login: "acme" },
							default_branch: "master",
							private: false,
							visibility: "public",
							archived: false,
							disabled: false,
							fork: true,
							html_url: "https://github.com/acme/repo-two",
							pushed_at: "2024-02-01T00:00:00Z",
							updated_at: "2024-02-02T00:00:00Z",
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		});
		const client = makeClient(
			{
				appId: "123456",
				clientId: "Iv1.abcdef",
				slug: "governmindz-app",
				privateKey: appKey.privateKey as string,
				installationId: "9",
			},
			fetchImpl,
		);
		const result = await client.listInstallationRepositories("token-123");
		assert.equal(result.totalCount, 2);
		assert.equal(result.repositorySelection, "selected");
		assert.equal(result.repositories.length, 2);
		const [r1, r2] = result.repositories;
		assert.equal(r1.id, 111);
		assert.equal(r1.fullName, "acme/repo-one");
		assert.equal(r1.visibility, "private");
		assert.equal(r1.archived, false);
		assert.equal(r2.id, 222);
		assert.equal(r2.visibility, "public");
		assert.equal(r2.fork, true);
	});

	test("getInstallation returns the connected account", async () => {
		const fetchImpl = mockFetch(() => {
			return new Response(
				JSON.stringify({
					id: 9,
					account: {
						id: 42,
						login: "acme",
						type: "Organization",
						avatar_url: "https://a.com/a.png",
						html_url: "https://github.com/acme",
					},
					repository_selection: "selected",
					permissions: { contents: "read" },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		});
		const client = makeClient(
			{
				appId: "123456",
				clientId: "Iv1.abcdef",
				slug: "governmindz-app",
				privateKey: appKey.privateKey as string,
				installationId: "9",
			},
			fetchImpl,
		);
		const account = await client.getInstallation("token-123");
		assert.equal(account.installationId, 9);
		assert.equal(account.account.login, "acme");
		assert.equal(account.account.type, "Organization");
		assert.equal(account.repositorySelection, "selected");
	});

	test("loadGitHubAppConfigFromEnv reads process.env", () => {
		const prev = {
			appId: process.env.GITHUB_APP_ID,
			clientId: process.env.GITHUB_APP_CLIENT_ID,
			slug: process.env.GITHUB_APP_SLUG,
			privateKeyB64: process.env.GITHUB_APP_PRIVATE_KEY_B64,
			installationId: process.env.GITHUB_INSTALLATION_ID,
		};
		process.env.GITHUB_APP_ID = "1";
		process.env.GITHUB_APP_CLIENT_ID = "Iv1.x";
		process.env.GITHUB_APP_SLUG = "s";
		process.env.GITHUB_APP_PRIVATE_KEY_B64 = Buffer.from(
			"fake-private-key-content",
			"utf8",
		).toString("base64");
		process.env.GITHUB_INSTALLATION_ID = "9";
		try {
			const cfg = loadGitHubAppConfigFromEnv();
			assert.equal(cfg.appId, "1");
			assert.equal(cfg.clientId, "Iv1.x");
			assert.equal(cfg.slug, "s");
			assert.equal(cfg.installationId, "9");
			assert.ok(cfg.privateKey, "private key is decoded from base64");
		} finally {
			for (const k of [
				"GITHUB_APP_ID",
				"GITHUB_APP_CLIENT_ID",
				"GITHUB_APP_SLUG",
				"GITHUB_APP_PRIVATE_KEY_B64",
				"GITHUB_INSTALLATION_ID",
			]) {
				if (prev[k] === undefined) delete process.env[k];
				else process.env[k] = prev[k];
			}
		}
	});

	test("client reports not installed when no installation id", async () => {
		const client = makeClient({
			appId: "123456",
			clientId: "Iv1.x",
			slug: "s",
			privateKey: appKey.privateKey as string,
		});
		await assert.rejects(() => client.installationToken(), /not installed/);
	});
});
