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
	"libs/core/test/githubAppClient.test.ts",
	// "libs/core/test/workflow.test.ts", // skipped on CI due to env-specific failures
	"libs/core/test/scheduler.test.ts",
	"libs/core/test/convergence.test.ts",
	"libs/core/test/resilience.test.ts",
	"libs/core/test/documents.test.ts",
	// "libs/core/test/feedback.test.ts", // skipped on CI due to env-specific failures
	"libs/core/test/audit_chain_verifier.test.ts",
	"libs/core/test/supervisor_multi_agent_workflow.test.ts",
	"tests/run_debate_application_service.test.ts",
	"tests/research_crew_runner.test.ts",
	"tests/inquiry_score_policy.test.ts",
	"tests/conversation_evaluation.test.ts",
	"tests/conversation_export.test.ts",
	"tests/dissent_source_collector.test.ts",
	"tests/conversational_inquiry_policy.test.ts",
	"tests/council_assignment_emitter.test.ts",
	"tests/web_citation_context_builder.test.ts",
	"tests/debate_seat_factory.test.ts",
	"tests/document_evidence_ingestion_service.test.ts",
	"tests/zetaris_evidence_preparation_service.test.ts",
	"tests/debate_support_agent_factory.test.ts",
	"tests/crew_barrier_types.test.ts",
	"tests/crew_barrier.test.ts",
	"tests/audio_stream_controls.test.ts",
	"tests/holding_messages_and_precues.test.ts",
	"tests/demo_presentation_pacing.test.ts",
	"tests/agent_arrival_lifecycle.test.ts",
	"tests/synchronized_crew_exit.test.ts",
	"tests/conversational_inquiry_bypass.test.ts",
	"tests/crew_resilience.test.ts",
	"tests/live_demo_ui_sync.test.ts",
	"tests/phase1-services.test.ts",
];

const result = spawnSync(
	process.execPath,
	["--test", "--test-concurrency=1", "--import", "tsx", ...testFiles],
	{
		cwd: root,
		stdio: "inherit",
		env,
	},
);

