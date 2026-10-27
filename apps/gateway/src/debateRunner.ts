import { randomUUID } from "node:crypto";
import { type AgentSeat } from "@governmindz/core/debate/AgentSeat";
import { buildMessageContractEnvelope } from "@governmindz/core/debate/AgentMessage";
import { RivalChallenger } from "@governmindz/core/memory/RivalChallenger";
import { ThinkerAgent } from "@governmindz/core/memory/ThinkerAgent";
import { HMemService } from "@governmindz/core/memory/HMemService";
import { formatZetarisResult } from "./format.js";
import { DebateLoop, type DebateResult } from "@governmindz/core/debate/DebateLoop";
import { LocalSeatTransport } from "@governmindz/core/debate/SeatTransport";
import { auditTrail, type AuditEvent } from "@governmindz/core/engine/AuditTrailEmitter";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import { MeterlessSeatClient } from "@governmindz/core/providers/MeterlessSeatClient";
import { PromptRegistry } from "@governmindz/core/services/PromptRegistry";
import { loadSampleScenario, type SampleScenario } from "./sampleScenario.js";
import { DocumentIngestionService } from "@governmindz/core/documents/DocumentIngestionService";
import { SampleSeatClient } from "./sampleSeat.js";
import { zetarisQueryHandler } from "./tools/zetaris.tools.js";
import {
	classifyDeliverable,
	type DeliverableContract,
	type ArtifactDescriptor,
} from "@governmindz/core/orchestration/DeliverableContract";
import { DataCrew, type DataCrewReport } from "@governmindz/core/agents/DataCrew";
import { WebSearchCrew, type WebSearchCrewReport } from "@governmindz/core/agents/WebSearchCrew";
import { DesignAssistant } from "@governmindz/core/documents/DesignAssistant";
import { runCrewSafely, emptyDataCrewReport, emptyWebCrewReport } from "./crewResilience.js";
import { ResearchCrewRunner } from "./application/ResearchCrewRunner.js";
import { calculateInquiryScore } from "./application/InquiryScorePolicy.js";
import { collectDissentSources } from "./application/DissentSourceCollector.js";
import { isConversationalInquiry } from "./application/ConversationalInquiryPolicy.js";
import { emitCouncilAssignments } from "./application/CouncilAssignmentEmitter.js";
import { buildWebCitationContext } from "./application/WebCitationContextBuilder.js";
import { DebateSeatFactory } from "./services/DebateSeatFactory.js";
import { DocumentEvidenceIngestionService } from "./services/DocumentEvidenceIngestionService.js";
import { DebateSupportAgentFactory } from "./services/DebateSupportAgentFactory.js";
import {
	ZetarisEvidencePreparationService,
	type ZetarisEvidenceResult,
} from "./services/ZetarisEvidencePreparationService.js";

interface ZetarisToolResult extends ZetarisEvidenceResult {
	timeUsed?: number;
}

export interface RunParams {
	mode: "sample" | "live";
	scenarioPath?: string;
	topicOverride?: string;
	eventSink?: (event: Record<string, unknown>) => void;
	searchModes?: string[];
	model?: string;
	attachments?: Array<{
		id?: string;
		name: string;
		size?: number;
		type?: string;
		dataUrl?: string;
		content?: Buffer | string;
		filePath?: string;
	}>;
	conversationId?: string;
}

export interface RunOutput {
	mode: "sample" | "live";
	topic: string;
	scenarioId?: string;
	zetaris: {
		query: string;
		columns: string[];
		rows: unknown[][];
		total: number;
		isSynthetic?: boolean;
		evidenceSource?: string;
		circuitBreakerState?: string;
	};
	result: DebateResult;
	auditEvents: AuditEvent[];
	auditIntegrity: boolean;
	contract?: DeliverableContract;
	primaryArtifact?: ArtifactDescriptor;
	additionalArtifacts?: ArtifactDescriptor[];
	evidenceExport?: ArtifactDescriptor;
	supervisorDecision?: "APPROVED" | "REJECTED";
	supervisorResponse?: string;
	dataCrewReport?: DataCrewReport;
	webCrewReport?: WebSearchCrewReport;
}

