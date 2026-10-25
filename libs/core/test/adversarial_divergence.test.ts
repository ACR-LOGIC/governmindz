import assert from "node:assert/strict";
import { test } from "node:test";

const describe = (_name: string, fn: () => void) => {
	fn();
};
import { DebateLoop } from "../src/debate/DebateLoop.js";
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

	async respond(seatId: string, _history: AgentMessage[], round: number): Promise<AgentMessage> {
		const list = this.responses.get(seatId);
		if (list && list.length > 0) {
			return list.shift()!;
		}
		return createMockMessage({
			id: `resp-${seatId}-${round}-${Date.now()}`,
			fromSeat: seatId,
			round,
			confidence: 0.8,
			position: `Rebuttal from ${seatId} in round ${round}`,
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

function createLoop(seats: string[] = ["SeatA", "SeatB", "SeatC"]) {
	const transport = new MockTransport(seats, {});
	return new DebateLoop(
		seats,
		transport,
		() => seats,
		{
			maxRounds: 3,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: false,
			dissentTriggerCount: 3,
			judgeSeatId: seats[seats.length - 1],
		},
	);
}

describe("Adversarial Empirical Challenge: Dynamic Stance Divergence & Early Stopping", () => {
	// =========================================================================
	// 1. CORNER CASES: Array Size and Extreme Shapes
	// =========================================================================
	test("Corner Case 1.1: Empty messages array", () => {
		const loop = createLoop();
		const result = loop.calculateStanceDivergence([]);
		assert.equal(result.divergenceScore, 0);
		assert.equal(result.dissentsCount, 0);
		assert.equal(result.supportsCount, 0);
		assert.equal(result.confidenceVariance, 0);
		assert.equal(result.isUnanimous, true);

		// But evaluateEpistemicConvergence with < minConsensusSeats must NOT converge
		(loop as any).transcript = [];
		const conv = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv.converged, false);
		assert.equal(conv.isUnanimous, false);
		assert.equal(conv.divergence, 1.0);
	});

	test("Corner Case 1.2: Single message array (N = 1)", () => {
		const loop = createLoop(["SeatA"]);
		const msg = createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.9 });
		const result = loop.calculateStanceDivergence([msg]);
		assert.equal(result.divergenceScore, 0);
		assert.equal(result.avgConfidence, 0.9);
		assert.equal(result.isUnanimous, true);

		// evaluateEpistemicConvergence must protect against single seat when minConsensusSeats = 2
		(loop as any).transcript = [msg];
		const conv = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv.converged, false);
		assert.equal(conv.isUnanimous, false);
		assert.equal(conv.divergence, 1.0);
	});

	// =========================================================================
	// 2. CORNER CASES: 0 Dissents vs Multiple Dissents vs Excessive Dissents
	// =========================================================================
	test("Corner Case 2.1: 0 dissents and 0 supports (blind initial proposals)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.85 }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85 }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.dissentsCount, 0);
		assert.equal(result.dissentScore, 0);
		assert.equal(result.supportsCount, 0);
		assert.equal(result.supportScore, 0);
		assert.equal(result.confidenceVariance, 0);
		assert.equal(result.divergenceScore, 0);
		assert.equal(result.isUnanimous, true);
	});

	test("Corner Case 2.2: Single dissent in 3-agent pool (dissentsCount = 1, maxPairs = 6)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.85, dissents_from: ["SeatB"] }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85 }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.dissentsCount, 1);
		// d_dissent = 1 / 6 = 0.16666...
		assert.ok(Math.abs(result.dissentScore - 1 / 6) < 1e-6);
		// With 1 dissent, isUnanimous MUST be false
		assert.equal(result.isUnanimous, false);
		// Divergence includes 0.5 * d_dissent + 0.3 * d_support(1.0)
		assert.ok(result.divergenceScore > 0.30);
	});

	test("Corner Case 2.3: Maximal mutual dissents (all seats dissent against all peers)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.9, dissents_from: ["SeatB", "SeatC"] }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.9, dissents_from: ["SeatA", "SeatC"] }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.9, dissents_from: ["SeatA", "SeatB"] }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.dissentsCount, 6);
		assert.equal(result.dissentScore, 1.0);
		assert.equal(result.isUnanimous, false);
		// 0.5 * 1.0 + 0.3 * 1.0 = 0.80 divergence
		assert.ok(result.divergenceScore >= 0.80);
	});

	test("Corner Case 2.4: Excessive dissents (agents include duplicate or out-of-pool dissents)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.85, dissents_from: ["X", "Y", "Z", "W"] }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85, dissents_from: ["A", "B", "C", "D"] }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.dissentsCount, 8);
		// maxPairs is 6, so dissentsCount / maxPairs = 8 / 6 > 1.0. Clamped to 1.0!
		assert.equal(result.dissentScore, 1.0);
		assert.ok(result.divergenceScore <= 1.0);
		assert.equal(result.isUnanimous, false);
	});

	// =========================================================================
	// 3. CORNER CASES: Asymmetric Supports & Support Deficit
	// =========================================================================
	test("Corner Case 3.1: Full symmetric support (all seats support each other)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.85, supports: ["SeatB", "SeatC"] }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85, supports: ["SeatA", "SeatC"] }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85, supports: ["SeatA", "SeatB"] }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.supportsCount, 6);
		assert.equal(result.supportScore, 0.0);
		assert.equal(result.divergenceScore, 0.0);
		assert.equal(result.isUnanimous, true);
	});

	test("Corner Case 3.2: Asymmetric single support (SeatA supports SeatB, others silent)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.85, supports: ["SeatB"] }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85 }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.supportsCount, 1);
		// supportRatio = 1 / 6 = 0.16666...
		// d_support = 1 - 1/6 = 0.83333...
		// 0.3 * d_support = 0.25 divergenceScore!
		assert.ok(Math.abs(result.divergenceScore - 0.25) < 1e-4);
		// Asymmetric partial support prevents unanimous early stopping!
		assert.equal(result.isUnanimous, false);
	});

	test("Corner Case 3.3: High support near threshold (5 supports out of 6)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.85, supports: ["SeatB", "SeatC"] }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85, supports: ["SeatA", "SeatC"] }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85, supports: ["SeatA"] }), // missed SeatB
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.supportsCount, 5);
		// supportRatio = 5 / 6. d_support = 1 - 5/6 = 1/6.
		// divergenceScore = 0.3 * (1/6) = 0.05 <= 0.10!
		assert.ok(Math.abs(result.divergenceScore - 0.05) < 1e-4);
		assert.equal(result.isUnanimous, true);
	});

	test("Corner Case 3.4: Support overflow (supportsCount > maxPairs)", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.85, supports: ["SeatB", "SeatC", "Extra1", "Extra2"] }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85, supports: ["SeatA", "SeatC", "Extra3"] }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85, supports: ["SeatA", "SeatB"] }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.supportsCount, 9);
		// supportRatio clamped to 1.0, d_support clamped to 0.0
		assert.equal(result.supportScore, 0.0);
		assert.equal(result.divergenceScore, 0.0);
		assert.equal(result.isUnanimous, true);
	});

	// =========================================================================
	// 4. CORNER CASES: Variance Boundaries
	// =========================================================================
	test("Corner Case 4.1: Variance boundary in high confidence range [0.75, 1.0]", () => {
		const loop = createLoop(["SeatA", "SeatB"]);
		// Maximum possible variance in [0.75, 1.0] occurs at endpoints [0.75, 1.0]
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.75 }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 1.00 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		// avg = 0.875, diff = 0.125, var = 0.015625, std = 0.125
		// d_confVariance = 2 * 0.125 = 0.25
		// divergenceScore = 0.2 * 0.25 = 0.05 <= 0.10!
		assert.ok(Math.abs(result.divergenceScore - 0.05) < 1e-4);
		assert.equal(result.isUnanimous, true);
	});

	test("Corner Case 4.2: Variance boundary across full range [0.0, 1.0]", () => {
		const loop = createLoop(["SeatA", "SeatB"]);
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.0 }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 1.0 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		// avg = 0.5, var = 0.25, std = 0.5, d_confVariance = min(1.0, 2 * 0.5) = 1.0
		// divergenceScore = 0.2 * 1.0 = 0.20
		assert.equal(result.confidenceVariance, 1.0);
		assert.ok(Math.abs(result.divergenceScore - 0.20) < 1e-4);
		assert.equal(result.isUnanimous, false);
	});

	// =========================================================================
	// 5. THRESHOLD BOUNDARIES: Confidence 0.74 vs 0.75
	// =========================================================================
	test("Threshold Boundary 5.1: Exactly 0.75 confidence across all seats enables unanimity", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.75 }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.75 }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.75 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.equal(result.divergenceScore, 0);
		assert.equal(result.isUnanimous, true);

		(loop as any).transcript = msgs;
		const conv = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv.isUnanimous, true);
		assert.equal(conv.converged, true);
	});

	test("Threshold Boundary 5.2: 0.74 confidence on a single seat prevents unanimity", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.74 }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.85 }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.85 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		// Even though divergence is small (< 0.05), confidence 0.74 < 0.75 prevents isUnanimous!
		assert.ok(result.divergenceScore <= 0.05);
		assert.equal(result.isUnanimous, false);

		(loop as any).transcript = msgs;
		const conv = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv.isUnanimous, false);
	});

	test("Threshold Boundary 5.3: All seats at 0.74 prevents unanimity", () => {
		const loop = createLoop();
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "SeatA", round: 0, confidence: 0.74 }),
			createMockMessage({ id: "m2", fromSeat: "SeatB", round: 0, confidence: 0.74 }),
			createMockMessage({ id: "m3", fromSeat: "SeatC", round: 0, confidence: 0.74 }),
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.ok(result.divergenceScore < 1e-10);
		assert.equal(result.isUnanimous, false);

		(loop as any).transcript = msgs;
		const conv = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv.isUnanimous, false);
	});

	// =========================================================================
	// 6. THRESHOLD BOUNDARIES: Divergence 0.10 vs 0.11 (and surrounding)
	// =========================================================================
	test("Threshold Boundary 6.1: Divergence below 0.10 (D = 0.09) triggers unanimity", () => {
		// N = 5 seats -> maxPairs = 20.
		// If 14 supports are provided (0 dissents, identical confidence 0.80):
		// supportRatio = 14 / 20 = 0.70.
		// d_support = 1 - 0.70 = 0.30.
		// divergenceScore = 0.3 * 0.30 = 0.09 <= 0.10!
		const seats = ["S1", "S2", "S3", "S4", "S5"];
		const loop = createLoop(seats);
		const msgs = [
			createMockMessage({ id: "m1", fromSeat: "S1", round: 0, confidence: 0.80, supports: ["S2", "S3", "S4", "S5"] }), // 4
			createMockMessage({ id: "m2", fromSeat: "S2", round: 0, confidence: 0.80, supports: ["S1", "S3", "S4", "S5"] }), // 4 (total 8)
			createMockMessage({ id: "m3", fromSeat: "S3", round: 0, confidence: 0.80, supports: ["S1", "S2", "S4"] }),       // 3 (total 11)
			createMockMessage({ id: "m4", fromSeat: "S4", round: 0, confidence: 0.80, supports: ["S1", "S2", "S3"] }),       // 3 (total 14)
			createMockMessage({ id: "m5", fromSeat: "S5", round: 0, confidence: 0.80, supports: [] }),                        // 0 (total 14)
		];
		const result = loop.calculateStanceDivergence(msgs);
		assert.ok(Math.abs(result.divergenceScore - 0.09) < 1e-4);
		assert.ok(result.divergenceScore <= 0.10);
		assert.equal(result.isUnanimous, true);

		(loop as any).transcript = msgs;
		const conv = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv.isUnanimous, true);
	});

	test("Threshold Boundary 6.2: Divergence above 0.10 (D = 0.105 and D = 0.12) blocks unanimity", () => {
		// N = 5 seats -> maxPairs = 20.
		// If 13 supports: supportRatio = 13/20 = 0.65 -> d_support = 0.35 -> D = 0.3 * 0.35 = 0.105 > 0.10!
		const seats = ["S1", "S2", "S3", "S4", "S5"];
		const loop = createLoop(seats);
		const msgs13 = [
			createMockMessage({ id: "m1", fromSeat: "S1", round: 0, confidence: 0.80, supports: ["S2", "S3", "S4", "S5"] }), // 4
			createMockMessage({ id: "m2", fromSeat: "S2", round: 0, confidence: 0.80, supports: ["S1", "S3", "S4", "S5"] }), // 4 (8)
			createMockMessage({ id: "m3", fromSeat: "S3", round: 0, confidence: 0.80, supports: ["S1", "S2", "S4"] }),       // 3 (11)
			createMockMessage({ id: "m4", fromSeat: "S4", round: 0, confidence: 0.80, supports: ["S1", "S2"] }),             // 2 (13)
			createMockMessage({ id: "m5", fromSeat: "S5", round: 0, confidence: 0.80, supports: [] }),                        // 0 (13)
		];
		const result13 = loop.calculateStanceDivergence(msgs13);
		assert.ok(Math.abs(result13.divergenceScore - 0.105) < 1e-4);
		assert.ok(result13.divergenceScore > 0.10);
		assert.equal(result13.isUnanimous, false);

		(loop as any).transcript = msgs13;
		const conv13 = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv13.isUnanimous, false);

		// If 12 supports: supportRatio = 12/20 = 0.60 -> d_support = 0.40 -> D = 0.3 * 0.40 = 0.12 > 0.10!
		const msgs12 = [
			createMockMessage({ id: "m1", fromSeat: "S1", round: 0, confidence: 0.80, supports: ["S2", "S3", "S4", "S5"] }), // 4
			createMockMessage({ id: "m2", fromSeat: "S2", round: 0, confidence: 0.80, supports: ["S1", "S3", "S4"] }),       // 3 (7)
			createMockMessage({ id: "m3", fromSeat: "S3", round: 0, confidence: 0.80, supports: ["S1", "S2", "S4"] }),       // 3 (10)
			createMockMessage({ id: "m4", fromSeat: "S4", round: 0, confidence: 0.80, supports: ["S1", "S2"] }),             // 2 (12)
			createMockMessage({ id: "m5", fromSeat: "S5", round: 0, confidence: 0.80, supports: [] }),                        // 0 (12)
		];
		const result12 = loop.calculateStanceDivergence(msgs12);
		assert.ok(Math.abs(result12.divergenceScore - 0.12) < 1e-4);
		assert.ok(result12.divergenceScore > 0.10);
		assert.equal(result12.isUnanimous, false);

		(loop as any).transcript = msgs12;
		const conv12 = loop.evaluateEpistemicConvergence(0);
		assert.equal(conv12.isUnanimous, false);
	});

	// =========================================================================
	// 7. DELIBERATION EXECUTION: Early Stopping vs Rebuttal Round Transitions
	// =========================================================================
	test("Deliberation: When divergence > 0.10 (due to support deficit), early stop does NOT trigger and proceeds to rebuttal", async () => {
		const seatIds = ["SeatAlpha", "SeatBeta", "SeatGamma"];
		// SeatAlpha supports SeatBeta, others silent -> divergenceScore = 0.25 > 0.10!
		const mockProposals = {
			SeatAlpha: createMockMessage({
				id: "a1",
				fromSeat: "SeatAlpha",
				round: 0,
				confidence: 0.85,
				supports: ["SeatBeta"],
				position: "SeatAlpha proposal supporting SeatBeta",
			}),
			SeatBeta: createMockMessage({
				id: "b1",
				fromSeat: "SeatBeta",
				round: 0,
				confidence: 0.85,
				position: "SeatBeta independent proposal",
			}),
			SeatGamma: createMockMessage({
				id: "g1",
				fromSeat: "SeatGamma",
				round: 0,
				confidence: 0.85,
				position: "SeatGamma independent proposal",
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
				judgeSeatId: "SeatGamma",
			},
		);

		const result = await loop.run("Evaluate federated access");
		// Deliberation must NOT early stop at round 1 because D = 0.25 > 0.10!
		assert.ok(result.rounds >= 2, `Expected debate to continue into rebuttal rounds, but stopped at ${result.rounds}`);
		assert.ok(result.consensus_method !== "unanimous_initial");
		const rebuttalMessages = result.transcript.filter((m) => m.round >= 1 && m.type === "proposal");
		assert.ok(rebuttalMessages.length > 0, "Expected rebuttal round messages to be present");
	});

	test("Deliberation: When confidence < 0.75 on one seat, early stop does NOT trigger and proceeds to rebuttal", async () => {
		const seatIds = ["SeatAlpha", "SeatBeta", "SeatGamma"];
		// Zero dissents, zero supports, but SeatAlpha has confidence 0.74 (< 0.75)
		const mockProposals = {
			SeatAlpha: createMockMessage({
				id: "a1",
				fromSeat: "SeatAlpha",
				round: 0,
				confidence: 0.74, // Sub-threshold!
				position: "SeatAlpha low confidence proposal",
			}),
			SeatBeta: createMockMessage({
				id: "b1",
				fromSeat: "SeatBeta",
				round: 0,
				confidence: 0.85,
				position: "SeatBeta high confidence proposal",
			}),
			SeatGamma: createMockMessage({
				id: "g1",
				fromSeat: "SeatGamma",
				round: 0,
				confidence: 0.85,
				position: "SeatGamma high confidence proposal",
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
				judgeSeatId: "SeatGamma",
			},
		);

		const result = await loop.run("Evaluate policy compliance");
		// Deliberation must NOT early stop at round 1
		assert.ok(result.rounds >= 2, `Expected debate to continue into rebuttal rounds due to sub-threshold confidence, but stopped at ${result.rounds}`);
		assert.ok(result.consensus_method !== "unanimous_initial");
	});

	test("Deliberation: When unanimous initial consensus is met, early stops at Round 1, synthesizes decree and preserves audit integrity", async () => {
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
				maxRounds: 3,
				consensusThreshold: 0.75,
				minConsensusSeats: 2,
				enableTieredPhases: false,
				dissentTriggerCount: 3,
				judgeSeatId: "Synthesizer",
				eventSink: (e) => events.push(e as any),
			},
		);

		const result = await loop.run("Audit Zetaris federated access controls");

		// Round 1 early stop verification
		assert.equal(result.rounds, 1, `Expected debate to early stop at round 1, but ran ${result.rounds} rounds`);
		assert.equal(result.consensusReached, true);
		assert.equal(result.consensus_method, "unanimous_initial");
		assert.ok(result.finalConfidence >= 0.80);

		// Executive decree verification
		const lastMessage = result.transcript[result.transcript.length - 1];
		assert.equal(lastMessage.type, "consensus");
		assert.equal(lastMessage.fromSeat, "Synthesizer");
		assert.ok(lastMessage.content.includes("Executive Decree"));

		// Audit integrity
		assert.equal(auditTrail.verifyIntegrity(), true);
	});

	test("Deliberation: Exact boundary comparison in full debate (D = 0.09 early stops vs D = 0.105 continues)", async () => {
		const seats = ["S1", "S2", "S3", "S4", "S5"];

		// Case A: D = 0.09 <= 0.10 (14 supports out of 20) -> MUST EARLY STOP at round 1
		const proposals14 = {
			S1: createMockMessage({ id: "p1", fromSeat: "S1", round: 0, confidence: 0.85, supports: ["S2", "S3", "S4", "S5"] }),
			S2: createMockMessage({ id: "p2", fromSeat: "S2", round: 0, confidence: 0.85, supports: ["S1", "S3", "S4", "S5"] }),
			S3: createMockMessage({ id: "p3", fromSeat: "S3", round: 0, confidence: 0.85, supports: ["S1", "S2", "S4"] }),
			S4: createMockMessage({ id: "p4", fromSeat: "S4", round: 0, confidence: 0.85, supports: ["S1", "S2", "S3"] }),
			S5: createMockMessage({ id: "p5", fromSeat: "S5", round: 0, confidence: 0.85, supports: [] }),
		};
		const transportA = new MockTransport(seats, proposals14);
		const loopA = new DebateLoop(seats, transportA, () => seats, {
			maxRounds: 3,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			judgeSeatId: "S5",
			enableTieredPhases: false,
			dissentTriggerCount: 3,
		});
		const resultA = await loopA.run("Boundary test 0.09");
		assert.equal(resultA.rounds, 1, `Expected D=0.09 to early stop at round 1, but ran ${resultA.rounds}`);
		assert.equal(resultA.consensus_method, "unanimous_initial");

		// Case B: D = 0.105 > 0.10 (13 supports out of 20) -> MUST NOT early stop; proceeds to rebuttal
		const proposals13 = {
			S1: createMockMessage({ id: "p1", fromSeat: "S1", round: 0, confidence: 0.85, supports: ["S2", "S3", "S4", "S5"] }),
			S2: createMockMessage({ id: "p2", fromSeat: "S2", round: 0, confidence: 0.85, supports: ["S1", "S3", "S4", "S5"] }),
			S3: createMockMessage({ id: "p3", fromSeat: "S3", round: 0, confidence: 0.85, supports: ["S1", "S2", "S4"] }),
			S4: createMockMessage({ id: "p4", fromSeat: "S4", round: 0, confidence: 0.85, supports: ["S1", "S2"] }),
			S5: createMockMessage({ id: "p5", fromSeat: "S5", round: 0, confidence: 0.85, supports: [] }),
		};
		const transportB = new MockTransport(seats, proposals13);
		const loopB = new DebateLoop(seats, transportB, () => seats, {
			maxRounds: 3,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			judgeSeatId: "S5",
			enableTieredPhases: false,
			dissentTriggerCount: 3,
		});
		const resultB = await loopB.run("Boundary test 0.105");
		assert.ok(resultB.rounds >= 2, `Expected D=0.105 to continue to rebuttal rounds, but stopped at ${resultB.rounds}`);
		assert.ok(resultB.consensus_method !== "unanimous_initial");
	});

	test("Deliberation: Tiered phases (enableTieredPhases: true) early stops on unanimous blind proposals", async () => {
		const seatIds = ["FactChecker", "CloudArchitect", "Synthesizer"];
		const mockProposals = {
			FactChecker: createMockMessage({ id: "fc-1", fromSeat: "FactChecker", round: 0, confidence: 0.85 }),
			CloudArchitect: createMockMessage({ id: "ca-1", fromSeat: "CloudArchitect", round: 0, confidence: 0.85 }),
			Synthesizer: createMockMessage({ id: "sy-1", fromSeat: "Synthesizer", round: 0, confidence: 0.85 }),
		};
		const transport = new MockTransport(seatIds, mockProposals);
		const loop = new DebateLoop(seatIds, transport, () => seatIds, {
			maxRounds: 3,
			enableTieredPhases: true, // Blind round mode
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			dissentTriggerCount: 3,
			judgeSeatId: "Synthesizer",
		});
		const result = await loop.run("Blind round unanimous test");
		assert.equal(result.rounds, 1);
		assert.equal(result.consensus_method, "unanimous_initial");
		assert.equal(result.consensusReached, true);
	});
});
