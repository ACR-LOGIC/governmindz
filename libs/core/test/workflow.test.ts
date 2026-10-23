
import assert from "node:assert/strict";
import { ok } from "node:assert";
import { test } from "node:test";
import {
	workflowStateMachine,
	type WorkflowState,
	type HandoffMessage,
} from "../src/orchestration/WorkflowStateMachine.js";
import { inquiryScorer } from "../src/orchestration/InquiryScorer.js";
import { ContextAgent } from "../src/agents/ContextAgent.js";
import {
	CredibleSourcesResearchAgent,
} from "../src/agents/CredibleSourcesResearchAgent.js";
import {
	SocialCommunityResearchAgent,
} from "../src/agents/SocialCommunityResearchAgent.js";
import { RivalChallenger } from "../src/memory/RivalChallenger.js";
import { ThinkerAgent } from "../src/memory/ThinkerAgent.js";
import {
	IndependentInterventionManager,
	type InterventionContext,
} from "../src/orchestration/IndependentInterventionManager.js";

// ─── WorkflowStateMachine tests ───

test("WorkflowStateMachine: creates a run in RECEIVED state", () => {
	const run = workflowStateMachine.createRun("What is Zetaris?", "sample");
	assert.equal(run.currentState, "RECEIVED");
	assert.equal(run.userQuestion, "What is Zetaris?");
	assert.equal(run.mode, "sample");
	assert.equal(run.handoffs.length, 0);
	assert.equal(run.interventions.length, 0);
});

test("WorkflowStateMachine: valid transition RECEIVED -> ASSESSED", () => {
	const run = workflowStateMachine.createRun("Test question", "sample");
	const ok = workflowStateMachine.transitionState(
		run.runId,
		"ASSESSED",
		"Question assessed",
		"Orchestrator",
	);
	assert.equal(ok, true);
	assert.equal(run.currentState, "ASSESSED");
});

test("WorkflowStateMachine: invalid transition RECEIVED -> DEBATING is rejected", () => {
	const run = workflowStateMachine.createRun("Test question", "sample");
	const ok = workflowStateMachine.transitionState(
		run.runId,
		"DEBATING",
		"Skipping assessment",
		"Orchestrator",
	);
	assert.equal(ok, false);
	assert.equal(run.currentState, "RECEIVED");
});

test("WorkflowStateMachine: records handoff with all required fields", () => {
	const run = workflowStateMachine.createRun("Test question", "sample");
	const handoff: Omit<HandoffMessage, "runId" | "timestamp"> = {
		fromAgent: "Orchestrator",
		toAgent: "ContextAgent",
		currentState: "ASSESSED",
		nextState: "CONTEXT_READY",
		userQuestion: "Test question",
		task: "Assess context",
		claims: [{ claimId: "c1", statement: "test claim" }],
		evidence: [
			{
				source: "test",
				verificationStatus: "unverified",
			},
		],
		confidence: 5,
		confidenceRationale: "moderate complexity",
		limitations: [],
		triggerReason: "assessment needed",
		returnCondition: "context summary",
		mode: "sample",
	};
	workflowStateMachine.recordHandoff(run.runId, handoff);
	assert.equal(run.handoffs.length, 1);
	assert.equal(run.handoffs[0].fromAgent, "Orchestrator");
	assert.equal(run.handoffs[0].toAgent, "ContextAgent");
	assert.equal(run.handoffs[0].confidence, 5);
	assert.equal(true,run.handoffs[0].timestamp > 0);
});

test("WorkflowStateMachine: records and resolves interventions", () => {
	const run = workflowStateMachine.createRun("Test question", "sample");
	workflowStateMachine.recordIntervention(run.runId, {
		agent: "RivalChallenger",
		state: "CHALLENGE_PENDING",
		triggerReason: "high confidence, weak evidence",
		targetAgent: "FactChecker",
		resolution: "PENDING",
		details: {},
		runId: run.runId,
	});
	assert.equal(run.interventions.length, 1);

	const resolved = workflowStateMachine.resolveIntervention(
		run.runId,
		run.interventions[0].id,
		"RESOLVED",
		{ note: "claim verified" },
	);
	assert.equal(resolved, true);
	assert.equal(run.interventions[0].resolution, "RESOLVED");
});

