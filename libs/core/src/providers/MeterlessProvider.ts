
import type { ProviderRequestOptions } from "../interfaces/IProvider";
import type { ProviderResponse } from "../types";
import {
	MeterlessTokenStore,
	type MeterlessKeyValueStore,
} from "./MeterlessTokenStore.js";
import { ProviderInterface } from "./ProviderInterface.js";

export const METERLESS_DEFAULT_BASE_URL = "http://127.0.0.1:8088/v1";
export const METERLESS_DEFAULT_MODEL = "meterless/auto";
export const METERLESS_DEFAULT_TIMEOUT_MS = 180_000;
export const METERLESS_AUTO_DETECT_PORTS = [8088, 8090, 8787, 11434];
export const METERLESS_AUTO_DETECT_HOSTS = [
	"127.0.0.1",
	"localhost",
	"[::1]",
];

const PLACEHOLDER_TOKEN = "rt-local";

export type MeterlessStatusState = "online" | "unauthorized" | "offline";

export interface MeterlessStatus {
	state: MeterlessStatusState;
	baseUrl: string;
	models?: string[];
	reason?: string;
}

export class MeterlessError extends Error {
	readonly code: string;
	readonly status?: number;

	constructor(message: string, code = "METERLESS_ERROR", status?: number) {
		super(message);
		this.name = "MeterlessError";
		this.code = code;
		this.status = status;
	}
}

export interface MeterlessConfig {
	apiKey?: string;
	model?: string;
	baseUrl?: string;
	appId?: string;
	stateDir?: string;
	timeoutMs?: number;
	maxRetries?: number;
	retryBaseMs?: number;
	storage?: MeterlessKeyValueStore;
	inheritToken?: boolean;
}

export interface MeterlessConnectConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	app: string;
	healthUrl: string;
	loopback: boolean;
}

export interface MeterlessAutoDetectOptions {
	token?: string;
	ports?: number[];
	hosts?: string[];
	timeoutMs?: number;
	stateDir?: string;
}

interface MeterlessMessage {
	role: string;
	content: unknown;
}

interface MeterlessChoice {
	message?: { content?: unknown };
	text?: unknown;
	finish_reason?: string;
}

interface MeterlessCompletion {
	id?: string;
	model?: string;
	choices?: MeterlessChoice[];
	usage?: Record<string, unknown>;
	meterless?: {
		artifacts?: unknown;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

function env(name: string): string {
	return (process.env[name] ?? "").trim();
}

function displayUrl(value: string): string {
	try {
		const url = new URL(value);
		if (url.username) url.username = "<redacted>";
		if (url.password) url.password = "<redacted>";
		if (url.hash) url.hash = "#<redacted>";
		for (const key of ["k", "token", "api_key", "key"]) {
			if (url.searchParams.has(key)) url.searchParams.set(key, "<redacted>");
		}
		return url.toString();
	} catch {
		return value.replace(/#.*$/, "#<redacted>");
	}
}

function numberFromEnv(name: string, fallback: number): number {
	const parsed = Number(env(name));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Accept a bare host, a `/v1` base, or a full `/v1/chat/completions` URL and
 * return the canonical origin + `/v1` base. Never produces `/v1/v1`.
 */
export function normalizeMeterlessBaseUrl(value?: string): string {
	const raw = String(value ?? "").trim() || METERLESS_DEFAULT_BASE_URL;
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
		? raw
		: `http://${raw}`;

	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		throw new MeterlessError(
			`Invalid Meterless base URL: ${displayUrl(raw)}`,
			"METERLESS_BASE_URL_INVALID",
		);
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new MeterlessError(
			"Meterless base URL must use http or https.",
			"METERLESS_BASE_URL_INVALID",
		);
	}
	if (url.username || url.password) {
		throw new MeterlessError(
			"Meterless base URL must not contain credentials.",
			"METERLESS_BASE_URL_INVALID",
		);
	}

	return `${url.origin}/v1`;
}

export function parseConnectLink(value?: string): MeterlessConnectConfig | null {
	const raw = String(value ?? "").trim();
	if (!raw) return null;

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return null;
	if (url.username || url.password) return null;
	if (url.pathname.replace(/\/+$/, "") !== "/connect") return null;

	const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
	const key = fragment.get("k");
	if (!key) return null;

	const hostname = url.hostname.toLowerCase();
	const loopback =
		hostname === "127.0.0.1" ||
		hostname === "localhost" ||
		hostname === "[::1]" ||
		hostname === "::1";

	return {
		baseUrl: `${url.origin}/v1`,
		apiKey: key,
		model: fragment.get("m") || METERLESS_DEFAULT_MODEL,
		app: (fragment.get("n") || "").trim().toLowerCase(),
		healthUrl: `${url.origin}/healthz`,
		loopback,
	};
}

function normalizeMessages(messages: unknown): MeterlessMessage[] {
	if (typeof messages === "string") {
		return [{ role: "user", content: messages }];
	}
	if (!Array.isArray(messages)) {
		throw new MeterlessError(
			"MeterlessProvider.chat expects a string or an array of messages.",
			"METERLESS_MESSAGES_INVALID",
		);
	}

	return messages.map((message) => {
		if (typeof message === "string") {
			return { role: "user", content: message };
		}
		if (!message || typeof message !== "object") {
			throw new MeterlessError(
				"MeterlessProvider.chat received an invalid message.",
				"METERLESS_MESSAGES_INVALID",
			);
		}
		const record = message as Record<string, unknown>;
		return {
			role: typeof record.role === "string" ? record.role : "user",
			content: record.content ?? "",
		};
	});
}

/**
 * Flatten the OpenAI-compatible content shapes Meterless can return:
 * a plain string, an array of typed parts, or a scalar.
 */
export function extractMeterlessContent(
	completion: MeterlessCompletion,
): string {
	const content = completion.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;

	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (!part || typeof part !== "object") return "";
				const record = part as Record<string, unknown>;
				if (typeof record.text === "string") return record.text;
				if (typeof record.content === "string") return record.content;
				if (record.type === "image_url" || record.type === "audio") {
					return `[${String(record.type)}]`;
				}
				return "";
			})
			.filter(Boolean)
			.join("");
	}

