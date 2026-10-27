import { randomUUID } from "node:crypto";
import type { DataCrewReport } from "@governmindz/core/agents/DataCrew";
import type { WebSearchCrewReport } from "@governmindz/core/agents/WebSearchCrew";
import type { CrewOutcome } from "../crewResilience.js";

export type ResearchMode = "sample" | "live";
export type ResearchEventSink = (event: Record<string, unknown>) => void;

export interface ResearchCrewConfig {
	runId: string;
	topic: string;
	mode: ResearchMode;
	scenarioPath?: string;
	eventSink?: ResearchEventSink;
}

export interface ResearchCrew<TReport> {
	run(): Promise<TReport>;
}

export interface ResearchCrewRunnerDependencies {
	createDataCrew(config: ResearchCrewConfig): ResearchCrew<DataCrewReport>;
	createWebCrew(config: ResearchCrewConfig): ResearchCrew<WebSearchCrewReport>;
	runCrewSafely<T>(
		crewName: string,
		run: () => Promise<T>,
		emptyReport: (error: string) => T,
		eventSink: ResearchEventSink | undefined,
		runId: string,
		timeoutMs: number,
	): Promise<CrewOutcome<T>>;
	emptyDataCrewReport(runId: string, mode: ResearchMode, error: string): DataCrewReport;
	emptyWebCrewReport(runId: string, topic: string, error: string): WebSearchCrewReport;
}

export interface ResearchCrewRunOptions {
	topic: string;
	mode: ResearchMode;
	scenarioPath?: string;
	conversationId?: string;
	eventSink?: ResearchEventSink;
	timeoutMs: number;
}

export interface ResearchCrewRunResult {
	crewRoundId: string;
	crewExecutionRunId: string;
	dataOutcome: CrewOutcome<DataCrewReport>;
	webOutcome: CrewOutcome<WebSearchCrewReport>;
	dataCrewReport: DataCrewReport;
	webCrewReport: WebSearchCrewReport;
}

export class ResearchCrewRunner {
	constructor(private readonly dependencies: ResearchCrewRunnerDependencies) {}

	async run(options: ResearchCrewRunOptions): Promise<ResearchCrewRunResult> {
		const { eventSink } = options;
		const crewRoundId = `round_${randomUUID()}`;
		eventSink?.({
			type: "crew:created",
			roundId: crewRoundId,
			crewId: "data-crew",
			payload: { label: "Data Research Crew (Zetaris)", type: "data" },
			timestamp: Date.now(),
		});
		eventSink?.({
			type: "crew:created",
			roundId: crewRoundId,
			crewId: "web-crew",
			payload: { label: "Web Search Crew (External Standards)", type: "web" },
			timestamp: Date.now(),
		});

		const crewExecutionRunId = randomUUID();
		const crewConfig = {
			runId: crewExecutionRunId,
			topic: options.topic,
			mode: options.mode,
			scenarioPath: options.scenarioPath,
			eventSink,
		};
		const dataCrew = this.dependencies.createDataCrew(crewConfig);
		const webCrew = this.dependencies.createWebCrew(crewConfig);

		const [dataOutcome, webOutcome] = await Promise.all([
			this.dependencies.runCrewSafely(
				"DataCrew",
				() => dataCrew.run(),
				(error) => this.dependencies.emptyDataCrewReport(crewExecutionRunId, options.mode, error),
				eventSink,
				crewExecutionRunId,
				options.timeoutMs,
			),
			this.dependencies.runCrewSafely(
				"WebSearchCrew",
				() => webCrew.run(),
				(error) => this.dependencies.emptyWebCrewReport(crewExecutionRunId, options.topic, error),
				eventSink,
				crewExecutionRunId,
				options.timeoutMs,
			),
		]);

		if (options.mode === "live" && dataOutcome.failed) {
			throw new Error(
				`Live mode aborted: Zetaris Data Crew failed (${dataOutcome.error || "unknown error"}). ` +
					"No synthetic fallback is permitted in live mode.",
			);
		}

		eventSink?.({
			type: "agent_pre_cue",
			cueId: `cue_${randomUUID()}`,
			runId: crewExecutionRunId,
			conversationId: options.conversationId,
			targetAgent: "FactChecker",
			taskType: "prepare_schema_validation",
			hint: "Research crews completed; prepare schema validation against Zetaris virtual fabric.",
			sequence: 1,
			timestamp: Date.now(),
		});
		eventSink?.(
			dataOutcome.failed
				? {
						type: "crew:failed",
						roundId: crewRoundId,
						crewId: "data-crew",
						payload: { error: dataOutcome.error, timedOut: dataOutcome.timedOut },
						timestamp: Date.now(),
					}
				: {
						type: "crew:ready",
						roundId: crewRoundId,
						crewId: "data-crew",
						payload: { summary: dataOutcome.report.summary },
						timestamp: Date.now(),
					},
		);
		eventSink?.(
			webOutcome.failed
				? {
						type: "crew:failed",
						roundId: crewRoundId,
						crewId: "web-crew",
						payload: { error: webOutcome.error, timedOut: webOutcome.timedOut },
						timestamp: Date.now(),
					}
				: {
						type: "crew:ready",
						roundId: crewRoundId,
						crewId: "web-crew",
						payload: { summary: webOutcome.report.summary },
						timestamp: Date.now(),
					},
		);
		eventSink?.({
			type: "agent_pre_cue",
			cueId: `cue_${randomUUID()}`,
			runId: crewExecutionRunId,
			conversationId: options.conversationId,
			targetAgent: "RivalChallenger",
			taskType: "prepare_adversarial_challenge",
			hint: "Cross-silo findings ready; prepare adversarial review for unsupported assumptions.",
			sequence: 2,
			timestamp: Date.now(),
		});
		eventSink?.({
			type: "agent_pre_cue",
			cueId: `cue_${randomUUID()}`,
			runId: crewExecutionRunId,
			conversationId: options.conversationId,
			targetAgent: "Synthesizer",
			taskType: "prepare_consensus_synthesis",
			hint: "Evidence collected; initialize multi-agent consensus alignment rubric.",
			sequence: 3,
			timestamp: Date.now(),
		});

		return {
			crewRoundId,
			crewExecutionRunId,
			dataOutcome,
			webOutcome,
			dataCrewReport: dataOutcome.report,
			webCrewReport: webOutcome.report,
		};
	}
}
