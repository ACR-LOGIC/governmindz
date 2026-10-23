
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type DebateResult } from "@governmindz/core/debate/DebateLoop";
import {
	auditTrail,
	type AuditEvent,
} from "@governmindz/core/engine/AuditTrailEmitter";
import { Logger } from "@governmindz/core/kernel/Logger";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import { formatZetarisResult } from "./format.js";
import { loadSampleScenario, type SampleScenario } from "./sampleScenario.js";
import { zetarisQueryHandler } from "./tools/zetaris.tools.js";
import { runDebate as runDebateCore } from "./debateRunner.js";
import { Orchestrator } from "./orchestrator.js";

interface ZetarisToolResult {
	columns: string[];
	rows: unknown[][];
	total?: number;
	timeUsed?: number;
}

const DEFAULT_TOPIC =
	"Assess the Zetaris data available to this agent and recommend a governance-safe debate workflow for the Open Agent Hackathon.";

function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

async function fetchZetarisContext(): Promise<{
	query: string;
	result: ZetarisToolResult;
	context: string;
}> {
	const query = process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES";
	const result = (await zetarisQueryHandler(
		{ query, limit: 50 },
		{ callerRole: "analyst", correlationId: randomUUID() },
	)) as ZetarisToolResult;

	return {
		query,
		result,
		context: formatZetarisResult(result, 50),
	};
}

async function printMeterlessStatus(
	provider: MeterlessProvider,
): Promise<Awaited<ReturnType<MeterlessProvider["status"]>>> {
	if (hasFlag("--auto-detect")) {
		const detected = await provider.autoDetect();
		if (!detected) {
			console.log("Meterless auto detect: no runtime found on known local ports.");
		}
	}
	const status = await provider.status();
	console.log(`Meterless: ${status.state} (${status.baseUrl})`);
	if (status.reason) console.log(`  reason: ${status.reason}`);
	if (status.state === "unauthorized" && !provider.hasToken()) {
		console.log(
			`  token: paste the /connect link into METERLESS_CONNECT_LINK or place the runtime token in ${provider.stateDir}/proxy-token`,
		);
	}
	if (status.models?.length) {
		console.log(`  models: ${status.models.join(", ")}`);
	}
	return status;
}

async function runDryRun(): Promise<number> {
	const { query, result, context } = await fetchZetarisContext();
	console.log(`Zetaris query: ${query}`);
	console.log(`Rows: ${result.rows.length}${result.total != null ? ` / total ${result.total}` : ""}`);
	console.log(context);

	await printMeterlessStatus(new MeterlessProvider());
	console.log("Dry run complete: Zetaris verified; no LLM calls were made.");
	return 0;
}

function printDebateResult(
	resultDebate: DebateResult,
	zetarisRows: number,
	auditEvents: AuditEvent[],
): void {
	console.log("\n=== Debate result ===");
	console.log(
		JSON.stringify(
			{
				session_id: resultDebate.session_id,
				rounds: resultDebate.rounds,
				consensusReached: resultDebate.consensusReached,
				consensusMethod: resultDebate.consensus_method,
				finalConfidence: Number(resultDebate.finalConfidence.toFixed(3)),
				halted: resultDebate.halted,
				haltReason: resultDebate.haltReason,
				quarantinedSeats: resultDebate.quarantined_seats,
				zetarisRows,
			},
			null,
			2,
		),
	);

	for (const [seatId, vote] of Object.entries(resultDebate.seat_votes)) {
		console.log(
			`\n${seatId} (${vote.confidence.toFixed(2)}): ${vote.position}`,
		);
	}

	console.log(
		`\nAudit events: ${auditEvents.length}; integrity: ${auditTrail.verifyIntegrity()}`,
	);
	const head = auditEvents[auditEvents.length - 1];
	if (head) console.log(`Audit head: ${head.hash}`);
	console.log(`Session artifact: ${resultDebate.session_id}`);
}