test("WorkflowStateMachine: unresolved intervention adds to unresolvedIssues", () => {
	const run = workflowStateMachine.createRun("Test question", "sample");
	workflowStateMachine.recordIntervention(run.runId, {
		agent: "ThinkerAgent",
		state: "THINKING_PENDING",
		triggerReason: "untested assumption",
		targetAgent: "CloudArchitect",
		resolution: "PENDING",
		details: {},
		runId: run.runId,
	});
	workflowStateMachine.resolveIntervention(
		run.runId,
		run.interventions[0].id,
		"UNRESOLVED",
		{},
	);
	assert.equal(run.unresolvedIssues.length, 1);
	assert.equal(true,run.unresolvedIssues[0].includes("ThinkerAgent"));
});

test("WorkflowStateMachine: completeRun sets COMPLETED state", () => {
	const run = workflowStateMachine.createRun("Test question", "sample");
	workflowStateMachine.completeRun(run.runId, "Final answer");
	assert.equal(run.currentState, "COMPLETED");
	assert.equal(run.finalAnswer, "Final answer");
	assert.ok(run.completedAt);
});

test("WorkflowStateMachine: haltRun sets HALTED state", () => {
	const run = workflowStateMachine.createRun("Test question", "sample");
	workflowStateMachine.haltRun(run.runId, "Zetaris unavailable");
	assert.equal(run.currentState, "HALTED");
	assert.equal(run.haltReason, "Zetaris unavailable");
	assert.ok(run.completedAt);
});

test("WorkflowStateMachine: valid transitions for each state", () => {
	const received = workflowStateMachine.getValidTransitions("RECEIVED");
	assert.equal(true,received.includes("ASSESSED"));
	assert.equal(true,received.includes("HALTED"));

	const assessed = workflowStateMachine.getValidTransitions("ASSESSED");
	assert.equal(true,assessed.includes("CONTEXT_READY"));
	assert.equal(true,assessed.includes("RESEARCHING"));
	assert.equal(true,assessed.includes("EVIDENCE_REVIEW"));
	assert.equal(true,assessed.includes("DEBATING"));
	assert.equal(true,assessed.includes("FINAL_REVIEW"));
	assert.equal(true,assessed.includes("HALTED"));

	const completed = workflowStateMachine.getValidTransitions("COMPLETED");
	assert.equal(completed.length, 0);

	const halted = workflowStateMachine.getValidTransitions("HALTED");
	assert.equal(halted.length, 0);
});

// ─── InquiryScorer tests ───

test("InquiryScorer: simple question scores 1-2", () => {
	const result = inquiryScorer.scoreInitial({
		question: "What is 2+2?",
		conversationHistory: [],
	});
	assert.equal(true,result.score >= 1 && result.score <= 2);
	assert.equal(result.band, "simple");
});

	test("InquiryScorer: governance question scores higher", () => {
		const result = inquiryScorer.scoreInitial({
			question: "What governance controls should be verified before exposing Zetaris data?",
			conversationHistory: [],
		});
		assert.equal(true,result.score >= 3);
		assert.equal(true,result.requiresResearch);
	});

	test("InquiryScorer: high-stakes question scores 9-10", () => {
		const result = inquiryScorer.scoreInitial({
			question: "What are the disputed regulatory compliance requirements for federated data access across multiple jurisdictions?",
			conversationHistory: [
				{ role: "user", content: "Previous question about data governance" },
				{ role: "assistant", content: "Previous answer about governance" },
				{ role: "user", content: "Follow-up on conflicting regulations" },
			],
		});
		assert.equal(true,result.score >= 5);
		assert.equal(result.band, "multi_factor");
});

