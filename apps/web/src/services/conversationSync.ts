import type {
	AgentProfile,
	AgentStatus,
	ChatMessage,
	Conversation,
	MessageType,
	SeatAssignment,
	StructuredOutput,
	WorkflowTimelineEvent,
} from "../types";
import { getAgentProfile } from "./agentRegistry";

export type ActivityPhase =
	| "researching"
	| "analyzing"
	| "responding"
	| "challenging"
	| "synthesizing";

export interface ActiveAgentActivity {
	seatId: string;
	phase: ActivityPhase;
	round?: number;
	detail?: string;
	targetSeat?: string;
	startedAt: number;
}

/**
 * Seats that represent non-conversational framing or internal sub-workers
 * and must never appear as standalone cards in the main conversation Agent Roster.
 */
const EXCLUDED_ROSTER_SEATS = new Set<string>([
	"user",
	"Orchestrator",
	"CredibleSourcesResearchAgent",
	"ContextAgent",
]);

const MENTION_TO_SEAT: Record<string, string> = {
	factchecker: "FactChecker",
	priya: "FactChecker",
	cloudarchitect: "CloudArchitect",
	marcus: "CloudArchitect",
	synthesizer: "Synthesizer",
	val: "Synthesizer",
	rivalchallenger: "RivalChallenger",
	arturo: "RivalChallenger",
	thinker: "Thinker",
	lucy: "Thinker",
	supervisor: "Supervisor",
};

/**
 * Returns true if the given seatId is eligible to appear in the conversation's
 * Agent Roster when assigned a task and joining the conversation.
 */
export function isRosterEligibleSeat(
	seatId: string | undefined | null,
	assignedSeats?: Record<string, SeatAssignment> | Set<string>,
): boolean {
	if (!seatId) return false;
	if (EXCLUDED_ROSTER_SEATS.has(seatId)) return false;
	if (seatId.startsWith("DataCrew-") || seatId.startsWith("WebCrew-")) {
		return false;
	}
	if (!assignedSeats) return true;
	if (assignedSeats instanceof Set) {
		return assignedSeats.size === 0 || assignedSeats.has(seatId);
	}
	const keys = Object.keys(assignedSeats);
	return keys.length === 0 || Boolean(assignedSeats[seatId]);
}

/**
 * Extracts a clean, concise snippet from a message for reply context display.
 */
