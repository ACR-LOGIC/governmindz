/**
 * Parallel Crew & Barrier Synchronization Types
 * Isolated to frontend visualization and synchronization logic.
 */

export type CrewType = "data" | "web" | "pair";

export type CrewStatus = "talking" | "ready" | "wrapping_up";

export type CrewMessageKind = "chat" | "checkpoint";

export interface CrewMessage {
	id: string;
	crewId: string;
	author: string;
	text: string;
	ts: number;
	kind: CrewMessageKind;
}

export interface ActiveCrew {
	id: string;
	type: CrewType;
	label: string;
	status: CrewStatus;
	messages: CrewMessage[];
	softDeadlineAt: number;
	summary?: string;
}

export interface CrewRound {
	roundId: string;
	crewIds: string[];
	mainChatId: string;
	crews: Record<string, ActiveCrew>;
	barrierReleased: boolean;
	summaryPosted: boolean;
	summaryText?: string;
	error?: string;
}

export type CrewEventType =
	| "crew:created"
	| "crew:message"
	| "crew:checkpoint"
	| "crew:ready"
	| "crew:timeout_soft";

export interface CrewEvent {
	type: CrewEventType;
	roundId: string;
	crewId: string;
	payload?: Record<string, unknown>;
	timestamp: number;
}

/**
 * Evaluates whether all required crews in the round have reached 'ready'.
 * Note: An individual crew reaching 'ready' does NOT release the barrier.
 */
export function isCrewRoundReady(round: CrewRound): boolean {
	if (!round || !round.crewIds || round.crewIds.length === 0) {
		return false;
	}
	return round.crewIds.every((id) => round.crews[id]?.status === "ready");
}

/**
 * Barrier release condition:
 * All required crews must be ready, and the barrier has not yet been released.
 */
export function canReleaseBarrier(round: CrewRound): boolean {
	return isCrewRoundReady(round) && !round.barrierReleased;
}

/**
 * Checks whether the crew has exceeded its soft deadline while still actively talking.
 */
export function hasSoftDeadlinePassed(crew: ActiveCrew, now: number = Date.now()): boolean {
	return crew.status === "talking" && crew.softDeadlineAt > 0 && now >= crew.softDeadlineAt;
}

/**
 * Pure state reducer to append an incoming message to a crew.
 * Preserves message ordering by timestamp and prevents duplicate message IDs.
 */
export function appendCrewMessage(crew: ActiveCrew, message: CrewMessage): ActiveCrew {
	if (crew.messages.some((m) => m.id === message.id)) {
		return crew;
	}
	const updatedMessages = [...crew.messages, message].sort((a, b) => a.ts - b.ts);
	return {
		...crew,
		messages: updatedMessages,
	};
}