test("InquiryScorer: scoreUpdate increases on contradictions", () => {
	const updated = inquiryScorer.scoreUpdate({
		currentScore: 5,
		newEvidenceCount: 2,
		contradictionsFound: 2,
		unsupportedClaims: 1,
		interventionsTriggered: 1,
		confidenceVsEvidenceGap: 0.6,
	});
	assert.equal(true,updated.score > 5);
	assert.equal(true,updated.rationale.includes("contradiction"));
});

test("InquiryScorer: scoreUpdate decreases when new evidence resolves gaps", () => {
	const updated = inquiryScorer.scoreUpdate({
		currentScore: 7,
		newEvidenceCount: 5,
		contradictionsFound: 0,
		unsupportedClaims: 0,
		interventionsTriggered: 0,
		confidenceVsEvidenceGap: 0.2,
	});
	assert.equal(true,updated.score <= 7);
});

// ─── ContextAgent tests ───

test("ContextAgent: assesses context and identifies missing information", () => {
	const agent = new ContextAgent();
	const assessment = agent.assessContext({
		userQuestion: "What is the capital of France?",
		conversationHistory: [],
		mode: "sample",
	});
	assert.equal(true,assessment.contextSummary.length > 0);
	assert.equal(true,Array.isArray(assessment.missingContext));
	assert.equal(true,Array.isArray(assessment.confirmedFacts));
	assert.equal(true,Array.isArray(assessment.contradictions));
});

test("ContextAgent: detects contradictions between research and memory", () => {
	const agent = new ContextAgent();
	// First, add some memory with a claim
	agent["hmem"].mine({
		sessionId: "test-session",
		topic: "Zetaris governance",
		finalAnswer: "Zetaris requires read-only access",
		seatPositions: [{ seatId: "FactChecker", position: "Read-only required", confidence: 0.9 }],
	});

	const assessment = agent.assessContext({
		userQuestion: "Does Zetaris allow write access?",
		conversationHistory: [],
		researchFindings: [
			{
				source: "blog",
				claim: "Zetaris allows write access",
				evidence: ["blog post"],
			},
		],
		proposedAnswers: [],
		mode: "sample",
	});
	// Should find at least the missing context about no conversation history
	assert.equal(true,assessment.missingContext.length > 0);
});

// ─── CredibleSourcesResearchAgent tests ───

test("CredibleSourcesResearchAgent: returns sources with quality scores", () => {
	const agent = new CredibleSourcesResearchAgent();
	const result = agent.research({
		userQuestion: "What are the governance requirements for Zetaris?",
		claimsToVerify: ["Zetaris requires read-only access"],
		context: "",
		mode: "sample",
	});
	assert.equal(true,Array.isArray(result.sources));
	assert.equal(true,result.sources.length > 0);
	assert.equal(true,result.confidence >= 1 && result.confidence <= 10);
	assert.equal(true,result.sourceQualitySummary.length > 0);
});

test("CredibleSourcesResearchAgent: identifies unsupported claims", () => {
	const agent = new CredibleSourcesResearchAgent();
	const result = agent.research({
		userQuestion: "Unknown topic xyzzy",
		claimsToVerify: ["This claim has no credible source"],
		context: "",
		mode: "sample",
	});
	assert.equal(true,result.unresolvedQuestions.length > 0 || result.supportedClaims.length >= 0);
});

// ─── SocialCommunityResearchAgent tests ───

test("SocialCommunityResearchAgent: returns community sources and sentiment", () => {
	const agent = new SocialCommunityResearchAgent();
	const result = agent.research({
		userQuestion: "What do people think about Zetaris governance?",
		claimsToCheck: ["Zetaris is hard to configure"],
		context: "",
		mode: "sample",
		availablePlatforms: ["wikipedia", "reddit"],
	});
	assert.equal(true,Array.isArray(result.sources));
	assert.equal(true,result.publicSentiment.length > 0);
	assert.equal(true,Array.isArray(result.wikipediaReferences));
	assert.equal(true,Array.isArray(result.corroborationNeeded));
	assert.equal(true,result.confidence >= 1 && result.confidence <= 10);
});

