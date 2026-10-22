// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor
// Copyright (c) 2026 ACR Logic.

import type {
	AgentContext,
	AgentResult,
	IAgent,
} from "../../interfaces/IAgent.js";
import type { ADKAgentConfig } from "./types.js";

/**
 * ADKAgent using Vercel AI SDK core.
 */
export class ADKAgent implements IAgent {
	constructor(protected config: ADKAgentConfig) {}

	get id() {
		return this.config.id;
	}
	get name() {
		return this.config.name;
	}

	/**
	 * Standardized execution method following ADK patterns.
	 */
	async execute(context: AgentContext): Promise<AgentResult> {
		console.log(`[ADKAgent:${this.name}] Executing task with Vercel AI SDK...`);

		const { generateWithVercelAI } = await import("../../core/aiClient.js");
		const result = await generateWithVercelAI({
			model: this.config.model,
			system: this.config.instruction,
			prompt: context.prompt,
			temperature: 0.5,
		});

		return {
			agentId: this.id,
			content: result.text,
			confidence: 1.0,
			timestamp: Date.now(),
			usage: {
				prompt_tokens: result.usage.inputTokens || 0,
				completion_tokens: result.usage.outputTokens || 0,
				total_tokens: result.usage.totalTokens || 0,
			},
		};
	}

	getSystemPrompt(): string {
		return this.config.instruction;
	}
}
