// Copyright (c) 2026 ACR Logic.

export {};

function argValue(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

process.env.SAMPLE_MODE = "true";
if (!process.env.AUDIT_TRAIL_SECRET?.trim()) {
	process.env.AUDIT_TRAIL_SECRET = "sample-mode-local-audit-secret";
}
const scenario = argValue("--scenario");
const output = argValue("--output");
const log = argValue("--log");
if (scenario) process.env.SAMPLE_SCENARIO = scenario;
if (output) process.env.SAMPLE_OUTPUT = output;
if (log) process.env.SAMPLE_LOG = log;

await import("./main.js");
