import type { AgentProfile, AgentStatus } from "../types";
import { getAgentProfile } from "./agentRegistry";

export type ArrivalStage = "pop_in" | "holding" | "greeting" | "assigned" | "working";

export interface ArrivalConfig {
	holdingDurationMs: number;
	greetingDurationMs: number;
	assignedDurationMs: number;
}

export const DEFAULT_ARRIVAL_CONFIG: ArrivalConfig = {
	holdingDurationMs: 400,
	greetingDurationMs: 400,
	assignedDurationMs: 300,
};

const HOLDING_MESSAGES = [
	"Hold up, one sec",
	"Give me a second",
	"One second, joining in",
	"Hold tight, stepping up",
];

export class AgentArrivalManager {
	private readonly config: ArrivalConfig;
	private timers: Map<string, any> = new Map();
	private activeRoster: Map<string, AgentProfile> = new Map();
	private currentConversationId: string | null = null;
	private onRosterChange?: (roster: AgentProfile[]) => void;

	constructor(config: Partial<ArrivalConfig> = {}, onRosterChange?: (roster: AgentProfile[]) => void) {
		this.config = { ...DEFAULT_ARRIVAL_CONFIG, ...config };
		this.onRosterChange = onRosterChange;
	}

	public setConversation(conversationId: string | null, initialAgents: AgentProfile[] = []): void {
		this.clearTimers();
		this.currentConversationId = conversationId;
		this.activeRoster.clear();
		for (const agent of initialAgents) {
			this.activeRoster.set(agent.id, {
				...agent,
				arrivalStage: "working",
			});
		}
		this.notify();
	}

	public getConversationId(): string | null {
		return this.currentConversationId;
	}

	public getRoster(): AgentProfile[] {
		return Array.from(this.activeRoster.values());
	}

	public clearRoster(): void {
		this.clearTimers();
		this.activeRoster.clear();
		this.notify();
	}

	public clearTimers(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
	}

	/**
	 * Activate an agent for the current conversation.
	 * Follows: pop_in -> holding -> greeting -> assigned -> working
	 */
	public activateAgent(
		seatId: string,
		assignment?: { humanName?: string; jobTask?: string; avatarId?: string; role?: string },
		initialTask?: string,
		conversationId?: string,
	): AgentProfile {
		// Stale event guard: if conversationId is specified and doesn't match current, ignore
		if (conversationId && this.currentConversationId && conversationId !== this.currentConversationId) {
			return getAgentProfile(seatId, assignment);
		}

		// Duplicate guard: if agent already exists in active roster
		const existing = this.activeRoster.get(seatId);
		if (existing) {
			// If already working or completed, do not regress back to holding/greeting
			if (existing.arrivalStage === "working") {
				if (initialTask && initialTask !== existing.currentTask) {
					existing.currentTask = initialTask;
					existing.jobTask = initialTask;
					this.notify();
				}
				return existing;
			}
			return existing;
		}

		// Initialize base profile
		const profile = getAgentProfile(seatId, assignment);
		if (initialTask) {
			profile.jobTask = initialTask;
			profile.currentTask = initialTask;
		}

		// Stage 1: Pop-in & Holding
		const holdingText = HOLDING_MESSAGES[Math.floor(Math.random() * HOLDING_MESSAGES.length)];
		profile.arrivalStage = "holding";
		profile.arrivalMessage = holdingText;
		profile.status = "queued";
		profile.lastActiveTime = Date.now();

		this.activeRoster.set(seatId, profile);
		this.notify();

		// Schedule non-blocking transitions
		if (this.config.holdingDurationMs <= 0) {
			// Fast bypass (test or instant mode)
			profile.arrivalStage = "working";
			profile.arrivalMessage = undefined;
			profile.status = "analyzing";
			this.notify();
			return profile;
		}

		// Holding -> Greeting
		const timer1 = setTimeout(() => {
			const current = this.activeRoster.get(seatId);
			if (!current || current.arrivalStage === "working") return;

			current.arrivalStage = "greeting";
			current.arrivalMessage = "Hey, I’m here.";
			this.notify();

			// Greeting -> Assigned
			const timer2 = setTimeout(() => {
				const curr2 = this.activeRoster.get(seatId);
				if (!curr2 || curr2.arrivalStage === "working") return;

				curr2.arrivalStage = "assigned";
				curr2.arrivalMessage = curr2.currentTask || curr2.jobTask || "Task assigned";
				this.notify();

				// Assigned -> Working
				const timer3 = setTimeout(() => {
					const curr3 = this.activeRoster.get(seatId);
					if (!curr3) return;

					curr3.arrivalStage = "working";
					curr3.arrivalMessage = undefined;
					if (curr3.status === "queued" || curr3.status === "idle") {
						curr3.status = "analyzing";
					}
					this.notify();
				}, this.config.assignedDurationMs);

				this.timers.set(`${seatId}_assigned`, timer3);
			}, this.config.greetingDurationMs);

			this.timers.set(`${seatId}_greeting`, timer2);
		}, this.config.holdingDurationMs);

		this.timers.set(`${seatId}_holding`, timer1);

		return profile;
	}

