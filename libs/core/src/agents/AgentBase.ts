// Copyright (c) 2026 ACR Logic.

import type { AgentContext, AgentResult, IAgent } from "../interfaces/IAgent";
import { renderPromptPayloadMessages } from "../prompt-cache/PromptPayloadBuilder";
import type { ProviderPromptMessage } from "../prompt-cache/types";
import {
	getToolboxSystemPrompt,
	systemToolbox,
} from "../services/SystemToolbox";

export abstract class AgentBase implements IAgent {
	abstract id: string;
	abstract name: string;
	role?: string;

	protected readonly tools = systemToolbox;

	abstract execute(context: AgentContext): Promise<AgentResult>;

	getSystemPrompt(): string {
		const basePrompt = this.role
			? `You are ${this.name}. Your role in GOVERNMINDZ is ${this.role}.`
			: `You are ${this.name}, a GOVERNMINDZ participant.`;

		return basePrompt + getToolboxSystemPrompt();
	}

	protected result(content: string, confidence: number = 1.0): AgentResult {
		return {
			agentId: this.id,
			content,
			confidence,
			timestamp: Date.now(),
		};
	}

	protected buildProviderMessages(
		context: AgentContext,
	): ProviderPromptMessage[] {
		if (context.promptPayload) {
			return renderPromptPayloadMessages(context.promptPayload);
		}

		return [
			{ role: "system", content: this.getSystemPrompt() },
			{ role: "user", content: context.prompt },
		];
	}

	protected log(message: string): void {
		console.log(`[Agent:${this.name}] ${message}`);
	}
}
