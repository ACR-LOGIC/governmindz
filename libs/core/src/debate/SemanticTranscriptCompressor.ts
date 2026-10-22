
import type { AgentMessage } from "./AgentMessage";

export interface CompressionResult {
	compressedHistory: string;
	tokenEstimateBefore: number;
	tokenEstimateAfter: number;
	retainedMessageIds: string[];
}

export interface CompressionOptions {
	maxRecentMessages?: number;
	maxEvidencePerMessage?: number;
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export class SemanticTranscriptCompressor {
	compress(
		history: AgentMessage[],
		seatId: string,
		options: CompressionOptions = {},
	): CompressionResult {
		const maxRecentMessages = options.maxRecentMessages ?? 6;
		const maxEvidencePerMessage = options.maxEvidencePerMessage ?? 2;
		const relevantHistory = history.filter(
			(message) => message.type !== "summary" || message.fromSeat !== seatId,
		);
		const recent = relevantHistory.slice(-maxRecentMessages);
		const earlier = relevantHistory.slice(0, -maxRecentMessages);

		const roundSummaries = new Map<number, string[]>();
		for (const message of earlier) {
			const evidence = message.structured.evidence
				.slice(0, maxEvidencePerMessage)
				.join("; ");
			const caveats = message.structured.caveats.slice(0, 1).join("; ");
			const summary = [
				`${message.fromSeat}:${message.structured.position}`,
				evidence ? `evidence=${evidence}` : "",
				caveats ? `caveat=${caveats}` : "",
				message.structured.dissents_from?.length
					? `dissent=${message.structured.dissents_from.join(",")}`
					: "",
			]
				.filter(Boolean)
				.join(" | ");

			const bucket = roundSummaries.get(message.round) ?? [];
			bucket.push(summary);
			roundSummaries.set(message.round, bucket);
		}

		const earlySummary = Array.from(roundSummaries.entries())
			.sort(([left], [right]) => left - right)
			.map(([round, items]) => `Round ${round}: ${items.join(" || ")}`)
			.join("\n");

		const recentSummary = recent
			.map(
				(message) =>
					`[${message.fromSeat} r${message.round} ${message.type}] ${message.structured.position} ` +
					`(v=${message.structured.confidence_self.toFixed(2)}, ext=${message.structured.confidence_expert_agreement.toFixed(2)})`,
			)
			.join("\n");

		const compressedHistory = [
			earlySummary ? `Earlier rounds summary:\n${earlySummary}` : "",
			recentSummary,
		]
			.filter(Boolean)
			.join("\n\n");
		const tokenEstimateBefore = estimateTokens(
			relevantHistory
				.map((message) => `${message.fromSeat}:${message.structured.position}`)
				.join("\n"),
		);
		const tokenEstimateAfter = estimateTokens(compressedHistory);

		return {
			compressedHistory,
			tokenEstimateBefore,
			tokenEstimateAfter,
			retainedMessageIds: recent.map((message) => message.id),
		};
	}

	summarize(messages: AgentMessage[], label = "Debate Summary"): string {
		if (messages.length === 0) {
			return `${label}: no earlier rounds to summarize.`;
		}

		const grouped = new Map<string, string[]>();
		for (const message of messages) {
			const entry = grouped.get(message.fromSeat) ?? [];
			entry.push(message.structured.position);
			grouped.set(message.fromSeat, entry);
		}

		return [
			`${label}: condensed history for dropped rounds.`,
			...Array.from(grouped.entries()).map(
				([seatId, positions]) =>
					`${seatId}: ${positions.slice(-2).join(" | ")}`,
			),
		].join("\n");
	}
}
