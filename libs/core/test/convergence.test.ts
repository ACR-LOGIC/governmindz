import assert from "node:assert/strict";
import { test } from "node:test";
import { DebateLoop, type DebateConfig } from "../src/debate/DebateLoop.js";
import type { ISeatTransport } from "../src/debate/SeatTransport.js";
import type { AgentMessage } from "../src/debate/AgentMessage.js";
import { auditTrail } from "../src/engine/AuditTrailEmitter.js";

function createMockMessage(opts: {
	id: string;
	fromSeat: string;
	round: number;
	confidence: number;
	dissents_from?: string[];
	supports?: string[];
	position?: string;
}): AgentMessage {
	return {
		id: opts.id,
		fromSeat: opts.fromSeat,
		toSeat: "all",
		type: "proposal",
		content: opts.position || `Position from ${opts.fromSeat}`,
		confidence: opts.confidence,
		round: opts.round,
		timestamp: Date.now(),
		structured: {
			position: opts.position || `Position from ${opts.fromSeat}`,
			confidenceSelf: opts.confidence,
			confidence_self: opts.confidence,
			confidenceExpertAgreement: opts.confidence,
			confidence_expert_agreement: opts.confidence,
			evidence: [`ev-${opts.fromSeat}`],
			caveats: [],
			dissents_from: opts.dissents_from || [],
			dissentsFrom: opts.dissents_from || [],
			supports: opts.supports || [],
		},
	};
}

class MockTransport implements ISeatTransport {
	readonly mode = "in_process" as const;
	private proposals: Map<string, AgentMessage> = new Map();
	private responses: Map<string, AgentMessage[]> = new Map();

	constructor(
		private readonly seats: string[],
		proposals: Record<string, AgentMessage>,
		responses: Record<string, AgentMessage[]> = {},
	) {
		for (const [seat, msg] of Object.entries(proposals)) {
			this.proposals.set(seat, msg);
		}
		for (const [seat, msgs] of Object.entries(responses)) {
			this.responses.set(seat, msgs);
		}
	}

	listSeatIds(): string[] {
		return [...this.seats];
	}

	hasSeat(seatId: string): boolean {
		return this.seats.includes(seatId);
	}

	async propose(seatId: string, _task: string, _round: number): Promise<AgentMessage> {
		const msg = this.proposals.get(seatId);
		if (!msg) throw new Error(`No mock proposal for ${seatId}`);
		return msg;
	}

	async respond(seatId: string, _history: AgentMessage[], _round: number): Promise<AgentMessage> {
		const list = this.responses.get(seatId);
		if (list && list.length > 0) {
			return list.shift()!;
		}
		return createMockMessage({
			id: `resp-${seatId}-${Date.now()}`,
			fromSeat: seatId,
			round: 1,
			confidence: 0.8,
		});
	}

	async synthesize(seatId: string, _history: AgentMessage[], round: number, instruction?: string): Promise<AgentMessage> {
		return {
			id: `decree-${seatId}-${round}-${Date.now()}`,
			fromSeat: seatId,
			toSeat: "all",
			type: "consensus",
			content: `Executive Decree: ${instruction || "Unified consensus recommendation."}`,
			confidence: 0.95,
			round,
			timestamp: Date.now(),
			structured: {
				position: `Executive Decree: ${instruction || "Unified consensus recommendation."}`,
				confidenceSelf: 0.95,
				confidence_self: 0.95,
				confidenceExpertAgreement: 0.95,
				confidence_expert_agreement: 0.95,
				evidence: ["ev-unanimous-synthesis"],
				caveats: [],
				dissents_from: [],
				supports: this.seats.filter((s) => s !== seatId),
			},
		};
	}
}

