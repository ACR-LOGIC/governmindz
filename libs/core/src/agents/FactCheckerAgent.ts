
import { ADKAgent } from "./adk/ADKAgent.js";

/**
 * Refactored FactCheckerAgent following ADK patterns.
 */
export class FactCheckerAgent extends ADKAgent {
	constructor() {
		super({
			id: "fact_checker",
			name: "Fact Checker",
			model: process.env.NEMOTRON_MODEL ?? "",
			instruction:
				"You are the Fact Checker. Your job is to verify claims, check for accuracy, cite sources when possible, and flag unsupported assertions.",
			tools: [],
		});
	}
}