export function buildReplyExcerpt(content: string | undefined, maxLength = 120): string | undefined {
	if (!content) return undefined;
	const cleaned = content
		.replace(/^\[([^\]]+)\]\s*/i, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return undefined;
	if (cleaned.length <= maxLength) return cleaned;
	return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Infers which prior message a new turn is replying to or challenging based on
 * explicit `inReplyTo`/`replyToId`, `toSeat`, `@Mentions`, or round rebuttal context.
 */
export function resolveReplyLink(
	incoming: {
		id?: string;
		fromSeat: string;
		toSeat?: string;
		type?: MessageType;
		content: string;
		round?: number;
		replyToId?: string;
		replyToExcerpt?: string;
	},
	existingMessages: ChatMessage[],
): { toSeat?: string; replyToId?: string; replyToExcerpt?: string } {
	let toSeat = incoming.toSeat;
	let replyToId = incoming.replyToId;
	let replyToExcerpt = incoming.replyToExcerpt;

	// 1. If explicit replyToId is provided, look up the target message to populate excerpt & toSeat
	if (replyToId) {
		const targetMsg = existingMessages.find((m) => m.id === replyToId);
		if (targetMsg) {
			if (!toSeat && targetMsg.fromSeat !== incoming.fromSeat && targetMsg.fromSeat !== "user") {
				toSeat = targetMsg.fromSeat;
			}
			if (!replyToExcerpt) {
				replyToExcerpt = buildReplyExcerpt(targetMsg.structured?.position || targetMsg.content);
			}
			return { toSeat, replyToId, replyToExcerpt };
		}
	}

	// 2. Check for @Mentions in message content if toSeat is not already set
	if (!toSeat && incoming.content) {
		const mentionMatches = Array.from(incoming.content.matchAll(/@([A-Za-z0-9_-]+)/g));
		for (const match of mentionMatches) {
			const token = match[1]?.toLowerCase();
			if (!token) continue;
			const mappedSeat = MENTION_TO_SEAT[token];
			if (mappedSeat && mappedSeat !== incoming.fromSeat) {
				toSeat = mappedSeat;
				break;
			}
		}
	}

	// 3. If toSeat is known (and is a specific agent seat), link to that seat's latest message
	if (toSeat && toSeat !== "council" && toSeat !== "all" && toSeat !== incoming.fromSeat) {
		for (let i = existingMessages.length - 1; i >= 0; i--) {
			const candidate = existingMessages[i];
			if (candidate.fromSeat === toSeat && candidate.id !== incoming.id) {
				replyToId = candidate.id;
				replyToExcerpt =
					replyToExcerpt ||
					buildReplyExcerpt(candidate.structured?.position || candidate.content);
				return { toSeat, replyToId, replyToExcerpt };
			}
		}
	}

	// 4. For challenges, rebuttals, refinements, or Round >= 1 turns, link to the most recent
	// relevant turn from another conversational seat if not already linked.
	const isInteractiveTurn =
		incoming.type === "challenge" ||
		incoming.type === "rebuttal" ||
		incoming.type === "refinement" ||
		(typeof incoming.round === "number" && incoming.round >= 1);

	if (isInteractiveTurn && incoming.fromSeat !== "user" && incoming.fromSeat !== "Orchestrator") {
		// If responding right after a RivalChallenger or Thinker intervention, link to it first
		for (let i = existingMessages.length - 1; i >= 0; i--) {
			const candidate = existingMessages[i];
			if (
				candidate.id !== incoming.id &&
				candidate.fromSeat !== incoming.fromSeat &&
				candidate.fromSeat !== "user" &&
				candidate.fromSeat !== "Orchestrator"
			) {
				replyToId = candidate.id;
				if (!toSeat) {
					toSeat = candidate.fromSeat;
				}
				replyToExcerpt =
					replyToExcerpt ||
					buildReplyExcerpt(candidate.structured?.position || candidate.content);
				return { toSeat, replyToId, replyToExcerpt };
			}
		}
	}

	return { toSeat, replyToId, replyToExcerpt };
}

/**
 * Normalizes a raw backend/demo message payload into a ChatMessage, deduplicates
 * against existing messages, resolves reply links, and maintains chronological order.
 */
export function upsertConversationMessage(
	existingMessages: ChatMessage[],
	rawMsg: Record<string, any>,
): { messages: ChatMessage[]; message: ChatMessage; isDuplicate: boolean } {
	const fromSeat: string = rawMsg.fromSeat || rawMsg.seatId || "Orchestrator";
	const content: string = String(rawMsg.content ?? rawMsg.envelope?.message?.text ?? "");
	const round: number | undefined =
		typeof rawMsg.round === "number" ? rawMsg.round : rawMsg.envelope?.execution?.round;
	const type: MessageType = (rawMsg.type ||
		rawMsg.envelope?.message?.type ||
		"proposal") as MessageType;

	// Build deterministic ID if none was provided
	const id: string =
		rawMsg.id ||
		`msg_${fromSeat}_${round ?? 0}_${type}_${ Math.abs(hashCode(content.slice(0, 120)))}`;

	// Check for exact ID match or identical (fromSeat + round + type + content) duplicate
	const existingIndex = existingMessages.findIndex(
		(m) =>
			m.id === id ||
			(m.fromSeat === fromSeat &&
				m.round === round &&
				m.type === type &&
				m.content === content &&
				content.length > 0),
	);

	const rawReplyToId: string | undefined =
		rawMsg.replyToId || rawMsg.inReplyTo || rawMsg.envelope?.message?.replyTo;

	const replyLink = resolveReplyLink(
		{
			id,
			fromSeat,
			toSeat: rawMsg.toSeat,
			type,
			content,
			round,
			replyToId: rawReplyToId,
			replyToExcerpt: rawMsg.replyToExcerpt,
		},
		existingIndex >= 0 ? existingMessages.slice(0, existingIndex) : existingMessages,
	);

	const structured: StructuredOutput | undefined = rawMsg.structured;
	const confidence: number | undefined =
		typeof rawMsg.confidence === "number"
			? rawMsg.confidence
			: structured?.confidence_self ?? structured?.confidenceSelf;

	const lastTimestamp =
		existingMessages.length > 0
			? existingMessages[existingMessages.length - 1].timestamp
			: 0;
	const rawTimestamp = typeof rawMsg.timestamp === "number" ? rawMsg.timestamp : Date.now();
	// Ensure monotonic timestamp progression so chronological sequence matches arrival order
	const timestamp = Math.max(rawTimestamp, lastTimestamp);

	const normalized: ChatMessage = {
		id: existingIndex >= 0 ? existingMessages[existingIndex].id : id,
		fromSeat,
		toSeat: replyLink.toSeat,
		type,
		content,
		structured,
		round,
		confidence,
		timestamp: existingIndex >= 0 ? existingMessages[existingIndex].timestamp : timestamp,
		latency_ms: rawMsg.latency_ms ?? rawMsg.envelope?.execution?.latency_ms,
		replyToId: replyLink.replyToId,
		replyToExcerpt: replyLink.replyToExcerpt,
		userRating: existingIndex >= 0 ? existingMessages[existingIndex].userRating : null,
		envelope: rawMsg.envelope,
	};

	if (existingIndex >= 0) {
		const updated = [...existingMessages];
		updated[existingIndex] = {
			...existingMessages[existingIndex],
			...normalized,
		};
		return {
			messages: updated,
			message: updated[existingIndex],
			isDuplicate: true,
		};
	}

	return {
		messages: [...existingMessages, normalized],
		message: normalized,
		isDuplicate: false,
	};
}

/**
 * Infers the semantic activity phase for an agent based on seat and workflow event.
 */
export function resolveActivityPhase(
	seatId: string,
	eventHint?: string,
	round?: number,
): ActivityPhase {
	const hint = (eventHint || "").toLowerCase();
	if (
		hint.includes("synthes") ||
		hint.includes("final") ||
		seatId === "Synthesizer" ||
		seatId === "Supervisor"
	) {
		if (round === undefined || round >= 1 || seatId === "Supervisor" || hint.includes("synthes")) {
			return "synthesizing";
		}
	}
	if (
		seatId === "RivalChallenger" ||
		hint.includes("challeng") ||
		hint.includes("rival") ||
		hint.includes("rebut") ||
		hint.includes("skeptic")
	) {
		return "challenging";
	}
	if (
		hint.includes("research") ||
		hint.includes("query") ||
		hint.includes("search") ||
		hint.includes("catalog") ||
		seatId.startsWith("DataCrew") ||
		seatId.startsWith("WebCrew")
	) {
		return "researching";
	}
	if (typeof round === "number" && round >= 1) {
		return "responding";
	}
	return "analyzing";
}

/**
 * Derives a WorkflowTimelineEvent from a real backend/demo stream event and appends it
 * to the conversation's workflowEvents list without duplicates.
 */
export function appendWorkflowTimelineEvent(
	existingEvents: WorkflowTimelineEvent[] = [],
	streamEvent: Record<string, any>,
): WorkflowTimelineEvent[] {
	const now = typeof streamEvent.timestamp === "number" ? streamEvent.timestamp : Date.now();
	let candidate: WorkflowTimelineEvent | null = null;

	switch (streamEvent.type) {
		case "run_start": {
			candidate = {
				id: `wf_run_start_${streamEvent.sessionId || now}`,
				state: "INQUIRY_RECEIVED",
				timestamp: now,
				trigger: "session_initialized",
				agent: "Orchestrator",
				details: `Deliberation initialized in ${String(streamEvent.mode || "live").toUpperCase()} mode.`,
			};
			break;
		}
		case "inquiry_score": {
			const scorePct =
				typeof streamEvent.score === "number"
					? `${(streamEvent.score * 100).toFixed(0)}%`
					: "computed";
			candidate = {
				id: `wf_inquiry_score_${scorePct}`,
				state: "COMPLEXITY_SCORED",
				timestamp: now,
				trigger: `inquiry_score: ${scorePct}`,
				agent: "Orchestrator",
				details:
					streamEvent.rationale ||
					`Inquiry complexity evaluated (${scorePct}) to determine debate depth.`,
			};
			break;
		}
		case "crew_start": {
			const crewName = streamEvent.crew === "data" ? "DataCrew" : "WebSearchCrew";
			candidate = {
				id: `wf_crew_start_${streamEvent.crew}`,
				state: "PARALLEL_RESEARCH",
				timestamp: now,
				trigger: `${crewName}.start`,
				agent: crewName,
				details:
					streamEvent.crew === "data"
						? "Dispatching parallel lakehouse schema, SQL, anomaly, and provenance checks."
						: "Dispatching parallel standards, freshness, scholarly, and counter-evidence checks.",
			};
			break;
		}
		case "zetaris": {
			const rows = streamEvent.total ?? streamEvent.rows?.length ?? 0;
			candidate = {
				id: `wf_zetaris_${rows}`,
				state: "EVIDENCE_RETRIEVED",
				timestamp: now,
				trigger: `zetaris_mcp (${rows} rows)`,
				agent: "FactChecker",
				details: `Retrieved ${rows} governed data rows via Zetaris MCP query.`,
			};
			break;
		}
		case "web_search": {
			const total = streamEvent.total ?? streamEvent.results?.length ?? 0;
			candidate = {
				id: `wf_web_search_${total}`,
				state: "EXTERNAL_GROUNDING",
				timestamp: now,
				trigger: `web_search (${total} sources)`,
				agent: "WebSearchCrew",
				details: `Verified ${total} external reference sources (${streamEvent.source || "web"}).`,
			};
			break;
		}
		case "seat_thinking": {
			const seatId = streamEvent.seatId || "Agent";
			const round = streamEvent.round ?? 0;
			const phase = resolveActivityPhase(seatId, streamEvent.step || streamEvent.phase, round);
			candidate = {
				id: `wf_thinking_${seatId}_r${round}_${phase}`,
				state:
					phase === "synthesizing"
						? "CONSENSUS_SYNTHESIS"
						: phase === "challenging"
							? "ADVERSARIAL_CHALLENGE"
							: round > 0
								? `ROUND_${round}_DELIBERATION`
								: "PROPOSAL_GENERATION",
				timestamp: now,
				trigger: `seat_thinking (Round ${round})`,
				agent: seatId,
				details:
					streamEvent.step ||
					`${seatId} is ${phase} for Round ${round}.`,
			};
			break;
		}
		case "rival_trigger":
		case "hater_crew_challenge": {
			const target = streamEvent.targetSeat || streamEvent.targetAgent || "Council";
			candidate = {
				id: `wf_challenge_${streamEvent.type}_${target}_${streamEvent.round ?? 0}`,
				state: "ADVERSARIAL_CHALLENGE",
				timestamp: now,
				trigger: `${streamEvent.type} -> ${target}`,
				agent: "RivalChallenger",
				details:
					streamEvent.challengeText ||
					`Challenging ${target} to verify evidence and assumptions.`,
			};
			break;
		}
		case "thinker_question": {
			candidate = {
				id: `wf_thinker_${streamEvent.round ?? 0}`,
				state: "SOCRATIC_PROBE",
				timestamp: now,
				trigger: "thinker_intervention",
				agent: "Thinker",
				details:
					streamEvent.question ||
					"Probing edge cases and unexamined operational hypotheses.",
			};
			break;
		}
		case "message": {
			const msg = streamEvent.message;
			if (!msg || msg.fromSeat === "user" || msg.fromSeat === "Orchestrator") {
				return existingEvents;
			}
			const seatId = msg.fromSeat;
			const round = msg.round ?? 0;
			const confStr =
				typeof msg.confidence === "number"
					? ` (${(msg.confidence * 100).toFixed(0)}% conf)`
					: "";
			candidate = {
				id: `wf_msg_${msg.id || `${seatId}_${round}_${msg.type}`}`,
				state:
					msg.type === "final" || msg.type === "consensus"
						? "CONSENSUS_REACHED"
						: msg.type === "challenge"
							? "ADVERSARIAL_CHALLENGE"
							: msg.type === "rebuttal" || msg.type === "refinement"
								? `ROUND_${round}_RESPONSE`
								: `ROUND_${round}_PROPOSAL`,
				timestamp: msg.timestamp || now,
				trigger: `${msg.type || "message"}${confStr}`,
				agent: seatId,
				details:
					buildReplyExcerpt(msg.structured?.position || msg.content, 140) ||
					`${seatId} published a ${msg.type || "response"}.`,
			};
			break;
		}
		case "delivery_approved": {
			candidate = {
				id: "wf_delivery_approved",
				state: "SUPERVISOR_APPROVED",
				timestamp: now,
				trigger: `decision: ${streamEvent.decision || "APPROVED"}`,
				agent: "Supervisor",
				details: "Supervisor verified deliverable contract and approved final synthesis.",
			};
			break;
		}
		case "complete": {
			const confPct =
				typeof streamEvent.finalConfidence === "number"
					? `${(streamEvent.finalConfidence * 100).toFixed(1)}%`
					: "verified";
			candidate = {
				id: "wf_complete",
				state: "AUDIT_SEALED",
				timestamp: now,
				trigger: `complete (${confPct} confidence)`,
				agent: "Synthesizer",
				details: `Deliberation completed and cryptographically sealed at ${confPct} confidence.`,
			};
			break;
		}
		case "error": {
			candidate = {
				id: `wf_error_${now}`,
				state: "EXECUTION_ERROR",
				timestamp: now,
				trigger: "stream_error",
				agent: "Orchestrator",
				details: String(streamEvent.message || "An execution error occurred."),
			};
			break;
		}
		default:
			return existingEvents;
	}

	if (!candidate) return existingEvents;

	const existingIdx = existingEvents.findIndex((e) => e.id === candidate!.id);
	if (existingIdx >= 0) {
		const next = [...existingEvents];
		next[existingIdx] = candidate;
		return next;
	}

	return [...existingEvents, candidate];
}

/**
 * Returns the ordered list of unique agent seatIds that actually joined the
 * conversation (i.e. contributed a message or final supervisor synthesis),
 * in chronological order of their first appearance.
 *
 * Agents that never joined the conversation are strictly excluded.
 */
export function extractParticipatingSeatIds(
	conversation: Pick<Conversation, "messages" | "agentAssignments" | "supervisorResponse">,
	assignedSeatIds?: Set<string>,
): string[] {
	const joined: string[] = [];
	const seen = new Set<string>();

	for (const msg of conversation.messages || []) {
		const seatId = msg.fromSeat;
		if (!isRosterEligibleSeat(seatId, assignedSeatIds || conversation.agentAssignments)) {
			continue;
		}
		if (!seen.has(seatId)) {
			seen.add(seatId);
			joined.push(seatId);
		}
	}

	return joined;
}

/**
 * Filters a seat assignment map so only agents that actually joined the conversation
 * remain stored on the conversation history.
 */
export function filterAssignmentsToParticipants(
	assignments: Record<string, SeatAssignment> | undefined,
	participatingSeatIds: Iterable<string>,
): Record<string, SeatAssignment> | undefined {
	if (!assignments) return undefined;
	const allowed = new Set(participatingSeatIds);
	const filtered: Record<string, SeatAssignment> = {};
	for (const seatId of allowed) {
		if (assignments[seatId]) {
			filtered[seatId] = assignments[seatId];
		}
	}
	return filtered;
}

/**
 * Reconstructs the Agent Roster for a conversation strictly from the agents
 * that actually joined the conversation, in the order they joined.
 */
export function buildParticipatingAgentRoster(
	conversation: Conversation,
	isCompleted: boolean = conversation.status === "completed",
): AgentProfile[] {
	const participatingIds = extractParticipatingSeatIds(conversation);
	const roster: AgentProfile[] = [];

	for (const seatId of participatingIds) {
		const assignment = conversation.agentAssignments?.[seatId];
		const profile = getAgentProfile(seatId, assignment);
		const agentMessages = conversation.messages.filter((m) => m.fromSeat === seatId);
		const lastMsg = agentMessages[agentMessages.length - 1];

		let status: AgentStatus = "analyzing";
		if (isCompleted) {
			status = "completed";
		} else if (lastMsg) {
			if (lastMsg.type === "final" || lastMsg.type === "consensus") {
				status = "synthesizing";
			} else if (lastMsg.type === "challenge") {
				status = "challenging";
			} else {
				status = "analyzing";
			}
		}

		roster.push({
			...profile,
			status,
			arrivalStage: "working",
			arrivalMessage: undefined,
			confidence:
				typeof lastMsg?.confidence === "number" ? lastMsg.confidence : profile.confidence,
			evidenceCount: agentMessages.reduce(
				(acc, m) => acc + (m.structured?.evidence?.length || 0),
				0,
			),
			lastActiveTime: lastMsg?.timestamp || conversation.updatedAt,
		});
	}

	return roster;
}

function hashCode(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return hash;
}
