export type ToolOverride = {
	/** Roles permitted to invoke the tool. Unset = no role restriction. */
	allowed_roles?: string[];
	/** Tool requires explicit approval before execution. */
	approval_required?: boolean;
	/** Max calls allowed per minute for the calling role. */
	max_calls_per_min?: number;
};

export type McpRegistryPolicies = {
	/* Default role assigned to callers without an explicit identity. */
	default_role?: string;
	default_rate_limit_per_min?: number;
	audit_all_calls?: boolean;
	tool_overrides?: Record<string, ToolOverride>;
};

export type McpRegistryServer = {
	id: string;
	name: string;
	transport: "stdio" | "http";
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	policies?: {
		default_role?: string;
		tool_overrides?: Record<string, ToolOverride>;
	};
};

export type McpRegistry = {
	$schema?: string;
	version: string;
	gateway?: {
		name?: string;
		entrypoint?: string;
		transport?: string;
		description?: string;
	};
	servers: McpRegistryServer[];
	policies?: McpRegistryPolicies;
};