	const fallback = completion.choices?.[0]?.text;
	if (typeof fallback === "string") return fallback;
	if (content == null) return "";
	return String(content);
}

function usageFrom(completion: MeterlessCompletion): ProviderResponse["usage"] {
	const usage = completion.usage ?? {};
	const prompt =
		usage.prompt_tokens ?? usage.input_tokens ?? usage.input ?? undefined;
	const completionTokens =
		usage.completion_tokens ?? usage.output_tokens ?? usage.output ?? undefined;
	const total =
		usage.total_tokens ??
		(typeof prompt === "number" && typeof completionTokens === "number"
			? prompt + completionTokens
			: undefined);

	return {
		promptTokens: typeof prompt === "number" ? prompt : undefined,
		completionTokens:
			typeof completionTokens === "number" ? completionTokens : undefined,
		totalTokens: typeof total === "number" ? total : 0,
	};
}

function isPlaceholderToken(token: string): boolean {
	return token.trim().toLowerCase() === PLACEHOLDER_TOKEN;
}

export class MeterlessProvider extends ProviderInterface {
	static readonly providerId = "meterless";
	static readonly providerName = "Meterless Runtime";

	appId: string;
	readonly timeoutMs: number;
	readonly stateDir: string;
	private readonly maxRetries: number;
	private readonly retryBaseMs: number;
	private readonly tokenStore: MeterlessTokenStore;

