// Copyright (c) 2026 ACR Logic.

export type PayloadBlockType =
	| "system"
	| "context"
	| "research"
	| "validation"
	| "instruction";

export interface PayloadBlock {
	type: PayloadBlockType;
	role: string;
	content: string;
	priority: number;
	version: string;
	cacheable?: boolean;
	metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PromptEnvelope {
	schemaVersion: "governmindz.prompt.v1";
	blockOrder: readonly PayloadBlockType[];
	staticPrefix: readonly PayloadBlock[];
	dynamicSuffix: readonly PayloadBlock[];
	providerHints: {
		prefixHash: string;
		cacheableBlockCount: number;
		dynamicBlockCount: number;
		staticTokenEstimate?: number;
		dynamicTokenEstimate?: number;
		cacheSegments?: readonly string[];
	};
}

export interface PromptPayload {
	schemaVersion: "governmindz.prompt.v1";
	cacheKey: string;
	prefixHash: string;
	canonical: string;
	blocks: readonly PayloadBlock[];
	envelope: PromptEnvelope;
	builtAt: number;
}

export interface ProviderPromptMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
