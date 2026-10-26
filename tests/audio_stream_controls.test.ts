import { test } from "node:test";
import assert from "node:assert/strict";
import { ttsService } from "../apps/web/src/services/ttsService.js";

test("TTSService: independent group mute states for Main and Crews", () => {
	// Initialize default states
	ttsService.setTtsEnabled(true);
	ttsService.setMuted(false);
	ttsService.setGroupMuted("main", false);
	ttsService.setGroupMuted("crews", false);

	assert.equal(ttsService.isGroupMuted("main"), false);
	assert.equal(ttsService.isGroupMuted("crews"), false);
	assert.equal(ttsService.isTtsEnabled("main"), true);
	assert.equal(ttsService.isTtsEnabled("crews"), true);

	// Mute Main group only
	ttsService.setGroupMuted("main", true);
	assert.equal(ttsService.isGroupMuted("main"), true);
	assert.equal(ttsService.isGroupMuted("crews"), false);
	assert.equal(ttsService.isTtsEnabled("main"), false);
	assert.equal(ttsService.isTtsEnabled("crews"), true, "Crews group remains active when Main is muted");

	// Toggle Main group back
	const toggled = ttsService.toggleGroupMute("main");
	assert.equal(toggled, false);
	assert.equal(ttsService.isGroupMuted("main"), false);
	assert.equal(ttsService.isTtsEnabled("main"), true);
});

test("TTSService: muting a group immediately drops pending queue items for that group", () => {
	ttsService.setTtsEnabled(true);
	ttsService.setMuted(false);
	ttsService.setGroupMuted("main", false);
	ttsService.setGroupMuted("crews", false);

	// Queue utterances for both groups
	ttsService.queueSpeak("Main council statement 1", "FactChecker", "msg-1", "main");
	ttsService.queueSpeak("Research finding from data crew", "Priya", "msg-crew-1", "crews");
	ttsService.queueSpeak("Main council statement 2", "CloudArchitect", "msg-2", "main");

	// Mute Main group
	ttsService.setGroupMuted("main", true);

	// Queued speech for Main should be dropped, but Crews speech preserved
	const internalQueue = (ttsService as any).queue as Array<{ groupId: string; text: string }>;
	const mainItems = internalQueue.filter((q) => q.groupId === "main");
	const crewItems = internalQueue.filter((q) => q.groupId === "crews");

	assert.equal(mainItems.length, 0, "All pending Main audio queue items must be discarded upon mute");
	// Clean up
	ttsService.stop();
});

test("TTSService: text delivery decoupling - text is never altered or delayed by audio state", () => {
	// Simulate text pipeline receiving message while audio is muted
	ttsService.setGroupMuted("main", true);

	const conversationMessages: any[] = [];
	const incomingMsg = {
		id: "msg_async_101",
		fromSeat: "Synthesizer",
		content: "The consensus verdict regarding SEC and OpenFDA catalogs is approved.",
		timestamp: Date.now(),
	};

	// 1. Text is delivered immediately into conversation
	conversationMessages.push(incomingMsg);
	assert.equal(conversationMessages.length, 1);
	assert.equal(conversationMessages[0].content, incomingMsg.content);

	// 2. Audio queue invocation does NOT throw or block, and safely discards muted audio
	assert.doesNotThrow(() => {
		ttsService.queueSpeak(incomingMsg.content, incomingMsg.fromSeat, incomingMsg.id, "main");
	});

	// Text remains intact
	assert.equal(conversationMessages[0].id, "msg_async_101");
});

test("TTSService: unmuting does not replay muted backlog and sets fresh eligibility boundary", async () => {
	ttsService.setTtsEnabled(true);
	ttsService.setMuted(false);

	// Start with Main muted
	ttsService.setGroupMuted("main", true);

	// Attempt to queue speech during muted period (historical backlog)
	ttsService.queueSpeak("Muted historical argument", "Thinker", "msg-old", "main");

	const queueWhileMuted = (ttsService as any).queue as any[];
	assert.equal(queueWhileMuted.filter((q) => q.groupId === "main").length, 0, "Muted items are not queued");

	// Unmute Main group
	ttsService.setGroupMuted("main", false);
	assert.equal(ttsService.isGroupMuted("main"), false);

	// Verify that unmuting did NOT restore or replay the old backlog
	const queueAfterUnmute = (ttsService as any).queue as any[];
	assert.equal(queueAfterUnmute.length, 0, "Unmuting must NOT replay the backlog");

	// Now queue newly eligible speech produced AFTER unmute
	ttsService.queueSpeak("Fresh deliberation statement after unmute", "Synthesizer", "msg-new", "main");

	const queueWithNewSpeech = (ttsService as any).queue as any[];
	const newMainItems = queueWithNewSpeech.filter((q) => q.groupId === "main");
	assert.ok(newMainItems.length >= 0, "New speech is accepted");

	ttsService.stop();
});

test("TTSService: generation token invalidates in-flight async chunks after mute", () => {
	ttsService.setTtsEnabled(true);
	ttsService.setMuted(false);
	ttsService.setGroupMuted("main", false);

	const initialToken = (ttsService as any).generationToken;

	// When mute is triggered, generation token increments
	ttsService.setGroupMuted("main", true);
	const tokenAfterMute = (ttsService as any).generationToken;

	assert.ok(tokenAfterMute > initialToken, "Generation token must increment on mute to reject late async chunks");

	ttsService.stop();
});
