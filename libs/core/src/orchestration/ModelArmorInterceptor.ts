// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor

/**
 * ModelArmorInterceptor - Security middleware for tool invocation.
 *
 * Implements "Zero-Trust" validation for agentic tool calls,
 * specifically targeting infrastructure-mutating commands.
 */
export class ModelArmorInterceptor {
	private static readonly DESTRUCTIVE_KEYWORDS = [
		"delete",
		"drop",
		"remove",
		"terminate",
		"destroy",
		"purge",
	];

	/**
	 * Detects policy violations for destructive actions.
	 */
	private static detectBaseViolation(
		toolName: string,
		args: any,
	): string | undefined {
		const normalizedName = toolName.toLowerCase();

		// 1. Keyword check for destructive actions
		if (
			ModelArmorInterceptor.DESTRUCTIVE_KEYWORDS.some((keyword) =>
				normalizedName.includes(keyword),
			)
		) {
			return `Destructive tool '${toolName}' is blocked by default.`;
		}

		// 2. Argument-level validation
		if (args?.force === true || args?.recursive === true) {
			return `Use of 'force' or 'recursive' flags in '${toolName}' is restricted.`;
		}

		return undefined;
	}

	/**
	 * Validates a tool call against the security policy.
	 */
	static validateToolCall(toolName: string, args: any): void {
		const violation = ModelArmorInterceptor.detectBaseViolation(toolName, args);
		if (violation) {
			throw new Error(`[ModelArmor] Policy Violation: ${violation}`);
		}
	}

	/**
	 * Gravity Shield — uses the Gravity Engine confidence signal as a dynamic
	 * security threshold. Low confidence = higher scrutiny. High confidence =
	 * standard gates apply.
	 */
	static validateWithGravitySignals(
		toolName: string,
		args: any,
		signals: { urgency: number; dependencyWeight: number; relevance: number; confidence: number },
	): {
		approved: boolean;
		vetoReason?: string;
		confidenceAtDecision: number;
		urgencyAtDecision: number;
	} {
		// Run existing keyword + argument validation first
		const baseViolation = ModelArmorInterceptor.detectBaseViolation(
			toolName,
			args,
		);

		// Confidence gate — low confidence triggers elevated scrutiny
		const confidenceThreshold = signals.confidence < 0.5;
		const urgencyOverride = signals.urgency > 0.9;

		// High urgency + low confidence = veto regardless of keyword check
		const vetoed = !!baseViolation || (confidenceThreshold && urgencyOverride);

		return {
			approved: !vetoed,
			vetoReason: vetoed
				? baseViolation
					? `Keyword/argument violation: ${baseViolation}`
					: "Low confidence + high urgency gate triggered"
				: undefined,
			confidenceAtDecision: signals.confidence,
			urgencyAtDecision: signals.urgency,
		};
	}
}
