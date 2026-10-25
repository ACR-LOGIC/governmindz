import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ParallelAgentScheduler,
	type ParallelProposalTask,
} from "../src/scheduler/ParallelAgentScheduler.js";
import { AuditTrailEmitter } from "../src/engine/AuditTrailEmitter.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("ParallelAgentScheduler: executes proposals concurrently with measurable speedup vs serial", async () => {
	const scheduler = new ParallelAgentScheduler();
	const delay = 60;
	const tasks: ParallelProposalTask[] = [
		{
			seatId: "seat-1",
			execute: async () => {
				await sleep(delay);
				return { id: "m1", fromSeat: "seat-1", content: "Proposal 1" } as any;
			},
		},
		{
			seatId: "seat-2",
			execute: async () => {
				await sleep(delay);
				return { id: "m2", fromSeat: "seat-2", content: "Proposal 2" } as any;
			},
		},
		{
			seatId: "seat-3",
			execute: async () => {
				await sleep(delay);
				return { id: "m3", fromSeat: "seat-3", content: "Proposal 3" } as any;
			},
		},
		{
			seatId: "seat-4",
			execute: async () => {
				await sleep(delay);
				return { id: "m4", fromSeat: "seat-4", content: "Proposal 4" } as any;
			},
		},
	];

	const start = Date.now();
	const results = await scheduler.executeParallelProposals(tasks, {
		maxConcurrency: 4,
	});
	const elapsed = Date.now() - start;

	// 4 tasks * 60ms serial would be >= 240ms. Concurrent execution should take < 170ms.
	assert.ok(
		elapsed < 190,
		`Expected concurrent execution < 190ms, got ${elapsed}ms (serial baseline would be >= 240ms)`,
	);
	assert.equal(results.size, 4);

	for (const id of ["seat-1", "seat-2", "seat-3", "seat-4"]) {
		const res = results.get(id);
		assert.ok(res, `Missing result for ${id}`);
		assert.equal(res?.status, "COMPLETED");
		assert.equal(res?.timedOut, false);
		assert.ok(res?.message);
	}
});

test("ParallelAgentScheduler: enforces bounded concurrency pool", async () => {
	const scheduler = new ParallelAgentScheduler();
	let peakConcurrent = 0;
	let currentRunning = 0;
	const taskDelay = 50;

	const tasks: ParallelProposalTask[] = [1, 2, 3, 4].map((i) => ({
		seatId: `seat-${i}`,
		execute: async () => {
			currentRunning++;
			if (currentRunning > peakConcurrent) {
				peakConcurrent = currentRunning;
			}
			await sleep(taskDelay);
			currentRunning--;
			return { id: `m${i}`, fromSeat: `seat-${i}`, content: `Proposal ${i}` } as any;
		},
	}));

	const start = Date.now();
	const results = await scheduler.executeParallelProposals(tasks, {
		maxConcurrency: 2,
	});
	const elapsed = Date.now() - start;

	assert.equal(results.size, 4);
	assert.ok(
		peakConcurrent <= 2,
		`Peak concurrent tasks (${peakConcurrent}) exceeded maxConcurrency (2)`,
	);
	// 4 tasks with concurrency 2 will run in 2 waves: >= 90ms
	assert.ok(
		elapsed >= 90,
		`Expected bounded execution >= 90ms with concurrency 2, got ${elapsed}ms`,
	);
});

test("ParallelAgentScheduler: handles per-agent timeout races without aborting siblings", async () => {
	const scheduler = new ParallelAgentScheduler();
	const tasks: ParallelProposalTask[] = [
		{
			seatId: "fast-agent",
			timeoutMs: 150,
			execute: async () => {
				await sleep(20);
				return { id: "m-fast", fromSeat: "fast-agent", content: "Fast" } as any;
			},
		},
		{
			seatId: "slow-agent",
			timeoutMs: 40,
			execute: async () => {
				// Simulates a hanging LLM call
				await sleep(300);
				return { id: "m-slow", fromSeat: "slow-agent", content: "Slow" } as any;
			},
		},
		{
			seatId: "normal-agent",
			timeoutMs: 150,
			execute: async () => {
				await sleep(30);
				return { id: "m-normal", fromSeat: "normal-agent", content: "Normal" } as any;
			},
		},
	];

	const results = await scheduler.executeParallelProposals(tasks);

	assert.equal(results.size, 3);

	const fast = results.get("fast-agent");
	assert.equal(fast?.status, "COMPLETED");
	assert.equal(fast?.timedOut, false);
	assert.ok(fast?.message);

	const slow = results.get("slow-agent");
	assert.equal(slow?.status, "TIMED_OUT");
	assert.equal(slow?.timedOut, true);
	assert.ok(slow?.error?.message.includes("PROPOSAL_TIMEOUT"));
	assert.equal(slow?.message, undefined);

	const normal = results.get("normal-agent");
	assert.equal(normal?.status, "COMPLETED");
	assert.equal(normal?.timedOut, false);
	assert.ok(normal?.message);
});

