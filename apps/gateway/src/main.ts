// Copyright (c) 2026 ACR Logic.

import { randomUUID } from "node:crypto";
import { AgentSeat, type SeatConfig } from "@governmindz/core/debate/AgentSeat";
import { DebateLoop } from "@governmindz/core/debate/DebateLoop";
import { LocalSeatTransport } from "@governmindz/core/debate/SeatTransport";
import { auditTrail } from "@governmindz/core/engine/AuditTrailEmitter";
import { Logger } from "@governmindz/core/kernel/Logger";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import { MeterlessSeatClient } from "@governmindz/core/providers/MeterlessSeatClient";
import { PromptRegistry } from "@governmindz/core/services/PromptRegistry";
import { formatZetarisResult } from "./format.js";
import { zetarisQueryHandler } from "./tools/zetaris.tools.js";

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

function buildSeats(provider: MeterlessProvider): AgentSeat[] {
	const seatModel = process.env.METERLESS_SEAT_MODEL?.trim() || undefined;
	const llm = new MeterlessSeatClient(provider, seatModel);
	const trace = (seatId: string) => ({
		complete: async (system: string, prompt: string) => {
			console.log(`\n[${seatId}] requesting...`);
			const started = Date.now();
			const result = await llm.complete(system, prompt);
			console.log(`[${seatId}] responded in ${Date.now() - started}ms`);
			return result;
		},
	});
	const configs: SeatConfig[] = [
		{
			seatId: "FactChecker",
			role: "fact_checker",
			provider: "meterless",
			systemPrompt: PromptRegistry.load("fact_checker"),
		},
		{
			seatId: "CloudArchitect",
			role: "cloud-architect",
			provider: "meterless",
			systemPrompt: PromptRegistry.load("architect"),
		},
		{
			seatId: "Synthesizer",
			role: "synthesizer",
			provider: "meterless",
			systemPrompt: PromptRegistry.load("synthesizer"),
		},
	];

	return configs.map(
		(config) => new AgentSeat(config, trace(config.seatId)),
	);
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
	const task = [
		"You are advising a human operator. Use only the supplied Zetaris evidence and your role expertise.",
		"",
		`Question: ${topic}`,
		"",
		"Zetaris evidence:",
		context,
		"",
		"Do not invent database names, row counts, sources, or credentials. If the evidence is insufficient, say so and lower your confidence.",
	].join("\n");

	const seats = buildSeats(provider);
	const seatMap = new Map(seats.map((seat) => [seat.seatId, seat]));
	const transport = new LocalSeatTransport(seatMap);
	const seatIds = seats.map((seat) => seat.seatId);
	const loop = new DebateLoop(
		seatIds,
		transport,
		() => seatIds,
		{
			maxRounds: 2,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: true,
			dissentTriggerCount: 3,
			judgeSeatId: "Synthesizer",
			transcriptCompression: {
				maxRecentMessages: 8,
				maxEvidencePerMessage: 3,
			},
			maxActiveTranscriptMessages: 12,
			summaryIntervalRounds: 2,
		},
		undefined,
		topic,
	);

	const resultDebate = await loop.run(task);
	const auditEvents = auditTrail.getLog();

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
				zetarisRows: result.rows.length,
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

	return resultDebate.halted ? 1 : 0;
}

async function main(): Promise<void> {
	Logger.configure({ minLevel: "warn" });
	const code = hasFlag("--dry-run") ? await runDryRun() : await runDebate();
	process.exitCode = code;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
