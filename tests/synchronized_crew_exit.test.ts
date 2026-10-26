import { test } from "node:test";
import assert from "node:assert/strict";
import { SynchronizedExitCoordinator } from "../apps/web/src/services/synchronizedExitCoordinator.js";

test("SynchronizedExitCoordinator: executes synchronized exit immediately when no voice or presentation is playing", async () => {
	let closingStarted = false;
	let finalized = false;

	const coordinator = new SynchronizedExitCoordinator({
		transitionDurationMs: 40,
		isVoicePlaying: () => false,
		isPresentationPlaying: () => false,
		onStartClosing: () => {
			closingStarted = true;
		},
		onFinalizeExit: () => {
			finalized = true;
		},
	});

	coordinator.requestExit();

	assert.equal(closingStarted, true, "Synchronized exit transition begins immediately when voice/presentation is idle");
	assert.equal(finalized, false, "Finalization occurs only after synchronized transition duration");

	await new Promise((r) => setTimeout(r, 60));
	assert.equal(finalized, true, "Exit finalized together once transition ends");

	coordinator.destroy();
});

test("SynchronizedExitCoordinator: waits for active voice playback to complete before synchronized exit", async () => {
	let isVoiceActive = true;
	let closingStarted = false;
	let finalized = false;

	const coordinator = new SynchronizedExitCoordinator({
		transitionDurationMs: 30,
		isVoicePlaying: () => isVoiceActive,
		isPresentationPlaying: () => false,
		onStartClosing: () => {
			closingStarted = true;
		},
		onFinalizeExit: () => {
			finalized = true;
		},
	});

	coordinator.requestExit();

	// While voice is active, exit must NOT start
	assert.equal(closingStarted, false, "Must not close while voice is actively speaking");
	assert.equal(coordinator.isPending(), true);

	await new Promise((r) => setTimeout(r, 50));
	assert.equal(closingStarted, false, "Still waiting for voice to complete");

	// Voice playback finishes
	isVoiceActive = false;
	coordinator.notifyPlaybackStateChange();

	// Transition should now begin
	assert.equal(closingStarted, true, "Synchronized exit transition begins when voice finishes");

	await new Promise((r) => setTimeout(r, 50));
	assert.equal(finalized, true, "Synchronized exit complete");

	coordinator.destroy();
});

test("SynchronizedExitCoordinator: cancellation and force exit immediately clean up state", () => {
	let finalized = false;

	const coordinator = new SynchronizedExitCoordinator({
		transitionDurationMs: 100,
		isVoicePlaying: () => true,
		onFinalizeExit: () => {
			finalized = true;
		},
	});

	coordinator.requestExit();
	assert.equal(coordinator.isPending(), true);

	// User resets or starts new conversation -> force exit
	coordinator.forceExit();
	assert.equal(coordinator.isPending(), false);
	assert.equal(finalized, true, "Force exit executes cleanup synchronously");

	coordinator.destroy();
});
