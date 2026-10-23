
import { randomUUID } from "node:crypto";
import { runDebate as runDebateCore } from "./debateRunner.js";
import { zetarisQueryHandler } from "./tools/zetaris.tools.js";
import { formatZetarisResult } from "./format.js";
import { loadSampleScenario } from "./sampleScenario.js";
import { HMemService } from "../../../libs/core/src/memory/HMemService.js";
import { MeterlessProvider } from "../../../libs/core/src/providers/MeterlessProvider.js";
import { MeterlessSeatClient } from "../../../libs/core/src/providers/MeterlessSeatClient.js";
import { ContextAgent, type ContextAgentInput } from "../../../libs/core/src/agents/ContextAgent.js";
import {
	CredibleSourcesResearchAgent,
	type CredibleSourcesResearchInput,
} from "../../../libs/core/src/agents/CredibleSourcesResearchAgent.js";
import {
	SocialCommunityResearchAgent,
	type SocialCommunityResearchInput,
} from "../../../libs/core/src/agents/SocialCommunityResearchAgent.js";
import {
	workflowStateMachine,
	type WorkflowState,
	type HandoffMessage,
	type ExecutionPlan,
} from "../../../libs/core/src/orchestration/WorkflowStateMachine.js";
import { inquiryScorer, type InquiryScoreResult } from "../../../libs/core/src/orchestration/InquiryScorer.js";
import {
	IndependentInterventionManager,
	type InterventionContext,
} from "../../../libs/core/src/orchestration/IndependentInterventionManager.js";
import { auditTrail } from "../../../libs/core/src/engine/AuditTrailEmitter.js";
import { AgentMessage } from "../../../libs/core/src/debate/AgentMessage.js";

export interface OrchestratorConfig {
	mode: "sample" | "live";
	scenarioPath?: string;
	topicOverride?: string;
	maxCycles?: number;
	llmClient?: {
		complete: (system: string, prompt: string) => Promise<{ content: string; confidence: number }>;
	};
}

export interface OrchestratorResult {
	runId: string;
	mode: "sample" | "live";
	userQuestion: string;
	finalAnswer: string;
	confidenceScore: number; // 1-10
	inquiryScore: number; // 1-10
	consensusReached: boolean;
	consensusMethod: string;
	unresolvedIssues: string[];
	auditIntegrity: boolean;
	stateHistory: Array<{ state: WorkflowState; timestamp: number; trigger: string }>;
	zetarisUsed: boolean;
	researchUsed: boolean;
	interventions: Array<{
		agent: string;
		trigger: string;
		resolution: string;
	}>;
}

type LLMComplete = (system: string, prompt: string) => Promise<{ content: string; confidence: number }>;

export class Orchestrator {
	private config: OrchestratorConfig;
	private hmem = new HMemService();
	private stateMachine = workflowStateMachine;
	private interventionManager: IndependentInterventionManager | null = null;
	private inquiryScoreResult: InquiryScoreResult | null = null;
	private contextAssessment: any = null;
	private researchResults: Array<{ agent: string; result: any }> = [];
	private debateResult: any = null;
	private stateHistory: Array<{ state: WorkflowState; timestamp: number; trigger: string }> = [];

	constructor(config: OrchestratorConfig) {
		this.config = config;
	}

