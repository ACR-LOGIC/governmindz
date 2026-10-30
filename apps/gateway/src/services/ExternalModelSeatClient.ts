/**
 * ExternalModelSeatClient
 *
 * Adapts external AI provider APIs (OpenAI, Anthropic, Google Gemini,
 * OpenRouter, custom) to the ILLMClient interface used by AgentSeat in the
 * GovernMindz debate loop. External models participate as full debate seats
 * — they propose, respond, challenge, and synthesize — but remain subject to
 * the same supervisor governance and evidence requirements as internal seats.
 *
 * Provider API formats:
 *   OpenAI:        POST {endpoint}/v1/chat/completions  (OpenAI-compatible)
 *   OpenRouter:    POST {endpoint}/api/v1/chat/completions (OpenAI-compatible)
 *   Anthropic:     POST {endpoint}/v1/messages
 *   Google Gemini: POST {endpoint}/v1beta/models/{model}:generateContent
 *   Custom:        POST {endpoint}/v1/chat/completions (OpenAI-compatible by default)
 */

import type { ILLMClient, LLMResult } from "@governmindz/core/debate/AgentSeat";

export type ExternalProviderType =
	| "openai"
	| "anthropic"
	| "google"
	| "openrouter"
	| "custom";

export interface ExternalModelSeatClientConfig {
	providerType: ExternalProviderType;
	endpoint: string;
	apiKey: string;
	model: string;
	temperature?: number;
	maxTokens?: number;
}

export class ExternalModelSeatClient implements ILLMClient {
	private readonly providerType: ExternalProviderType;
	private readonly endpoint: string;
	private readonly apiKey: string;
	private readonly model: string;
	private readonly temperature: number;
	private readonly maxTokens: number;

	constructor(config: ExternalModelSeatClientConfig) {
		this.providerType = config.providerType;
		this.endpoint = config.endpoint.replace(/\/$/, "");
		this.apiKey = config.apiKey;
		this.model = config.model;
		this.temperature = config.temperature ?? 0.4;
		this.maxTokens = config.maxTokens ?? 2048;
	}

	async complete(system: string, prompt: string): Promise<LLMResult> {
		switch (this.providerType) {
			case "openai":
			case "openrouter":
			case "custom":
				return this.callOpenAICompatible(system, prompt);
			case "anthropic":
				return this.callAnthropic(system, prompt);
			case "google":
				return this.callGoogleGemini(system, prompt);
			default:
				return this.callOpenAICompatible(system, prompt);
		}
	}

	private async callOpenAICompatible(
		system: string,
		prompt: string,
	): Promise<LLMResult> {
		const resp = await fetch(`${this.endpoint}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: prompt },
				],
				temperature: this.temperature,
				max_tokens: this.maxTokens,
				response_format: { type: "json_object" },
			}),
		});

		if (!resp.ok) {
			const errorText = await resp.text().catch(() => "");
			throw new Error(
				`${this.providerType} API error (${resp.status}): ${errorText}`,
			);
		}

		const data = (await resp.json()) as any;
		const content =
			data.choices?.[0]?.message?.content ??
			data.choices?.[0]?.text ??
			"";

		return {
			content,
			confidence: 0.7,
		};
	}

	private async callAnthropic(system: string, prompt: string): Promise<LLMResult> {
		const resp = await fetch(`${this.endpoint}/v1/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: this.model,
				max_tokens: this.maxTokens,
				temperature: this.temperature,
				system,
				messages: [
					{ role: "user", content: prompt },
				],
			}),
		});

		if (!resp.ok) {
			const errorText = await resp.text().catch(() => "");
			throw new Error(
				`Anthropic API error (${resp.status}): ${errorText}`,
			);
		}

		const data = (await resp.json()) as any;
		const content =
			data.content?.[0]?.text ?? "";

		return {
			content,
			confidence: 0.7,
		};
	}

	private async callGoogleGemini(
		system: string,
		prompt: string,
	): Promise<LLMResult> {
		// Gemini uses a generateContent endpoint with the model in the URL
		const modelName = this.model.includes("/")
			? this.model.split("/").pop() ?? this.model
			: this.model;
		const resp = await fetch(
			`${this.endpoint}/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					system_instruction: {
						parts: [{ text: system }],
					},
					contents: [
						{
							parts: [{ text: prompt }],
						},
					],
					generationConfig: {
						temperature: this.temperature,
						maxOutputTokens: this.maxTokens,
					},
				}),
			},
		);

		if (!resp.ok) {
			const errorText = await resp.text().catch(() => "");
			throw new Error(
				`Google Gemini API error (${resp.status}): ${errorText}`,
			);
		}

		const data = (await resp.json()) as any;
		const content =
			data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

		return {
			content,
			confidence: 0.7,
		};
	}
}