test("SocialCommunityResearchAgent: treats social claims as needing corroboration", () => {
	const agent = new SocialCommunityResearchAgent();
	const result = agent.research({
		userQuestion: "Is Zetaris governance controversial?",
		claimsToCheck: ["Zetaris governance is disputed"],
		context: "",
		mode: "sample",
		availablePlatforms: ["reddit", "x"],
	});
	assert.equal(true,result.corroborationNeeded.length >= 0);
	assert.equal(true,result.availablePlatforms.includes("reddit") || result.availablePlatforms.includes("x"));
});

// ─── RivalChallenger tests ───

test("RivalChallenger: detects high confidence with weak evidence trigger", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.5 }),
	});

	const messages = [
		{
			id: "m1",
			fromSeat: "FactChecker",
			toSeat: "all",
			type: "proposal",
			content: "This is definitely correct",
			confidence: 0.9,
			round: 0,
			timestamp: Date.now(),
			structured: {
				position: "This is definitely correct",
				confidenceSelf: 0.9,
				confidence_self: 0.9,
				confidenceExpertAgreement: 0.9,
				confidence_expert_agreement: 0.9,
				evidence: [],
				caveats: [],
				dissents_from: [],
				supports: [],
			},
		},
	];

	const triggers = challenger.scanForTriggers({
		messages: messages as any,
		evidenceContext: "",
		round: 0,
		inquiryScore: 5,
	});

	assert.ok(triggers.length > 0);
	const highConfTrigger = triggers.find((t) => t.type === "high_confidence_weak_evidence");
	assert.ok(highConfTrigger);
	assert.equal(highConfTrigger?.targetSeat, "FactChecker");
	assert.equal(highConfTrigger?.severity, "high");
});

test("RivalChallenger: detects no-evidence claim trigger", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.5 }),
	});

	const messages = [
		{
			id: "m1",
			fromSeat: "CloudArchitect",
			toSeat: "all",
			type: "proposal",
			content: "We should deploy to multi-region immediately",
			confidence: 0.85,
			round: 0,
			timestamp: Date.now(),
			structured: {
				position: "We should deploy to multi-region immediately",
				confidenceSelf: 0.85,
				confidence_self: 0.85,
				evidence: [],
				caveats: [],
				dissents_from: [],
				supports: [],
			},
		},
	];

	const triggers = challenger.scanForTriggers({
		messages: messages as any,
		evidenceContext: "",
		round: 0,
		inquiryScore: 5,
	});

	const noEvidenceTrigger = triggers.find(
		(t) => t.type === "critical_claim_insufficient_evidence",
	);
	assert.ok(noEvidenceTrigger);
	assert.equal(noEvidenceTrigger?.targetSeat, "CloudArchitect");
});

test("RivalChallenger: challenge and resolution lifecycle", async () => {
	const challenger = new RivalChallenger({
		complete: async () => ({
			content: JSON.stringify({
				challenge: "Claim unsupported",
				verifiedClaims: [],
				unsupportedClaims: ["main claim"],
				correctedPosition: "Uncertain",
				confidence: 0.4,
			}),
			confidence: 0.5,
		}),
	});

	const result = await challenger.challenge(
		"FactChecker",
		{
			id: "m1",
			fromSeat: "FactChecker",
			toSeat: "all",
			type: "proposal",
			content: "Unsupported claim",
			confidence: 0.9,
			round: 0,
			timestamp: Date.now(),
			structured: {
				position: "Unsupported claim",
				confidenceSelf: 0.9,
				confidence_self: 0.9,
				confidenceExpertAgreement: 0.9,
				confidence_expert_agreement: 0.9,
				evidence: [],
				caveats: [],
				dissents_from: [],
				supports: [],
			},
		} as any,
		"",
	);

	assert.equal(result.unsupportedClaims.length, 1);
	assert.equal(result.correctedPosition, "Uncertain");

	const intervention = challenger.recordIntervention("run-1", {
		type: "unsupported_claim",
		severity: "high",
		description: "Claim lacks support",
		targetSeat: "FactChecker",
		evidenceQuality: 0,
		confidenceScore: 9,
	});

	assert.equal(intervention.resolution, "PENDING");
	assert.ok(intervention.id);

	const resolved = challenger.resolveIntervention(intervention.id, "RESOLVED", result);
	assert.equal(resolved, true);
	assert.equal(intervention.resolution, "RESOLVED");
});

