
import type { AgentMessage } from "../debate/AgentMessage.js";
import type { ILLMClient } from "../debate/AgentSeat.js";
import { RivalChallenger, type RivalTrigger, type ChallengeResult } from "../memory/RivalChallenger.js";
import { ThinkerAgent, type ThinkerTrigger, type ThinkerQuestion } from "../memory/ThinkerAgent.js";
import { workflowStateMachine, type WorkflowState, type HandoffMessage } from "../orchestration/WorkflowStateMachine.js";
import { inquiryScorer, type InquiryScoreResult } from "../orchestration/InquiryScorer.js";
import { auditTrail } from "../engine/AuditTrailEmitter";

export interface InterventionContext {
	runId: string;
	messages: AgentMessage[];
	evidenceContext: string;
	round: number;
	inquiryScore: number;
	inquiryRationale: string;
	mode: "sample" | "live";
	userQuestion: string;
}

export interface InterventionDecision {
	rivalTriggers: RivalTrigger[];
	thinkerTriggers: ThinkerTrigger[];
	shouldIntervene: boolean;
	priorityAgent: "RivalChallenger" | "ThinkerAgent" | "both" | "none";
	reason: string;
}

export class IndependentInterventionManager {
	private rivalChallenger: RivalChallenger;
	private thinkerAgent: ThinkerAgent;
	private interventionCooldown = new Map<string, number>(); // triggerKey -> last timestamp
	private readonly cooldownMs = 30_000; // 30 seconds between same trigger

	constructor(llmClient: ILLMClient) {
		this.rivalChallenger = new RivalChallenger(llmClient);
		this.thinkerAgent = new ThinkerAgent(llmClient);
	}

