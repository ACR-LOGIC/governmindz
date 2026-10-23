import { randomUUID } from "node:crypto";
import { AgentSeat, type SeatConfig } from "@governmindz/core/debate/AgentSeat";
import { RivalChallenger } from "@governmindz/core/memory/RivalChallenger";
import { ThinkerAgent } from "@governmindz/core/memory/ThinkerAgent";
import { HMemService } from "@governmindz/core/memory/HMemService";
import { DebateLoop, type DebateResult } from "@governmindz/core/debate/DebateLoop";
import { LocalSeatTransport } from "@governmindz/core/debate/SeatTransport";
import { auditTrail, type AuditEvent } from "@governmindz/core/engine/AuditTrailEmitter";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import { MeterlessSeatClient } from "@governmindz/core/providers/MeterlessSeatClient";
import { PromptRegistry } from "@governmindz/core/services/PromptRegistry";
import { formatZetarisResult } from "./format.js";
import { loadSampleScenario, type SampleScenario } from "./sampleScenario.js";
import { SampleSeatClient } from "./sampleSeat.js";
import { zetarisQueryHandler } from "./tools/zetaris.tools.js";

interface ZetarisToolResult {
	columns: string[];
	rows: unknown[][];
	total?: number;
	timeUsed?: number;
}

export interface RunParams {
	mode: "sample" | "live";
	scenarioPath?: string;
	topicOverride?: string;
	eventSink?: (event: Record<string, unknown>) => void;
}

export interface RunOutput {
	mode: "sample" | "live";
	topic: string;
	scenarioId?: string;
	zetaris: { query: string; columns: string[]; rows: unknown[][]; total: number };
	result: DebateResult;
	auditEvents: AuditEvent[];
	auditIntegrity: boolean;
}

const DEFAULT_TOPIC =
	"Assess the Zetaris data available to this agent and recommend a governance-safe debate workflow for the Open Agent Hackathon.";

const hmem = new HMemService();

function buildSeats(
	provider: MeterlessProvider | null,
	scenario?: SampleScenario,
): AgentSeat[] {
	const seatModel = process.env.METERLESS_SEAT_MODEL?.trim() || undefined;
	const configs: SeatConfig[] = [
		{ seatId: "FactChecker", role: "fact_checker", provider: "meterless", systemPrompt: PromptRegistry.load("fact_checker") },
		{ seatId: "CloudArchitect", role: "cloud-architect", provider: "meterless", systemPrompt: PromptRegistry.load("architect") },
		{ seatId: "Synthesizer", role: "synthesizer", provider: "meterless", systemPrompt: PromptRegistry.load("synthesizer") },
	];
	return configs.map((config) => {
		if (scenario) {
			return new AgentSeat(config, new SampleSeatClient(config.seatId, scenario.seats[config.seatId] ?? []));
		}
		if (!provider) throw new Error("Meterless provider is required outside sample mode.");
		const llm = new MeterlessSeatClient(provider, seatModel);
		return new AgentSeat(config, {
			complete: async (system: string, prompt: string) => {
				const result = await llm.complete(system, prompt);
				return result;
			},
		});
	});
}

function createDebateLoop(
	seats: AgentSeat[],
	topic: string,
	eventSink?: (event: Record<string, unknown>) => void,
	evidenceContext?: string,
	rivalChallenger?: RivalChallenger,
	thinkerAgent?: ThinkerAgent,
	inquiryScore?: number,
): DebateLoop {
	const seatMap = new Map(seats.map((seat) => [seat.seatId, seat]));
	const transport = new LocalSeatTransport(seatMap);
	const seatIds = seats.map((seat) => seat.seatId);
	return new DebateLoop(
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
			transcriptCompression: { maxRecentMessages: 8, maxEvidencePerMessage: 3 },
			maxActiveTranscriptMessages: 12,
			summaryIntervalRounds: 2,
			eventSink: eventSink as any,
			evidenceContext,
			rivalChallenger,
			thinkerAgent,
			inquiryScore,
		},
		undefined,
		topic,
	);
}

function buildTask(topic: string, context: string): string {
	return [
		"You are advising a human operator. Use only the supplied Zetaris evidence and your role expertise.",
		"",
		`Question: ${topic}`,
		"",
		"Zetaris evidence:",
		context,
		"",
		"Do not invent database names, row counts, sources, or credentials. If the evidence is insufficient, say so and lower your confidence.",
	].join("\n");
}

