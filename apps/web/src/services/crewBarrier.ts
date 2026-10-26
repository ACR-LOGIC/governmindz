/**
 * Crew Barrier Synchronization Service
 * Coordinates parallel research crews, enforces barrier synchronization,
 * prevents stale/duplicate events, handles soft timeouts, and generates combined summaries.
 */

import type {
	ActiveCrew,
	CrewEvent,
	CrewMessage,
	CrewRound,
	CrewStatus,
	CrewType,
} from "../types/crew";
import { appendCrewMessage, isCrewRoundSettled } from "../types/crew";

export interface BarrierSummaryResult {
	summaryText: string;
	hasConflict: boolean;
	dataFindingsCount: number;
	webFindingsCount: number;
	partial: boolean;
	failedCrewIds: string[];
}

export class CrewBarrierManager {
	/**
	 * Initializes a new CrewRound with authoritative crew IDs.
	 */
	static createRound(
		roundId: string,
		crewIds: string[],
		mainChatId: string,
		options: { softDeadlineMs?: number } = {},
	): CrewRound {
		const softDeadlineMs = options.softDeadlineMs ?? 20000;
		const now = Date.now();
		const crews: Record<string, ActiveCrew> = {};

		for (const id of crewIds) {
			const type: CrewType = id.includes("data") ? "data" : id.includes("web") ? "web" : "pair";
			const label =
				type === "data"
					? "Data Research Crew (Zetaris)"
					: type === "web"
						? "Web Search Crew (External Standards)"
						: "Pair Research Crew";

			crews[id] = {
				id,
				type,
				label,
				status: "talking",
				messages: [],
				softDeadlineAt: now + softDeadlineMs,
			};
		}

		return {
			roundId,
			crewIds,
			mainChatId,
			crews,
			barrierReleased: false,
			summaryPosted: false,
		};
	}

