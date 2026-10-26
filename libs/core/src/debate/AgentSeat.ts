
// packages/core/src/debate/AgentSeat.ts — v1.1 ENHANCED

import { randomUUID } from "node:crypto";
import {
	PromptPayloadBuilder,
	renderPromptPayloadMessages,
} from "../prompt-cache/PromptPayloadBuilder";
import {
	type AgentMessage,
	type AgentOutputContract,
	type MessageType,
	buildMessageContractEnvelope,
} from "./AgentMessage.js";

// JSON schema instruction injected into every LLM system prompt
const JSON_OUTPUT_INSTRUCTION = `
You MUST respond ONLY with a valid JSON object matching this exact schema. No markdown. No prose outside the JSON.
{
  "position": "<your answer, max 500 chars>",
  "confidence_self": <0.0-1.0>,
  "confidence_expert_agreement": <0.0-1.0>,
  "evidence": ["<source 1>", "<source 2>"],
  "caveats": ["<caveat 1>"],
  "dissents_from": ["<SeatID if disagreeing — omit if none>"],
  "supports": ["<SeatID if agreeing — omit if none>"],
  "raw_reasoning": "<optional chain of thought>"
}`;

export interface SeatConfig {
	seatId: string;
	role: string;
	provider: "meterless" | "google" | "gemini" | "vertex";
	systemPrompt: string;
	/**
	 * Optional pre-fetched user context block from MemoryService.getUserContextBlock().
	 * When provided, it is prepended to the seat system prompt so the LLM receives
	 * personalised context on every call.  Leave undefined to skip injection.
	 */
	userContextBlock?: string;
}

export interface LLMResult {
	content: string;
	confidence: number;
}

export interface ILLMClient {
	complete(system: string, prompt: string): Promise<LLMResult>;
}

export class AgentSeat {
	private historicalConfidence = 0.8;
	private responseCount = 0;

	constructor(
		private readonly config: SeatConfig,
		private readonly llm: ILLMClient,
	) {}

	async propose(task: string, round: number): Promise<AgentMessage> {
		const startTime = Date.now();
		const { systemPrompt, userPrompt } = this.buildPrompts({
			taskInstruction: `Task: ${task}\n\nProvide your initial proposal.`,
		});
		const result = await this.llm.complete(systemPrompt, userPrompt);
		const latency_ms = Date.now() - startTime;
		const structured = this.parseStructured(result.content, result.confidence);
		this.updateStats(structured.confidence_self);
		return this.buildMessage("proposal", "all", structured, round, latency_ms);
	}

	async respond(
		history: AgentMessage[],
		round: number,
		inReplyTo?: AgentMessage,
		peerContext?: string,
		contextOverride?: string,
	): Promise<AgentMessage> {
		const startTime = Date.now();
		const context = contextOverride ?? this.buildContext(history);
		const peerSection = peerContext
			? `\n\n--- SHARED DEBATE HISTORY ---\n${peerContext}\n---`
			: "";
		const tiebreakerNote = peerContext?.startsWith("TIEBREAKER")
			? "\n\nTIEBREAKER ROUND: Review all prior arguments carefully and cast your definitive final position."
			: "";
		const objectivityNote =
			"\n\nEvaluate the shared history from an objective third-party standpoint. Do not privilege your own prior output.";

		const taskInstruction = inReplyTo
			? `${peerSection}${objectivityNote}${tiebreakerNote}\n\nYou are being challenged by ${inReplyTo.fromSeat}:\n"${inReplyTo.structured?.position || inReplyTo.content}"\n\nRespond with a refinement or defend your position.`
			: `${peerSection}${objectivityNote}${tiebreakerNote}\n\nBased on the debate so far, provide your current position.`;

		const { systemPrompt, userPrompt } = this.buildPrompts({
			compressedContext: context,
			peerContext,
			taskInstruction,
		});
		const result = await this.llm.complete(systemPrompt, userPrompt);
		const latency_ms = Date.now() - startTime;
		const structured = this.parseStructured(result.content, result.confidence);

		// Determine message type based on confidence and challenge context
		let type: MessageType = "challenge";
		if (inReplyTo) {
			type = "refinement";
		} else if (structured.confidence_self >= 0.85) {
			type = "consensus";
		} else if (structured.confidence_self < 0.4) {
			type = "escalation";
		}

		this.updateStats(structured.confidence_self);
		return this.buildMessage(
			type,
			inReplyTo ? inReplyTo.fromSeat : "all",
			structured,
			round,
			latency_ms,
			inReplyTo?.id,
		);
	}

	async synthesize(
		history: AgentMessage[],
		round: number,
		instruction = "Synthesize the debate into a final, unified answer.",
	): Promise<AgentMessage> {
		const startTime = Date.now();
		const context = this.buildContext(history);
		const { systemPrompt, userPrompt } = this.buildPrompts({
			compressedContext: context,
			taskInstruction: instruction,
		});
		const result = await this.llm.complete(systemPrompt, userPrompt);
		const latency_ms = Date.now() - startTime;
		const structured = this.parseStructured(result.content, result.confidence);
		this.updateStats(structured.confidence_self);
		return this.buildMessage("consensus", "all", structured, round, latency_ms);
	}

	get seatId(): string {
		return this.config.seatId;
	}

	getSeatId(): string {
		return this.config.seatId;
	}

	get stats() {
		return {
			historicalConfidence: this.historicalConfidence,
			responseCount: this.responseCount,
		};
	}

