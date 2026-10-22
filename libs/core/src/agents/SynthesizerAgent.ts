
import { ADKAgent } from "./adk/ADKAgent.js";

/**
 * Refactored SynthesizerAgent following ADK patterns.
 */
export class SynthesizerAgent extends ADKAgent {
	constructor() {
		super({
			id: "synthesizer",
			name: "Synthesizer",
			model: process.env.NEMOTRON_MODEL ?? "",
			instruction:
				"You are the Synthesizer. Your job is to combine multiple perspectives into coherent summaries. Focus on finding common ground and identifying unique insights.",
			tools: [],
		});
	}
}
