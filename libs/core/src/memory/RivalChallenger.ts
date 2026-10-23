import type { AgentMessage } from "../debate/AgentMessage.js";
import type { ILLMClient } from "../debate/AgentSeat.js";

export interface ChallengeResult {
	seatId: string;
	challenge: string;
	verifiedClaims: string[];
	unsupportedClaims: string[];
	correctedPosition: string;
	confidence: number;
}

const SYSTEM = `You are the Rival Challenger. You operate independently of the debate and do NOT vote in consensus.
Given an agent's position, its stated evidence, and the available Zetaris evidence context, you must:
1. Double-check the agent's claims against the evidence.
2. Identify any unsupported or inaccurate claims.
3. Research supporting evidence from the provided context when appropriate.
4. Correct unsupported claims.
Return ONLY valid JSON:
{
  "challenge": "<your challenge text>",
  "verifiedClaims": ["<claim supported by evidence>"],
  "unsupportedClaims": ["<claim not supported>"],
  "correctedPosition": "<corrected position or original if all verified>",
  "confidence": <0.0-1.0>
}`;

export class RivalChallenger {
	constructor(private readonly llm: ILLMClient) {}

	async challenge(
		seatId: string,
		message: AgentMessage,
		evidenceContext: string,
	): Promise<ChallengeResult> {
		const position =
			message.structured?.position || message.content || "";
		const evidence = (message.structured?.evidence || []).join("; ");
		const prompt = [
			`Agent: ${seatId}`,
			`Position: ${position}`,
			`Stated evidence: ${evidence}`,
			"",
			"Available Zetaris evidence context:",
			evidenceContext,
			"",
			"Verify and challenge.",
		].join("\n");

		try {
			const result = await this.llm.complete(SYSTEM, prompt);
			const cleaned = result.content
				.replace(/^```json\s*/i, "")
				.replace(/^```\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = JSON.parse(cleaned) as Partial<ChallengeResult>;
			return {
				seatId,
				challenge: parsed.challenge || result.content.slice(0, 300),
				verifiedClaims: Array.isArray(parsed.verifiedClaims)
					? parsed.verifiedClaims
					: [],
				unsupportedClaims: Array.isArray(parsed.unsupportedClaims)
					? parsed.unsupportedClaims
					: [],
				correctedPosition:
					parsed.correctedPosition || position,
				confidence:
					typeof parsed.confidence === "number"
						? parsed.confidence
						: result.confidence,
			};
		} catch {
			return {
				seatId,
				challenge: "Challenger could not parse model output; claims unverified.",
				verifiedClaims: [],
				unsupportedClaims: [],
				correctedPosition: position,
				confidence: 0.3,
			};
		}
	}
}