	async run(): Promise<OrchestratorResult> {
		const userQuestion = this.config.topicOverride || "Assess the Zetaris data available to this agent.";
		const run = this.stateMachine.createRun(userQuestion, this.config.mode);
		const runId = run.runId;

		// Initialize intervention manager with LLM client
		const configured = this.config.llmClient;
		const defaultClient = this.createDefaultLLMClient();
		const rawLlmClient: LLMComplete = configured
			? (system: string, prompt: string) => configured.complete(system, prompt)
			: defaultClient;
		const llmClient: LLMComplete = rawLlmClient;
		const llmComplete: (system: string, prompt: string) => Promise<string> =
			async (system, prompt) => {
				const result = await llmClient(system, prompt);
				return result.content;
			};
		const llmAdapter: { complete: (system: string, prompt: string) => Promise<{ content: string; confidence: number }> } = {
			complete: llmClient,
		};
		this.interventionManager = new IndependentInterventionManager(llmAdapter);

		// Initialize state history
		this.recordState("RECEIVED", "Run created");

		try {
			// === STATE: RECEIVED -> ASSESSED ===
			await this.stateMachine.transitionState(runId, "ASSESSED", "Question received and ready for assessment", "Orchestrator");
			this.recordState("ASSESSED", "Question received");

			// Assess inquiry complexity
			this.inquiryScoreResult = inquiryScorer.scoreInitial({
				question: userQuestion,
				conversationHistory: run.conversationHistory.map((h) => ({ role: h.role, content: h.content })),
				availableTools: this.config.mode === "live" ? ["zetaris_query"] : [],
			});

			this.stateMachine.updateExecutionPlan(runId, {
				inquiryScore: this.inquiryScoreResult.score,
				inquiryRationale: this.inquiryScoreResult.rationale,
				requiredAgents: this.inquiryScoreResult.recommendedAgents,
				requiresZetaris: this.inquiryScoreResult.requiresZetaris,
				requiresResearch: this.inquiryScoreResult.requiresResearch,
				contextNeeded: this.inquiryScoreResult.score >= 3,
				maxCycles: this.config.maxCycles ?? 5,
				currentCycle: 0,
			});

			// Audit: inquiry score assigned
			auditTrail.emitEvent({
				event_type: "session_complete",
				session_id: runId,
				timestamp: Date.now(),
				payload: {
					workflow_event: "inquiry_scored",
					score: this.inquiryScoreResult.score,
					band: this.inquiryScoreResult.band,
					rationale: this.inquiryScoreResult.rationale,
					requires_zetaris: this.inquiryScoreResult.requiresZetaris,
					requires_research: this.inquiryScoreResult.requiresResearch,
				},
			});

			// === STATE: ASSESSED -> CONTEXT_READY ===
			if (this.inquiryScoreResult.score >= 3) {
				await this.stateMachine.transitionState(runId, "CONTEXT_READY", "Context agent evaluation needed", "Orchestrator");
				this.recordState("CONTEXT_READY", "Context agent evaluation");

				const contextAgent = new ContextAgent(llmComplete);
				const contextInput: ContextAgentInput = {
					userQuestion,
					conversationHistory: run.conversationHistory,
					mode: this.config.mode,
				};
				this.contextAssessment = contextAgent.assessContext(contextInput);

				await this.stateMachine.transitionState(runId, "CONTEXT_READY", "Context assessment complete", "ContextAgent");
			} else {
				await this.stateMachine.transitionState(runId, "CONTEXT_READY", "Simple question; minimal context needed", "Orchestrator");
				this.contextAssessment = {
					relevantMemories: [],
					missingContext: ["Simple question; no complex context required"],
					incorrectAssumptions: [],
					irrelevantResearch: [],
					confirmedFacts: [],
					inferences: [],
					outdatedInformation: [],
					contradictions: [],
					contextSummary: `Simple question: ${userQuestion}`,
					shareableContext: "",
				};
			}

			// === STATE: CONTEXT_READY -> RESEARCHING / DEBATING ===
			let zetarisUsed = false;
			let researchUsed = false;

			// Determine if Zetaris is needed
			const needsZetaris = this.inquiryScoreResult.requiresZetaris;

			if (needsZetaris && this.config.mode !== "sample") {
				// Live mode: actually query Zetaris
				await this.stateMachine.transitionState(runId, "RESEARCHING", "Zetaris evidence required", "Orchestrator");
				this.recordState("RESEARCHING", "Zetaris query");

				const zetarisQuery = process.env.ZETARIS_DEMO_QUERY || "SHOW LIGHTNING DATABASES";
				const zetarisResult = (await zetarisQueryHandler(
					{ query: zetarisQuery, limit: 50 },
					{ callerRole: "analyst", correlationId: randomUUID() },
				)) as any;

				zetarisUsed = true;
				researchUsed = true;

				const context = formatZetarisResult(zetarisResult, 50);
				this.contextAssessment.shareableContext += `\n\nZetaris evidence:\n${context}`;

				// Store Zetaris findings in H-MEM
				this.hmem.mine({
					sessionId: runId,
					topic: userQuestion,
					finalAnswer: "",
					seatPositions: [],
				});
			} else if (needsZetaris && this.config.mode === "sample") {
				// Sample mode: use cached scenario
				await this.stateMachine.transitionState(runId, "RESEARCHING", "Cached scenario evidence", "Orchestrator");
				this.recordState("RESEARCHING", "Cached scenario");

				const { scenario } = loadSampleScenario(this.config.scenarioPath);
				const context = formatZetarisResult(scenario.zetaris, 50);
				this.contextAssessment.shareableContext += `\n\nZetaris evidence (cached):\n${context}`;
				zetarisUsed = true;
				researchUsed = true;
			}

			// Determine if research agents are needed
			if (this.inquiryScoreResult.requiresResearch && this.inquiryScoreResult.score >= 5) {
				await this.stateMachine.transitionState(runId, "RESEARCHING", "Research agents needed", "Orchestrator");
				this.recordState("RESEARCHING", "Research agents");

				// Credible Sources Research Agent
				if (this.inquiryScoreResult.recommendedAgents.includes("CredibleSourcesResearchAgent")) {
					const credibleAgent = new CredibleSourcesResearchAgent(llmComplete);
					const credibleInput: CredibleSourcesResearchInput = {
						userQuestion,
						claimsToVerify: [userQuestion],
						context: this.contextAssessment.shareableContext,
						mode: this.config.mode,
					};
					const credibleResult = credibleAgent.research(credibleInput);
					this.researchResults.push({ agent: "CredibleSourcesResearchAgent", result: credibleResult });
					researchUsed = true;
				}

				// Social & Community Research Agent
				if (this.inquiryScoreResult.recommendedAgents.includes("SocialCommunityResearchAgent")) {
					const socialAgent = new SocialCommunityResearchAgent(llmComplete);
					const socialInput: SocialCommunityResearchInput = {
						userQuestion,
						claimsToCheck: [userQuestion],
						context: this.contextAssessment.shareableContext,
						mode: this.config.mode,
						availablePlatforms: ["wikipedia"],
					};
					const socialResult = socialAgent.research(socialInput);
					this.researchResults.push({ agent: "SocialCommunityResearchAgent", result: socialResult });
					researchUsed = true;
				}

				await this.stateMachine.transitionState(runId, "EVIDENCE_REVIEW", "Research findings ready for review", "Orchestrator");
				this.recordState("EVIDENCE_REVIEW", "Research findings ready");
			}

			// === STATE: EVIDENCE_REVIEW -> DEBATING / CHALLENGE_PENDING ===
			// Run independent intervention scan before debate
			const interventionContext: InterventionContext = {
				runId,
				messages: [],
				evidenceContext: this.contextAssessment.shareableContext,
				round: 0,
				inquiryScore: this.inquiryScoreResult.score,
				inquiryRationale: this.inquiryScoreResult.rationale,
				mode: this.config.mode,
				userQuestion,
			};

			const interventionDecision = this.interventionManager.scanForInterventions(interventionContext);

			// If Rival Challenger triggers fire, handle them before debate
			if (interventionDecision.priorityAgent === "RivalChallenger" || interventionDecision.priorityAgent === "both") {
				await this.stateMachine.transitionState(runId, "CHALLENGE_PENDING", "Rival Challenger pre-debate intervention", "RivalChallenger");
				this.recordState("CHALLENGE_PENDING", "Rival Challenger pre-debate");

				for (const trigger of interventionDecision.rivalTriggers) {
					// Create a synthetic message for the challenge target
					const syntheticMsg: AgentMessage = {
						id: `synthetic_${randomUUID()}`,
						fromSeat: trigger.targetSeat,
						toSeat: "all",
						type: "proposal",
						content: trigger.targetClaim || "Unknown position",
						confidence: trigger.confidenceScore / 10,
						structured: {
							position: trigger.targetClaim || "Unknown position",
							confidenceSelf: trigger.confidenceScore / 10,
							confidence_self: trigger.confidenceScore / 10,
							confidenceExpertAgreement: trigger.confidenceScore / 10,
							confidence_expert_agreement: trigger.confidenceScore / 10,
							evidence: [],
							caveats: [],
							dissents_from: [],
							supports: [],
						},
						round: 0,
						timestamp: Date.now(),
					};

					await this.interventionManager.executeRivalChallenge(interventionContext, syntheticMsg, trigger);
				}
			}

			if (interventionDecision.priorityAgent === "ThinkerAgent" || interventionDecision.priorityAgent === "both") {
				await this.stateMachine.transitionState(runId, "THINKING_PENDING", "Thinker Agent pre-debate intervention", "ThinkerAgent");
				this.recordState("THINKING_PENDING", "Thinker Agent pre-debate");

				for (const trigger of interventionDecision.thinkerTriggers) {
					await this.interventionManager.executeThinkerIntervention(interventionContext, trigger);
				}
			}

			// === STATE: DEBATING ===
			await this.stateMachine.transitionState(runId, "DEBATING", "Multi-agent debate", "Orchestrator");
			this.recordState("DEBATING", "Debate started");

			// Build evidence context for debate
			const evidenceContext = this.contextAssessment.shareableContext ||
				(this.config.mode === "sample"
					? (this.config.scenarioPath ? formatZetarisResult(loadSampleScenario(this.config.scenarioPath).scenario.zetaris, 50) : "")
					: "");

			// Run the existing debate loop
			const debateOut = await runDebateCore({
				mode: this.config.mode,
				scenarioPath: this.config.scenarioPath,
				topicOverride: userQuestion,
				eventSink: (event: Record<string, unknown>) => {
					// Forward debate events to audit trail
					auditTrail.emitEvent({
						event_type: "session_complete",
						session_id: runId,
						timestamp: Date.now(),
						payload: {
							workflow_event: "debate_event",
							...event,
						},
					});
				},
			});

			this.debateResult = debateOut.result;

			await this.stateMachine.transitionState(runId, "EVIDENCE_REVIEW", "Debate complete; evidence review", "Orchestrator");
			this.recordState("EVIDENCE_REVIEW", "Debate complete");

			// === Post-debate intervention scan ===
			const postDebateMessages = this.debateResult.transcript;
			const postInterventionContext: InterventionContext = {
				runId,
				messages: postDebateMessages,
				evidenceContext: this.contextAssessment.shareableContext,
				round: this.debateResult.rounds,
				inquiryScore: this.inquiryScoreResult.score,
				inquiryRationale: this.inquiryScoreResult.rationale,
				mode: this.config.mode,
				userQuestion,
			};

			const postDecision = this.interventionManager.scanForInterventions(postInterventionContext);

			if (postDecision.shouldIntervene) {
				// Handle post-debate challenges
				for (const trigger of postDecision.rivalTriggers) {
					const targetMsg = postDebateMessages.find(
						(m) => m.fromSeat === trigger.targetSeat,
					);
					if (targetMsg) {
						await this.stateMachine.transitionState(runId, "CHALLENGE_PENDING", "Post-debate Rival Challenger intervention", "RivalChallenger");
						this.recordState("CHALLENGE_PENDING", "Post-debate Rival Challenger");

						await this.interventionManager.executeRivalChallenge(postInterventionContext, targetMsg, trigger);

						await this.stateMachine.transitionState(runId, "REVISION", "Addressing challenge", "Orchestrator");
						this.recordState("REVISION", "Addressing challenge");
					}
				}

				for (const trigger of postDecision.thinkerTriggers) {
					await this.stateMachine.transitionState(runId, "THINKING_PENDING", "Post-debate Thinker intervention", "ThinkerAgent");
					this.recordState("THINKING_PENDING", "Post-debate Thinker");

					await this.interventionManager.executeThinkerIntervention(postInterventionContext, trigger);
				}
			}

			// === STATE: FINAL_REVIEW ===
			await this.stateMachine.transitionState(runId, "FINAL_REVIEW", "Final review before completion", "Orchestrator");
			this.recordState("FINAL_REVIEW", "Final review");

			// Check unresolved issues
			const unresolvedIssues = [...run.unresolvedIssues];
			const pendingInterventions = this.interventionManager.hasPendingInterventions;

			if (pendingInterventions) {
				for (const int of this.interventionManager.getRivalChallenger().getInterventions()) {
					if (int.resolution === "UNRESOLVED") {
						unresolvedIssues.push(`Rival Challenger: ${int.trigger.description}`);
					}
				}
				for (const int of this.interventionManager.getThinkerAgent().getInterventions()) {
					if (int.status === "PENDING") {
						unresolvedIssues.push(`Thinker Agent: ${int.trigger.description}`);
					}
				}
			}

			// Build final answer
			const finalAnswer = this.buildFinalAnswer(
				userQuestion,
				this.debateResult,
				this.contextAssessment,
				this.researchResults,
				unresolvedIssues,
				this.config.mode,
			);

			// Check if we can complete
			// If no unresolved issues, or cycle limit reached, finish the run
			if (unresolvedIssues.length === 0 || this.stateMachine.isCycleExhausted(runId)) {
				await this.stateMachine.transitionState(runId, "COMPLETED", "Final review complete", "Orchestrator");
				this.recordState("COMPLETED", "Run completed");
				this.stateMachine.completeRun(runId, finalAnswer);
			} else {
				// Bounded additional revision cycle
				await this.stateMachine.transitionState(runId, "REVISION", "Additional cycle for unresolved issues", "Orchestrator");
				this.stateMachine.incrementCycle(runId);

				// After incrementing, check if cycle limit is now reached.
				// If so, complete with unresolved issues disclosed.
				// If not exhausted, still complete with unresolved issues
				// rather than looping indefinitely.
				if (this.stateMachine.isCycleExhausted(runId)) {
					await this.stateMachine.transitionState(runId, "COMPLETED", "Cycle limit reached; completing with unresolved issues", "Orchestrator");
					this.recordState("COMPLETED", "Cycle limit reached");
					this.stateMachine.completeRun(runId, finalAnswer);
				} else {
									// Cycle limit not yet reached but no more revision cycles
									// will be attempted; complete with unresolved issues.
									await this.stateMachine.transitionState(runId, "COMPLETED", "Review complete with unresolved issues", "Orchestrator");
									this.recordState("COMPLETED", "Review complete with unresolved issues");
									this.stateMachine.completeRun(runId, finalAnswer);
								}
			}

			// Collect intervention records
			const interventions: Array<{
				agent: string;
				trigger: string;
				resolution: string;
			}> = [];
			for (const int of this.interventionManager.getRivalChallenger().getInterventions()) {
				interventions.push({
					agent: "RivalChallenger",
					trigger: int.trigger.description,
					resolution: int.resolution,
				});
			}
			for (const int of this.interventionManager.getThinkerAgent().getInterventions()) {
				interventions.push({
					agent: "ThinkerAgent",
					trigger: int.trigger.description,
					resolution: int.status,
				});
			}

			return {
				runId,
				mode: this.config.mode,
				userQuestion,
				finalAnswer,
				confidenceScore: this.inquiryScoreResult.score,
				inquiryScore: this.inquiryScoreResult.score,
				consensusReached: this.debateResult?.consensusReached ?? false,
				consensusMethod: this.debateResult?.consensus_method ?? "none",
				unresolvedIssues,
				auditIntegrity: auditTrail.verifyIntegrity(),
				stateHistory: this.stateHistory,
				zetarisUsed,
				researchUsed,
				interventions,
			};
		} catch (error) {
			const haltReason = error instanceof Error ? error.message : String(error);
			await this.stateMachine.transitionState(runId, "HALTED", haltReason, "Orchestrator");
			this.recordState("HALTED", haltReason);
			this.stateMachine.haltRun(runId, haltReason);

			return {
				runId,
				mode: this.config.mode,
				userQuestion,
				finalAnswer: `Run halted: ${haltReason}`,
				confidenceScore: 1,
				inquiryScore: this.inquiryScoreResult?.score ?? 0,
				consensusReached: false,
				consensusMethod: "none",
				unresolvedIssues: [haltReason],
				auditIntegrity: false,
				stateHistory: this.stateHistory,
				zetarisUsed: false,
				researchUsed: false,
				interventions: [],
			};
		}
	}