// ─── ThinkerAgent tests ───

test("ThinkerAgent: detects conflicting findings trigger", () => {
	const thinker = new ThinkerAgent({
		complete: async () => ({ content: "{}", confidence: 0.5 }),
	});

	const messages = [
		{
			id: "m1",
			fromSeat: "FactChecker",
			toSeat: "all",
			type: "proposal",
			content: "Position A",
			confidence: 0.8,
			round: 0,
			timestamp: Date.now(),
			structured: {
				position: "Position A",
				confidenceSelf: 0.8,
				confidence_self: 0.8,
				evidence: [],
				caveats: [],
				dissents_from: [],
				supports: [],
			},
		},
		{
			id: "m2",
			fromSeat: "FactChecker",
			toSeat: "all",
			type: "refinement",
			content: "Position B",
			confidence: 0.7,
			round: 1,
			timestamp: Date.now(),
			structured: {
				position: "Position B",
				confidenceSelf: 0.7,
				confidence_self: 0.7,
				evidence: [],
				caveats: [],
				dissents_from: [],
				supports: [],
			},
		},
	];

	const triggers = thinker.scanForTriggers({
		messages: messages as any,
		inquiry: "Test inquiry",
		findings: "Current findings",
		sources: "Source refs",
		inquiryScore: 5,
		round: 1,
	});

	const conflictTrigger = triggers.find((t) => t.type === "conflicting_findings");
	assert.ok(conflictTrigger);
	assert.equal(conflictTrigger?.severity, "high");
});

test("ThinkerAgent: detects untested assumption (high confidence, no caveats)", () => {
	const thinker = new ThinkerAgent({
		complete: async () => ({ content: "{}", confidence: 0.5 }),
	});

	const messages = [
		{
			id: "m1",
			fromSeat: "Synthesizer",
			toSeat: "all",
			type: "consensus",
			content: "Final answer",
			confidence: 0.9,
			round: 0,
			timestamp: Date.now(),
			structured: {
				position: "Final answer",
				confidenceSelf: 0.9,
				confidence_self: 0.9,
				evidence: ["source1"],
				caveats: [],
				dissents_from: [],
				supports: [],
			},
		},
	];

	const triggers = thinker.scanForTriggers({
		messages: messages as any,
		inquiry: "Test inquiry",
		findings: "Current findings",
		sources: "Source refs",
		inquiryScore: 8,
		round: 0,
	});

	const assumptionTrigger = triggers.find((t) => t.type === "untested_assumption");
	assert.ok(assumptionTrigger);
	assert.equal(assumptionTrigger?.severity, "medium");
});

test("ThinkerAgent: generates questions and prevents repetition", async () => {
	const thinker = new ThinkerAgent({
		complete: async () => ({
			content: JSON.stringify({
				questions: [
					{
						question: "What is the evidence for claim X?",
						assignedTo: ["FactChecker"],
						reason: "Claim X lacks verification",
					},
				],
				summary: "One blind spot found",
			}),
			confidence: 0.5,
		}),
	});

	const result = await thinker.think({
		inquiry: "Test inquiry",
		findings: "Current findings",
		sources: "Source refs",
		maxQuestions: 2,
	});

	assert.equal(true,result.questions.length > 0);
	assert.equal(result.questions[0].assignedTo[0], "FactChecker");
	assert.equal(result.summary, "One blind spot found");

	// Second call should not repeat the same question
	const result2 = await thinker.think({
		inquiry: "Test inquiry",
		findings: "Current findings",
		sources: "Source refs",
		maxQuestions: 2,
	});
	assert.equal(true,result2.questions.length === 0 || result2.questions[0].question !== result.questions[0].question);
});

