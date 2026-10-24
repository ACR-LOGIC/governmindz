// biome-ignore-all lint/style/noNonNullAssertion: legacy code pending refactor

import { AuditEvent, AuditTrailEmitter, verifySqliteIntegrity, sqliteAudit } from "./AuditTrailEmitter";
import { randomUUID } from "node:crypto";
import type { HandoffMessage, WorkflowRun, WorkflowState, ExecutionPlan, InterventionRecord } from "../orchestration/WorkflowStateMachine";
import type { AgentMessage } from "./AgentMessage";

// ============================================================
// Agent task descriptor
// ============================================================

interface AgentTaskDescriptor {
	id: string;
	agentId: string;
	agentName: string;
	task: string;
	dependsOn: string[]; // task IDs this task depends on
	priority: number;
	maxDurationMs: number;
	cancelAfterMs: number;
}

// ============================================================
// Scheduler state
// ============================================================

type SchedulerState = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";

interface ScheduledAgent {
	id: string;
	agentId: string;
	agentName: string;
	task: string;
	status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
	startTime: number | null;
	endTime: number | null;
	durationMs: number | null;
	error?: string;
	dependsOn: string[];
	dependents: string[]; // tasks that depend on this one
}

interface SchedulerMetrics {
	totalAgents: number;
	completedAgents: number;
	failedAgents: number;
	cancelledAgents: number;
	averageDurationMs: number;
}

// ============================================================
// ParallelAgentScheduler
// ============================================================

export class ParallelAgentScheduler {
	private state: SchedulerState = "IDLE";
	private tasks: Map<string, ScheduledAgent> = new Map();
	private eventEmitter: AuditTrailEmitter;
	private metrics: SchedulerMetrics = {
		totalAgents: 0,
		completedAgents: 0,
		failedAgents: 0,
		cancelledAgents: 0,
		averageDurationMs: 0,
	};
	private runningAgents: Set<string> = new Set();
	private timeoutHandlers: Map<string, NodeJS.Timeout> = new Map();

	constructor(eventEmitter: AuditTrailEmitter) {
		this.eventEmitter = eventEmitter;
	}

	// Map the agent dependency graph from workflow state
	mapAgentDependencyGraph(
		runId: string,
		executionPlan: ExecutionPlan | null,
		interventions: InterventionRecord[],
		handoffs: HandoffMessage[],
	): ScheduledAgent[] {
		const agents: ScheduledAgent[] = [];

		// Define the core agent tasks based on the workflow state machine
		// Each agent has dependencies on prior agents in the flow
		const agentDefs: AgentTaskDescriptor[] = [
			{
				id: "research",
				agentId: "ResearchAgent",
				agentName: "ResearchAgent",
				task: "Conduct research and gather evidence",
				dependsOn: [],
				priority: 1,
				maxDurationMs: 30000,
				cancelAfterMs: 5000,
			},
			{
				id: "challenge",
				agentId: "RivalChallenger",
				agentName: "RivalChallenger",
				task: "Challenge high-confidence claims with weak evidence",
				dependsOn: ["research"],
				priority: 2,
				maxDurationMs: 20000,
				cancelAfterMs: 3000,
			},
			{
				id: "think",
				agentId: "ThinkerAgent",
				agentName: "ThinkerAgent",
				task: "Generate questions from contradictions and gaps",
				dependsOn: ["research", "challenge"],
				priority: 2,
				maxDurationMs: 25000,
				cancelAfterMs: 3000,
			},
			{
				id: "synthesize",
				agentId: "Synthesizer",
				agentName: "Synthesizer",
				task: "Synthesize consensus from agent contributions",
				dependsOn: ["research", "challenge", "think"],
				priority: 3,
				maxDurationMs: 30000,
				cancelAfterMs: 5000,
			},
		];

		// Create scheduled agents with dependency relationships
		for (const def of agentDefs) {
			const dependents: string[] = [];
			for (const other of agentDefs) {
				if (other.dependsOn.includes(def.id)) {
					dependents.push(other.id);
				}
			}

			const agent: ScheduledAgent = {
				id: def.id,
				agentId: def.agentId,
				agentName: def.agentName,
				task: def.task,
				status: "PENDING",
				startTime: null,
				endTime: null,
				durationMs: null,
				dependsOn: def.dependsOn,
				dependents,
			};

			this.tasks.set(def.id, agent);
		}

		// Set up dependents relationships reverse
		for (const [id, agent] of this.tasks) {
			for (const depId of agent.dependsOn) {
				if (this.tasks.has(depId)) {
					this.tasks.get(depId)!.dependents.push(id);
				}
			}
		}

		return agents;
	}

	// Start the scheduler with bounded concurrency
	start(maxConcurrent: number = 3): void {
		if (this.state !== "IDLE") {
			console.warn(`Scheduler is in ${this.state} state, cannot start`);
			return;
		}

		this.state = "RUNNING";
		this.runAgents(maxConcurrent);
	}

	private runAgents(maxConcurrent: number): void {
		// Find all agents whose dependencies are satisfied and that are not already running
		const readyAgents = Array.from(this.tasks.values())
			.filter(
				(agent) =>
					agent.status === "PENDING" &&
					agent.dependsOn.every((dep) => {
						const depTask = this.tasks.get(dep);
						return (
							depTask === undefined ||
							depTask.status === "COMPLETED" ||
							depTask.status === "FAILED"
						);
					}),
			)
			.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

		// Start up to maxConcurrently ready agents
		const toStart = readyAgents.slice(0, maxConcurrent);

		for (const agent of toStart) {
			this.startAgent(agent.id);
		}

		// If there are still pending agents, check again when one finishes
		if (readyAgents.length > toStart.length) {
			// Poll until all agents complete
			const checkInterval = setInterval(() => {
				const stillRunning = Array.from(this.runningAgents).length;
				if (stillRunning === 0 && this.areAllDone()) {
					clearInterval(checkInterval);
					this.state = "COMPLETED";
					this.emitCompletion();
				}
			}, 100);
		}
	}

