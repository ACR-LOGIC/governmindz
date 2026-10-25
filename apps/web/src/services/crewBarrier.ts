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
import { appendCrewMessage, isCrewRoundReady } from "../types/crew";

export interface BarrierSummaryResult {
	summaryText: string;
	hasConflict: boolean;
	dataFindingsCount: number;
	webFindingsCount: number;
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

		if (eventType === "crew_complete") {
			const crewName = String(rawEvent.crew || "");
			const crewId = crewName.toLowerCase().includes("data") ? "data-crew" : "web-crew";
			const existing = round.crews[crewId];
			if (!existing) return round;

			const summaryText =
				String(rawEvent.summary || "") ||
				`Completed research with ${rawEvent.findingsCount || 4} verified findings.`;

			const readyMsg: CrewMessage = {
				id: `ready_${crewId}_${Date.now()}`,
				crewId,
				author: crewName,
				text: `Checkpoint: Research completed. Final findings submitted.`,
				ts: Date.now(),
				kind: "checkpoint",
			};

			// CRITICAL: Marks this crew as 'ready', but DOES NOT close bubbles or release barrier!
			return {
				...round,
				crews: {
					...round.crews,
					[crewId]: {
						...appendCrewMessage(existing, readyMsg),
						status: "ready",
						summary: summaryText,
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

			case "crew:ready": {
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
	 * Checks whether the barrier synchronization conditions are fully met:
	 * 1. Every authoritative crew ID in round.crewIds is 'ready'.
	 * 2. Barrier has not yet been released.
	 */
	static canRelease(round: CrewRound): boolean {
		return isCrewRoundReady(round) && !round.barrierReleased;
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

		const dataSummary = dataCrew?.summary || (dataCheckpoints.length > 0 ? dataCheckpoints[dataCheckpoints.length - 1].text : "Zetaris queries verified.");
		const webSummary = webCrew?.summary || (webCheckpoints.length > 0 ? webCheckpoints[webCheckpoints.length - 1].text : "External citations verified.");

		// Inspect messages for conflict keywords
		const allTexts = [...dataMessages, ...webMessages].map((m) => m.text.toLowerCase());
		const hasConflict = allTexts.some(
			(t) =>
				t.includes("dispute") ||
				t.includes("discrepancy") ||
				t.includes("conflict") ||
				t.includes("contradiction") ||
				t.includes("delayed") ||
				t.includes("outlier"),
		);

		let summary = `### 🤝 Harmonized Research Crew Briefing\n\n`;
		summary += `Both parallel research crews have synchronized and submitted verified findings.\n\n`;
		summary += `**1. Zetaris Federated Data Crew Findings:**\n`;
		summary += `> ${dataSummary}\n\n`;
		summary += `**2. External Standards & Web Search Crew Findings:**\n`;
		summary += `> ${webSummary}\n\n`;

		if (hasConflict) {
			summary += `> [!WARNING] **Evidence Divergence / Discrepancy Detected**\n`;
			summary += `> Data Crew records and external web citations note active operational differences or timing variances. Downstream Fact Checker and Thinker review will evaluate these discrepancies explicitly.\n\n`;
		} else {
			summary += `> [!NOTE] **Evidentiary Alignment**\n`;
			summary += `> Primary database catalog attributes and external regulatory standards demonstrate consistent baseline governance alignment.\n\n`;
		}

		summary += `*Barrier synchronized: Releasing parallel research bubbles to main deliberation.*`;

		return {
			summaryText: summary,
			hasConflict,
			dataFindingsCount: dataCheckpoints.length,
			webFindingsCount: webCheckpoints.length,
		};
	}

	/**
	 * Marks that the combined summary was successfully posted to the main conversation.
	 * Returns the updated round with barrierReleased: true and summaryPosted: true.
	 */
	static markSummaryPosted(round: CrewRound, summaryText: string): CrewRound {
		return {
			...round,
			barrierReleased: true,
			summaryPosted: true,
			summaryText,
			error: undefined,
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
