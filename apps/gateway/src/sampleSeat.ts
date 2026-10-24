import type { ILLMClient, LLMResult } from "@governmindz/core/debate/AgentSeat";
import type { SampleReply } from "./sampleScenario.js";

export class SampleSeatClient implements ILLMClient {
	private index = 0;

	constructor(
		private readonly seatId: string,
		private readonly replies: SampleReply[],
		private readonly delayMs: number = 300,
	) {}

	async complete(_system: string, _prompt: string): Promise<LLMResult> {
		if (this.replies.length === 0) {
			throw new Error(`SAMPLE_REPLY_MISSING:${this.seatId}`);
		}
		if (this.delayMs > 0 && process.env.NODE_ENV !== "test") {
			await new Promise((resolve) => setTimeout(resolve, this.delayMs));
		}
		const reply = this.replies[Math.min(this.index, this.replies.length - 1)];
		this.index += 1;
		return {
			content: JSON.stringify(reply),
			confidence: reply.confidence_self,
		};
	}
}