	/**
	 * Scan for triggers from both independent agents. This is the event-driven
	 * entry point - can be called at any workflow state.
	 */
	scanForInterventions(context: InterventionContext): InterventionDecision {
		const { messages, evidenceContext, round, inquiryScore, userQuestion } = context;

		const rivalTriggers = this.rivalChallenger.scanForTriggers({
			messages,
			evidenceContext,
			round,
			inquiryScore,
			conversationHistory: userQuestion,
		});

		const thinkerTriggers = this.thinkerAgent.scanForTriggers({
			messages,
			inquiry: userQuestion,
			findings: messages.map((m) => m.content).join("\n"),
			sources: evidenceContext,
			inquiryScore,
			round,
		});

		// Filter triggers by cooldown to prevent duplicate interventions
		const now = Date.now();
		const filteredRival = rivalTriggers.filter((t) => {
			const key = `rival:${t.type}:${t.targetSeat}`;
			const last = this.interventionCooldown.get(key) ?? 0;
			if (now - last < this.cooldownMs) return false;
			this.interventionCooldown.set(key, now);
			return true;
		});

		const filteredThinker = thinkerTriggers.filter((t) => {
			const key = `thinker:${t.type}:${t.description.slice(0, 40)}`;
			const last = this.interventionCooldown.get(key) ?? 0;
			if (now - last < this.cooldownMs) return false;
			this.interventionCooldown.set(key, now);
			return true;
		});

		const shouldIntervene = filteredRival.length > 0 || filteredThinker.length > 0;
		let priorityAgent: "RivalChallenger" | "ThinkerAgent" | "both" | "none" = "none";
		let reason = "";

		if (filteredRival.length > 0 && filteredThinker.length > 0) {
			priorityAgent = "both";
			reason = "Both Rival Challenger and Thinker triggers fired";
		} else if (filteredRival.length > 0) {
			priorityAgent = "RivalChallenger";
			reason = "Rival Challenger trigger(s) detected: evidence/confidence issues";
		} else if (filteredThinker.length > 0) {
			priorityAgent = "ThinkerAgent";
			reason = "Thinker Agent trigger(s) detected: blind spots or missing questions";
		} else {
			reason = "No independent agent triggers fired";
		}

		// Audit the intervention decision
		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: context.runId,
			timestamp: now,
			payload: {
				workflow_event: "intervention_scan",
				rival_triggers: filteredRival.length,
				thinker_triggers: filteredThinker.length,
				priority_agent: priorityAgent,
				reason,
				inquiry_score: inquiryScore,
				round,
			},
		});

		return {
			rivalTriggers: filteredRival,
			thinkerTriggers: filteredThinker,
			shouldIntervene,
			priorityAgent,
			reason,
		};
	}

	/**
	 * Execute a Rival Challenger challenge against a specific agent message.
	 * Records the intervention in the state machine.
	 */
	async executeRivalChallenge(
		context: InterventionContext,
		targetMessage: AgentMessage,
		trigger: RivalTrigger,
	): Promise<{
		interventionId: string;
		result: ChallengeResult;
		resolution: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED";
	}> {
		const result = await this.rivalChallenger.challenge(
			targetMessage.fromSeat,
			targetMessage,
			context.evidenceContext,
		);

		const intervention = this.rivalChallenger.recordIntervention(context.runId, trigger);

		// Record in state machine
		workflowStateMachine.recordIntervention(context.runId, {
			agent: "RivalChallenger",
			state: "CHALLENGE_PENDING" as WorkflowState,
			triggerReason: trigger.description,
			targetAgent: trigger.targetSeat,
			resolution: "PENDING",
			details: {
				triggerType: trigger.type,
				triggerSeverity: trigger.severity,
				evidenceQuality: trigger.evidenceQuality,
				confidenceScore: trigger.confidenceScore,
			},
			runId: context.runId,
		});

		// Emit audit event
		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: context.runId,
			timestamp: Date.now(),
			payload: {
				workflow_event: "rival_challenge_issued",
				target_seat: trigger.targetSeat,
				trigger_type: trigger.type,
				challenge: result.challenge,
				unsupported_claims: result.unsupportedClaims,
				verified_claims: result.verifiedClaims,
			},
		});

		// Determine resolution
		let resolution: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED" = "PENDING" as any;
		if (result.unsupportedClaims.length === 0) {
			resolution = "RESOLVED";
		} else if (result.verifiedClaims.length > 0 && result.unsupportedClaims.length > 0) {
			resolution = "PARTIALLY_RESOLVED";
		} else {
			resolution = "UNRESOLVED";
		}

		this.rivalChallenger.resolveIntervention(intervention.id, resolution, result);

		workflowStateMachine.resolveIntervention(
			context.runId,
			intervention.id,
			resolution,
			{ challengeResult: result },
		);

		return {
			interventionId: intervention.id,
			result: result as any,
			resolution,
		};
	}

	/**
	 * Execute Thinker Agent to generate questions for gaps/blind spots.
	 */
	async executeThinkerIntervention(
		context: InterventionContext,
		trigger: ThinkerTrigger,
	): Promise<{
		interventionId: string;
		questions: ThinkerQuestion[];
		summary: string;
	}> {
		const result = await this.thinkerAgent.think({
			inquiry: context.userQuestion,
			findings: context.messages.map((m) => m.content).join("\n"),
			sources: context.evidenceContext,
			maxQuestions: 2,
		});

		const intervention = this.thinkerAgent.recordIntervention(
			context.runId,
			trigger,
			result.questions,
			result.summary,
		);

		// Record in state machine
		workflowStateMachine.recordIntervention(context.runId, {
			agent: "ThinkerAgent",
			state: "THINKING_PENDING" as WorkflowState,
			triggerReason: trigger.description,
			targetAgent: "Orchestrator",
			resolution: "PENDING",
			details: {
				triggerType: trigger.type,
				triggerSeverity: trigger.severity,
				questionCount: result.questions.length,
			},
			runId: context.runId,
		});

		// Emit audit event
		auditTrail.emitEvent({
			event_type: "session_complete",
			session_id: context.runId,
			timestamp: Date.now(),
			payload: {
				workflow_event: "thinker_intervention",
				trigger_type: trigger.type,
				questions: result.questions,
				summary: result.summary,
			},
		});

		// Resolve if no questions (nothing to do)
		if (result.questions.length === 0) {
			this.thinkerAgent.resolveIntervention(intervention.id, "ANSWERED");
			workflowStateMachine.resolveIntervention(
				context.runId,
				intervention.id,
				"RESOLVED",
				{ reason: "No questions generated" },
			);
		}

		return {
			interventionId: intervention.id,
			questions: result.questions as any,
			summary: result.summary,
		};
	}

	/**
	 * Get the RivalChallenger instance for direct access.
	 */
	getRivalChallenger(): RivalChallenger {
		return this.rivalChallenger;
	}

	/**
	 * Get the ThinkerAgent instance for direct access.
	 */
	getThinkerAgent(): ThinkerAgent {
		return this.thinkerAgent;
	}

	/**
	 * Clear all interventions (for fresh runs/testing).
	 */
	clearInterventions(): void {
		this.rivalChallenger.clearInterventions();
		this.thinkerAgent.clearInterventions();
		this.interventionCooldown.clear();
	}

	get hasPendingInterventions(): boolean {
		return (
			this.rivalChallenger.hasInterventions ||
			this.thinkerAgent.hasInterventions ||
			this.rivalChallenger.getPendingRechecks().length > 0 ||
			this.thinkerAgent.getPendingInterventions().length > 0
		);
	}

	get recheckableChallenges() {
		return this.rivalChallenger.getPendingRechecks();
	}

	get pendingThinkerQuestions() {
		return this.thinkerAgent.getPendingInterventions();
	}
}