	constructor(config: MeterlessConfig = {}) {
		const stateDir = new MeterlessTokenStore({
			stateDir: config.stateDir,
			storage: config.storage,
		});
		const configuredBase = config.baseUrl?.trim();
		const rawBase = configuredBase || env("METERLESS_BASE_URL");
		const inheritToken = config.inheritToken !== false;
		const rawKey =
			config.apiKey ?? (inheritToken ? env("METERLESS_API_KEY") : "");
		const keyLink = parseConnectLink(rawKey);
		const connect =
			parseConnectLink(configuredBase) ||
			(!configuredBase
				? parseConnectLink(env("METERLESS_CONNECT_LINK")) ||
					parseConnectLink(rawBase)
				: null);
		const storedToken = inheritToken ? stateDir.getStoredToken() : "";
		const runtimeToken = inheritToken ? stateDir.readRuntimeToken() : "";
		const apiKey =
			(keyLink ? "" : rawKey.trim()) ||
			connect?.apiKey ||
			keyLink?.apiKey ||
			(inheritToken ? env("METERLESS_RUNTIME_TOKEN") : "") ||
			storedToken ||
			runtimeToken;
		const baseUrl =
			connect?.baseUrl ||
			(!configuredBase ? keyLink?.baseUrl : undefined) ||
			normalizeMeterlessBaseUrl(rawBase || stateDir.getBaseUrl() || undefined);

		super({
			apiKey,
			model:
				config.model?.trim() ||
				connect?.model ||
				keyLink?.model ||
				env("METERLESS_MODEL") ||
				env("NEMOTRON_MODEL") ||
				METERLESS_DEFAULT_MODEL,
			baseUrl,
		});
		this.appId = (
			config.appId?.trim() ||
			connect?.app ||
			keyLink?.app ||
			env("METERLESS_APP_ID") ||
			"governmindz"
		).toLowerCase();
		this.timeoutMs =
			config.timeoutMs ??
			numberFromEnv("METERLESS_TIMEOUT_MS", METERLESS_DEFAULT_TIMEOUT_MS);
		this.maxRetries =
			config.maxRetries ?? numberFromEnv("METERLESS_MAX_RETRIES", 2);
		this.retryBaseMs =
			config.retryBaseMs ?? numberFromEnv("METERLESS_RETRY_BASE_MS", 500);
		this.stateDir = stateDir.stateDir;
		this.tokenStore = stateDir;
		const linked = connect || (!configuredBase ? keyLink : null);
		if (linked?.apiKey) {
			this.rememberConnect(linked.apiKey, linked.baseUrl);
		} else if (!storedToken && runtimeToken && runtimeToken === apiKey) {
			try {
				stateDir.setToken(runtimeToken);
			} catch {}
		}
	}

	override getId(): string {
		return MeterlessProvider.providerId;
	}

	override getName(): string {
		return MeterlessProvider.providerName;
	}

	override getType(): string {
		return MeterlessProvider.providerId;
	}

	hasToken(): boolean {
		return Boolean(this.apiKey) && !isPlaceholderToken(this.apiKey);
	}

	setToken(token: string): void {
		const trimmed = token.trim();
		if (!trimmed) {
			throw new MeterlessError(
				"Meterless token is empty.",
				"METERLESS_TOKEN_MISSING",
			);
		}
		if (isPlaceholderToken(trimmed)) {
			throw new MeterlessError(
				"Meterless token is the 'rt-local' placeholder. Paste the real runtime token from the /connect link.",
				"METERLESS_TOKEN_PLACEHOLDER",
			);
		}
		this.apiKey = trimmed;
		this.tokenStore.setToken(trimmed);
	}

	applyConnectLink(link: string): MeterlessConnectConfig {
		const parsed = parseConnectLink(link);
		if (!parsed) {
			throw new MeterlessError(
				"That value is not a Meterless /connect link.",
				"METERLESS_CONNECT_LINK_INVALID",
			);
		}
		this.apiKey = parsed.apiKey;
		this.baseUrl = parsed.baseUrl;
		this.model = parsed.model;
		if (parsed.app) this.appId = parsed.app;
		this.rememberConnect(parsed.apiKey, parsed.baseUrl);
		return parsed;
	}

	private rememberConnect(token: string, baseUrl: string): void {
		try {
			this.tokenStore.setToken(token);
			this.tokenStore.setBaseUrl(baseUrl);
		} catch {
			return;
		}
	}

	override validateConfig(): boolean {
		this.assertToken();
		return Boolean(this.baseUrl && this.model && this.apiKey);
	}

	private assertToken(): void {
		if (!this.apiKey) {
			throw new MeterlessError(
				"Meterless token is not configured. Paste the runtime token into METERLESS_API_KEY (or METERLESS_RUNTIME_TOKEN) in .env.local.",
				"METERLESS_TOKEN_MISSING",
			);
		}
		if (isPlaceholderToken(this.apiKey)) {
			throw new MeterlessError(
				"Meterless token is the 'rt-local' placeholder. Paste the real runtime token from the /connect link.",
				"METERLESS_TOKEN_PLACEHOLDER",
			);
		}
	}

