// Plain (non-zod) type declarations for the GOVERNMINDZ baseline.
// zod was excluded from baseline (no new installs); schemas are expressed as
// plain TypeScript interfaces instead.

export interface Card {
	id: string;
	type: string;
	title: string;
	summary: string;
	status: string;
	priority: number;
	priorityScore?: number;
	domain?: string;
}

export interface Intent {
	id: string;
	name: string;
	intent?: string;
	confidence: number;
	agents: string[];
}

export interface AgentResponse {
	agentId: string;
	content: string;
	confidence: number;
	timestamp: number;
}

export interface ProviderRequest {
	prompt: string;
	model?: string;
}

export interface ProviderResponse {
	id?: string;
	content: string;
	usage: {
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
		input?: number;
		output?: number;
	};
	provider?: string;
	model?: string;
	latencyMs?: number;
}

export interface SyncEvent {
	provider: string;
	status: string;
	timestamp: number;
}

export interface MemoryRecord {
	id: string;
	content: string;
	metadata: Record<string, any>;
}

export interface ExecutionContext {
	correlationId: string;
	startTime: number;
}

export interface RunTrace {
	runId: string;
	events: any[];
}
