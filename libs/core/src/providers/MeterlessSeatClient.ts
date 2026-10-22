
import type { ILLMClient, LLMResult } from "../debate/AgentSeat.js";
import { MeterlessProvider } from "./MeterlessProvider.js";

/**
 * Adapts MeterlessProvider to the DebateLoop seat contract. AgentSeat asks
 * for JSON and parses confidence_self from the response; the fallback
 * confidence here is only used when the model returns malformed JSON.
 */
export class MeterlessSeatClient implements ILLMClient {
	constructor(
		private readonly provider: MeterlessProvider = new MeterlessProvider(),
		private readonly model?: string,
	) {}

	async complete(system: string, prompt: string): Promise<LLMResult> {
		const response = await this.provider.chat(
			[
				{ role: "system", content: system },
				{ role: "user", content: prompt },
			],
			{
				model: this.model,
				temperature: 0.4,
				max_tokens: 2048,
				response_format: { type: "json_object" },
			},
		);

		return {
			content: response.content,
			confidence: 0.7,
		};
	}
}
