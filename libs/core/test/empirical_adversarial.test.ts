import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ParallelAgentScheduler,
	type ParallelProposalTask,
} from "../src/scheduler/ParallelAgentScheduler.js";
import { AuditTrailEmitter } from "../src/engine/AuditTrailEmitter.js";
import { DebateLoop } from "../src/debate/DebateLoop.js";
import type { ISeatTransport } from "../src/debate/SeatTransport.js";
import type { AgentMessage } from "../src/debate/AgentMessage.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createMockMessage(opts: {
	id: string;
	fromSeat: string;
	round: number;
	confidence: number;
	type?: "proposal" | "refinement" | "consensus" | "challenge";
	dissents_from?: string[];
	supports?: string[];
	position?: string;
}): AgentMessage {
	return {
		id: opts.id,
		fromSeat: opts.fromSeat,
		toSeat: "all",
		type: opts.type || "proposal",
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

class DelayedMockTransport implements ISeatTransport {
	readonly mode = "in_process" as const;

	constructor(
		private readonly seats: string[],
		private readonly latencyMap: Record<string, number>,
		private readonly failureMap: Record<string, "error" | "string_error" | "timeout" | "sync_throw"> = {},
		private readonly confidenceMap: Record<string, number> = {},
	) {}

	listSeatIds(): string[] {
		return [...this.seats];
	}

	hasSeat(seatId: string): boolean {
		return this.seats.includes(seatId);
	}

	async propose(seatId: string, _task: string, round: number): Promise<AgentMessage> {
		const failType = this.failureMap[seatId];
		if (failType === "sync_throw") {
			throw new Error(`Sync explosion in seat ${seatId}`);
		}

		const delay = this.latencyMap[seatId] ?? 20;
		await sleep(delay);

		if (failType === "error") {
			throw new Error(`Asynchronous network abort in seat ${seatId}`);
		}
		if (failType === "string_error") {
			return Promise.reject(`Raw string rejection from seat ${seatId}`);
		}
		if (failType === "timeout") {
			await sleep(5000);
		}

		const conf = this.confidenceMap[seatId] ?? 0.85;
		return createMockMessage({
			id: `msg-${seatId}-r${round}`,
			fromSeat: seatId,
			round,
			type: "proposal",
			confidence: conf,
			position: `Governed position from ${seatId}`,
		});
	}

	async respond(seatId: string, _history: AgentMessage[], round: number): Promise<AgentMessage> {
		const delay = this.latencyMap[seatId] ?? 20;
		await sleep(delay);
		return createMockMessage({
			id: `resp-${seatId}-r${round}`,
			fromSeat: seatId,
			round,
			type: "refinement",
			confidence: 0.85,
		});
	}

	async synthesize(seatId: string, _history: AgentMessage[], round: number, instruction?: string): Promise<AgentMessage> {
		return {
			id: `decree-${seatId}-${round}-${Date.now()}`,
			fromSeat: seatId,
			toSeat: "all",
			type: "consensus",
			content: `Executive Decree: ${instruction || "Consensus established."}`,
			confidence: 0.95,
			round,
			timestamp: Date.now(),
			structured: {
				position: `Executive Decree: ${instruction || "Consensus established."}`,
				confidenceSelf: 0.95,
				confidence_self: 0.95,
				confidenceExpertAgreement: 0.95,
				confidence_expert_agreement: 0.95,
				evidence: ["ev-empirical-harness"],
				caveats: [],
				dissents_from: [],
				supports: this.seats.filter((s) => s !== seatId),
			},
		};
	}
}

// ---------------------------------------------------------------------------
// TEST 1: High Concurrency Load (50 tasks) with extreme asynchronous latency jitter
// ---------------------------------------------------------------------------
test("Adversarial 1: 50 concurrent tasks with extreme jitter and out-of-order completions", async () => {
	const emitter = new AuditTrailEmitter("adversarial-secret-key-1");
	const scheduler = new ParallelAgentScheduler(emitter);
	const taskCount = 50;

	// Latency is reverse of index: task 49 finishes in 10ms, task 0 finishes in 110ms
	const tasks: ParallelProposalTask[] = Array.from({ length: taskCount }, (_, i) => {
		const seatId = `agent-${String(i).padStart(2, "0")}`;
		const latency = 10 + ((taskCount - i) * 2);
		return {
			seatId,
			timeoutMs: 500,
			execute: async () => {
				await sleep(latency);
				return {
					id: `proposal-${seatId}`,
					fromSeat: seatId,
					content: `Result from ${seatId} with latency ${latency}ms`,
				} as any;
			},
		};
	});

	const results = await scheduler.executeParallelProposals(tasks, {
		maxConcurrency: 10,
	});

	assert.equal(results.size, taskCount, "All 50 tasks must be accounted for in result map");

	for (let i = 0; i < taskCount; i++) {
		const seatId = `agent-${String(i).padStart(2, "0")}`;
		const res = results.get(seatId);
		assert.ok(res, `Result must exist for ${seatId}`);
		assert.equal(res?.status, "COMPLETED", `Seat ${seatId} must complete successfully`);
		assert.equal(res?.timedOut, false);
		assert.equal(res?.message?.fromSeat, seatId);
	}

	assert.equal(emitter.verifyIntegrity(), true, "HMAC-SHA256 audit chain must remain intact");
});

// ---------------------------------------------------------------------------
// TEST 2: Asynchronous Rejection & Timeout Races
// ---------------------------------------------------------------------------
test("Adversarial 2: Asynchronous rejections, delayed rejections after timeout, and non-Error throws", async () => {
	const emitter = new AuditTrailEmitter("adversarial-secret-key-2");
	const scheduler = new ParallelAgentScheduler(emitter);

	const tasks: ParallelProposalTask[] = [
		{
			seatId: "seat-ok",
			timeoutMs: 100,
			execute: async () => {
				await sleep(10);
				return { id: "ok", fromSeat: "seat-ok" } as any;
			},
		},
		{
			seatId: "seat-timeout",
			timeoutMs: 30,
			execute: async () => {
				await sleep(200);
				return { id: "late", fromSeat: "seat-timeout" } as any;
			},
		},
		{
			seatId: "seat-delayed-reject",
			timeoutMs: 25,
			execute: async () => {
				await sleep(80);
				throw new Error("Delayed explosion after timeout");
			},
		},
		{
			seatId: "seat-string-reject",
			timeoutMs: 100,
			execute: async () => {
				await sleep(15);
				return Promise.reject("Raw string rejection payload");
			},
		},
		{
			seatId: "seat-null-reject",
			timeoutMs: 100,
			execute: async () => {
				await sleep(15);
				return Promise.reject(null);
			},
		},
	];

	const results = await scheduler.executeParallelProposals(tasks, {
		maxConcurrency: 5,
	});

	await sleep(100);

	assert.equal(results.size, 5);

	const resOk = results.get("seat-ok");
	assert.equal(resOk?.status, "COMPLETED");

	const resTimeout = results.get("seat-timeout");
	assert.equal(resTimeout?.status, "TIMED_OUT");
	assert.equal(resTimeout?.timedOut, true);

	const resDelayedReject = results.get("seat-delayed-reject");
	assert.equal(resDelayedReject?.status, "TIMED_OUT");
	assert.equal(resDelayedReject?.timedOut, true);

	const resStringReject = results.get("seat-string-reject");
	assert.equal(resStringReject?.status, "FAILED");
	assert.ok(resStringReject?.error?.message.includes("Raw string rejection"));

	const resNullReject = results.get("seat-null-reject");
	assert.equal(resNullReject?.status, "FAILED");

	assert.equal(emitter.verifyIntegrity(), true);
});

// ---------------------------------------------------------------------------
// TEST 3: DebateLoop Integration — Inverted Latencies, Transcript Order & Audit Chaining
// ---------------------------------------------------------------------------
test("Adversarial 3: DebateLoop Round 1 with completely inverted latencies maintains canonical transcript sequence and HMAC chain", async () => {
	const canonicalSeats = [
		"Seat_0_Slowest",
		"Seat_1_Slow",
		"Seat_2_Medium",
		"Seat_3_Fast",
		"Seat_4_Faster",
		"Seat_5_Instant",
	];

	const latencyMap: Record<string, number> = {
		Seat_0_Slowest: 90,
		Seat_1_Slow: 70,
		Seat_2_Medium: 50,
		Seat_3_Fast: 30,
		Seat_4_Faster: 15,
		Seat_5_Instant: 5,
	};

	const confidenceMap: Record<string, number> = {
		Seat_0_Slowest: 0.88,
		Seat_1_Slow: 0.86,
		Seat_2_Medium: 0.89,
		Seat_3_Fast: 0.87,
		Seat_4_Faster: 0.85,
		Seat_5_Instant: 0.90,
	};

	const transport = new DelayedMockTransport(canonicalSeats, latencyMap, {}, confidenceMap);
	const emitter = new AuditTrailEmitter("adversarial-secret-key-3");
	const scheduler = new ParallelAgentScheduler(emitter);

	const loop = new DebateLoop(
		canonicalSeats,
		transport,
		() => canonicalSeats,
		{
			maxRounds: 2,
			consensusThreshold: 0.75,
			minConsensusSeats: 4,
			enableTieredPhases: false,
			dissentTriggerCount: 3,
			judgeSeatId: "Seat_5_Instant",
			scheduler,
			concurrency: 6,
			proposalTimeoutMs: 500,
		},
	);

	const result = await loop.run("Stress test inverted latency transcript sequence");

	assert.equal(result.rounds, 1);
	assert.equal(result.consensusReached, true);
	assert.equal(result.consensus_method, "unanimous_initial");

	// Strict canonical order in transcript
	const proposalMessages = result.transcript.filter((m) => m.type === "proposal");
	assert.equal(proposalMessages.length, canonicalSeats.length);

	for (let i = 0; i < canonicalSeats.length; i++) {
		assert.equal(
			proposalMessages[i].fromSeat,
			canonicalSeats[i],
			`Proposal index ${i} must be from canonical seat '${canonicalSeats[i]}'`,
		);
	}

	const lastMessage = result.transcript[result.transcript.length - 1];
	assert.equal(lastMessage.type, "consensus");
	assert.equal(lastMessage.fromSeat, "Seat_5_Instant");

	assert.equal(emitter.verifyIntegrity(), true, "Emitter audit chain must be cryptographically valid");
});

// ---------------------------------------------------------------------------
// TEST 4: DebateLoop Integration — Partial Seat Failures & Timeouts
// ---------------------------------------------------------------------------
test("Adversarial 4: DebateLoop handles non-critical seat timeouts without crashing or corrupting transcript", async () => {
	const canonicalSeats = ["FactChecker", "CloudArchitect", "FaultySeat", "HangingSeat", "Synthesizer"];

	const latencyMap: Record<string, number> = {
		FactChecker: 20,
		CloudArchitect: 30,
		FaultySeat: 15,
		HangingSeat: 1000,
		Synthesizer: 25,
	};

	const failureMap: Record<string, "error" | "string_error" | "timeout" | "sync_throw"> = {
		FaultySeat: "error",
		HangingSeat: "timeout",
	};

	const confidenceMap: Record<string, number> = {
		FactChecker: 0.85,
		CloudArchitect: 0.85,
		Synthesizer: 0.85,
	};

	const transport = new DelayedMockTransport(canonicalSeats, latencyMap, failureMap, confidenceMap);
	const emitter = new AuditTrailEmitter("adversarial-secret-key-4");
	const scheduler = new ParallelAgentScheduler(emitter);

	const loop = new DebateLoop(
		canonicalSeats,
		transport,
		() => canonicalSeats,
		{
			maxRounds: 1,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: false,
			dissentTriggerCount: 3,
			judgeSeatId: "Synthesizer",
			scheduler,
			concurrency: 5,
			proposalTimeoutMs: 60,
		},
	);

	const result = await loop.run("Handle partial seat failures gracefully");

	const proposalSeats = result.transcript
		.filter((m) => m.round === 0 && m.type === "proposal")
		.map((m) => m.fromSeat);

	assert.deepEqual(
		proposalSeats,
		["FactChecker", "CloudArchitect", "Synthesizer"],
		"Only healthy seats should have proposals committed in canonical order",
	);

	assert.ok(result.transcript.length >= 3);
	assert.equal(emitter.verifyIntegrity(), true);
});

// ---------------------------------------------------------------------------
// TEST 5: All Seats Time Out in Round 0
// ---------------------------------------------------------------------------
test("Adversarial 5: DebateLoop resilience when 100% of seats time out in Round 0", async () => {
	const canonicalSeats = ["SeatA", "SeatB", "SeatC"];

	const latencyMap: Record<string, number> = {
		SeatA: 1000,
		SeatB: 1000,
		SeatC: 1000,
	};

	const failureMap: Record<string, any> = {
		SeatA: "timeout",
		SeatB: "timeout",
		SeatC: "timeout",
	};

	const transport = new DelayedMockTransport(canonicalSeats, latencyMap, failureMap);
	const emitter = new AuditTrailEmitter("adversarial-secret-key-5");
	const scheduler = new ParallelAgentScheduler(emitter);

	const loop = new DebateLoop(
		canonicalSeats,
		transport,
		() => canonicalSeats,
		{
			maxRounds: 1,
			consensusThreshold: 0.75,
			minConsensusSeats: 2,
			enableTieredPhases: false,
			dissentTriggerCount: 3,
			judgeSeatId: "SeatC",
			scheduler,
			concurrency: 3,
			proposalTimeoutMs: 30,
		},
	);

	const result = await loop.run("All seats timeout check");

	assert.ok(result, "Debate must return a result without throwing unhandled exception");
	assert.equal(result.consensusReached, false, "Consensus must not be reached when all seats timeout");
	const round0Proposals = result.transcript.filter((m) => m.round === 0 && m.type === "proposal");
	assert.equal(round0Proposals.length, 0, "No proposals committed in round 0 when all seats timeout");
	assert.equal(emitter.verifyIntegrity(), true, "Audit trail must remain unbroken");
});

// ---------------------------------------------------------------------------
// TEST 6: Serial (Concurrency 1) vs Wide (Concurrency 20) Load Equivalence
// ---------------------------------------------------------------------------
test("Adversarial 6: Bounded concurrency extremes (maxConcurrency=1 vs maxConcurrency=20) yield equivalent deterministic results", async () => {
	const seatIds = Array.from({ length: 12 }, (_, i) => `seat-${i}`);

	const makeTasks = () => seatIds.map((seatId, idx) => ({
		seatId,
		execute: async () => {
			await sleep(5 + (idx % 3) * 5);
			return { id: `m-${seatId}`, fromSeat: seatId, content: `data-${seatId}` } as any;
		},
	}));

	const scheduler1 = new ParallelAgentScheduler();
	const scheduler20 = new ParallelAgentScheduler();

	const res1 = await scheduler1.executeParallelProposals(makeTasks(), { maxConcurrency: 1 });
	const res20 = await scheduler20.executeParallelProposals(makeTasks(), { maxConcurrency: 20 });

	assert.equal(res1.size, 12);
	assert.equal(res20.size, 12);

	for (const id of seatIds) {
		assert.equal(res1.get(id)?.status, "COMPLETED");
		assert.equal(res20.get(id)?.status, "COMPLETED");
		assert.equal(res1.get(id)?.message?.content, res20.get(id)?.message?.content);
	}
});