test("DebateLoop: stance divergence metric accurately quantifies alignment vs conflict", () => {
	const seatIds = ["FactChecker", "CloudArchitect", "Synthesizer"];
	const transport = new MockTransport(seatIds, {});
	const loop = new DebateLoop(
		seatIds,
		transport,
		() => seatIds,
		{ maxRounds: 2, consensusThreshold: 0.75, minConsensusSeats: 2, enableTieredPhases: false, dissentTriggerCount: 3 },
	);

	// Case 1: Perfectly aligned proposals (0 dissents, identical high confidence)
	const alignedMessages: AgentMessage[] = [
		createMockMessage({ id: "m1", fromSeat: "FactChecker", round: 0, confidence: 0.85 }),
		createMockMessage({ id: "m2", fromSeat: "CloudArchitect", round: 0, confidence: 0.85 }),
		createMockMessage({ id: "m3", fromSeat: "Synthesizer", round: 0, confidence: 0.85 }),
	];

	const alignedDiv = loop.calculateStanceDivergence(alignedMessages);
	assert.ok(
		alignedDiv.divergenceScore <= 0.05,
		`Aligned messages expected divergence <= 0.05, got ${alignedDiv.divergenceScore}`,
	);
	assert.equal(alignedDiv.dissentsCount, 0);
	assert.equal(alignedDiv.isUnanimous, true);

	// Case 2: Conflicting messages with mutual dissents
	const conflictingMessages: AgentMessage[] = [
		createMockMessage({
			id: "c1",
			fromSeat: "FactChecker",
			round: 0,
			confidence: 0.85,
			dissents_from: ["CloudArchitect"],
		}),
		createMockMessage({
			id: "c2",
			fromSeat: "CloudArchitect",
			round: 0,
			confidence: 0.85,
			dissents_from: ["FactChecker"],
		}),
	];

	const conflictDiv = loop.calculateStanceDivergence(conflictingMessages);
	assert.ok(
		conflictDiv.divergenceScore >= 0.50,
		`Conflicting messages expected divergence >= 0.50, got ${conflictDiv.divergenceScore}`,
	);
	assert.equal(conflictDiv.dissentsCount, 2);
	assert.equal(conflictDiv.isUnanimous, false);

	// Case 3: Confidence variance spread
	const spreadMessages: AgentMessage[] = [
		createMockMessage({ id: "s1", fromSeat: "FactChecker", round: 0, confidence: 0.95 }),
		createMockMessage({ id: "s2", fromSeat: "CloudArchitect", round: 0, confidence: 0.40 }),
	];
	const spreadDiv = loop.calculateStanceDivergence(spreadMessages);
	assert.ok(spreadDiv.confidenceVariance > 0.3);
	assert.equal(spreadDiv.isUnanimous, false); // confidence 0.40 is < 0.75
});

test("DebateLoop: epistemic convergence detects unanimous alignment vs low-confidence ambiguity", () => {
	const seatIds = ["AgentA", "AgentB"];
	const transport = new MockTransport(seatIds, {});
	const loop = new DebateLoop(
		seatIds,
		transport,
		() => seatIds,
		{ maxRounds: 2, consensusThreshold: 0.75, minConsensusSeats: 2, enableTieredPhases: false, dissentTriggerCount: 3 },
	);

	// Directly populate transcript round 0 with unanimous messages
	(loop as any).transcript = [
		createMockMessage({ id: "u1", fromSeat: "AgentA", round: 0, confidence: 0.88 }),
		createMockMessage({ id: "u2", fromSeat: "AgentB", round: 0, confidence: 0.84 }),
	];

	const conv = loop.evaluateEpistemicConvergence(0);
	assert.equal(conv.converged, true);
	assert.equal(conv.isUnanimous, true);
	assert.ok(conv.divergence <= 0.10);

	// Change to low confidence
	(loop as any).transcript = [
		createMockMessage({ id: "low1", fromSeat: "AgentA", round: 0, confidence: 0.50 }),
		createMockMessage({ id: "low2", fromSeat: "AgentB", round: 0, confidence: 0.55 }),
	];

	const lowConv = loop.evaluateEpistemicConvergence(0);
	assert.equal(lowConv.converged, false);
	assert.equal(lowConv.isUnanimous, false);
});

