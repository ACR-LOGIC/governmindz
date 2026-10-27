
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	autoDetectMeterless,
	extractMeterlessContent,
	MeterlessProvider,
	normalizeMeterlessBaseUrl,
	parseConnectLink,
} from "../src/providers/MeterlessProvider.js";
import { ProviderFactory } from "../src/providers/ProviderFactory.js";
import {
	METERLESS_TOKEN_KEY,
	MeterlessTokenStore,
	resolveMeterlessRuntimeDirs,
} from "../src/providers/MeterlessTokenStore.js";

async function withServer(
	handler: (req: any, res: any) => void,
	run: (baseUrl: string) => Promise<void>,
): Promise<void> {
	const server = createServer(handler);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	try {
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

test("normalizes bare hosts, /v1 bases, and full chat URLs", () => {
	const expected = "http://127.0.0.1:8088/v1";
	for (const input of [
		"http://127.0.0.1:8088",
		"http://127.0.0.1:8088/",
		"http://127.0.0.1:8088/v1",
		"http://127.0.0.1:8088/v1/",
		"http://127.0.0.1:8088/v1/chat/completions",
		"http://127.0.0.1:8088/v1/models",
		"127.0.0.1:8088/v1",
	]) {
		assert.equal(normalizeMeterlessBaseUrl(input), expected, input);
	}
	assert.equal(
		normalizeMeterlessBaseUrl("https://meterless.example/connect#k=secret"),
		"https://meterless.example/v1",
	);
	assert.throws(() => normalizeMeterlessBaseUrl("ftp://127.0.0.1:8088/v1"));
});

test("parses connect links and rejects other URLs", () => {
	assert.deepEqual(
		parseConnectLink("http://127.0.0.1:8088/connect#k=secret"),
		{
			baseUrl: "http://127.0.0.1:8088/v1",
			apiKey: "secret",
			model: "meterless/auto",
			app: "",
			healthUrl: "http://127.0.0.1:8088/healthz",
			loopback: true,
		},
	);
	assert.equal(
		parseConnectLink("https://meterless.example/connect/#k=a%2Bb&m=meterless/deep&n=my-app")
			?.apiKey,
		"a+b",
	);
	assert.equal(
		parseConnectLink("https://meterless.example/connect#k=key&m=meterless/fast&n=app")
			?.model,
		"meterless/fast",
	);
	assert.equal(
		parseConnectLink("https://meterless.example/connect#k=key&m=meterless/fast&n=app")
			?.app,
		"app",
	);
	assert.equal(parseConnectLink("http://127.0.0.1:8088/v1"), null);
	assert.equal(parseConnectLink("http://127.0.0.1:8088/connect"), null);
	assert.equal(parseConnectLink("http://127.0.0.1:8088/other#k=secret"), null);
});

test("reads proxy-token and stores the runtime token under the contract key", () => {
	const stateDir = join(tmpdir(), `meterless-test-${randomUUID()}`);
	mkdirSync(stateDir, { recursive: true });
	writeFileSync(join(stateDir, "proxy-token"), "runtime-file-token\n", "utf8");

	const store = new MeterlessTokenStore({ stateDir });
	assert.equal(store.getToken(), "runtime-file-token");

	store.setToken("typed-token");
	const saved = JSON.parse(
		readFileSync(store.storagePath, "utf8"),
	) as Record<string, string>;
	assert.equal(saved[METERLESS_TOKEN_KEY], "typed-token");
	assert.equal(store.getToken(), "typed-token");
	assert.equal(
		new MeterlessProvider({ stateDir }).apiKey,
		"typed-token",
	);

	const runtimeOnlyDir = join(tmpdir(), `meterless-test-${randomUUID()}`);
	mkdirSync(runtimeOnlyDir, { recursive: true });
	writeFileSync(
		join(runtimeOnlyDir, "proxy-token"),
		"imported-runtime-token",
		"utf8",
	);
	assert.equal(
		new MeterlessProvider({ stateDir: runtimeOnlyDir }).apiKey,
		"imported-runtime-token",
	);
	const imported = JSON.parse(
		readFileSync(
			join(runtimeOnlyDir, "meterless-provider.json"),
			"utf8",
		),
	) as Record<string, string>;
	assert.equal(imported[METERLESS_TOKEN_KEY], "imported-runtime-token");
	rmSync(stateDir, { recursive: true, force: true });
	rmSync(runtimeOnlyDir, { recursive: true, force: true });
});

test("discovers Nightshift proxy-token locations, preferring an explicit state dir", () => {
	const explicit = join(tmpdir(), `meterless-explicit-${randomUUID()}`);
	const dirs = resolveMeterlessRuntimeDirs(explicit);
	assert.ok(dirs.length > 0);
	assert.equal(dirs[0], explicit);

	const joined = dirs.join("\n").toLowerCase();
	switch (process.platform) {
		case "win32":
			assert.match(joined, /ai\.meterless\.runtime/);
			break;
		case "darwin":
			assert.match(joined, /ai\.meterless\.runtime/);
			break;
		default:
			assert.match(joined, /\/var\/lib\/meterless/);
			break;
	}
});

test("flattens string, typed-part, and fallback content", () => {
	assert.equal(
		extractMeterlessContent({ choices: [{ message: { content: "plain" } }] }),
		"plain",
	);
	assert.equal(
		extractMeterlessContent({
			choices: [
				{
					message: {
						content: [
							{ type: "text", text: "one " },
							{ type: "text", text: "two" },
						],
					},
				},
			],
		}),
		"one two",
	);
	assert.equal(
		extractMeterlessContent({ choices: [{ text: "legacy" }] }),
		"legacy",
	);
});

test("chat sends contract headers and parses usage", async () => {
	let captured: {
		url?: string;
		headers?: Record<string, unknown>;
		body?: any;
	} = {};

	await withServer(
		(req, res) => {
			captured.url = req.url;
			captured.headers = req.headers;
			let body = "";
			req.on("data", (chunk: any) => {
				body += String(chunk);
			});
			req.on("end", () => {
				captured.body = JSON.parse(body);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						id: "cmpl_1",
						model: "meterless/auto",
						choices: [{ message: { content: "hello back" } }],
						usage: {
							prompt_tokens: 3,
							completion_tokens: 4,
							total_tokens: 7,
						},
					}),
				);
			});
		},
		async (baseUrl) => {
			const provider = new MeterlessProvider({
				apiKey: "test-token",
				baseUrl: `${baseUrl}/v1/chat/completions`,
				model: "meterless/auto",
				appId: "governmindz",
				maxRetries: 0,
			});
			const response = await provider.chat("hello", {
				max_tokens: 2048,
				response_format: { type: "json_object" },
			});

			assert.equal(response.content, "hello back");
			assert.equal(response.provider, "meterless");
			assert.equal(response.usage.totalTokens, 7);
			assert.equal(provider.getId(), "meterless");
			assert.equal(provider.getName(), "Meterless Runtime");
		},
	);

	assert.equal(captured.url, "/v1/chat/completions");
	assert.equal(captured.headers?.authorization, "Bearer test-token");
	assert.equal(captured.headers?.["meterless-app"], "governmindz");
	assert.equal(captured.headers?.["meterless-scope"], "user");
	assert.equal(captured.body.model, "meterless/auto");
	assert.deepEqual(captured.body.messages, [
		{ role: "user", content: "hello" },
	]);
	assert.deepEqual(captured.body.response_format, {
		type: "json_object",
	});
	assert.equal(captured.body.max_tokens, 2048);
});