	/**
	 * Parse the LLM response into a structured AgentOutputContract.
	 * Attempts JSON.parse first; falls back gracefully to a minimal contract
	 * if the model returns malformed output.
	 */
	private parseStructured(
		content: string,
		fallbackConfidence: number,
	): AgentOutputContract {
		try {
			// Strip markdown fences if model wrapped anyway
			const cleaned = content
				.replace(/^```json\s*/i, "")
				.replace(/^```\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = JSON.parse(cleaned) as Partial<AgentOutputContract>;
			return {
				position: parsed.position || content.slice(0, 500),
				confidenceSelf: this.clamp(
					parsed.confidence_self ?? fallbackConfidence,
				),
				confidence_self: this.clamp(
					parsed.confidence_self ?? fallbackConfidence,
				),
				confidenceExpertAgreement: this.clamp(
					parsed.confidence_expert_agreement ?? fallbackConfidence * 0.9,
				),
				confidence_expert_agreement: this.clamp(
					parsed.confidence_expert_agreement ?? fallbackConfidence * 0.9,
				),
				evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
				caveats: Array.isArray(parsed.caveats) ? parsed.caveats : [],
				outputs: Array.isArray(parsed.outputs) ? parsed.outputs : [],
				dissentsFrom: Array.isArray(parsed.dissents_from)
					? parsed.dissents_from
					: [],
				dissents_from: Array.isArray(parsed.dissents_from)
					? parsed.dissents_from
					: [],
				supports: Array.isArray(parsed.supports) ? parsed.supports : [],
				rawReasoning: parsed.raw_reasoning,
				raw_reasoning: parsed.raw_reasoning,
			};
		} catch {
			// Graceful fallback — preserve content as position
			const conf = this.clamp(fallbackConfidence);
			return {
				position: content.slice(0, 500),
				confidenceSelf: conf,
				confidence_self: conf,
				confidenceExpertAgreement: this.clamp(conf * 0.9),
				confidence_expert_agreement: this.clamp(conf * 0.9),
				evidence: [],
				caveats: [
					"Warning: LLM returned non-JSON response. Structured parsing failed.",
				],
				dissents_from: [],
				supports: [],
				raw_reasoning: content,
				rawReasoning: content,
			};
		}
	}

	private clamp(val: unknown): number {
		const n = Number(val);
		return Number.isNaN(n) ? 0.5 : Math.min(1, Math.max(0, n));
	}

	private updateStats(confidence: number) {
		this.responseCount++;
		// Simple running average (Phase 4 will introduce Bayesian Scorer)
		this.historicalConfidence =
			(this.historicalConfidence * (this.responseCount - 1) + confidence) /
			this.responseCount;
	}

	private buildContext(history: AgentMessage[]): string {
		return history
			.map(
				(m) =>
					`[${m.fromSeat} — Round ${m.round} — ${m.type}]: ${m.structured?.position || m.content}`,
			)
			.join("\n\n");
	}

	private buildPrompts({
		compressedContext,
		peerContext,
		taskInstruction,
	}: {
		compressedContext?: string;
		peerContext?: string;
		taskInstruction: string;
	}): { systemPrompt: string; userPrompt: string } {
		// Prepend user context block when available — graceful: skipped when undefined or empty
		const systemContent = this.config.userContextBlock
			? `${this.config.userContextBlock}\n\n${this.config.systemPrompt}${JSON_OUTPUT_INSTRUCTION}`
			: this.config.systemPrompt + JSON_OUTPUT_INSTRUCTION;

		const payload = new PromptPayloadBuilder()
			.addBlock({
				type: "system",
				role: this.config.role,
				content: systemContent,
				priority: 100,
				version: "v2",
				cacheable: !this.config.userContextBlock, // don't cache when context is dynamic
				metadata: { provider: this.config.provider },
			})
			.addBlock({
				type: "context",
				role: this.config.role,
				content: compressedContext ?? "",
				priority: 90,
				version: "v2",
				cacheable: Boolean(compressedContext),
				metadata: { kind: "compressed_history" },
			})
			.addBlock({
				type: "research",
				role: "PeerSummary",
				content: peerContext ?? "",
				priority: 70,
				version: "v2",
				cacheable: Boolean(
					peerContext && !peerContext.startsWith("TIEBREAKER"),
				),
			})
			.addBlock({
				type: "instruction",
				role: this.config.role,
				content: taskInstruction,
				priority: 100,
				version: "v2",
				cacheable: false,
			})
			.build();

		const rendered = renderPromptPayloadMessages(payload);
		const systemPrompt = rendered
			.filter((message) => message.role === "system")
			.map((message) => message.content)
			.join("\n\n");
		const userPrompt =
			rendered.find((message) => message.role === "user")?.content ??
			taskInstruction;
		return { systemPrompt, userPrompt };
	}

	private buildMessage(
		type: MessageType,
		toSeat: string,
		structured: AgentOutputContract,
		round: number,
		latency_ms: number,
		inReplyTo?: string,
	): AgentMessage {
		// Estimate token count from position length (4 chars ≈ 1 token)
		const token_count = Math.ceil(
			(structured.position.length +
				(structured.raw_reasoning?.length || 0) +
				structured.evidence.join("").length) /
				4,
		);
		const id = randomUUID();
		const envelope = buildMessageContractEnvelope({
			id,
			type,
			structured,
			round,
			latency_ms,
			toSeat,
			inReplyTo,
		});
		return {
			id,
			fromSeat: this.config.seatId,
			toSeat,
			type,
			content: structured.position, // backward compat
			confidence: structured.confidence_self, // backward compat
			structured, // NEW: machine-readable contract
			round,
			timestamp: Date.now(),
			latency_ms,
			token_count,
			inReplyTo,
			envelope,
		};
	}
}