test("DebateLoop: early stops after Round 1 on unanimous initial consensus and synthesizes decree", async () => {
	const seatIds = ["FactChecker", "CloudArchitect", "Synthesizer"];
	const mockProposals = {
		FactChecker: createMockMessage({
			id: "fc-1",
			fromSeat: "FactChecker",
			round: 0,
			confidence: 0.88,
			position: "All 3 Zetaris catalogs verified with read-only guard.",
		}),
		CloudArchitect: createMockMessage({
			id: "ca-1",
			fromSeat: "CloudArchitect",
			round: 0,
			confidence: 0.85,
			position: "Zero-trust policy gate configured; quarantine confidential sources.",
		}),
		Synthesizer: createMockMessage({
			id: "sy-1",
			fromSeat: "Synthesizer",
			round: 0,
			confidence: 0.90,
			position: "Consensus agreed: read-only access with audit logging.",
		}),
	};

	const transport = new MockTransport(seatIds, mockProposals);
	const events: Array<{ type: string; [key: string]: unknown }> = [];

	const loop = new DebateLoop(
		seatIds,
		transport,
		() => seatIds,
		{
			maxRounds: 3, // normally would run 3 rounds
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: false,
			dissentTriggerCount: 3,
			judgeSeatId: "Synthesizer",
			eventSink: (e) => events.push(e as any),
		},
	);

	const result = await loop.run("Audit Zetaris federated access controls");

	// Deliberation must terminate after Round 1 (round 0 proposals + decree synthesis = round 1)
	assert.equal(result.rounds, 1, `Expected debate to early stop at round 1, but ran ${result.rounds} rounds`);
	assert.equal(result.consensusReached, true);
	assert.equal(result.consensus_method, "unanimous_initial");
	assert.ok(result.finalConfidence >= 0.80);

	// Verify executive decree synthesis message exists at the end
	const lastMessage = result.transcript[result.transcript.length - 1];
	assert.equal(lastMessage.type, "consensus");
	assert.equal(lastMessage.fromSeat, "Synthesizer");
	assert.ok(lastMessage.content.includes("Executive Decree"));

	// Verify lifecycle events
	const eventTypes = events.map((e) => e.type);
	assert.ok(eventTypes.includes("epistemic_convergence"));
	assert.ok(eventTypes.includes("consensus"));
	const consensusEvent = events.find((e) => e.type === "consensus");
	assert.equal(consensusEvent?.method, "unanimous_initial");
});

test("DebateLoop: continues to rebuttal rounds when divergence is high", async () => {
	const seatIds = ["FactChecker", "CloudArchitect", "Synthesizer"];
	const mockProposals = {
		FactChecker: createMockMessage({
			id: "fc-1",
			fromSeat: "FactChecker",
			round: 0,
			confidence: 0.85,
			dissents_from: ["CloudArchitect"],
			position: "Direct catalog access is permitted without policy gate.",
		}),
		CloudArchitect: createMockMessage({
			id: "ca-1",
			fromSeat: "CloudArchitect",
			round: 0,
			confidence: 0.80,
			dissents_from: ["FactChecker"],
			position: "Direct access is prohibited; policy gate is strictly mandatory.",
		}),
		Synthesizer: createMockMessage({
			id: "sy-1",
			fromSeat: "Synthesizer",
			round: 0,
			confidence: 0.70,
			position: "Deadlock identified between FactChecker and CloudArchitect.",
		}),
	};

	const transport = new MockTransport(seatIds, mockProposals);
	const loop = new DebateLoop(
		seatIds,
		transport,
		() => seatIds,
		{
			maxRounds: 2,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: false,
			dissentTriggerCount: 3,
			judgeSeatId: "Synthesizer",
		},
	);

	const result = await loop.run("Debate catalog access security");

	// Must NOT stop at round 1; proceeds into round 2 rebuttal
	assert.ok(result.rounds >= 2, `Expected debate to continue past round 1, got ${result.rounds}`);
	assert.ok(result.consensus_method !== "unanimous_initial");
});

test("DebateLoop: preserves deterministic canonical turn sequence and cryptographic audit integrity", async () => {
	const seatIds = ["SeatAlpha", "SeatBeta", "SeatGamma"];
	const mockProposals = {
		SeatAlpha: createMockMessage({ id: "a1", fromSeat: "SeatAlpha", round: 0, confidence: 0.85 }),
		SeatBeta: createMockMessage({ id: "b1", fromSeat: "SeatBeta", round: 0, confidence: 0.85 }),
		SeatGamma: createMockMessage({ id: "g1", fromSeat: "SeatGamma", round: 0, confidence: 0.85 }),
	};

	const transport = new MockTransport(seatIds, mockProposals);
	const loop = new DebateLoop(
		seatIds,
		transport,
		() => seatIds,
		{
			maxRounds: 1,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: false,
			dissentTriggerCount: 3,
			judgeSeatId: "SeatGamma",
		},
	);

	const result = await loop.run("Verify canonical order");

	// Proposals in transcript must be in the exact order of seatIds: SeatAlpha, SeatBeta, SeatGamma
	const proposalSeats = result.transcript
		.filter((m) => m.type === "proposal")
		.map((m) => m.fromSeat);

	assert.deepEqual(proposalSeats, seatIds);

	// Audit trail cryptographic hash chain must remain valid
	assert.equal(auditTrail.verifyIntegrity(), true);
});
