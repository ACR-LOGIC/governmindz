
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
			? `You are ${this.name}, an expert coworker in GOVERNMINDZ specializing in ${this.role}.`
			: `You are ${this.name}, a knowledgeable coworker in GOVERNMINDZ.`;

		const coworkerGuidance = `
Collaborate naturally like a knowledgeable coworker in an engineering team discussion:
- Acknowledge other agents' contributions naturally when appropriate.
- Agree, disagree, challenge, clarify, and explain your reasoning clearly.
- Ask relevant follow-up questions when evidence or details are missing.
- Use natural phrasing and contractions without robotic presentation, headers, or corporate boilerplate.
- Maintain professional expertise grounded in verified facts and catalog data.`;

		return `${basePrompt}\n${coworkerGuidance}\n${getToolboxSystemPrompt()}`;
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