export async function runDebate(params: RunParams): Promise<RunOutput> {
	const eventSink = params.eventSink;
	const isSample = params.mode === "sample";

	let topic: string;
	let zetarisResult: ZetarisToolResult;
	let scenario: SampleScenario | undefined;
	let scenarioId: string | undefined;

	if (isSample) {
		const loaded = loadSampleScenario(params.scenarioPath);
		scenario = loaded.scenario;
		topic = params.topicOverride?.trim() || scenario.topic;
		zetarisResult = {
			columns: scenario.zetaris.columns,
			rows: scenario.zetaris.rows,
			total: scenario.zetaris.total ?? scenario.zetaris.rows.length,
		};
		scenarioId = scenario.id;
	} else {
		const query = process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES";
		const result = (await zetarisQueryHandler(
			{ query, limit: 50 },
			{ callerRole: "analyst", correlationId: randomUUID() },
		)) as ZetarisToolResult;
		zetarisResult = result;
		topic = params.topicOverride?.trim() || process.env.GOVERNMINDZ_TOPIC?.trim() || DEFAULT_TOPIC;
	}

	const zetarisContext = isSample
		? formatZetarisResult(scenario!.zetaris, 50)
		: formatZetarisResult(zetarisResult as any, 50);

	const memoryRetrieved = hmem.retrieve(topic, 5);
	const evidenceContext = memoryRetrieved.context
		? `${zetarisContext}\n\n${memoryRetrieved.context}`
		: zetarisContext;

	const zetarisQuery = isSample
		? scenario!.zetaris.query
		: (process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES");

	eventSink?.({
		type: "zetaris",
		query: zetarisQuery,
		columns: zetarisResult.columns,
		rows: zetarisResult.rows,
		total: zetarisResult.total ?? zetarisResult.rows.length,
	});

	const provider = isSample ? null : new MeterlessProvider();
	if (!isSample) {
		const status = await provider!.status();
		if (status.state !== "online") {
			throw new Error(
				status.state === "unauthorized"
					? "Meterless rejected the token."
					: "Meterless is offline.",
			);
		}
	}

	const seats = buildSeats(provider, scenario);

	// Rival Challenger LLM client: real in live mode, canned in sample mode.
	let challengerClient: { complete: (s: string, p: string) => Promise<{ content: string; confidence: number }> };
	if (isSample) {
		challengerClient = {
			complete: async () => ({
				content: JSON.stringify({
					challenge: "Rival Challenger (sample): claims appear consistent with cached evidence; verify against live Zetaris before production.",
					verifiedClaims: ["Cached evidence present"],
					unsupportedClaims: [],
					correctedPosition: "No correction needed in sample mode.",
					confidence: 0.7,
					questions: [
						{
							question: "Have current access reviews and retention policies been verified for the confidential source?",
							assignedTo: ["FactChecker"],
							reason: "Missing angle: production readiness depends on access reviews.",
						},
					],
					summary: "One unexplored governance angle.",
				}),
				confidence: 0.7,
			}),
		};
	} else {
		const seatModel = process.env.METERLESS_SEAT_MODEL?.trim() || undefined;
		const llm = new MeterlessSeatClient(provider!, seatModel);
		challengerClient = {
			complete: async (s: string, p: string) => llm.complete(s, p),
		};
	}
	const rivalChallenger = new RivalChallenger(challengerClient as any);
	const thinkerAgent = new ThinkerAgent(challengerClient as any);

	// Inquiry score heuristic (1-10): based on topic complexity + evidence size.
	let inquiryScore = 5;
	if (topic.length > 120) inquiryScore += 1;
	if (zetarisResult.rows.length > 5) inquiryScore += 1;
	if (/confidential|conflict|dispute|uncertain/i.test(topic)) inquiryScore += 2;
	inquiryScore = Math.max(1, Math.min(10, inquiryScore));

	eventSink?.({ type: "inquiry_score", score: inquiryScore });

	const loop = createDebateLoop(
		seats,
		topic,
		eventSink,
		evidenceContext,
		rivalChallenger,
		thinkerAgent,
		inquiryScore,
	);

	eventSink?.({ type: "run_start", mode: isSample ? "sample" : "live", topic, scenarioId });

	const resultDebate = await loop.run(buildTask(topic, evidenceContext));
	const auditEvents = auditTrail.getLog();

	// H-MEM: mine this debate into hierarchical memory for future runs.
	try {
		hmem.mine({
			sessionId: resultDebate.session_id,
			topic,
			finalAnswer:
				resultDebate.seat_votes?.Synthesizer?.position ||
				resultDebate.transcript[resultDebate.transcript.length - 1]?.content ||
				"",
			seatPositions: Object.entries(resultDebate.seat_votes || {}).map(
				([seatId, v]) => ({
					seatId,
					position: v.position,
					confidence: v.confidence,
				}),
			),
		});
	} catch {
		// degrade gracefully
	}

	eventSink?.({
		type: "complete",
		result: resultDebate,
		auditEvents,
		auditIntegrity: auditTrail.verifyIntegrity(),
	});

	return {
		mode: isSample ? "sample" : "live",
		topic,
		scenarioId,
		zetaris: {
			query: zetarisQuery,
			columns: zetarisResult.columns,
			rows: zetarisResult.rows,
			total: zetarisResult.total ?? zetarisResult.rows.length,
		},
		result: resultDebate,
		auditEvents,
		auditIntegrity: auditTrail.verifyIntegrity(),
	};
}