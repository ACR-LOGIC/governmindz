
import { MeterlessProvider } from "../providers/MeterlessProvider.js";

/**
 * aiClient — Meterless-backed text generation for the ADK agents.
 *
 * The baseline used a Vercel AI SDK stub. That dependency is still not
 * installed; Meterless exposes an OpenAI-compatible /v1 surface, so this
 * client talks to the local runtime directly.
 */
export const aiProvider: unknown = undefined;

export async function generateWithVercelAI(options: {
	model?: string;
	system?: string;
	prompt: string;
	temperature?: number;
	maxTokens?: number;
}): Promise<{
	text: string;
	usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}> {
	const provider = new MeterlessProvider({ model: options.model });
	const messages: Array<{ role: string; content: string }> = [];
	if (options.system?.trim()) {
		messages.push({ role: "system", content: options.system });
	}
	messages.push({ role: "user", content: options.prompt });

	const response = await provider.chat(messages, {
		temperature: options.temperature,
		max_tokens: options.maxTokens,
	});

	return {
		text: response.content,
		usage: {
			inputTokens: response.usage.promptTokens ?? 0,
			outputTokens: response.usage.completionTokens ?? 0,
			totalTokens: response.usage.totalTokens ?? 0,
		},
	};
}
