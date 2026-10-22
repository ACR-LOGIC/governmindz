// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor

import type {
	IProvider,
	ProviderRequestOptions,
} from "../interfaces/IProvider";
import type { ProviderResponse } from "../types";
import { MeterlessProvider } from "./MeterlessProvider.js";
import { ProviderInterface } from "./ProviderInterface.js";

export { ProviderInterface } from "./ProviderInterface";

function resolveApiBaseUrl(baseUrl?: string): string {
	const configured =
		baseUrl ||
		(typeof import.meta !== "undefined" &&
			(import.meta as { env?: { VITE_API_BASE_URL?: string } }).env
				?.VITE_API_BASE_URL) ||
		(typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
		(typeof process !== "undefined" && process.env?.API_BASE_URL) ||
		"";

	const normalized = String(configured).trim();
	if (!normalized) {
		return "http://localhost:3001";
	}
	return normalized.replace(/\/+$/, "");
}

async function gatewayChatRequest(payload: {
	provider: string;
	model: string;
	messages: any[];
	baseUrl?: string;
	options?: Record<string, any>;
}): Promise<ProviderResponse> {
	const timeoutMs = Number(payload.options?.timeoutMs || 20000);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(
			`${resolveApiBaseUrl(payload.baseUrl)}/api/providers/chat`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(payload.options?.runId
						? { "x-run-id": payload.options.runId }
						: {}),
				},
				body: JSON.stringify({
					provider: payload.provider,
					model: payload.model,
					messages: payload.messages,
					options: {
						...(payload.options || {}),
						model: payload.model,
						timeoutMs,
					},
					seatIndex: payload.options?.seatIndex,
					runId: payload.options?.runId,
				}),
				signal: controller.signal,
			},
		);

		const data = await response.json();
		if (!response.ok) {
			const code = data?.errorCode || "PROVIDER_GATEWAY_ERROR";
			const message = data?.message || "Provider gateway request failed";
			const error = new Error(`[${code}] ${message}`);
			(error as any).retryable = Boolean(data?.retryable);
			throw error;
		}

		return {
			id: data.id,
			content: data.content,
			usage: {
				promptTokens: data.usage?.promptTokens || data.usage?.prompt_tokens,
				completionTokens:
					data.usage?.completionTokens || data.usage?.completion_tokens,
				totalTokens: data.usage?.totalTokens || data.usage?.total_tokens || 0,
			},
			provider: data.provider,
			model: data.model,
			latencyMs: data.latencyMs,
		} as ProviderResponse;
	} catch (error: any) {
		if (error?.name === "AbortError") {
			throw new Error("[PROVIDER_TIMEOUT] Gateway request timed out");
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * ProviderFactory - provider abstraction with the Meterless Runtime adapter.
 *
 * The legacy multi-provider classes (GenkitProvider, GoogleVertexProvider and
 * the failover/router/key-router chain) were intentionally excluded from this
 * baseline. This factory resolves the base ProviderInterface plus
 * MeterlessProvider. Unknown provider types fall back to ProviderInterface
 * directly rather than pulling in removed adapters.
 */
export class ProviderFactory {
	static create(
		config:
			| {
					type?: string;
					apiKey?: string;
					model?: string;
					baseUrl?: string;
					appId?: string;
					stateDir?: string;
					useDirectSdk?: boolean;
			  }
			| string = {},
	): IProvider {
		const cfg = typeof config === "string" ? { type: config } : config;
		const type = String(cfg.type || "").toLowerCase();

		switch (type) {
			case "meterless": {
				return new MeterlessProvider({
					apiKey: cfg.apiKey,
					model: cfg.model,
					baseUrl: cfg.baseUrl,
					appId: cfg.appId,
					stateDir: cfg.stateDir,
				});
			}
			default:
				if (type && type !== "") {
					console.warn(
						`[ProviderFactory] Provider "${type}" is not available in baseline; falling back to base ProviderInterface.`,
					);
				}
				return new ProviderInterface({
					apiKey: cfg.apiKey,
					model: cfg.model,
					baseUrl: cfg.baseUrl,
				});
		}
	}

	static getSupportedTypes(): string[] {
		return ["base", "meterless"];
	}

	static getProviderMetadata(): Array<{ id: string; name: string }> {
		return [
			{
				id: ProviderInterface.providerId,
				name: ProviderInterface.providerName,
			},
			{
				id: MeterlessProvider.providerId,
				name: MeterlessProvider.providerName,
			},
		];
	}
}