test("rejects the rt-local placeholder before sending", async () => {
	const provider = new MeterlessProvider({
		apiKey: "rt-local",
		baseUrl: "http://127.0.0.1:1/v1",
	});
	await assert.rejects(() => provider.chat("hello"), /placeholder/);
	const status = await provider.status();
	assert.equal(status.state, "unauthorized");
	assert.match(status.reason ?? "", /placeholder/);
});

test("maps 401 to a clear unauthorized error", async () => {
	await withServer(
		(_req, res) => {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "unauthorized" }));
		},
		async (baseUrl) => {
			const provider = new MeterlessProvider({
				apiKey: "bad-token",
				baseUrl,
				maxRetries: 0,
			});
			await assert.rejects(() => provider.chat("hello"), /rejected the token/);
		},
	);
});

test("retries a 500 once and then succeeds", async () => {
	let calls = 0;
	await withServer(
		(_req, res) => {
			calls += 1;
			res.writeHead(calls === 1 ? 500 : 200, {
				"Content-Type": "application/json",
			});
			res.end(
				JSON.stringify({
					choices: [{ message: { content: calls === 1 ? "error" : "ok" } }],
				}),
			);
		},
		async (baseUrl) => {
			const provider = new MeterlessProvider({
				apiKey: "test-token",
				baseUrl,
				maxRetries: 1,
				retryBaseMs: 1,
			});
			const response = await provider.chat("hello");
			assert.equal(response.content, "ok");
		},
	);
	assert.equal(calls, 2);
});