	/**
	 * Update agent's real execution workflow state.
	 * If substantive state arrives before visual arrival sequence finishes,
	 * seamlessly advance to working stage without blocking real work.
	 */
	public appendReasoning(seatId: string, reasoningChunk: string, conversationId?: string): void {
		if (conversationId && this.currentConversationId && conversationId !== this.currentConversationId) {
			return;
		}

		let agent = this.activeRoster.get(seatId);
		if (!agent) {
			agent = getAgentProfile(seatId);
			agent.arrivalStage = "working";
			agent.lastActiveTime = Date.now();
			this.activeRoster.set(seatId, agent);
		}

		if (agent.arrivalStage !== "working") {
			this.clearAgentTimers(seatId);
			agent.arrivalStage = "working";
			agent.arrivalMessage = undefined;
		}

		agent.liveReasoning = [...(agent.liveReasoning || []), reasoningChunk];
		if (agent.status !== "completed" && agent.status !== "error") {
			agent.status = "analyzing";
		}
		agent.lastActiveTime = Date.now();
		this.notify();
	}

	public updateWorkflowStatus(
		seatId: string,
		status: AgentStatus,
		confidence?: number | null,
		task?: string,
		conversationId?: string,
	): void {
		if (conversationId && this.currentConversationId && conversationId !== this.currentConversationId) {
			return;
		}

		let agent = this.activeRoster.get(seatId);
		if (!agent) {
			// Agent was activated directly by workflow event: introduce it directly to working
			agent = getAgentProfile(seatId);
			agent.arrivalStage = "working";
			agent.status = status;
			if (confidence !== undefined) agent.confidence = confidence;
			if (task) agent.currentTask = task;
			agent.lastActiveTime = Date.now();
			this.activeRoster.set(seatId, agent);
			this.notify();
			return;
		}

		// Cancel pending arrival timers if moving directly to substantive working or completed state
		if (status === "analyzing" || status === "challenging" || status === "synthesizing" || status === "completed") {
			this.clearAgentTimers(seatId);
			agent.arrivalStage = "working";
			agent.arrivalMessage = undefined;
		}

		agent.status = status;
		if (confidence !== undefined) agent.confidence = confidence;
		if (task) agent.currentTask = task;
		agent.lastActiveTime = Date.now();
		this.notify();
	}

	private clearAgentTimers(seatId: string): void {
		const holdingTimer = this.timers.get(`${seatId}_holding`);
		if (holdingTimer) {
			clearTimeout(holdingTimer);
			this.timers.delete(`${seatId}_holding`);
		}
		const greetingTimer = this.timers.get(`${seatId}_greeting`);
		if (greetingTimer) {
			clearTimeout(greetingTimer);
			this.timers.delete(`${seatId}_greeting`);
		}
		const assignedTimer = this.timers.get(`${seatId}_assigned`);
		if (assignedTimer) {
			clearTimeout(assignedTimer);
			this.timers.delete(`${seatId}_assigned`);
		}
	}

	private notify(): void {
		if (this.onRosterChange) {
			this.onRosterChange(this.getRoster());
		}
	}
}
