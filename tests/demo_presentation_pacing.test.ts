import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoPresentationQueue } from "../apps/web/src/services/demoPresentationQueue.js";

test("DemoPresentationQueue: paces burst of messages into ordered sequential reveals", async () => {
	const revealed: string[] = [];
	const queue = new DemoPresentationQueue(
		(item) => {
			revealed.push(item.id);
		},
		() => {},
		{
			minReadingTimeMs: 30,
			maxReadingTimeMs: 30,
			transitionDelayMs: 20,
			wordsPerMinute: 300,
			audioTimeoutMs: 0,
		},
	);

	// Enqueue 3 messages all at once (burst)
	queue.enqueue({ id: "item-1", type: "message", payload: { text: "Short message" }, textLength: 15 });
	queue.enqueue({ id: "item-2", type: "message", payload: { text: "Second message" }, textLength: 20 });
	queue.enqueue({ id: "item-3", type: "message", payload: { text: "Third message" }, textLength: 25 });

	// At start, only item-1 has been revealed immediately
	assert.equal(revealed.length, 1);
	assert.equal(revealed[0], "item-1");

	// Wait for item-2 to be revealed (30ms reading + 20ms transition = 50ms)
	await new Promise((r) => setTimeout(r, 90));
	assert.ok(revealed.includes("item-2"), "Item-2 should be revealed after reading and transition delay");

	// Wait for item-3 to be revealed (another 50ms)
	await new Promise((r) => setTimeout(r, 90));
	assert.equal(revealed.length, 3);
	assert.deepEqual(revealed, ["item-1", "item-2", "item-3"], "Order preserved without flooding");

	queue.destroy();
});

test("DemoPresentationQueue: enqueue restarts a queue that completed before events arrived", () => {
	const revealed: string[] = [];
	const queue = new DemoPresentationQueue((item) => {
		revealed.push(item.id);
	});

	// A run can call play() before the first SSE event is enqueued.
	queue.play();
	assert.equal(queue.getState(), "completed");

	queue.enqueue({ id: "late-1", type: "message", payload: {}, textLength: 10 });
	assert.equal(queue.getState(), "playing");
	assert.deepEqual(revealed, ["late-1"]);

	queue.destroy();
});

test("DemoPresentationQueue: operational events drain without consuming reading time", async () => {
	const revealed: string[] = [];
	const queue = new DemoPresentationQueue(
		(item) => {
			revealed.push(item.id);
		},
		() => {},
		{
			minReadingTimeMs: 60,
			maxReadingTimeMs: 60,
			transitionDelayMs: 10,
			audioTimeoutMs: 0,
		},
	);

	queue.enqueue({ id: "msg-1", type: "message", payload: {}, textLength: 1 });
	for (let i = 0; i < 10; i += 1) {
		queue.enqueue({ id: `crew-${i}`, type: "crew", payload: {}, textLength: 1 });
	}
	queue.enqueue({ id: "msg-2", type: "message", payload: {}, textLength: 1 });

	await new Promise((r) => setTimeout(r, 220));
	assert.ok(revealed.includes("crew-9"), "Operational events must drain in order");
	assert.ok(revealed.includes("msg-2"), "The next message must not wait for operational-event reading time");

	queue.destroy();
});

test("DemoPresentationQueue: Live mode bypasses queue and reveals immediately with 0 delay", () => {
	const revealed: string[] = [];
	const queue = new DemoPresentationQueue((item) => {
		revealed.push(item.id);
	});

	// Enable live mode
	queue.setLiveMode(true);

	// Enqueue burst
	queue.enqueue({ id: "live-1", type: "message", payload: {}, textLength: 100 });
	queue.enqueue({ id: "live-2", type: "message", payload: {}, textLength: 100 });
	queue.enqueue({ id: "live-3", type: "message", payload: {}, textLength: 100 });

	// All items must reveal synchronously and immediately
	assert.equal(revealed.length, 3, "Live mode must reveal all events immediately without queue delays");
	assert.deepEqual(revealed, ["live-1", "live-2", "live-3"]);

	queue.destroy();
});

test("DemoPresentationQueue: Pause and Resume controls freeze and continue presentation safely", async () => {
	const revealed: string[] = [];
	const queue = new DemoPresentationQueue(
		(item) => {
			revealed.push(item.id);
		},
		() => {},
		{
			minReadingTimeMs: 40,
			maxReadingTimeMs: 40,
			transitionDelayMs: 20,
			audioTimeoutMs: 0,
		},
	);

	queue.enqueue({ id: "p-1", type: "message", payload: {}, textLength: 20 });
	queue.enqueue({ id: "p-2", type: "message", payload: {}, textLength: 20 });
	queue.enqueue({ id: "p-3", type: "message", payload: {}, textLength: 20 });

	assert.equal(revealed.length, 1);

	// Pause immediately while p-1 is displaying
	queue.pause();
	assert.equal(queue.getState(), "paused");

	// Wait 100ms (longer than total 60ms cycle)
	await new Promise((r) => setTimeout(r, 100));
	assert.equal(revealed.length, 1, "Paused queue must not advance");

	// Resume
	queue.resume();
	assert.equal(queue.getState(), "playing");

	// Wait for p-2 to advance after resume
	await new Promise((r) => setTimeout(r, 120));
	assert.ok(revealed.includes("p-2"), "Resumed queue continues from current position");

	queue.destroy();
});

test("DemoPresentationQueue: Reset clears queue and prevents stale events from leaking", async () => {
	const revealed: string[] = [];
	const queue = new DemoPresentationQueue(
		(item) => {
			revealed.push(item.id);
		},
		() => {},
		{
			minReadingTimeMs: 80,
			transitionDelayMs: 40,
			audioTimeoutMs: 0,
		},
	);

	queue.enqueue({ id: "old-1", type: "message", payload: {}, textLength: 20 });
	queue.enqueue({ id: "old-2", type: "message", payload: {}, textLength: 20 });

	assert.equal(revealed.length, 1);

	// Reset demo
	queue.reset();
	assert.equal(queue.getState(), "idle");

	await new Promise((r) => setTimeout(r, 150));
	assert.equal(revealed.length, 1, "Reset must prevent old-2 from ever being revealed");

	// Next run can start fresh
	queue.enqueue({ id: "new-1", type: "message", payload: {}, textLength: 10 });
	assert.equal(revealed[1], "new-1", "New run proceeds cleanly without stale backlog");

	queue.destroy();
});