	private recordState(state: WorkflowState, trigger: string): void {
		this.stateHistory.push({
			state,
			timestamp: Date.now(),
			trigger,
		});
	}

	private createDefaultLLMClient(): LLMComplete {
		return async (system: string, prompt: string) => {
			const provider = new MeterlessProvider();
			const client = new MeterlessSeatClient(provider);
			return client.complete(system, prompt);
		};
	}

	private buildFinalAnswer(
		userQuestion: string,
		debateResult: any,
		contextAssessment: any,
		researchResults: Array<{ agent: string; result: any }>,
		unresolvedIssues: string[],
		mode: "sample" | "live",
	): string {
		const parts: string[] = [];

		// Direct answer
		const synthesizerPosition = debateResult?.seat_votes?.Synthesizer?.position ||
			debateResult?.transcript[debateResult.transcript.length - 1]?.content ||
			"No answer produced.";
		parts.push(`## Answer\n${synthesizerPosition}`);

		// Confidence
		parts.push(`\n## Confidence\nInquiry score: ${this.inquiryScoreResult?.score ?? "N/A"}/10`);
		parts.push(`Debate consensus: ${debateResult?.consensusReached ? "reached" : "not reached"} (${debateResult?.consensus_method ?? "none"})`);
		parts.push(`Final confidence: ${debateResult?.finalConfidence?.toFixed(2) ?? "N/A"}`);

		// Evidence sources
		parts.push(`\n## Evidence\n`);
		if (contextAssessment?.shareableContext) {
			parts.push(`Context: ${contextAssessment.shareableContext.slice(0, 500)}`);
		}
		for (const r of researchResults) {
			parts.push(`${r.agent}: ${r.result.sourceQualitySummary || r.result.publicSentiment || "No summary available"}`);
		}

		// Unresolved issues
		if (unresolvedIssues.length > 0) {
			parts.push(`\n## Unresolved Issues\n`);
			for (const issue of unresolvedIssues) {
				parts.push(`- ${issue}`);
			}
		}

		// Mode disclosure
		parts.push(`\n## Mode\n${mode === "sample" ? "Sample mode: evidence is synthetic fixture data." : "Live mode: evidence from actual operations."}`);

		return parts.join("\n");
	}
}

export const orchestrator = new Orchestrator({
	mode: "sample",
});