	private areAllDone(): boolean {
		return Array.from(this.tasks.values()).every(
			(agent) =>
				agent.status === "COMPLETED" ||
				agent.status === "FAILED" ||
				agent.status === "CANCELLED",
		);
	}

	private startAgent(agentId: string): void {
		const agent = this.tasks.get(agentId);
		if (!agent || agent.status !== "PENDING") return;

		agent.status = "RUNNING";
		agent.startTime = Date.now();
		this.runningAgents.add(agentId);

		// Set timeout for cancellation
		const timeoutHandler = setTimeout(() => {
			this.cancelAgent(agentId, "timeout");
		}, agent.cancelAfterMs ?? 5000);

		this.timeoutHandlers.set(agentId, timeoutHandler);

		// Emit agent start event
		this.emitAgentEvent(agent, "start");

		console.log(`[Scheduler] Starting agent: ${agent.agentName} (${agent.task})`);
	}

	private cancelAgent(agentId: string, reason: string): void {
		const agent = this.tasks.get(agentId);
		if (!agent) return;

		clearTimeout(this.timeoutHandlers.get(agentId)!);
		this.timeoutHandlers.delete(agentId);
		this.runningAgents.delete(agentId);

		agent.status = "CANCELLED";
		agent.endTime = Date.now();
		agent.durationMs = agent.endTime - agent.startTime ?? 0;
		agent.error = reason;

		this.metrics.cancelledAgents++;

		// Emit cancellation event
		this.emitAgentEvent(agent, "cancel", reason);

		console.log(`[Scheduler] Agent cancelled: ${agent.agentName} - ${reason}`);

		// Check if we can proceed with remaining agents
		this.checkProgression();
	}

	private emitAgentEvent(agent: ScheduledAgent, event: "start" | "complete" | "cancel" | "fail", detail?: string): void {
		const payload: Record<string, unknown> = {
			agent_id: agent.agentId,
			agent_name: agent.agentName,
			task: agent.task,
			status: agent.status,
			task_id: agent.id,
		};

		if (detail) {
			payload.reason = detail;
		}

		const eventType = `agent_${event}`;
		this.eventEmitter.emit({
			event_type: eventType,
			session_id: "scheduler",
			timestamp: Date.now(),
			payload,
		});
	}

	private checkProgression(): void {
		// When an agent completes, check if dependent agents can now start
		const completedAgents = Array.from(this.tasks.values())
			.filter((a) => a.dependents.some((dep) => this.tasks.get(dep)?.status === "COMPLETED"));

		for (const completed of completedAgents) {
			const dependsOnCompleted = completed.dependsOn.every(
				(dep) => this.tasks.get(dep)?.status === "COMPLETED",
			);

			if (dependsOnCompleted && completed.status === "PENDING") {
				this.startAgent(completed.id);
			}
		}
	}

	// Mark an agent as completed
	completeAgent(agentId: string, result?: string): void {
		const agent = this.tasks.get(agentId);
		if (!agent) return;

		clearTimeout(this.timeoutHandlers.get(agentId)!);
		this.timeoutHandlers.delete(agentId);
		this.runningAgents.delete(agentId);

		agent.status = "COMPLETED";
		agent.endTime = Date.now();
		agent.durationMs = agent.endTime - agent.startTime ?? 0;

		if (result) {
			agent.error = undefined;
		}

		this.metrics.completedAgents++;

		this.emitAgentEvent(agent, "complete", result);

		this.checkProgression();
	}

	// Get current scheduler metrics
	getMetrics(): SchedulerMetrics {
		const completed = Array.from(this.tasks.values()).filter(
			(a) => a.status === "COMPLETED",
		).length;
		const failed = Array.from(this.tasks.values()).filter(
			(a) => a.status === "FAILED",
		).length;
		const cancelled = Array.from(this.tasks.values()).filter(
			(a) => a.status === "CANCELLED",
		).length;

		this.metrics = {
			totalAgents: this.tasks.size,
			completedAgents: completed,
			failedAgents: failed,
			cancelledAgents: cancelled,
			averageDurationMs:
				completed > 0
					? Array.from(this.tasks.values())
							.filter((a) => a.status === "COMPLETED" && a.durationMs)
							.reduce((sum, a) => sum + (a.durationMs ?? 0), 0) /
							  completed
					: 0,
		};

		return this.metrics;
	}

	// Get the current state of all agents
	getAgentStates(): Map<string, ScheduledAgent> {
		return new Map([...this.tasks]);
	}

	// Force cancel all running agents
	cancelAll(reason: string = "manual_cancellation": void {
		for (const agentId of Array.from(this.runningAgents)) {
			this.cancelAgent(agentId, reason);
		}
		this.state = "CANCELLED";
	});

	// Emit completion event
	private emitCompletion(): void {
		this.eventEmitter.emit({
			event_type: "scheduler_complete",
			session_id: "scheduler",
			timestamp: Date.now(),
			payload: {
				total_agents: this.metrics.totalAgents,
				completed: this.metrics.completedAgents,
				failed: this.metrics.failedAgents,
				cancelled: this.metrics.cancelledAgents,
			},
		});
	}
}

// Export a convenience factory so the orchestrator can wire it up without
// needing to construct the emitter itself.
export function createScheduler(
	auditEmitter: AuditTrailEmitter,
): ParallelAgentScheduler {
	return new ParallelAgentScheduler(auditEmitter);
}