function writeTrace(
	logPath: string,
	mode: "sample" | "live",
	metadata: Record<string, unknown>,
	resultDebate: DebateResult,
	auditEvents: AuditEvent[],
): void {
	const resolved = path.resolve(process.cwd(), logPath);
	fs.mkdirSync(path.dirname(resolved), { recursive: true });
	const lines: Record<string, unknown>[] = [
		{
			type: "run_start",
			mode,
			timestamp: new Date().toISOString(),
			...metadata,
		},
		...resultDebate.transcript.map((message) => ({
			type: "agent_message",
			id: message.id,
			from: message.fromSeat,
			to: message.toSeat,
			message_type: message.type,
			round: message.round,
			confidence: Number(message.confidence.toFixed(4)),
			position: message.content,
			evidence: message.structured?.evidence ?? [],
			caveats: message.structured?.caveats ?? [],
			in_reply_to: message.inReplyTo ?? null,
			latency_ms: message.latency_ms,
			token_count: message.token_count,
		})),
		...auditEvents.map((event) => ({
			type: "audit_event",
			event_type: event.event_type,
			session_id: event.session_id,
			timestamp: event.timestamp,
			previous_hash: event.previous_hash,
			hash: event.hash,
			signature: event.signature,
			payload: event.payload,
		})),
		{
			type: "run_complete",
			timestamp: new Date().toISOString(),
			session_id: resultDebate.session_id,
			rounds: resultDebate.rounds,
			consensus_reached: resultDebate.consensusReached,
			consensus_method: resultDebate.consensus_method,
			final_confidence: Number(resultDebate.finalConfidence.toFixed(4)),
			halted: resultDebate.halted,
			audit_integrity: auditTrail.verifyIntegrity(),
		},
	];
	fs.writeFileSync(
		resolved,
		`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
		"utf8",
	);
}

function writeSampleArtifacts(
	scenario: SampleScenario,
	scenarioPath: string,
	topic: string,
	resultDebate: DebateResult,
	auditEvents: AuditEvent[],
): { outputPath: string; logPath: string } {
	const outputPath =
		process.env.SAMPLE_OUTPUT?.trim() ||
		path.join("output_examples", `${scenario.id}.json`);
	const logPath =
		process.env.SAMPLE_LOG?.trim() || path.join("logs", `${scenario.id}.jsonl`);
	const resolvedOutput = path.resolve(process.cwd(), outputPath);
	fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
	const payload = {
		mode: "sample",
		generated_at: new Date().toISOString(),
		scenario_id: scenario.id,
		scenario_file: scenarioPath.split(/[\\/]/).pop() ?? scenarioPath,
		topic,
		zetaris: {
			query: scenario.zetaris.query,
			columns: scenario.zetaris.columns,
			rows: scenario.zetaris.rows,
			total: scenario.zetaris.total ?? scenario.zetaris.rows.length,
		},
		result: resultDebate,
		audit: {
			integrity: auditTrail.verifyIntegrity(),
			events: auditEvents,
		},
	};
	fs.writeFileSync(
		resolvedOutput,
		`${JSON.stringify(payload, null, 2)}\n`,
		"utf8",
	);
	writeTrace(
		logPath,
		"sample",
		{
			scenario_id: scenario.id,
			scenario_file: payload.scenario_file,
			topic,
			zetaris_query: scenario.zetaris.query,
			zetaris_rows: scenario.zetaris.rows.length,
		},
		resultDebate,
		auditEvents,
	);
	return { outputPath, logPath };
}

async function runDebate(): Promise<number> {
	const provider = new MeterlessProvider();
	const status = await printMeterlessStatus(provider);
	if (status.state !== "online") {
		console.error(
			status.state === "unauthorized"
				? "Meterless rejected the token. Paste the current /connect link or token into METERLESS_CONNECT_LINK or METERLESS_API_KEY, then retry."
				: "Meterless is offline. Start the runtime or retry with --auto-detect.",
		);
		return 2;
	}

	const { query, result, context } = await fetchZetarisContext();
	console.log(`Zetaris query: ${query}`);
	console.log(context);

	const topic = process.env.GOVERNMINDZ_TOPIC?.trim() || DEFAULT_TOPIC;
	const out = await runDebateCore({
		mode: "live",
		topicOverride: topic,
	});
	const resultDebate = out.result;
	const auditEvents = out.auditEvents;

	printDebateResult(resultDebate, result.rows.length, auditEvents);
	const logPath = process.env.GOVERNMINDZ_LOG_PATH?.trim();
	if (logPath) {
		writeTrace(
			logPath,
			"live",
			{
				topic,
				zetaris_query: query,
				zetaris_rows: result.rows.length,
				meterless_base_url: status.baseUrl,
				meterless_models: status.models ?? [],
			},
			resultDebate,
			auditEvents,
		);
		console.log(`Trace log: ${logPath}`);
	}

	return resultDebate.halted ? 1 : 0;
}

async function runSampleDebate(): Promise<number> {
	const { scenario, filePath } = loadSampleScenario();
	const topic = process.env.GOVERNMINDZ_TOPIC?.trim() || scenario.topic;
	const context = formatZetarisResult(scenario.zetaris, 50);
	console.log(`Sample mode: ${scenario.id} (${filePath})`);
	console.log(`Zetaris query (cached): ${scenario.zetaris.query}`);
	console.log(context);

	const out = await runDebateCore({
		mode: "sample",
		scenarioPath: filePath,
		topicOverride: topic,
	});
	const resultDebate = out.result;
	const auditEvents = out.auditEvents;

	printDebateResult(resultDebate, scenario.zetaris.rows.length, auditEvents);
	const { outputPath, logPath } = writeSampleArtifacts(
		scenario,
		filePath,
		topic,
		resultDebate,
		auditEvents,
	);
	console.log(`Sample output: ${outputPath}`);
	console.log(`Trace log: ${logPath}`);

	return resultDebate.halted ? 1 : 0;
}

async function main(): Promise<void> {
	Logger.configure({ minLevel: "warn" });
	let code: number;
	if (hasFlag("--dry-run")) {
		code = await runDryRun();
	} else if (hasFlag("--orchestrator")) {
		const orchestrator = new Orchestrator({
			mode: process.env.SAMPLE_MODE === "true" ? "sample" : "live",
			scenarioPath: process.env.SAMPLE_SCENARIO,
			topicOverride: process.env.GOVERNMINDZ_TOPIC,
			maxCycles: 5,
		});
		const result = await orchestrator.run();
		console.log("\n=== Orchestrator Result ===");
		console.log(`Run ID: ${result.runId}`);
		console.log(`Mode: ${result.mode}`);
		console.log(`Question: ${result.userQuestion}`);
		console.log(`Inquiry score: ${result.inquiryScore}/10`);
		console.log(`Consensus: ${result.consensusReached} (${result.consensusMethod})`);
		console.log(`Zetaris used: ${result.zetarisUsed}`);
		console.log(`Research used: ${result.researchUsed}`);
		console.log(`Audit integrity: ${result.auditIntegrity}`);
		console.log(`Unresolved issues: ${result.unresolvedIssues.length}`);
		console.log(`Interventions: ${result.interventions.length}`);
		console.log("\n--- Final Answer ---");
		console.log(result.finalAnswer);
		console.log("\n--- State History ---");
		for (const s of result.stateHistory) {
			console.log(`  [${s.state}] ${s.trigger}`);
		}
		code = result.unresolvedIssues.length > 0 ? 1 : 0;
	} else if (process.env.SAMPLE_MODE === "true" || hasFlag("--sample")) {
		code = await runSampleDebate();
	} else {
		code = await runDebate();
	}
	process.exitCode = code;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