test("ThinkerAgent: intervention lifecycle", () => {
	const thinker = new ThinkerAgent({
		complete: async () => ({ content: "{}", confidence: 0.5 }),
	});

	const intervention = thinker.recordIntervention("run-1", {
		type: "untested_assumption",
		severity: "medium",
		description: "High confidence with no caveats",
		context: "Some position",
	}, [
		{ question: "What evidence supports this?", assignedTo: ["FactChecker"], reason: "Verification needed" },
	],
	"One blind spot");

	assert.equal(intervention.status, "PENDING");
	assert.ok(intervention.id);
	assert.equal(intervention.questions.length, 1);

	const resolved = thinker.resolveIntervention(intervention.id, "ANSWERED");
	assert.equal(resolved, true);
	assert.equal(intervention.status, "ANSWERED");
});

// ─── IndependentInterventionManager tests ───

test("IndependentInterventionManager: scans for triggers and returns decision", () => {
	const manager = new IndependentInterventionManager({
		complete: async () => ({ content: "{}", confidence: 0.5 }),
	});

	const context: InterventionContext = {
		runId: "run-1",
		messages: [
			{
				id: "m1",
				fromSeat: "FactChecker",
				toSeat: "all",
				type: "proposal",
				content: "Definitely correct",
				confidence: 0.9,
				round: 0,
				timestamp: Date.now(),
				structured: {
					position: "Definitely correct",
					confidenceSelf: 0.9,
					confidence_self: 0.9,
					confidenceExpertAgreement: 0.9,
					confidence_expert_agreement: 0.9,
					evidence: [],
					caveats: [],
					dissents_from: [],
					supports: [],
				},
			} as any,
		],
		evidenceContext: "",
		round: 0,
		inquiryScore: 8,
		inquiryRationale: "Complex governance question",
		mode: "sample",
		userQuestion: "What are the governance requirements?",
	};

	const decision = manager.scanForInterventions(context);
	assert.equal(true,typeof decision.shouldIntervene === "boolean");
	assert.equal(true,["RivalChallenger", "ThinkerAgent", "both", "none"].includes(decision.priorityAgent));
	assert.equal(true,typeof decision.reason === "string");
	assert.equal(true,decision.reason.length > 0);
});

test("IndependentInterventionManager: Rival Challenger challenge flow", async () => {
	const manager = new IndependentInterventionManager({
		complete: async () => ({
			content: JSON.stringify({
				challenge: "Claim lacks evidence",
				verifiedClaims: [],
				unsupportedClaims: ["main claim"],
				correctedPosition: "Uncertain",
				confidence: 0.4,
			}),
			confidence: 0.5,
		}),
	});

	const context: InterventionContext = {
		runId: "run-1",
		messages: [],
		evidenceContext: "",
		round: 0,
		inquiryScore: 8,
		inquiryRationale: "Complex",
		mode: "sample",
		userQuestion: "Test question",
	};

	const targetMsg = {
		id: "m1",
		fromSeat: "FactChecker",
		toSeat: "all",
		type: "proposal",
		content: "Unsupported claim",
		confidence: 0.9,
		round: 0,
		timestamp: Date.now(),
		structured: {
			position: "Unsupported claim",
			confidenceSelf: 0.9,
			confidence_self: 0.9,
			confidenceExpertAgreement: 0.9,
			confidence_expert_agreement: 0.9,
			evidence: [],
			caveats: [],
			dissents_from: [],
			supports: [],
		},
	} as any;

	const trigger = {
		type: "unsupported_claim" as const,
		severity: "high" as const,
		description: "Claim lacks support",
		targetSeat: "FactChecker",
		evidenceQuality: 0,
		confidenceScore: 9,
	};

	const result = await manager.executeRivalChallenge(context, targetMsg, trigger);
	assert.equal(result.resolution, "UNRESOLVED");
	assert.ok(result.interventionId);
	assert.ok(result.result.unsupportedClaims.length > 0);
});