	private headers(
		includeAuth = true,
		scope: "user" | null = null,
	): Record<string, string> {
		const usableToken =
			includeAuth && Boolean(this.apiKey) && !isPlaceholderToken(this.apiKey);
		return {
			"Content-Type": "application/json",
			"meterless-app": this.appId,
			...(scope ? { "meterless-scope": scope } : {}),
			...(usableToken ? { Authorization: `Bearer ${this.apiKey}` } : {}),
		};
	}

	private async fetchWithTimeout(
		path: string,
		init: RequestInit,
		timeoutMs: number,
	): Promise<Response> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			return await fetch(`${this.baseUrl}${path}`, {
				...init,
				signal: controller.signal,
			});
		} catch (error) {
			if ((error as { name?: string })?.name === "AbortError") {
				throw new MeterlessError(
					`Meterless request timed out after ${timeoutMs}ms.`,
					"METERLESS_TIMEOUT",
				);
			}
			throw new MeterlessError(
				`Cannot reach Meterless at ${this.baseUrl}: ${
					error instanceof Error ? error.message : String(error)
				}`,
				"METERLESS_UNREACHABLE",
			);
		} finally {
			clearTimeout(timeout);
		}
	}

	async listModels(): Promise<string[]> {
		if (this.apiKey && isPlaceholderToken(this.apiKey)) {
			throw new MeterlessError(
				"Meterless token is the 'rt-local' placeholder. Paste the real runtime token from the /connect link.",
				"METERLESS_TOKEN_PLACEHOLDER",
			);
		}
		const response = await this.fetchWithTimeout(
			"/models",
			{ method: "GET", headers: this.headers(Boolean(this.apiKey)) },
			Math.min(this.timeoutMs, 10_000),
		);
		if (response.status === 401 || response.status === 403) {
			throw new MeterlessError(
				"Meterless rejected the token. Paste the current token from the /connect link into METERLESS_API_KEY.",
				"METERLESS_UNAUTHORIZED",
				response.status,
			);
		}
		if (!response.ok) {
			throw new MeterlessError(
				`Meterless /models returned HTTP ${response.status}.`,
				"METERLESS_MODELS_FAILED",
				response.status,
			);
		}
		const payload = (await response.json()) as {
			data?: Array<{ id?: string }>;
		};
		return (payload.data ?? [])
			.map((model) => model.id)
			.filter((id): id is string => typeof id === "string");
	}

	/**
	 * `/healthz` only proves the proxy process is up, so status is derived
	 * from `/v1/models` as required by the Meterless contract.
	 */
	async status(): Promise<MeterlessStatus> {
		const baseUrl = this.baseUrl;
		try {
			const models = await this.listModels();
			const meterlessModels = models.filter((id) =>
				id.startsWith("meterless/"),
			);
			if (meterlessModels.length === 0) {
				return {
					state: "offline",
					baseUrl,
					models,
					reason:
						"Runtime responded but exposed no meterless/* model ids.",
				};
			}
			return { state: "online", baseUrl, models };
		} catch (error) {
			if (
				error instanceof MeterlessError &&
				(error.code === "METERLESS_UNAUTHORIZED" ||
					error.code === "METERLESS_TOKEN_PLACEHOLDER")
			) {
				return {
					state: "unauthorized",
					baseUrl,
					reason:
						error.code === "METERLESS_TOKEN_PLACEHOLDER"
							? error.message
							: this.hasToken()
								? error.message
								: "No Meterless token configured. Paste the runtime token from the /connect link.",
				};
			}
			return {
				state: "offline",
				baseUrl,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async autoDetect(
		options: MeterlessAutoDetectOptions = {},
	): Promise<MeterlessStatus | null> {
		const detected = await autoDetectMeterless({
			...options,
			token: options.token ?? this.apiKey,
			stateDir: options.stateDir ?? this.stateDir,
		});
		if (!detected) return null;
		this.baseUrl = detected.baseUrl;
		try {
			this.tokenStore.setBaseUrl(detected.baseUrl);
		} catch {}
		return detected;
	}

	override async chat(
		messages: unknown,
		options: ProviderRequestOptions = {},
	): Promise<ProviderResponse> {
		this.assertToken();
		const model = options.model?.trim() || this.model || METERLESS_DEFAULT_MODEL;
		const body: Record<string, unknown> = {
			model,
			messages: normalizeMessages(messages),
			stream: false,
		};
		if (typeof options.temperature === "number") {
			body.temperature = options.temperature;
		}
		if (typeof options.max_tokens === "number") {
			body.max_tokens = options.max_tokens;
		}
		if (options.response_format) {
			body.response_format = options.response_format;
		}

		const timeoutMs = options.timeoutMs ?? this.timeoutMs;
		let lastError: MeterlessError | undefined;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			const started = Date.now();
			let response: Response;
			try {
				response = await this.fetchWithTimeout(
					"/chat/completions",
					{
						method: "POST",
						headers: this.headers(true, "user"),
						body: JSON.stringify(body),
					},
					timeoutMs,
				);
			} catch (error) {
				lastError =
					error instanceof MeterlessError
						? error
						: new MeterlessError(String(error), "METERLESS_UNREACHABLE");
				if (lastError.code === "METERLESS_TIMEOUT") throw lastError;
				if (attempt < this.maxRetries) {
					await this.sleep(attempt);
					continue;
				}
				throw lastError;
			}

			const bodyText = await response.text();
			let payload: MeterlessCompletion | null = null;
			try {
				payload = bodyText
					? (JSON.parse(bodyText) as MeterlessCompletion)
					: null;
			} catch {
				payload = null;
			}

			if (response.status === 401 || response.status === 403) {
				throw new MeterlessError(
					"Meterless rejected the token. Paste the current token from the /connect link into METERLESS_API_KEY.",
					"METERLESS_UNAUTHORIZED",
					response.status,
				);
			}

			if (response.status === 404) {
				throw new MeterlessError(
					`Meterless returned 404 at ${this.baseUrl}/chat/completions. Check that the base URL ends at /v1 and the runtime is current.`,
					"METERLESS_NOT_FOUND",
					404,
				);
			}

			if (response.status === 429 || response.status >= 500) {
				lastError = new MeterlessError(
					`Meterless returned HTTP ${response.status}.`,
					"METERLESS_RETRYABLE",
					response.status,
				);
				if (attempt < this.maxRetries) {
					await this.sleep(attempt);
					continue;
				}
				throw lastError;
			}

			if (!response.ok) {
				const detail = this.redact(bodyText.replace(/\s+/g, " ").slice(0, 400));
				throw new MeterlessError(
					`Meterless HTTP ${response.status}: ${detail || response.statusText}`,
					"METERLESS_HTTP_ERROR",
					response.status,
				);
			}

			if (!payload) {
				throw new MeterlessError(
					"Meterless returned a non-JSON response.",
					"METERLESS_RESPONSE_INVALID",
				);
			}

			return {
				id: payload.id,
				content: extractMeterlessContent(payload),
				usage: usageFrom(payload),
				provider: "meterless",
				model: payload.model ?? model,
				latencyMs: Date.now() - started,
			};
		}

		throw (
			lastError ??
			new MeterlessError("Meterless request failed.", "METERLESS_ERROR")
		);
	}

	private redact(value: string): string {
		if (!this.apiKey) return value;
		return value.split(this.apiKey).join("<redacted>");
	}

	private async sleep(attempt: number): Promise<void> {
		const delay = Math.min(this.retryBaseMs * 2 ** attempt, 8_000);
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}

export async function autoDetectMeterless(
	options: MeterlessAutoDetectOptions = {},
): Promise<MeterlessStatus | null> {
	const ports = options.ports ?? METERLESS_AUTO_DETECT_PORTS;
	const hosts = options.hosts ?? METERLESS_AUTO_DETECT_HOSTS;
	const scanToken =
		options.token && !isPlaceholderToken(options.token)
			? options.token
			: undefined;
	for (const host of hosts) {
		for (const port of ports) {
			const provider = new MeterlessProvider({
				apiKey: scanToken,
				baseUrl: `http://${host}:${port}/v1`,
				stateDir: options.stateDir,
				timeoutMs: options.timeoutMs ?? 2_500,
				maxRetries: 0,
				inheritToken: false,
			});
			const status = await provider.status();
			if (status.state === "online" || status.state === "unauthorized") {
				return status;
			}
		}
	}
	return null;
}
