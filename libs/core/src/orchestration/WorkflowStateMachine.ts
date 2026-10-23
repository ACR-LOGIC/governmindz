
import { randomUUID, createHash } from "node:crypto";
import { auditTrail } from "../engine/AuditTrailEmitter";
import type { AuditEvent } from "../engine/AuditTrailEmitter";

export type WorkflowState =
	| "RECEIVED"
	| "ASSESSED"
	| "CONTEXT_READY"
	| "RESEARCHING"
	| "EVIDENCE_REVIEW"
	| "DEBATING"
	| "CHALLENGE_PENDING"
	| "THINKING_PENDING"
	| "REVISION"
	| "FINAL_REVIEW"
	| "COMPLETED"
	| "HALTED";

export interface HandoffMessage {
	runId: string;
	fromAgent: string;
	toAgent: string;
	currentState: WorkflowState;
	nextState: WorkflowState;
	userQuestion: string;
	task: string;
	claims: Array<{ claimId: string; statement: string }>;
	evidence: Array<{
		source: string;
		excerpt?: string;
		date?: string;
		verificationStatus: "verified" | "partially_verified" | "disputed" | "unverified";
	}>;
	confidence: number; // 1-10
	confidenceRationale: string;
	limitations: string[];
	triggerReason: string;
	returnCondition: string;
	timestamp: number;
	mode: "sample" | "live";
}

export interface InterventionRecord {
	id: string;
	agent: "RivalChallenger" | "ThinkerAgent";
	state: WorkflowState;
	triggerReason: string;
	targetAgent: string;
	runId: string;
	timestamp: number;
	resolution: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED" | "PENDING";
	details: Record<string, unknown>;
}

export interface ExecutionPlan {
	runId: string;
	userQuestion: string;
	inquiryScore: number; // 1-10
	inquiryRationale: string;
	requiredAgents: string[];
	requiresZetaris: boolean;
	requiresResearch: boolean;
	contextNeeded: boolean;
	maxCycles: number;
	currentCycle: 0;
	mode: "sample" | "live";
}

export interface WorkflowRun {
	runId: string;
	userQuestion: string;
	mode: "sample" | "live";
	currentState: WorkflowState;
	executionPlan: ExecutionPlan | null;
	handoffs: HandoffMessage[];
	interventions: InterventionRecord[];
	conversationHistory: Array<{ role: string; content: string; timestamp: number }>;
	finalAnswer?: string;
	unresolvedIssues: string[];
	auditEvents: AuditEvent[];
	startedAt: number;
	completedAt?: number;
	haltReason?: string;
}

const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
	RECEIVED: ["ASSESSED", "HALTED"],
	ASSESSED: ["CONTEXT_READY", "RESEARCHING", "EVIDENCE_REVIEW", "DEBATING", "FINAL_REVIEW", "HALTED"],
	CONTEXT_READY: ["RESEARCHING", "DEBATING", "EVIDENCE_REVIEW", "FINAL_REVIEW", "HALTED"],
	RESEARCHING: ["EVIDENCE_REVIEW", "DEBATING", "CHALLENGE_PENDING", "THINKING_PENDING", "REVISION", "HALTED"],
	EVIDENCE_REVIEW: ["DEBATING", "CHALLENGE_PENDING", "THINKING_PENDING", "REVISION", "FINAL_REVIEW", "HALTED"],
	DEBATING: ["EVIDENCE_REVIEW", "CHALLENGE_PENDING", "THINKING_PENDING", "REVISION", "FINAL_REVIEW", "HALTED"],
	CHALLENGE_PENDING: ["REVISION", "EVIDENCE_REVIEW", "DEBATING", "FINAL_REVIEW", "HALTED"],
	THINKING_PENDING: ["RESEARCHING", "DEBATING", "EVIDENCE_REVIEW", "REVISION", "FINAL_REVIEW", "HALTED"],
	REVISION: ["EVIDENCE_REVIEW", "DEBATING", "FINAL_REVIEW", "HALTED"],
	FINAL_REVIEW: ["COMPLETED", "REVISION", "DEBATING", "HALTED"],
	COMPLETED: [],
	HALTED: [],
};

export class WorkflowStateMachine {
	private runs: Map<string, WorkflowRun> = new Map();
	private maxCycles: number;

	constructor(maxCycles = 5) {
		this.maxCycles = maxCycles;
	}