test("status reports online only when meterless model ids are present", async () => {
	await withServer(
		(req, res) => {
			assert.equal(req.url, "/v1/models");
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					data: [{ id: "meterless/auto" }, { id: "meterless/fast" }],
				}),
			);
		},
		async (baseUrl) => {
			const provider = new MeterlessProvider({
				apiKey: "test-token",
				baseUrl,
			});
			const status = await provider.status();
			assert.equal(status.state, "online");
			assert.deepEqual(status.models, ["meterless/auto", "meterless/fast"]);
		},
	);
});

test("a wrong token reports unauthorized, not offline", async () => {
	await withServer(
		(_req, res) => {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "unauthorized" }));
		},
		async (baseUrl) => {
			const provider = new MeterlessProvider({
				apiKey: "bad-token",
				baseUrl,
			});
			const status = await provider.status();
			assert.equal(status.state, "unauthorized");
		},
	);
});

test("auto detect returns the first online or unauthorized runtime", async () => {
	await withServer(
		(req, res) => {
			assert.equal(req.url, "/v1/models");
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ data: [{ id: "meterless/auto" }] }));
		},
		async (baseUrl) => {
			const port = Number(new URL(baseUrl).port);
			const status = await autoDetectMeterless({
				token: "test-token",
				hosts: ["127.0.0.1"],
				ports: [port],
			});
			assert.equal(status?.state, "online");
			assert.equal(status?.baseUrl, `${baseUrl}/v1`);
		},
	);
});

test("inherits METERLESS_API_KEY when no explicit token is given", () => {
	const stateDir = join(tmpdir(), `meterless-test-${randomUUID()}`);
	mkdirSync(stateDir, { recursive: true });
	const previous = process.env.METERLESS_API_KEY;
	process.env.METERLESS_API_KEY = "env-token";
	try {
		assert.equal(new MeterlessProvider({ stateDir }).apiKey, "env-token");
	} finally {
		if (previous === undefined) delete process.env.METERLESS_API_KEY;
		else process.env.METERLESS_API_KEY = previous;
		rmSync(stateDir, { recursive: true, force: true });
	}
});

test("prefers METERLESS_MODEL over the legacy NEMOTRON_MODEL", () => {
	const stateDir = join(tmpdir(), `meterless-test-${randomUUID()}`);
	mkdirSync(stateDir, { recursive: true });
	const previousModel = process.env.METERLESS_MODEL;
	const previousLegacy = process.env.NEMOTRON_MODEL;
	process.env.METERLESS_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
	process.env.NEMOTRON_MODEL = "meterless/auto";
	try {
		const provider = new MeterlessProvider({
			stateDir,
			apiKey: "test-token",
		});
		assert.equal(
			provider.model,
			"nvidia/nemotron-3.5-lightning-30b-a3b",
		);
	} finally {
		if (previousModel === undefined) delete process.env.METERLESS_MODEL;
		else process.env.METERLESS_MODEL = previousModel;
		if (previousLegacy === undefined) delete process.env.NEMOTRON_MODEL;
		else process.env.NEMOTRON_MODEL = previousLegacy;
		rmSync(stateDir, { recursive: true, force: true });
	}
});

test("factory exposes the meterless provider metadata", () => {
	assert.deepEqual(
		ProviderFactory.getProviderMetadata().find(
			(provider) => provider.id === "meterless",
		),
		{ id: "meterless", name: "Meterless Runtime" },
	);
});

test("a connect link configures base URL, token, model, and app", () => {
	const values = new Map<string, string>();
	const provider = new MeterlessProvider({
		baseUrl:
			"http://127.0.0.1:8088/connect#k=secret&m=meterless/deep&n=My-App",
		storage: {
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => {
				values.set(key, value);
			},
			removeItem: (key) => {
				values.delete(key);
			},
		},
	});
	assert.equal(provider.baseUrl, "http://127.0.0.1:8088/v1");
	assert.equal(provider.apiKey, "secret");
	assert.equal(provider.model, "meterless/deep");
	assert.equal(provider.appId, "my-app");
	assert.equal(values.get("meterless_runtime_token"), "secret");
});
