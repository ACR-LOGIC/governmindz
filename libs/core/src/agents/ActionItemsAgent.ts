
import { ADKAgent } from "./adk/ADKAgent.js";

/**
 * Refactored ActionItemsAgent following ADK patterns.
 */
export class ActionItemsAgent extends ADKAgent {
	constructor() {
		super({
			id: "action_items",
			name: "Action Items Extraction",
			model: process.env.NEMOTRON_MODEL ?? "",
			instruction:
				"You are the Action Extraction Specialist. Your job is to identify concrete tasks, follow-ups, and action items from the conversation transcript.",
			tools: [],
		});
	}
}
