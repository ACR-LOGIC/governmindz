// Copyright (c) 2026 ACR Logic.

import type { MessageType } from "../debate/AgentMessage";
import type { PromptPayload } from "../prompt-cache/types";

export interface AgentHistoryEntry {
	source: string;
	content: string;
	confidence: number;
	timestamp: number;
	agentId?: string;
	round?: number;
	messageType?: MessageType;
	metadata?: Record<string, unknown>;

	// Enhanced Enterprise Metadata
	displayName?: string;
	role?: string;
	provider?: string;
	modelFamily?: string;
	model?: string;
	capability?: string;
	executionPath?: string;
}

export interface AgentExecutionMetadata {
	runId: string;
	round: number;
	stepKey: string;
	targetSeat?: string;
	challengeId?: string;
	taskType?: MessageType | "synthesis" | "action_items";
	originalPrompt?: string;
}

export interface AgentContext {
	prompt: string;
	history?: AgentHistoryEntry[];
	signal?: AbortSignal;
	promptPayload?: PromptPayload;
	metadata?: AgentExecutionMetadata;
	onToken?: (token: string) => void;
}

export interface AgentUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface AgentResult {
	agentId: string;
	content: string;
	confidence: number;
	metadata?: Record<string, unknown>;
	usage?: AgentUsage;
	timestamp?: number;
	responseType?: MessageType;
	targetSeat?: string | "all";

	// Enhanced Enterprise Metadata
	displayName?: string;
	role?: string;
	provider?: string;
	modelFamily?: string;
	model?: string;
	capability?: string;
	executionPath?: string;
	latencyMs?: number;
	contributionSummary?: string;
}

export interface IAgent {
	id: string;
	name: string;
	role?: string;
	provider?: string;
	modelFamily?: string;
	model?: string;
	capability?: string;
	executionPath?: string;
	_dynamicParams?: Record<string, unknown>;
	execute(context: AgentContext): Promise<AgentResult>;
	getSystemPrompt?(): string;
}
