// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor

// packages/core/src/debate/AgentMessage.ts — v1.1 ENHANCED with Normalized Contract Envelope

import type { ConfidenceResult } from "../scoring/ConfidenceScorer";

export type MessageType =
	| "proposal"
	| "challenge"
	| "refinement"
	| "consensus"
	| "escalation"
	| "action_items"
	| "summary";

// Normalized Message-Generation Contract Version 1.0
export interface MessageContractMessage {
	type: string;
	text: string;
	replyTo?: string;
}

export interface MessageContractResult {
	conclusion: string;
	confidence: number;
	evidenceIds: string[];
	unresolvedQuestions: string[];
}

export interface MessageContractExecution {
	taskId: string;
	status: "pending" | "running" | "completed" | "error" | string;
	round?: number;
	latency_ms?: number;
	auditRef?: string;
}

export interface MessageGenerationContract {
	schemaVersion: "1.0";
	message: MessageContractMessage;
	result: MessageContractResult;
	execution: MessageContractExecution;
}

export function buildMessageContractEnvelope(msg: {
	id?: string;
	type?: string;
	content?: string;
	structured?: Partial<AgentOutputContract>;
	confidence?: number;
	round?: number;
	latency_ms?: number;
	toSeat?: string;
	inReplyTo?: string;
	taskId?: string;
	status?: string;
}): MessageGenerationContract {
	const text = msg.structured?.position || msg.content || "";
	const confidence =
		msg.structured?.confidenceSelf ??
		msg.structured?.confidence_self ??
		msg.confidence ??
		1.0;
	const evidenceIds = (msg.structured?.evidence || []).map((_e, idx) => `ev-${idx + 1}`);
	const unresolved = msg.structured?.caveats || [];

	return {
		schemaVersion: "1.0",
		message: {
			type: msg.type || "proposal",
			text,
			replyTo: msg.inReplyTo || (msg.toSeat && msg.toSeat !== "all" ? msg.toSeat : undefined),
		},
		result: {
			conclusion: text,
			confidence,
			evidenceIds,
			unresolvedQuestions: unresolved,
		},
		execution: {
			taskId: msg.taskId || msg.id || `task-${Date.now()}`,
			status: msg.status || "completed",
			round: msg.round,
			latency_ms: msg.latency_ms,
			auditRef: msg.id,
		},
	};
}

// Structured output contract — machine-readable agent response
export interface AgentOutputContract {
	position: string; // Agent's stated answer (max 500 chars)
	confidenceSelf: number; // 0.0–1.0 self-assessed confidence
	confidence_self: number; // snake_case alias
	confidenceExpertAgreement: number; // 0.0–1.0 estimated % experts would agree
	confidence_expert_agreement: number; // snake_case alias
	evidence: string[]; // Supporting evidence array
	caveats: string[]; // Known limitations / uncertainties
	claimConfidences?: Array<{ claim: string; confidence: number }>; // per-claim confidence
	outputs?: Array<{
		id: string;
		type:
			| "chart"
			| "table"
			| "code"
			| "markdown"
			| "json"
			| "text"
			| "image"
			| "mermaid"
			| "3d";
		title?: string;
		data?: any;
		[key: string]: any;
	}>;
	dissentsFrom?: string[]; // Seat IDs this msg explicitly disagrees with
	dissents_from?: string[]; // snake_case alias
	supports?: string[]; // Seat IDs this msg agrees with
	rawReasoning?: string; // Full chain-of-thought (optional)
	raw_reasoning?: string; // snake_case alias
}

export interface AgentMessage {
	id: string;
	fromSeat: string;
	toSeat: string | "all";
	type: MessageType;
	content: string; // Backward compat — mirrors position
	structured: AgentOutputContract; // machine-readable contract
	confidence: number; // Backward compat — mirrors confidence_self
	confidenceMetadata?: ConfidenceResult; // detailed Bayesian metadata
	round: number;
	timestamp: number;
	latency_ms?: number; // response latency for AgentSeatWeightCalculator weighting
	token_count?: number; // verbosity signal
	inReplyTo?: string;

	// Normalized Contract Envelope v1.0
	envelope?: MessageGenerationContract;

	// Enhanced Enterprise Metadata
	agentId?: string;
	displayName?: string;
	roleName?: string;
	provider?: string;
	modelFamily?: string;
	model?: string;
	capability?: string;
	executionPath?: string;
	contributionSummary?: string;
}
