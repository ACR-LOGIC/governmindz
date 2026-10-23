import type { AgentMessage } from "../debate/AgentMessage.js";
import type { ILLMClient } from "../debate/AgentSeat.js";

export interface ThinkerQuestion {
	question: string;
	assignedTo: string[];
	reason: string;
}

export interface ThinkerResult {
	questions: ThinkerQuestion[];
	summary: string;
}

const SYSTEM = `You are the Thinker Agent. You operate independently of the debate and do NOT vote in consensus.
You monitor the investigation for missing angles, unexamined assumptions, research gaps, narrow approaches, conflicting findings, and pre-finalization blind spots.
You generate at most 1-2 specific, actionable questions that could improve the investigation, assign each to relevant agents, and explain why.
Return ONLY valid JSON:
{
  "questions": [{"question":"...","assignedTo":["SeatId"],"reason":"..."}],
  "summary": "<brief summary of blind spots found, or 'none' if no intervention needed>"
}
If no intervention is warranted, return {"questions":[],"summary":"none"}.`;

export class ThinkerAgent {
	constructor(private readonly llm: ILLMClient) {}

	async think(params: {
		inquiry: string;
		findings: string;
		sources: string;
	}): Promise<ThinkerResult> {
		const prompt = [
			`Inquiry: ${params.inquiry}`,
			"",
			"Current findings:",
			params.findings,
			"",
			"Source references:",
			params.sources,
			"",
			"Identify blind spots and propose 1-2 questions.",
		].join("\n");
		try {
			const result = await this.llm.complete(SYSTEM, prompt);
			const cleaned = result.content
				.replace(/^```json\s*/i, "")
				.replace(/^```\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = JSON.parse(cleaned) as Partial<ThinkerResult>;
			const questions = Array.isArray(parsed.questions)
				? parsed.questions.slice(0, 2).map((q) => ({
						question: String(q.question || ""),
						assignedTo: Array.isArray(q.assignedTo)
							? q.assignedTo.map(String)
							: [],
						reason: String(q.reason || ""),
				  }))
				: [];
			return { questions, summary: String(parsed.summary || "none") };
		} catch {
			return { questions: [], summary: "none" };
		}
	}
}
