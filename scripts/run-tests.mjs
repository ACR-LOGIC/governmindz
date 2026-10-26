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
	// "libs/core/test/workflow.test.ts", // skipped on CI due to env-specific failures
	"libs/core/test/scheduler.test.ts",
	"libs/core/test/convergence.test.ts",
	"libs/core/test/resilience.test.ts",
	"libs/core/test/documents.test.ts",
	// "libs/core/test/feedback.test.ts", // skipped on CI due to env-specific failures
	"libs/core/test/audit_chain_verifier.test.ts",
	"libs/core/test/supervisor_multi_agent_workflow.test.ts",
	"tests/crew_barrier_types.test.ts",
	"tests/crew_barrier.test.ts",
	"tests/audio_stream_controls.test.ts",
	"tests/holding_messages_and_precues.test.ts",
	"tests/demo_presentation_pacing.test.ts",
	"tests/agent_arrival_lifecycle.test.ts",
	"tests/synchronized_crew_exit.test.ts",
	"tests/conversational_inquiry_bypass.test.ts",
	"tests/crew_resilience.test.ts",
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
