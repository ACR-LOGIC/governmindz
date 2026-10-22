// Copyright (c) 2026 ACR Logic.

import { ZetarisClient } from "@governmindz/core/integrations/zetarisClient";
import type {
	McpRegistry,
	ToolContext,
	ToolDefinition,
	ToolHandler,
	ToolRegistration,
} from "@governmindz/mcp-core";
import { enforcePolicy } from "../middleware/policy.js";

const MAX_LIMIT = 1_000;
const DEFAULT_LIMIT = 100;

export const GATEWAY_REGISTRY: McpRegistry = {
	version: "0.1.0",
	servers: [],
	policies: {
		default_rate_limit_per_min: 30,
		audit_all_calls: true,
	},
};

export const zetarisQueryDefinition: ToolDefinition = {
	name: "zetaris_query",
	description:
		"Run a single read-only SQL statement against Zetaris Lightning and return columns and rows.",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string", description: "A read-only SQL statement" },
			limit: {
				type: "integer",
				minimum: 1,
				maximum: MAX_LIMIT,
				default: DEFAULT_LIMIT,
			},
		},
		required: ["query"],
	},
	riskGate: "rate_limited",
	rateLimit: 30,
};

interface ZetarisQueryInput {
	query: string;
	limit: number;
}

function parseInput(input: unknown): ZetarisQueryInput {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("zetaris_query expects an object input");
	}

	const record = input as Record<string, unknown>;
	if (typeof record.query !== "string" || !record.query.trim()) {
		throw new Error("zetaris_query requires a non-empty 'query' string");
	}

	const rawLimit = record.limit ?? DEFAULT_LIMIT;
	const limit = Number(rawLimit);
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
		throw new Error(
			`zetaris_query 'limit' must be an integer between 1 and ${MAX_LIMIT}`,
		);
	}

	return { query: record.query, limit };
}

const handler: ToolHandler = async (rawInput, context: ToolContext) => {
	if (!context?.callerRole?.trim()) {
		throw new Error("zetaris_query requires ToolContext.callerRole");
	}

	const decision = enforcePolicy(
		GATEWAY_REGISTRY,
		zetarisQueryRegistration,
		context,
	);
	if (!decision.allowed) {
		if (decision.requiresApproval) {
			throw new Error(
				decision.reason ?? "zetaris_query requires explicit approval",
			);
		}
		throw new Error(decision.reason ?? "zetaris_query denied by policy");
	}

	const input = parseInput(rawInput);
	const client = new ZetarisClient();
	const result = await client.query(input.query, { limit: input.limit });

	return {
		query: input.query,
		columns: result.columns,
		rows: result.rows,
		total: result.total,
		timeUsed: result.timeUsed,
	};
};

export const zetarisQueryRegistration: ToolRegistration = {
	definition: zetarisQueryDefinition,
	handler,
};

export const zetarisQueryHandler = handler;