	/**
	 * Normalizes any incoming event (both legacy backend events and normalized crew:* events)
	 * and updates the CrewRound state immutably.
	 */
	static processEvent(round: CrewRound, rawEvent: Record<string, unknown>): CrewRound {
		if (!round) return round;

		const eventType = String(rawEvent.type || "");

		// 1. Explicit normalized crew events
		if (eventType.startsWith("crew:")) {
			return this.handleNormalizedCrewEvent(round, rawEvent as unknown as CrewEvent);
		}

		// 2. Map existing backend events into crew updates
		if (eventType === "crew_start") {
			const crewName = String(rawEvent.crew || "");
			const crewId = crewName.toLowerCase().includes("data") ? "data-crew" : "web-crew";
			const existing = round.crews[crewId];
			if (!existing) return round;

			const startMsg: CrewMessage = {
				id: `start_${crewId}_${Date.now()}`,
				crewId,
				author: crewName,
				text: `Launched parallel research with ${rawEvent.agentCount || 4} specialized agents.`,
				ts: Number(rawEvent.timestamp) || Date.now(),
				kind: "checkpoint",
			};

			return {
				...round,
				crews: {
					...round.crews,
					[crewId]: appendCrewMessage(existing, startMsg),
				},
			};
		}

		if (eventType === "agent_task_assigned") {
			const agentId = String(rawEvent.agentId || "");
			const rawCrew = String(rawEvent.crew || "");
			const crewId = rawEvent.crewId
				? String(rawEvent.crewId)
				: rawCrew.toLowerCase().includes("data") || agentId.toLowerCase().includes("data")
					? "data-crew"
					: "web-crew";
			const existing = round.crews[crewId];
			if (!existing) return round;

			const taskMsg: CrewMessage = {
				id: String(rawEvent.taskId || `task_${Date.now()}`),
				crewId,
				author: agentId,
				text: `Assigned: ${rawEvent.task || rawEvent.role || "Research Task"}`,
				ts: Number(rawEvent.timestamp) || Date.now(),
				kind: "chat",
			};

			return {
				...round,
				crews: {
					...round.crews,
					[crewId]: appendCrewMessage(existing, taskMsg),
				},
			};
		}

		if (eventType === "research_finding") {
			const agentId = String(rawEvent.agentId || "");
			const rawCrew = String(rawEvent.crew || "");
			const crewId = rawEvent.crewId
				? String(rawEvent.crewId)
				: rawCrew.toLowerCase().includes("data") || agentId.toLowerCase().includes("data")
					? "data-crew"
					: "web-crew";
			const existing = round.crews[crewId];
			if (!existing) return round;

			const finding = (rawEvent.finding as any) || {};
			const claimText = finding.claim || finding.title || "Discovered new evidence record.";

			const findingMsg: CrewMessage = {
				id: `finding_${agentId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
				crewId,
				author: agentId,
				text: claimText,
				ts: Number(finding.timestamp) || Date.now(),
				kind: "checkpoint",
			};

			return {
				...round,
				crews: {
					...round.crews,
					[crewId]: appendCrewMessage(existing, findingMsg),
				},
			};
		}

		if (eventType === "crew_failed" || eventType === "crew_complete") {
			const crewName = String(rawEvent.crew || "");
			const crewId = crewName.toLowerCase().includes("data") ? "data-crew" : "web-crew";
			const existing = round.crews[crewId];
			if (!existing) return round;

			const failed = eventType === "crew_failed" || Boolean(rawEvent.failed);
			const errorText = String(rawEvent.error || rawEvent.summary || "").trim();
			const timedOut =
				Boolean(rawEvent.timedOut) ||
				existing.status === "timed_out" ||
				/timed out|timeout/i.test(errorText);

			if (failed) {
				const summaryText =
					errorText ||
					`${crewName} did not complete. No verified evidence was submitted for this crew.`;
				const failureMsg: CrewMessage = {
					id: `failed_${crewId}_${Date.now()}`,
					crewId,
					author: "Supervisor",
					text: `Checkpoint: Research did not complete. Evidence from this crew is excluded.`,
					ts: Number(rawEvent.timestamp) || Date.now(),
					kind: "checkpoint",
				};
				const alreadyFailed = existing.status === "failed" || existing.status === "timed_out";
				const updatedCrew = alreadyFailed
					? {
							...existing,
							status: timedOut ? ("timed_out" as CrewStatus) : existing.status,
							summary: summaryText,
							failureReason: errorText || existing.failureReason,
							timedOut: timedOut || existing.timedOut,
						}
					: {
							...appendCrewMessage(existing, failureMsg),
							status: timedOut ? ("timed_out" as CrewStatus) : ("failed" as CrewStatus),
							summary: summaryText,
							failureReason: errorText || `${crewName} did not complete.`,
							timedOut,
						};

				return {
					...round,
					crews: {
						...round.crews,
						[crewId]: updatedCrew,
					},
				};
			}

			if (existing.status === "failed" || existing.status === "timed_out") {
				return round;
			}

			const summaryText =
				String(rawEvent.summary || "") ||
				`Completed research with ${rawEvent.findingsCount || 4} verified findings.`;

			const readyMsg: CrewMessage = {
				id: `ready_${crewId}_${Date.now()}`,
				crewId,
				author: crewName,
				text: `Checkpoint: Research completed. Final findings submitted.`,
				ts: Number(rawEvent.timestamp) || Date.now(),
				kind: "checkpoint",
			};

			// Marks this crew as ready, but does not close bubbles or release the barrier.
			return {
				...round,
				crews: {
					...round.crews,
					[crewId]: {
						...appendCrewMessage(existing, readyMsg),
						status: "ready",
						summary: summaryText,
						failureReason: undefined,
						timedOut: false,
					},
				},
			};
		}

		return round;
	}

	/**
	 * Handles explicitly typed crew:* events.
	 */
	private static handleNormalizedCrewEvent(round: CrewRound, event: CrewEvent): CrewRound {
		const { type, crewId, payload, timestamp } = event;
		const existing = round.crews[crewId];
		if (!existing) return round;

		switch (type) {
			case "crew:created": {
				return {
					...round,
					crews: {
						...round.crews,
						[crewId]: {
							...existing,
							status: "talking",
						},
					},
				};
			}

			case "crew:message": {
				const text = String(payload?.text || "");
				const author = String(payload?.author || existing.label);
				const msgId = String(payload?.id || `msg_${Date.now()}`);
				const msg: CrewMessage = {
					id: msgId,
					crewId,
					author,
					text,
					ts: timestamp || Date.now(),
					kind: "chat",
				};
				return {
					...round,
					crews: {
						...round.crews,
						[crewId]: appendCrewMessage(existing, msg),
					},
				};
			}

			case "crew:checkpoint": {
				const text = String(payload?.text || "");
				const author = String(payload?.author || existing.label);
				const msgId = String(payload?.id || `cp_${Date.now()}`);
				const msg: CrewMessage = {
					id: msgId,
					crewId,
					author,
					text,
					ts: timestamp || Date.now(),
					kind: "checkpoint",
				};
				return {
					...round,
					crews: {
						...round.crews,
						[crewId]: appendCrewMessage(existing, msg),
					},
				};
			}

			case "crew:timeout_soft": {
				// Soft timeout MUST transition to wrapping_up, NOT ready!
				if (existing.status === "talking") {
					const warnMsg: CrewMessage = {
						id: `warn_${crewId}_${Date.now()}`,
						crewId,
						author: "Supervisor",
						text: "Soft deadline reached. Finalizing remaining queries...",
						ts: timestamp || Date.now(),
						kind: "checkpoint",
					};
					return {
						...round,
						crews: {
							...round.crews,
							[crewId]: {
								...appendCrewMessage(existing, warnMsg),
								status: "wrapping_up",
							},
						},
					};
				}
				return round;
			}

			case "crew:failed": {
				const errorText = String(payload?.error || payload?.summary || "Crew did not complete.");
				const timedOut = Boolean(payload?.timedOut) || /timed out|timeout/i.test(errorText);
				const failureMsg: CrewMessage = {
					id: `failed_${crewId}_${Date.now()}`,
					crewId,
					author: "Supervisor",
					text: `Checkpoint: Research did not complete. Evidence from this crew is excluded.`,
					ts: timestamp || Date.now(),
					kind: "checkpoint",
				};
				return {
					...round,
					crews: {
						...round.crews,
						[crewId]: {
							...appendCrewMessage(existing, failureMsg),
							status: timedOut ? "timed_out" : "failed",
							summary: errorText,
							failureReason: errorText,
							timedOut,
						},
					},
				};
			}

			case "crew:ready": {
				if (existing.status === "failed" || existing.status === "timed_out") {
					return round;
				}
				const summary = String(payload?.summary || "Research completed successfully.");
				const readyMsg: CrewMessage = {
					id: `ready_${crewId}_${Date.now()}`,
					crewId,
					author: existing.label,
					text: `Submitted final report: ${summary}`,
					ts: timestamp || Date.now(),
					kind: "checkpoint",
				};

				return {
					...round,
					crews: {
						...round.crews,
						[crewId]: {
							...appendCrewMessage(existing, readyMsg),
							status: "ready",
							summary,
						},
					},
				};
			}

			default:
				return round;
		}
	}

	/**
	 * Checks all active crews against their soft deadlines.
	 * If soft deadline has passed and crew is still 'talking', transitions it to 'wrapping_up'.
	 * Does NOT mark the crew ready.
	 */
	static checkSoftDeadlines(round: CrewRound, now: number = Date.now()): CrewRound {
		let modified = false;
		const updatedCrews = { ...round.crews };

		for (const crewId of round.crewIds) {
			const crew = updatedCrews[crewId];
			if (crew && crew.status === "talking" && crew.softDeadlineAt > 0 && now >= crew.softDeadlineAt) {
				const warnMsg: CrewMessage = {
					id: `timeout_${crewId}_${now}`,
					crewId,
					author: "Supervisor",
					text: "Notice: Soft deadline passed. Finalizing active inquiries...",
					ts: now,
					kind: "checkpoint",
				};
				updatedCrews[crewId] = {
					...appendCrewMessage(crew, warnMsg),
					status: "wrapping_up",
				};
				modified = true;
			}
		}

		if (!modified) return round;

		return {
			...round,
			crews: updatedCrews,
		};
	}

	/**
	 * Checks whether every authoritative crew has reached a terminal state.
	 * Failed and timed-out crews must not hold the barrier forever; their
	 * evidence is excluded and disclosed in the combined summary.
	 */
	static canRelease(round: CrewRound): boolean {
		return isCrewRoundSettled(round) && !round.barrierReleased;
	}

	/**
	 * Assembles the combined summary from all ready crews.
	 * Preserves discrepancies and contradictory evidence explicitly.
	 */
	static generateCombinedSummary(round: CrewRound): BarrierSummaryResult {
		const dataCrew = round.crews["data-crew"];
		const webCrew = round.crews["web-crew"];

		const dataMessages = dataCrew?.messages || [];
		const webMessages = webCrew?.messages || [];

		const dataCheckpoints = dataMessages.filter((m) => m.kind === "checkpoint");
		const webCheckpoints = webMessages.filter((m) => m.kind === "checkpoint");

		const crews = round.crewIds.map((id) => round.crews[id]).filter(Boolean);
		const failedCrews = crews.filter((crew) => crew.status === "failed" || crew.status === "timed_out");
		const readyCrews = crews.filter((crew) => crew.status === "ready");
		const partial = failedCrews.length > 0;
		const failedCrewIds = failedCrews.map((crew) => crew.id);

		const dataAvailable = dataCrew?.status === "ready";
		const webAvailable = webCrew?.status === "ready";

		const dataSummary = dataAvailable
			? dataCrew?.summary ||
				(dataCheckpoints.length > 0
					? dataCheckpoints[dataCheckpoints.length - 1].text
					: "Zetaris queries verified.")
			: `Data Crew did not complete. No database evidence from this crew is included.${
					dataCrew?.failureReason ? ` Reason: ${dataCrew.failureReason}` : ""
				}`;

		const webSummary = webAvailable
			? webCrew?.summary ||
				(webCheckpoints.length > 0
					? webCheckpoints[webCheckpoints.length - 1].text
					: "External citations verified.")
			: `Web Search Crew did not complete. No external citations from this crew are included.${
					webCrew?.failureReason ? ` Reason: ${webCrew.failureReason}` : ""
				}`;

		// Inspect available evidence for conflict keywords. Failure notices are
		// limitations, not evidence conflicts.
		const allTexts = [
			...dataMessages.filter(() => dataAvailable),
			...webMessages.filter(() => webAvailable),
		].map((m) => m.text.toLowerCase());
		const hasConflict = allTexts.some(
			(t) =>
				t.includes("dispute") ||
				t.includes("discrepancy") ||
				t.includes("conflict") ||
				t.includes("contradiction") ||
				t.includes("delayed") ||
				t.includes("outlier"),
		);

		let summary = partial
			? `### Research Crew Briefing (Partial Evidence)\n\n`
			: `### Harmonized Research Crew Briefing\n\n`;

		if (partial) {
			const names = failedCrews.map((crew) => crew.label).join(", ");
			summary += `${readyCrews.length} of ${crews.length} research crews returned verified findings. ${names} did not complete; their evidence is excluded from the verified record and must not be treated as consensus.\n\n`;
		} else {
			summary += `Both parallel research crews have synchronized and submitted verified findings.\n\n`;
		}

		summary += `**1. Zetaris Federated Data Crew Findings:**\n`;
		summary += `> ${dataSummary}\n\n`;
		summary += `**2. External Standards & Web Search Crew Findings:**\n`;
		summary += `> ${webSummary}\n\n`;

		if (partial) {
			summary += `> [!CAUTION] **Incomplete Research Evidence**\n`;
			summary += `> ${failedCrews
				.map((crew) => `${crew.label} is unavailable${crew.timedOut ? " after timing out" : ""}`)
				.join("; ")}. The final answer will disclose this limitation and cannot claim complete multi-crew verification.\n\n`;
		} else if (hasConflict) {
			summary += `> [!WARNING] **Evidence Divergence / Discrepancy Detected**\n`;
			summary += `> Data Crew records and external web citations note active operational differences or timing variances. Downstream Fact Checker and Thinker review will evaluate these discrepancies explicitly.\n\n`;
		} else {
			summary += `> [!NOTE] **Evidentiary Alignment**\n`;
			summary += `> Primary database catalog attributes and external regulatory standards demonstrate consistent baseline governance alignment.\n\n`;
		}

		summary += partial
			? `*Barrier released with partial evidence: research bubbles now pass to main deliberation with the limitation above.*`
			: `*Barrier synchronized: Releasing parallel research bubbles to main deliberation.*`;

		return {
			summaryText: summary,
			hasConflict,
			dataFindingsCount: dataCheckpoints.length,
			webFindingsCount: webCheckpoints.length,
			partial,
			failedCrewIds,
		};
	}

	/**
	 * Marks that the combined summary was successfully posted to the main conversation.
	 * Returns the updated round with barrierReleased: true and summaryPosted: true.
	 */
	static markSummaryPosted(round: CrewRound, summaryText: string): CrewRound {
		const failedCrewIds = round.crewIds.filter((id) => {
			const status = round.crews[id]?.status;
			return status === "failed" || status === "timed_out";
		});
		return {
			...round,
			barrierReleased: true,
			summaryPosted: true,
			summaryText,
			error: undefined,
			partial: failedCrewIds.length > 0,
			failedCrewIds,
		};
	}

	/**
	 * Preserves crew state on posting failure for retry/recovery.
	 */
	static markSummaryFailed(round: CrewRound, error: string): CrewRound {
		return {
			...round,
			barrierReleased: false,
			summaryPosted: false,
			error,
		};
	}
}
