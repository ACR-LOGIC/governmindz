import type { DataCrewReport } from "@governmindz/core/agents/DataCrew";
import type { WebSearchCrewReport } from "@governmindz/core/agents/WebSearchCrew";

type Sink = ((event: Record<string, unknown>) => void) | undefined;

export interface CrewOutcome<T> {
	report: T;
	failed: boolean;
	error?: string;
	timedOut: boolean;
}

function describe(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Run a crew without letting its failure abort the whole run. A failed crew is
 * never reported as a success: it yields an empty report, an explicit
 * `crew_failed` event, and a terminal `crew_complete` flagged `failed` so the
 * barrier can release and the final answer can disclose the limitation.
 */
export async function runCrewSafely<T>(
	crewName: string,
	run: () => Promise<T>,
	emptyReport: (error: string) => T,
	eventSink: Sink,
	runId: string,
	timeoutMs = 0,
): Promise<CrewOutcome<T>> {
	let timedOut = false;
	try {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const work = run();
		const report =
			timeoutMs > 0
				? await Promise.race([
						work,
						new Promise<never>((_, reject) => {
							timer = setTimeout(() => {
								timedOut = true;
								reject(new Error(`${crewName} timed out after ${timeoutMs}ms`));
							}, timeoutMs);
						}),
					]).finally(() => timer && clearTimeout(timer))
				: await work;
		return { report, failed: false, timedOut: false };
	} catch (err) {
		const error = describe(err);
		eventSink?.({ type: "crew_failed", crew: crewName, runId, error, timedOut, timestamp: Date.now() });
		eventSink?.({
			type: "crew_complete",
			crew: crewName,
			runId,
			failed: true,
			timedOut,
			findingsCount: 0,
			summary: `${crewName} did not complete: ${error}. Its evidence is NOT included.`,
			timestamp: Date.now(),
		});
		return { report: emptyReport(error), failed: true, error, timedOut };
	}
}

export function emptyDataCrewReport(runId: string, mode: "sample" | "live", error: string): DataCrewReport {
	return {
		runId,
		mode,
		findings: [],
		catalogDatabases: [],
		queriesExecuted: [],
		anomaliesDetected: [],
		provenanceSummary: `Data Crew unavailable: ${error}`,
		overallConfidence: 0,
		isSyntheticFallback: false,
		summary: `Data Crew failed (${error}). No database evidence was gathered.`,
	};
}

export function emptyWebCrewReport(runId: string, topic: string, error: string): WebSearchCrewReport {
	return {
		runId,
		topic,
		findings: [],
		totalCitationsFound: 0,
		contradictionsFound: [],
		unresolvedGaps: [`Web Search Crew failed: ${error}`],
		overallConfidence: 0,
		summary: `Web Search Crew failed (${error}). No external sources were reviewed.`,
	};
}