	createRun(
		userQuestion: string,
		mode: "sample" | "live",
		conversationHistory: Array<{ role: string; content: string; timestamp: number }> = [],
	): WorkflowRun {
		const runId = `run_${randomUUID()}`;
		const run: WorkflowRun = {
			runId,
			userQuestion,
			mode,
			currentState: "RECEIVED",
			executionPlan: null,
			handoffs: [],
			interventions: [],
			conversationHistory,
			unresolvedIssues: [],
			auditEvents: [],
			startedAt: Date.now(),
		};
		this.runs.set(runId, run);

		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: runId,
			timestamp: run.startedAt,
			payload: {
				workflow_event: "run_created",
				user_question_hash: this.hashQuestion(userQuestion),
				mode,
				initial_state: "RECEIVED",
			},
		});

		return run;
	}

	getRun(runId: string): WorkflowRun | undefined {
		return this.runs.get(runId);
	}

	transitionState(
		runId: string,
		nextState: WorkflowState,
		triggerReason: string,
		fromAgent: string = "Orchestrator",
	): boolean {
		const run = this.runs.get(runId);
		if (!run) return false;

		const allowed = VALID_TRANSITIONS[run.currentState];
		if (!allowed.includes(nextState)) {
			auditTrail.emitEvent({
				event_type: "session_complete",
				session_id: runId,
				timestamp: Date.now(),
				payload: {
					workflow_event: "invalid_transition",
					from: run.currentState,
					to: nextState,
					triggerReason,
				},
			});
			return false;
		}

		const previousState = run.currentState;
		run.currentState = nextState;

		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: runId,
			timestamp: Date.now(),
			payload: {
				workflow_event: "state_transition",
				from: previousState,
				to: nextState,
				triggerReason,
				fromAgent,
			},
		});

		return true;
	}

	recordHandoff(runId: string, handoff: Omit<HandoffMessage, "runId" | "timestamp">): void {
		const run = this.runs.get(runId);
		if (!run) return;

		const message: HandoffMessage = {
			...handoff,
			runId,
			timestamp: Date.now(),
		};
		run.handoffs.push(message);

		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: runId,
			timestamp: message.timestamp,
			payload: {
				workflow_event: "handoff",
				from: message.fromAgent,
				to: message.toAgent,
				from_state: message.currentState,
				to_state: message.nextState,
				trigger_reason: message.triggerReason,
				confidence: message.confidence,
			},
		});
	}

	recordIntervention(
		runId: string,
		intervention: Omit<InterventionRecord, "id" | "timestamp">,
	): void {
		const run = this.runs.get(runId);
		if (!run) return;

		const record: InterventionRecord = {
			...intervention,
			id: `int_${randomUUID()}`,
			timestamp: Date.now(),
		};
		run.interventions.push(record);

		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: runId,
			timestamp: record.timestamp,
			payload: {
				workflow_event: "intervention",
				agent: record.agent,
				state: record.state,
				trigger_reason: record.triggerReason,
				target_agent: record.targetAgent,
				resolution: record.resolution,
			},
		});
	}

	resolveIntervention(
		runId: string,
		interventionId: string,
		resolution: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED",
		details: Record<string, unknown> = {},
	): boolean {
		const run = this.runs.get(runId);
		if (!run) return false;

		const intervention = run.interventions.find((i) => i.id === interventionId);
		if (!intervention) return false;

		intervention.resolution = resolution;
		intervention.details = { ...intervention.details, ...details };

		if (resolution === "UNRESOLVED") {
			run.unresolvedIssues.push(
				`${intervention.agent}: ${intervention.triggerReason}`,
			);
		}

		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: runId,
			timestamp: Date.now(),
			payload: {
				workflow_event: "intervention_resolved",
				intervention_id: interventionId,
				agent: intervention.agent,
				resolution,
				details,
			},
		});

		return true;
	}

	updateExecutionPlan(runId: string, plan: Partial<ExecutionPlan>): void {
		const run = this.runs.get(runId);
		if (!run) return;

		if (!run.executionPlan) {
			run.executionPlan = {
				runId,
				userQuestion: run.userQuestion,
				inquiryScore: 5,
				inquiryRationale: "",
				requiredAgents: [],
				requiresZetaris: false,
				requiresResearch: false,
				contextNeeded: false,
				maxCycles: this.maxCycles,
				currentCycle: 0,
				mode: run.mode,
			};
		}

		Object.assign(run.executionPlan, plan);
	}

	incrementCycle(runId: string): void {
		const run = this.runs.get(runId);
		if (!run || !run.executionPlan) return;

		run.executionPlan.currentCycle += 1;
	}

	isCycleExhausted(runId: string): boolean {
		const run = this.runs.get(runId);
		if (!run || !run.executionPlan) return true;

		return run.executionPlan.currentCycle >= run.executionPlan.maxCycles;
	}

	completeRun(runId: string, finalAnswer: string): void {
		const run = this.runs.get(runId);
		if (!run) return;

		run.currentState = "COMPLETED";
		run.finalAnswer = finalAnswer;
		run.completedAt = Date.now();

		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: runId,
			timestamp: run.completedAt,
			payload: {
				workflow_event: "run_completed",
				final_answer_hash: this.hashQuestion(finalAnswer),
				unresolved_issues: run.unresolvedIssues,
				intervention_count: run.interventions.length,
			},
		});
	}

	haltRun(runId: string, reason: string): void {
		const run = this.runs.get(runId);
		if (!run) return;

		run.currentState = "HALTED";
		run.haltReason = reason;
		run.completedAt = Date.now();

		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: runId,
			timestamp: run.completedAt,
			payload: {
				workflow_event: "run_halted",
				halt_reason: reason,
			},
		});
	}

	addUnresolvedIssue(runId: string, issue: string): void {
		const run = this.runs.get(runId);
		if (!run) return;
		run.unresolvedIssues.push(issue);
	}

	getValidTransitions(currentState: WorkflowState): WorkflowState[] {
		return [...VALID_TRANSITIONS[currentState]];
	}

	private hashQuestion(q: string): string {
		return createHash("sha256").update(q).digest("hex").substr(0, 12);
	}
}

export const workflowStateMachine = new WorkflowStateMachine();