test("ParallelAgentScheduler: preserves deterministic lookup even with out-of-order completions", async () => {
	const scheduler = new ParallelAgentScheduler();
	// Seat 1 finishes last, Seat 4 finishes first
	const canonicalOrder = ["seat-alpha", "seat-beta", "seat-gamma", "seat-delta"];
	const latencies: Record<string, number> = {
		"seat-alpha": 70,
		"seat-beta": 40,
		"seat-gamma": 20,
		"seat-delta": 10,
	};

	const tasks: ParallelProposalTask[] = canonicalOrder.map((seatId) => ({
		seatId,
		execute: async () => {
			await sleep(latencies[seatId]);
			return { id: `msg-${seatId}`, fromSeat: seatId, content: `Content from ${seatId}` } as any;
		},
	}));

	const results = await scheduler.executeParallelProposals(tasks);

	// When reading in canonical seat sequence, every result matches the requested seat
	const reassembled = canonicalOrder.map((seatId) => results.get(seatId));
	assert.equal(reassembled.length, 4);
	for (let i = 0; i < canonicalOrder.length; i++) {
		const seatId = canonicalOrder[i];
		const res = reassembled[i];
		assert.equal(res?.seatId, seatId);
		assert.equal(res?.status, "COMPLETED");
		assert.equal(res?.message?.fromSeat, seatId);
	}
});

test("ParallelAgentScheduler: emits scheduler and agent lifecycle audit events", async () => {
	const emitter = new AuditTrailEmitter("test-scheduler-secret-1234567890");
	const emittedEvents: Array<{ event_type: string; payload: Record<string, unknown> }> = [];

	emitter.onEmit((event) => {
		emittedEvents.push({
			event_type: event.event_type,
			payload: event.payload,
		});
	});

	const scheduler = new ParallelAgentScheduler(emitter);
	const tasks: ParallelProposalTask[] = [
		{
			seatId: "agent-ok",
			execute: async () => {
				await sleep(10);
				return { id: "ok", fromSeat: "agent-ok" } as any;
			},
		},
		{
			seatId: "agent-timeout",
			timeoutMs: 25,
			execute: async () => {
				await sleep(100);
				return { id: "timeout", fromSeat: "agent-timeout" } as any;
			},
		},
	];

	await scheduler.executeParallelProposals(tasks);

	const eventTypes = emittedEvents.map((e) => e.event_type);
	assert.ok(eventTypes.includes("scheduler_start"), "Expected scheduler_start event");
	assert.ok(eventTypes.includes("agent_start"), "Expected agent_start event");
	assert.ok(eventTypes.includes("agent_complete"), "Expected agent_complete event");
	assert.ok(eventTypes.includes("agent_timeout"), "Expected agent_timeout event");
	assert.ok(eventTypes.includes("scheduler_complete"), "Expected scheduler_complete event");

	const completeEvent = emittedEvents.find((e) => e.event_type === "scheduler_complete");
	assert.equal(completeEvent?.payload.total_tasks, 2);
	assert.equal(completeEvent?.payload.completed, 1);
	assert.equal(completeEvent?.payload.timed_out, 1);
});

test("ParallelAgentScheduler: handles runtime exceptions gracefully without crashing", async () => {
	const scheduler = new ParallelAgentScheduler();
	const tasks: ParallelProposalTask[] = [
		{
			seatId: "failing-agent",
			execute: async () => {
				throw new Error("Seat network failure: 503 Service Unavailable");
			},
		},
		{
			seatId: "healthy-agent",
			execute: async () => {
				return { id: "healthy", fromSeat: "healthy-agent" } as any;
			},
		},
	];

	const results = await scheduler.executeParallelProposals(tasks);
	assert.equal(results.size, 2);

	const failing = results.get("failing-agent");
	assert.equal(failing?.status, "FAILED");
	assert.equal(failing?.timedOut, false);
	assert.ok(failing?.error?.message.includes("503 Service Unavailable"));

	const healthy = results.get("healthy-agent");
	assert.equal(healthy?.status, "COMPLETED");
	assert.equal(healthy?.timedOut, false);
});

test("ParallelAgentScheduler: handles synchronous task exceptions without timer leak or unhandledRejection", async () => {
	const scheduler = new ParallelAgentScheduler();
	const unhandledRejections: any[] = [];
	const onUnhandled = (err: any) => {
		unhandledRejections.push(err);
	};
	process.on("unhandledRejection", onUnhandled);

	try {
		const tasks: ParallelProposalTask[] = [
			{
				seatId: "sync-throw-agent",
				timeoutMs: 35,
				execute: () => {
					throw new Error("Synchronous transport initialization failure");
				},
			},
			{
				seatId: "async-healthy-agent",
				timeoutMs: 100,
				execute: async () => {
					await sleep(15);
					return { id: "ok-msg", fromSeat: "async-healthy-agent", content: "Valid proposal" } as any;
				},
			},
		];

		const results = await scheduler.executeParallelProposals(tasks);
		assert.equal(results.size, 2);

		const syncFail = results.get("sync-throw-agent");
		assert.ok(syncFail, "Result must exist for sync-throw-agent");
		assert.equal(syncFail?.status, "FAILED");
		assert.equal(syncFail?.timedOut, false);
		assert.ok(syncFail?.error?.message.includes("Synchronous transport initialization failure"));

		const healthy = results.get("async-healthy-agent");
		assert.ok(healthy, "Result must exist for async-healthy-agent");
		assert.equal(healthy?.status, "COMPLETED");
		assert.equal(healthy?.timedOut, false);

		// Sleep past timeoutMs (35ms) to ensure leaked timers would have fired
		await sleep(60);

		assert.equal(unhandledRejections.length, 0, "No unhandledRejection events should be triggered");
	} finally {
		process.removeListener("unhandledRejection", onUnhandled);
	}
});
