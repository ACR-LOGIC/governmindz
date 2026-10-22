import type {
	McpRegistry,
	ToolContext,
	ToolRegistration,
} from "@governmindz/mcp-core";

export interface PolicyDecision {
	allowed: boolean;
	reason?: string;
	/** Tool is gated on explicit human approval — queue instead of deny. */
	requiresApproval?: boolean;
}

const RATE_WINDOW_MS = 60_000;

// In-memory rolling rate-limit windows: `${tool}:${role}` -> timestamps.
// Process-local is acceptable for a single stdio gateway process; a shared
// store would be required if the gateway ever scales to multiple instances.
const rateWindows = new Map<string, number[]>();

function isCallAllowed(tool: string, role: string, maxPerMin: number): boolean {
	const key = `${tool}:${role}`;
	const now = Date.now();
	const window = (rateWindows.get(key) ?? []).filter(
		(t) => now - t < RATE_WINDOW_MS,
	);
	window.push(now);
	rateWindows.set(key, window);
	return window.length <= maxPerMin;
}

/**
 * Default-deny authorization for gateway tool calls.
 *
 * Rules (evaluated in order):
 * 1. Role allowlist — `restricted`-gated tools require a matching
 *    `allowed_roles` override, and any tool with an `allowed_roles` override
 *    is role-checked even when the definition has no explicit riskGate.
 *    Unauthorized roles are denied before the approval gate so that only
 *    allowed roles can queue an approval request at all.
 * 2. `approval`-gated tools (riskGate or `approval_required` override) are
 *    NOT executed. They are flagged `requiresApproval` so the gateway can
 *    enqueue them for explicit human approval instead of failing closed
 *    (hardening P8-3). The queue executes only after an authorized operator
 *    approves via the `approval_*` tools.
 * 3. Rate limiting applies from the per-tool `max_calls_per_min` override or
 *    the global `default_rate_limit_per_min`.
 *
 * This replaces the previous default-ALLOW behavior where a caller could invoke
 * infra/decision tools with no role check and no policy decision at all. See
 * audit finding R1.
 */
export function enforcePolicy(
	registry: McpRegistry,
	tool: ToolRegistration,
	context: ToolContext,
): PolicyDecision {
	const name = tool.definition.name;
	const override = registry.policies?.tool_overrides?.[name];
	const riskGate = tool.definition.riskGate;
	const allowedRoles = override?.allowed_roles;
	const approvalRequired =
		override?.approval_required === true || riskGate === "approval";

	// 1. Role allowlist — restricted tools must be on the list; any tool with
	//    an explicit `allowed_roles` override is role-checked too.
	if (riskGate === "restricted" || (allowedRoles && allowedRoles.length > 0)) {
		if (!allowedRoles || allowedRoles.length === 0) {
			return {
				allowed: false,
				reason: `Tool '${name}' requires an explicit role allowlist`,
			};
		}
		if (!allowedRoles.includes(context.callerRole)) {
			return {
				allowed: false,
				reason: `Role '${context.callerRole}' not permitted to call '${name}'`,
			};
		}
	}

	// 2. Approval-gated tools require human decision — queue, don't execute.
	if (approvalRequired) {
		return {
			allowed: false,
			reason: `Tool '${name}' requires explicit approval before execution`,
			requiresApproval: true,
		};
	}

	// 3. Rate limiting.
	const rateLimit =
		override?.max_calls_per_min ??
		tool.definition.rateLimit ??
		registry.policies?.default_rate_limit_per_min;
	if (rateLimit && !isCallAllowed(name, context.callerRole, rateLimit)) {
		return {
			allowed: false,
			reason: `Tool '${name}' exceeds its rate limit of ${rateLimit}/min`,
		};
	}

	return { allowed: true };
}
