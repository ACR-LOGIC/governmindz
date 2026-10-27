export type ConversationEvaluationStatus =
	| "NOT_EVALUATED"
	| "INSUFFICIENT_INPUT"
	| "INCOMPLETE"
	| "NO_SUBSTANTIVE_ANSWER"
	| "EVALUATED";

export interface EvaluationMessage {
	id?: string;
	type?: string;
	fromSeat?: string;
	content?: string;
	confidence?: number | null;
	structured?: {
		position?: string;
		evidence?: string[];
		caveats?: string[];
	} | null;
}

export interface ConversationEvaluationInput {
	messages?: EvaluationMessage[] | null;
	topic?: string | null;
	status?: string | null;
	finalConfidence?: number | null;
	inquiryScore?: number | null;
}

export interface ConversationEvaluation {
	status: ConversationEvaluationStatus;
	evaluated: boolean;
	label: string;
	reason: string;
	confidence: number | null;
	confidenceSource: "final" | "message" | null;
	confidenceIssue: string | null;
	inquiryScore: number | null;
	answer: string | null;
}

const PLACEHOLDER_ANSWERS = new Set([
	"n/a",
	"na",
	"none",
	"null",
	"pending",
	"no final consensus reached",
	"consensus pending",
	"deliberation consensus reached",
	"no substantive answer",
	"awaiting answer",
]);

function normalizedText(value: unknown): string {
	return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function answerText(message: EvaluationMessage): string {
	return normalizedText(message.structured?.position) || normalizedText(message.content);
}

function isSubstantiveText(value: string): boolean {
	if (!value) return false;
	const stripped = value
		.replace(/<[^>]*>/g, " ")
		.replace(/[`*_>#~|]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!/[a-z0-9]/i.test(stripped)) return false;
	if (PLACEHOLDER_ANSWERS.has(stripped.toLowerCase().replace(/[.!?:;]+$/, ""))) return false;
	return true;
}

function normalizeConfidence(value: unknown): { value: number | null; issue: string | null } {
	if (value === null || value === undefined) {
		return { value: null, issue: "No calibrated confidence was recorded." };
	}
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return { value: null, issue: "Recorded confidence is not a finite number." };
	}
	if (value < 0 || value > 1) {
		return { value: null, issue: "Recorded confidence is outside the valid 0-1 range." };
	}
	return { value, issue: null };
}

function normalizeInquiryScore(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	if (value < 1 || value > 10) return null;
	return value;
}

function result(
	status: ConversationEvaluationStatus,
	reason: string,
	options: {
		confidence?: number | null;
		confidenceSource?: "final" | "message" | null;
		confidenceIssue?: string | null;
		inquiryScore?: number | null;
		answer?: string | null;
	} = {},
): ConversationEvaluation {
	const evaluated = status === "EVALUATED";
	return {
		status,
		evaluated,
		label:
			status === "EVALUATED"
				? "Evaluated"
				: status === "INCOMPLETE"
					? "Incomplete"
					: status === "NO_SUBSTANTIVE_ANSWER"
						? "No substantive answer"
						: status === "INSUFFICIENT_INPUT"
							? "Insufficient input"
							: "Not evaluated",
		reason,
		confidence: evaluated ? (options.confidence ?? null) : null,
		confidenceSource: evaluated ? (options.confidenceSource ?? null) : null,
		confidenceIssue: evaluated ? (options.confidenceIssue ?? null) : null,
		inquiryScore: evaluated ? (options.inquiryScore ?? null) : null,
		answer: evaluated ? (options.answer ?? null) : null,
	};
}

/**
 * Single source of truth for whether a conversation contains an answer that
 * can be scored, exported, or presented as a completed decision.
 */
export function evaluateConversation(input: ConversationEvaluationInput): ConversationEvaluation {
	const messages = Array.isArray(input.messages) ? input.messages : [];
	const topic = normalizedText(input.topic);
	const status = normalizedText(input.status).toLowerCase();

	const finalMessage = [...messages]
		.reverse()
		.find((message) => message.type === "final" || message.fromSeat === "Synthesizer");
	const substantiveAgentMessages = messages.filter(
		(message) =>
			message !== finalMessage &&
			message.fromSeat !== "user" &&
			message.type !== "user" &&
			isSubstantiveText(answerText(message)),
	);

	if (messages.length === 0) {
		if (!isSubstantiveText(topic)) {
			return result(
				"NOT_EVALUATED",
				"No inquiry or deliberation content is available to evaluate.",
			);
		}
		return result(
			"NOT_EVALUATED",
			"An inquiry exists, but no council answer has been produced.",
		);
	}

	if (status === "running") {
		return result("INCOMPLETE", "The deliberation is still running; no final answer is available.");
	}

	if (!finalMessage) {
		if (substantiveAgentMessages.length > 0) {
			return result(
				"NO_SUBSTANTIVE_ANSWER",
				"Candidate agent findings exist, but no final synthesized answer was recorded.",
			);
		}
		if (!isSubstantiveText(topic)) {
			return result(
				"INSUFFICIENT_INPUT",
				"No substantive inquiry or answer content is available to evaluate.",
			);
		}
		return result(
			"NO_SUBSTANTIVE_ANSWER",
			"No substantive synthesized answer was recorded for this inquiry.",
		);
	}

	const answer = answerText(finalMessage);
	if (!isSubstantiveText(answer)) {
		if (!isSubstantiveText(topic)) {
			return result(
				"INSUFFICIENT_INPUT",
				"The inquiry and final message do not contain substantive content.",
			);
		}
		return result(
			"NO_SUBSTANTIVE_ANSWER",
			"The final message is empty or a placeholder, so no answer can be scored.",
		);
	}

	const finalConfidence = normalizeConfidence(input.finalConfidence);
	const messageConfidence = normalizeConfidence(finalMessage.confidence);
	const selectedConfidence = finalConfidence.value ?? messageConfidence.value;
	const confidenceSource = finalConfidence.value != null ? "final" : messageConfidence.value != null ? "message" : null;
	const confidenceIssue = selectedConfidence != null ? null : finalConfidence.issue || messageConfidence.issue;

	return result("EVALUATED", "A substantive final answer was recorded.", {
		confidence: selectedConfidence,
		confidenceSource,
		confidenceIssue,
		inquiryScore: normalizeInquiryScore(input.inquiryScore),
		answer,
	});
}