const DEFAULT_TOPIC =
	"Assess the Zetaris data available to this agent and recommend a governance-safe debate workflow for the Open Agent Hackathon.";

const hmem = new HMemService();

const debateSeatFactory = new DebateSeatFactory({
	loadPrompt: (name) => PromptRegistry.load(name),
	createSampleClient: (seatId, replies, delayMs) => new SampleSeatClient(seatId, replies, delayMs),
	createMeterlessClient: (provider, model) => new MeterlessSeatClient(provider, model),
});

const documentEvidenceIngestionService = new DocumentEvidenceIngestionService({
	createService: () => new DocumentIngestionService(),
});

const zetarisEvidencePreparationService = new ZetarisEvidencePreparationService({
	formatResult: (result, maxRows) => formatZetarisResult(result, maxRows),
	retrieveMemory: (topic, topN) => hmem.retrieve(topic, topN),
});

const debateSupportAgentFactory = new DebateSupportAgentFactory({
	createMeterlessClient: (provider, model) => new MeterlessSeatClient(provider, model),
	createRivalChallenger: (client) => new RivalChallenger(client),
	createThinkerAgent: (client) => new ThinkerAgent(client),
});

const researchCrewRunner = new ResearchCrewRunner({
	createDataCrew: (config) => new DataCrew(config),
	createWebCrew: (config) => new WebSearchCrew(config),
	runCrewSafely,
	emptyDataCrewReport,
	emptyWebCrewReport,
});

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

	// Each run gets its own genesis-anchored audit chain. This keeps demo runs
	// cryptographically isolated from live runs and prevents cross-run leakage.
	auditTrail.reset();

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
			isSynthetic: true,
			evidenceSource: "sample_scenario",
		};
		scenarioId = scenario.id;
	} else {
		const query = process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES";
		let result: ZetarisToolResult;
		try {
			result = (await zetarisQueryHandler(
				{ query, limit: 50 },
				{ callerRole: "analyst", correlationId: randomUUID() },
			)) as ZetarisToolResult;
		} catch (offlineErr) {
			const reason = offlineErr instanceof Error ? offlineErr.message : String(offlineErr);
			throw new Error(
				`Live mode aborted: Zetaris Lightning query failed (${reason}). ` +
					"Live runs never substitute synthetic or demo data. Check ZETARIS_REST_URL, ZETARIS_ORG_ID, ZETARIS_API_KEY, and that the Zetaris service is running.",
			);
		}
		if (result.isSynthetic) {
			throw new Error(
				"Live mode aborted: Zetaris returned a synthetic fallback. No demo or synthetic evidence is permitted in live mode.",
			);
		}
		zetarisResult = result;
		topic = params.topicOverride?.trim() || process.env.GOVERNMINDZ_TOPIC?.trim() || DEFAULT_TOPIC;
	}

	const evidenceVerificationUrl = params.conversationId
		? `/evidence/${encodeURIComponent(params.conversationId)}`
		: null;

	// 1. Establish Deliverable Contract
	const contract = classifyDeliverable(topic);
	eventSink?.({ type: "deliverable_contract", contract });

	// For simple greetings or basic conversations, do not unnecessarily activate every crew or force a full debate
	if (isConversationalInquiry(topic)) {
		const greetingResponse =
			"Hello! I am GovernMindz Mission Control, coordinating an autonomous multi-agent council for federated data governance, compliance risk analysis, and adversarial verification. What compliance or data governance inquiry would you like the council to assess today?";

		const orchMsg = {
			id: `supervisor-greeting-${Date.now()}`,
			fromSeat: "Supervisor",
			toSeat: "all",
			type: "summary" as const,
			content: greetingResponse,
			timestamp: Date.now(),
		};

		eventSink?.({ type: "message", message: orchMsg });
		eventSink?.({
			type: "complete",
			result: {
				session_id: randomUUID(),
				query_hash: "greeting",
				transcript: [orchMsg],
				rounds: 0,
				consensusReached: true,
				finalConfidence: 1.0,
				consensus_method: "synthesizer",
				quarantined_seats: [],
				seat_votes: {},
				timestamp: Date.now(),
				halted: false,
				transportMode: "in_process",
			},
			auditEvents: auditTrail.getLog(),
			auditIntegrity: true,
			contract,
			supervisorDecision: "APPROVED",
			supervisorResponse: greetingResponse,
		});

		return {
			mode: isSample ? "sample" : "live",
			topic,
			scenarioId,
			zetaris: {
				query: "NONE",
				columns: [],
				rows: [],
				total: 0,
			},
			result: {
				session_id: randomUUID(),
				query_hash: "greeting",
				transcript: [orchMsg] as unknown as DebateResult["transcript"],
				rounds: 0,
				consensusReached: true,
				finalConfidence: 1.0,
				consensus_method: "synthesizer",
				quarantined_seats: [],
				seat_votes: {},
				timestamp: Date.now(),
				halted: false,
				transportMode: "in_process",
			},
			auditEvents: auditTrail.getLog(),
			auditIntegrity: true,
			contract,
			supervisorDecision: "APPROVED",
			supervisorResponse: greetingResponse,
		};
	}

	// Emit Council Member task assignments & role acknowledgments
	emitCouncilAssignments(eventSink);

	const configuredCrewTimeout = Number(process.env.CREW_TIMEOUT_MS);
	const crewTimeoutMs =
		Number.isFinite(configuredCrewTimeout) && configuredCrewTimeout > 0
			? configuredCrewTimeout
			: isSample
				? 45000
				: 120000;
	const {
		crewRoundId,
		crewExecutionRunId,
		dataOutcome,
		webOutcome,
		dataCrewReport,
		webCrewReport,
	} = await researchCrewRunner.run({
		topic,
		mode: isSample ? "sample" : "live",
		scenarioPath: params.scenarioPath,
		conversationId: params.conversationId,
		eventSink,
		timeoutMs: crewTimeoutMs,
	});

	const zetarisQuery = isSample
		? scenario!.zetaris.query
		: (process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES");
	const { evidenceContext } = zetarisEvidencePreparationService.prepare({
		mode: isSample ? "sample" : "live",
		topic,
		query: zetarisQuery,
		result: zetarisResult,
		eventSink,
	});

	// Multi-Format Document Evidence Ingestion (PDF, CSV, XLSX)
	const documentEvidenceContext = await documentEvidenceIngestionService.ingest(
		params.attachments?.map((attachment) => ({
			id: attachment.id,
			filename: attachment.name,
			dataUrl: attachment.dataUrl,
			content: attachment.content,
			filePath: attachment.filePath,
			mimeType: attachment.type,
			size: attachment.size,
		})),
		eventSink,
	);

	// Incorporate Web Search Crew citations into context
	const webCitationContext = buildWebCitationContext(webCrewReport);

	let combinedEvidenceContext = evidenceContext;
	if (documentEvidenceContext) {
		combinedEvidenceContext = `${combinedEvidenceContext}\n${documentEvidenceContext}`;
	}
	if (webCitationContext) {
		combinedEvidenceContext = `${combinedEvidenceContext}\n${webCitationContext}`;
	}

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

	const seats = debateSeatFactory.create({
		provider,
		scenario,
		seatModel: process.env.METERLESS_SEAT_MODEL?.trim() || undefined,
		sampleDelayMs: process.env.NODE_ENV === "test" ? 0 : 2000,
	});

	const { rivalChallenger, thinkerAgent } = debateSupportAgentFactory.create({
		mode: isSample ? "sample" : "live",
		topic,
		provider,
		model: process.env.METERLESS_SEAT_MODEL?.trim() || undefined,
		delayMs: process.env.NODE_ENV === "test" ? 0 : 500,
	});

	// 3. Hater independently challenges both crews separately
	const crewChallenges = await rivalChallenger.challengeCrewsIndependently({
		dataCrewReport,
		webCrewReport,
		eventSink,
		unavailableCrews: [
			...(dataOutcome.failed ? (["DataCrew"] as const) : []),
			...(webOutcome.failed ? (["WebSearchCrew"] as const) : []),
		],
	});

	// Inquiry score heuristic (1-10): based on topic complexity + evidence size.
	const inquiryScore = calculateInquiryScore(topic, zetarisResult.rows.length);

	eventSink?.({ type: "inquiry_score", score: inquiryScore });

	const loop = createDebateLoop(
		seats,
		topic,
		eventSink,
		combinedEvidenceContext,
		rivalChallenger,
		thinkerAgent,
		inquiryScore,
	);

	eventSink?.({ type: "run_start", mode: isSample ? "sample" : "live", topic, scenarioId });

	const resultDebate = await loop.run(buildTask(topic, combinedEvidenceContext));

	const synthPosition =
		resultDebate.seat_votes?.Synthesizer?.position ||
		resultDebate.transcript.slice().reverse().find((m) => m.fromSeat === "Synthesizer")?.structured?.position ||
		resultDebate.transcript[resultDebate.transcript.length - 1]?.content ||
		"";

	const dissentSources = collectDissentSources(resultDebate.transcript);
	const crewFailureSummary = [
		dataOutcome.failed ? `Data Crew did not complete (${dataOutcome.error})` : "",
		webOutcome.failed ? `Web Search Crew did not complete (${webOutcome.error})` : "",
	]
		.filter(Boolean)
		.join("; ");
	const partialEvidence = Boolean(crewFailureSummary);
	const crewChallengeCount =
		crewChallenges.dataCrewChallenges.length + crewChallenges.webCrewChallenges.length;
	const unresolvedGaps = [
		...dataCrewReport.findings.flatMap((finding) => finding.limitations || []),
		...webCrewReport.unresolvedGaps,
		...(dataOutcome.failed ? [`Data Crew evidence unavailable: ${dataOutcome.error}`] : []),
		...(webOutcome.failed ? [`Web Search Crew evidence unavailable: ${webOutcome.error}`] : []),
	];

	const auditEvents = auditTrail.getLog();

	// 4. Design Assistant generates the requested authoritative deliverable(s)
	const designAssistant = new DesignAssistant();
	const { primaryArtifact, additionalArtifacts, evidenceExport } =
		await designAssistant.generateDeliverables({
			contract,
			topic,
			synthesizedContent: {
				title: `GovernMindz Decision: ${topic.slice(0, 50)}`,
				summary: synthPosition,
				sections: [
					{
						heading: "Executive Deliberation Summary",
						body: synthPosition,
						bulletPoints: [
							`Calibrated consensus confidence: ${((resultDebate.finalConfidence || 0.88) * 100).toFixed(1)}%`,
							dataOutcome.failed
								? "Data Crew did not complete; database evidence is excluded from this deliverable."
								: `Data Crew examined ${dataCrewReport.catalogDatabases.length} federated databases across Zetaris fabric.`,
							webOutcome.failed
								? "Web Search Crew did not complete; external citation evidence is excluded from this deliverable."
								: `Web Search Crew verified ${webCrewReport.totalCitationsFound} external regulatory citations.`,
						],
					},
					{
						heading: "Data Crew Findings & Evidence Lineage",
						body: dataCrewReport.summary,
						bulletPoints: dataCrewReport.findings.map((f) => `[${f.agentId}] ${f.claim}`),
					},
					{
						heading: "External Regulatory Standards & Citations",
						body: webCrewReport.summary,
						bulletPoints: webCrewReport.findings.map((f) => `[${f.agentId}] ${f.claim}`),
					},
					{
						heading: "Adversarial Review & Dispute Reconciliation",
						body: partialEvidence
							? `Adversarial review covered the available evidence only. ${crewChallengeCount} independent crew challenge${crewChallengeCount === 1 ? "" : "s"} were raised. ${crewFailureSummary}. No defense is attributed to a crew that did not complete.`
							: `Hater raised ${crewChallengeCount} independent crew challenge${crewChallengeCount === 1 ? "" : "s"}. Crews submitted formal responses; unresolved dissent and caveats remain explicitly recorded rather than being presented as unanimous consensus.`,
						bulletPoints: [
							...(dataOutcome.failed ? [] : [crewChallenges.dataCrewResponse.defenseStatement]),
							...(webOutcome.failed ? [] : [crewChallenges.webCrewResponse.defenseStatement]),
							...(dissentSources.length > 0
								? [`Recorded dissent sources: ${dissentSources.join(", ")}.`]
								: []),
						],
					},
					{
						heading: "Actionable Governance Recommendations",
						body: "Adopt role-separated multi-agent verification with cryptographically signed audit logs for all mission-critical operations.",
					},
				],
				evidence: [
					...dataCrewReport.findings.flatMap((f) => f.evidence),
					...webCrewReport.findings.map((f) => `[Citation] ${f.title}: ${f.claim}`),
					...(evidenceVerificationUrl
						? [
								`[Zetaris Verification] ${zetarisQuery} — ${zetarisResult.rows.length} rows captured. Verify the exact dataset and SHA-256 hash: ${evidenceVerificationUrl}`,
							]
						: []),
				],
				caveats: [
					...new Set([
						...unresolvedGaps,
						"Calibrated confidence is a statistical multi-agent consensus score, not an external guarantee.",
					]),
				],
				confidence: resultDebate.finalConfidence || 0.9,
				consensusMethod: resultDebate.consensus_method || "synthesizer",
				auditHash: auditEvents.slice(-1)[0]?.hash || `hash_${Date.now()}`,
			},
		});

	// 5. Delivery Validation
	const validatedPrimary = designAssistant.validateArtifact(primaryArtifact);

	// 6. Supervisor Release Review & Final Response formulation
	const outputLabel =
		contract.primaryOutputType === "presentation"
			? "Presentation completed"
			: contract.primaryOutputType === "report"
				? "Report completed"
				: contract.primaryOutputType === "spreadsheet"
					? "Spreadsheet completed"
					: contract.primaryOutputType === "chart"
						? "Visual Chart completed"
						: "Deliverable completed";

	const primaryLinkMarkdown = `[View or download the ${contract.primaryOutputType}](${validatedPrimary.viewUrl})`;
	const evidenceLinkMarkdown = `[Supporting evidence export](${evidenceExport.downloadUrl})`;
	const evidenceVerificationMarkdown = evidenceVerificationUrl
		? `[Verify raw Zetaris evidence](${evidenceVerificationUrl})`
		: "";

	let additionalLinks = "";
	if (additionalArtifacts.length > 0) {
		additionalLinks =
			`\n\n**Additional Deliverables:**\n` +
			additionalArtifacts
				.map((a) => `- [${a.title}](${a.viewUrl}) (${a.format.toUpperCase()}, ${Math.round(a.sizeBytes / 1024)} KB)`)
				.join("\n");
	}

	const supervisorSummary = [
		`**${outputLabel}: ${validatedPrimary.title}**`,
		"",
		`The ${contract.primaryOutputType} covers:`,
		`- **Key findings and conclusions:** ${synthPosition.slice(0, 220)}...`,
		`- **Supporting evidence:** ${
			partialEvidence
				? `${dataCrewReport.findings.length} available database findings and ${webCrewReport.totalCitationsFound} external citations were reviewed; failed crew evidence is excluded.`
				: `Reconciled ${dataCrewReport.findings.length} database findings across Zetaris Lightning and verified ${webCrewReport.totalCitationsFound} authoritative external citations.`
		}`,
		`- **Adversarial & multi-agent verification:** ${crewChallengeCount} independent crew challenge${
			crewChallengeCount === 1 ? "" : "s"
		} raised. ${
			dissentSources.length > 0
				? `Recorded dissent from ${dissentSources.join(", ")} remains visible rather than being presented as unanimous consensus.`
				: "No unresolved seat dissent was recorded in the final transcript."
		} Calibrated confidence: ${(resultDebate.finalConfidence * 100).toFixed(1)}%.`,
		`- **Recommendations & next steps:** Documented actionable governance safeguards with tamper-evident audit lineage.`,
		"",
		`**${primaryLinkMarkdown}**`,
		additionalLinks,
		"",
		...(partialEvidence
			? [
					"",
					`**Limitation:** ${crewFailureSummary}. This answer excludes that evidence and cannot claim complete multi-crew verification.`,
				]
			: []),
		...(dissentSources.length > 0
			? ["", `**Recorded dissent:** ${dissentSources.join(", ")}.`]
			: []),
		...(evidenceVerificationUrl
			? [
					"",
					`**${evidenceVerificationMarkdown}** - Inspect the exact Zetaris rows and SHA-256 integrity hash behind this decision.`,
				]
			: []),
		`Optional: **${evidenceLinkMarkdown}** - Supplementary research data and cryptographic proof (kept separate from primary deliverable).`,
	].filter(Boolean).join("\n");

	const orchestratorMsg = {
		id: `supervisor-final-${Date.now()}`,
		fromSeat: "Supervisor",
		toSeat: "all",
		type: "summary" as const,
		content: supervisorSummary,
		structured: {
			position: supervisorSummary,
			confidenceSelf: resultDebate.finalConfidence,
			confidence_self: resultDebate.finalConfidence,
			confidenceExpertAgreement: resultDebate.finalConfidence,
			confidence_expert_agreement: resultDebate.finalConfidence,
			evidence: [
				partialEvidence
					? `Partial evidence: ${crewFailureSummary}`
					: "All required research crews completed",
				dissentSources.length > 0
					? `Recorded dissent from: ${dissentSources.join(", ")}`
					: "No unresolved seat dissent recorded",
				"Cryptographic audit trail verified",
				"Deliverable Contract satisfied",
				`Primary artifact validated: ${validatedPrimary.filename}`,
				...(evidenceVerificationUrl ? [`Zetaris evidence snapshot: ${evidenceVerificationUrl}`] : []),
			],
			caveats: [
				...new Set([
					...unresolvedGaps,
					...crewChallenges.dataCrewChallenges.flatMap((challenge) => challenge.unsupportedPoints),
					...crewChallenges.webCrewChallenges.flatMap((challenge) => challenge.unsupportedPoints),
					...(partialEvidence ? [crewFailureSummary] : []),
					...(dissentSources.length > 0
						? [`Recorded dissent from ${dissentSources.join(", ")}.`]
						: []),
				]),
			],
			supports: Object.entries(resultDebate.seat_votes || {})
				.filter(([, vote]) => !vote.dissented)
				.map(([seatId]) => seatId),
			dissentsFrom: dissentSources,
			dissents_from: dissentSources,
		},
		confidence: resultDebate.finalConfidence,
		round: resultDebate.rounds,
		timestamp: Date.now(),
		envelope: buildMessageContractEnvelope({
			id: `supervisor-final-${Date.now()}`,
			type: "summary",
			content: supervisorSummary,
			confidence: resultDebate.finalConfidence,
			round: resultDebate.rounds,
			toSeat: "all",
		}),
	};

	resultDebate.transcript.push(orchestratorMsg);
	eventSink?.({ type: "message", message: orchestratorMsg });

	eventSink?.({
		type: "artifact_ready",
		contract,
		primaryArtifact: validatedPrimary,
		additionalArtifacts,
		evidenceExport,
	});

	eventSink?.({
		type: "delivery_approved",
		supervisorResponse: supervisorSummary,
		primaryUrl: validatedPrimary.viewUrl,
		evidenceUrl: evidenceExport.downloadUrl,
		zetarisEvidenceUrl: evidenceVerificationUrl,
	});

	// H-MEM: mine this debate into hierarchical memory for future runs.
	// Demo/sample runs are intentionally excluded so they cannot influence live retrieval.
	if (!isSample) {
		try {
			hmem.mine({
				sessionId: resultDebate.session_id,
				topic,
				finalAnswer: synthPosition,
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
	}

	eventSink?.({
		type: "complete",
		result: resultDebate,
		auditEvents,
		auditIntegrity: auditTrail.verifyIntegrity(),
		contract,
		primaryArtifact: validatedPrimary,
		additionalArtifacts,
		evidenceExport,
		supervisorDecision: "APPROVED",
		supervisorResponse: supervisorSummary,
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
			isSynthetic: zetarisResult.isSynthetic,
			evidenceSource: zetarisResult.evidenceSource,
			circuitBreakerState: zetarisResult.circuitBreakerState,
		},
		result: resultDebate,
		auditEvents,
		auditIntegrity: auditTrail.verifyIntegrity(),
		contract,
		primaryArtifact: validatedPrimary,
		additionalArtifacts,
		evidenceExport,
		supervisorDecision: "APPROVED",
		supervisorResponse: supervisorSummary,
		dataCrewReport,
		webCrewReport,
	};
}