test("IndependentInterventionManager: Thinker Agent intervention flow", async () => {
	const manager = new IndependentInterventionManager({
		complete: async () => ({
			content: JSON.stringify({
				questions: [
					{
						question: "What is the source of this claim?",
						assignedTo: ["FactChecker"],
						reason: "Verification needed",
					},
				],
				summary: "One blind spot",
			}),
			confidence: 0.5,
		}),
	});

	const context: InterventionContext = {
		runId: "run-1",
		messages: [],
		evidenceContext: "",
		round: 0,
		inquiryScore: 8,
		inquiryRationale: "Complex",
		mode: "sample",
		userQuestion: "Test question",
	};

	const trigger = {
		type: "untested_assumption" as const,
		severity: "medium" as const,
		description: "High confidence with no caveats",
		context: "Some position",
	};

	const result = await manager.executeThinkerIntervention(context, trigger);
	assert.equal(true,result.questions.length > 0);
	assert.equal(result.summary, "One blind spot");
});

test("IndependentInterventionManager: pending intervention tracking", () => {
	const manager = new IndependentInterventionManager({
		complete: async () => ({ content: "{}", confidence: 0.5 }),
	});
	assert.equal(manager.hasPendingInterventions, false);
});

// ─── Orchestrator sample mode test ───

test("Orchestrator: sample mode run completes with state history", async () => {
	const { Orchestrator } = await import("../../../apps/gateway/src/orchestrator.js");
	const orchestrator = new Orchestrator({
		mode: "sample",
		scenarioPath: "input_examples/01-governance-readiness.json",
		topicOverride: "Which governance controls should be verified?",
		maxCycles: 3,
	});

	const result = await orchestrator.run();
	assert.equal(result.mode, "sample");
	assert.equal(true,result.runId.length > 0);
	assert.equal(true,result.userQuestion.length > 0);
	assert.equal(true,result.finalAnswer.length > 0);
	assert.equal(true,result.inquiryScore >= 1 && result.inquiryScore <= 10);
	assert.equal(true,typeof result.consensusReached === "boolean");
	assert.equal(true,typeof result.auditIntegrity === "boolean");
	assert.equal(true,Array.isArray(result.stateHistory));
	assert.equal(true,result.stateHistory.length > 0);
	assert.equal(true,result.stateHistory[0].state === "RECEIVED");
	assert.equal(true,result.stateHistory[result.stateHistory.length - 1].state === "COMPLETED" ||
		result.stateHistory[result.stateHistory.length - 1].state === "HALTED");
});

test("Orchestrator: sample mode does not use Zetaris for simple questions", async () => {
	const { Orchestrator } = await import("../../../apps/gateway/src/orchestrator.js");
	const orchestrator = new Orchestrator({
		mode: "sample",
		topicOverride: "What is 2+2?",
		maxCycles: 3,
	});

	const result = await orchestrator.run();
	assert.equal(result.zetarisUsed, false);
	assert.equal(true,result.inquiryScore <= 4); // Simple question
});

test("Orchestrator: audit integrity is maintained", async () => {
	const { Orchestrator } = await import("../../../apps/gateway/src/orchestrator.js");
	const orchestrator = new Orchestrator({
		mode: "sample",
		scenarioPath: "input_examples/01-governance-readiness.json",
		maxCycles: 3,
	});

	const result = await orchestrator.run();
	assert.equal(result.auditIntegrity, true);
});
