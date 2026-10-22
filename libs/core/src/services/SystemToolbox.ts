// TODO(build-window): SystemToolbox real capabilities (Vision/Translation/Language/Speech/Linter)
// backed by Google Cloud client libraries are not installed in baseline.

/**
 * SystemToolbox — minimal baseline placeholder.
 *
 * The full SystemToolbox wired to Google Cloud Vision/Translation/Language/
 * Speech/Linter services was excluded from this baseline (those clients pull
 * in @google-cloud/* dependencies that are not installed). A minimal in-process
 * stub is provided so AgentBase can compile without new installs.
 */
export interface SystemToolbox {
	vision: unknown;
	translation: unknown;
	language: unknown;
	speech: unknown;
	linter: unknown;
}

export const systemToolbox: SystemToolbox = {
	vision: undefined,
	translation: undefined,
	language: undefined,
	speech: undefined,
	linter: undefined,
};

/**
 * Helper to generate a text summary of toolbox capabilities for agent prompts.
 */
export function getToolboxSystemPrompt(): string {
	return `
[SYSTEM TOOLBOX ENABLED (baseline placeholder)]
Shared AI capabilities (Vision, Translation, Language, Speech, Linter) are
reserved for the build window; no provider clients are installed in baseline.
`;
}
