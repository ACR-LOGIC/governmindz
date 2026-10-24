import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();

// Ensure test audit secret is set if not already provided
const env = {
	...process.env,
	AUDIT_TRAIL_SECRET: process.env.AUDIT_TRAIL_SECRET || "test-workflow-secret-do-not-use-in-production",
};

const testFiles = [
	"libs/core/test/gravity.test.ts",
	"libs/core/test/meterless.test.ts",
	"libs/core/test/zetaris.test.ts",
	"libs/core/test/workflow.test.ts",
];

const result = spawnSync(
	process.execPath,
	["--test", "--import", "tsx", ...testFiles],
	{
		cwd: root,
		stdio: "inherit",
		env,
	},
);

process.exit(result.status ?? 1);
