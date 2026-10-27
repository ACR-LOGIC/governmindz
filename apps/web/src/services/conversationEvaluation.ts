import { evaluateConversation, type ConversationEvaluation } from "../../../../libs/core/src/scoring/ConversationEvaluation";
import type { Conversation } from "../types";

export type { ConversationEvaluation };

export function evaluateWebConversation(conversation: Conversation | null | undefined): ConversationEvaluation {
	return evaluateConversation({
		messages: conversation?.messages,
		topic: conversation?.topic,
		status: conversation?.status,
		finalConfidence: conversation?.finalConfidence,
		inquiryScore: conversation?.inquiryScore,
	});
}

export function formatConfidence(confidence: number | null | undefined): string {
	return typeof confidence === "number" && Number.isFinite(confidence)
		? `${(confidence * 100).toFixed(1)}%`
		: "N/A";
}

export function formatConfidenceShort(confidence: number | null | undefined): string {
	return typeof confidence === "number" && Number.isFinite(confidence)
		? `${(confidence * 100).toFixed(0)}%`
		: "N/A";
}
