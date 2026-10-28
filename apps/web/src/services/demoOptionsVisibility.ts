export interface DemoOptionsVisibilityParams {
	isDemoMode: boolean;
	isBusy: boolean;
	hasCompletedMessages: boolean;
	manualOverride: boolean | null;
}

/**
 * Determines whether the 3-card Demo Options selector should be expanded.
 *
 * Rules:
 * 1. Never shown when not in Demo/Sample mode.
 * 2. Before a demo starts (`!isBusy && !hasCompletedMessages`), shown by default (`true`).
 * 3. Once a demo starts (`isBusy`) or has conversation messages (`hasCompletedMessages`),
 *    automatically collapses (`false`) so the conversation reclaims vertical screen space.
 * 4. The user can explicitly toggle the panel open/closed via the compact control
 *    (`manualOverride: true | false`), which resets automatically when starting a demo
 *    or resetting the session (`Start Over`).
 */
export function resolveDemoOptionsVisibility({
	isDemoMode,
	isBusy,
	hasCompletedMessages,
	manualOverride,
}: DemoOptionsVisibilityParams): boolean {
	if (!isDemoMode) return false;
	if (manualOverride !== null) return manualOverride;
	return !isBusy && !hasCompletedMessages;
}
