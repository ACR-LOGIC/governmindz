export type ToolDefinition = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	riskGate?: "approval" | "restricted" | "rate_limited";
	rateLimit?: number;
};

export type ToolHandler = (
	input: unknown,
	context: ToolContext,
) => Promise<unknown>;

export type ToolContext = {
	callerRole: string;
	correlationId: string;
	tenantId?: string;
};

export type ToolRegistration = {
	definition: ToolDefinition;
	handler: ToolHandler;
};

export type DomainManifest = {
	domain: string;
	tools: ToolRegistration[];
};
