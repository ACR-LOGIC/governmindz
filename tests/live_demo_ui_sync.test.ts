import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDemoOptionsVisibility } from "../apps/web/src/services/demoOptionsVisibility.js";
import { AutoScrollController } from "../apps/web/src/services/autoScrollController.js";
import {
	appendWorkflowTimelineEvent,
	buildParticipatingAgentRoster,
	extractParticipatingSeatIds,
	filterAssignmentsToParticipants,
	isRosterEligibleSeat,
	upsertConversationMessage,
} from "../apps/web/src/services/conversationSync.js";
import { AgentArrivalManager } from "../apps/web/src/services/agentArrivalManager.js";
import { assignHumanCouncil } from "../apps/web/src/services/nameRotation.js";
import { DemoPresentationQueue } from "../apps/web/src/services/demoPresentationQueue.js";
import type { Conversation } from "../apps/web/src/types/index.js";

test("Demo options visibility: visible before demo, collapses when started, supports compact toggle & restores on reset", () => {
	// 1. Before starting a demo: visible
	assert.equal(
		resolveDemoOptionsVisibility({
			isDemoMode: true,
			isBusy: false,
			hasCompletedMessages: false,
			manualOverride: null,
		}),
		true,
		"Three demo options must be visible before demo starts",
	);

	// 2. Once demo starts (isBusy = true): collapses automatically
	assert.equal(
		resolveDemoOptionsVisibility({
			isDemoMode: true,
			isBusy: true,
			hasCompletedMessages: true,
			manualOverride: null,
		}),
		false,
		"Demo options must collapse automatically once demo starts",
	);

	// 3. After demo finishes (isBusy = false, hasCompletedMessages = true): stays collapsed to preserve conversation space
	assert.equal(
		resolveDemoOptionsVisibility({
			isDemoMode: true,
			isBusy: false,
			hasCompletedMessages: true,
			manualOverride: null,
		}),
		false,
		"Demo options remain collapsed while viewing completed demo transcript",
	);

	// 4. User clicks compact 'Demo Options' control to reopen panel during/after demo
	assert.equal(
		resolveDemoOptionsVisibility({
			isDemoMode: true,
			isBusy: false,
			hasCompletedMessages: true,
			manualOverride: true,
		}),
		true,
		"Compact control must allow reopening demo options on demand",
	);

	// 5. User resets / clicks Start Over (isBusy = false, hasCompletedMessages = false, manualOverride = null)
	assert.equal(
		resolveDemoOptionsVisibility({
			isDemoMode: true,
			isBusy: false,
			hasCompletedMessages: false,
			manualOverride: null,
		}),
		true,
		"Resetting demo restores the three demo options automatically",
	);

	// 6. Never shown in Live mode
	assert.equal(
		resolveDemoOptionsVisibility({
			isDemoMode: false,
			isBusy: false,
			hasCompletedMessages: false,
			manualOverride: true,
		}),
		false,
		"Demo options must never display in Live Mode",
	);
});

test("AutoScrollController: follows new messages near bottom, suspends on manual scroll up, and resumes on Jump to Latest", () => {
	const controller = new AutoScrollController({
		nearBottomThresholdPx: 120,
		programmaticGuardMs: 150,
	});

	// Initially following
	assert.equal(controller.getState().isFollowing, true);

	// New messages arrive while following -> should auto-scroll smoothly
	const d1 = controller.syncMessages([
		{ id: "m1", fromSeat: "user", type: "user" },
		{ id: "m2", fromSeat: "FactChecker", type: "proposal" },
	]);
	assert.equal(d1.shouldScroll, true);
	assert.equal(d1.behavior, "smooth");
	assert.equal(d1.state.unreadCount, 0);

	// Establish scroll position near bottom (scrollHeight=1000, clientHeight=500, scrollTop=460 -> dist=40)
	controller.handleScroll({ scrollTop: 460, scrollHeight: 1000, clientHeight: 500 }, 1000);
	assert.equal(controller.getState().isFollowing, true);

	// User manually scrolls upward to inspect earlier message (scrollTop=180 -> dist=320 > 120)
	const afterUpScroll = controller.handleScroll(
		{ scrollTop: 180, scrollHeight: 1000, clientHeight: 500 },
		1200,
	);
	assert.equal(afterUpScroll.isFollowing, false, "Scrolling upward must suspend auto-following");

	// Two new agent messages arrive while user is reading earlier messages
	const d2 = controller.syncMessages([
		{ id: "m1", fromSeat: "user", type: "user" },
		{ id: "m2", fromSeat: "FactChecker", type: "proposal" },
		{ id: "m3", fromSeat: "CloudArchitect", type: "proposal" },
		{ id: "m4", fromSeat: "RivalChallenger", type: "challenge" },
	]);
	assert.equal(d2.shouldScroll, false, "Must not yank user down while reading older messages");
	assert.equal(d2.state.unreadCount, 2, "Must track unread incoming messages");
	assert.equal(d2.state.hasNewActivity, true);

	// User clicks 'Jump to Latest' control
	const jumpDecision = controller.jumpToLatest();
	assert.equal(jumpDecision.shouldScroll, true);
	assert.equal(jumpDecision.state.isFollowing, true);
	assert.equal(jumpDecision.state.unreadCount, 0);
	assert.equal(jumpDecision.state.hasNewActivity, false);

	// Programmatic scroll guard prevents intermediate scroll events from unfollowing
	controller.markProgrammaticScroll(2000);
	const duringProg = controller.handleScroll(
		{ scrollTop: 250, scrollHeight: 1400, clientHeight: 500 },
		2050,
	);
	assert.equal(duringProg.isFollowing, true, "Programmatic scroll must not trigger manual unfollow");

	// Session reset clears state cleanly
	const resetState = controller.reset([]);
	assert.equal(resetState.isFollowing, true);
	assert.equal(resetState.unreadCount, 0);
});

test("conversationSync: deduplicates messages, links replies/challenges, and synchronizes workflow timeline", () => {
	let messages: any[] = [];

	// 1. Add Round 0 proposal from FactChecker
	const r1 = upsertConversationMessage(messages, {
		id: "msg-fc-0",
		fromSeat: "FactChecker",
		type: "proposal",
		round: 0,
		content: "Verified 3 governed tables in Zetaris catalog with primary key lineage.",
		confidence: 0.86,
		timestamp: 1000,
	});
	messages = r1.messages;
	assert.equal(r1.isDuplicate, false);
	assert.equal(messages.length, 1);

	// 2. Duplicate event with same ID or identical payload is ignored without duplicating
	const dup = upsertConversationMessage(messages, {
		id: "msg-fc-0",
		fromSeat: "FactChecker",
		type: "proposal",
		round: 0,
		content: "Verified 3 governed tables in Zetaris catalog with primary key lineage.",
		confidence: 0.86,
		timestamp: 1005,
	});
	messages = dup.messages;
	assert.equal(dup.isDuplicate, true);
	assert.equal(messages.length, 1, "Duplicate message event must not create duplicate transcript entry");

	// 3. RivalChallenger challenges FactChecker (links via inReplyTo / toSeat and populates replyToExcerpt)
	const r2 = upsertConversationMessage(messages, {
		id: "msg-rival-0",
		fromSeat: "RivalChallenger",
		toSeat: "FactChecker",
		inReplyTo: "msg-fc-0",
		type: "challenge",
		round: 0,
		content: "@FactChecker Provide cryptographic hash verification for the Logistics Ticket API feed.",
		confidence: 0.78,
		timestamp: 950, // Delayed/out-of-order timestamp; monotonic guard keeps chronological order
	});
	messages = r2.messages;
	assert.equal(messages.length, 2);
	assert.equal(r2.message.replyToId, "msg-fc-0");
	assert.ok(
		r2.message.replyToExcerpt?.includes("Verified 3 governed tables"),
		"Challenge must automatically populate replyToExcerpt from target message",
	);
	assert.ok(
		r2.message.timestamp >= messages[0].timestamp,
		"Monotonic timestamp normalization preserves chronological sequence",
	);

	// 4. Round 1 rebuttal with @Mention links to RivalChallenger
	const r3 = upsertConversationMessage(messages, {
		id: "msg-fc-1",
		fromSeat: "FactChecker",
		type: "rebuttal",
		round: 1,
		content: "@Arturo Cross-checked SHA-256 digest against Zetaris audit snapshot.",
		confidence: 0.91,
		timestamp: 1200,
	});
	messages = r3.messages;
	assert.equal(r3.message.toSeat, "RivalChallenger");
	assert.equal(r3.message.replyToId, "msg-rival-0");

	// 5. Workflow timeline events synchronize and deduplicate
	let timeline = appendWorkflowTimelineEvent([], {
		type: "run_start",
		mode: "sample",
		timestamp: 900,
	});
	timeline = appendWorkflowTimelineEvent(timeline, {
		type: "seat_thinking",
		seatId: "FactChecker",
		round: 0,
		timestamp: 950,
	});
	timeline = appendWorkflowTimelineEvent(timeline, {
		type: "message",
		message: r1.message,
		timestamp: 1000,
	});
	// Duplicate seat_thinking event should update in place rather than duplicate
	timeline = appendWorkflowTimelineEvent(timeline, {
		type: "seat_thinking",
		seatId: "FactChecker",
		round: 0,
		timestamp: 960,
	});
	assert.equal(timeline.length, 3, "Timeline events must synchronize and deduplicate by stable ID");
});

test("Strict Agent Roster & History Filtering: only agents that join the conversation appear in roster or history", () => {
	const arrivalManager = new AgentArrivalManager({
		holdingDurationMs: 0,
		greetingDurationMs: 0,
		assignedDurationMs: 0,
	});
	arrivalManager.setConversation("conv-strict-1", []);

	// 1. All 5 council seats are assigned tasks at start of deliberation
	const councilAssignments = assignHumanCouncil();
	for (const [seatId, assignment] of Object.entries(councilAssignments)) {
		arrivalManager.recordTaskAssignment(seatId, assignment, assignment.jobTask, "conv-strict-1");
	}

	// Before any agent speaks/joins the conversation, the visible roster MUST be empty!
	assert.equal(
		arrivalManager.getRoster().length,
		0,
		"Assigned agents must not appear on the visible roster before joining the conversation",
	);

	// Non-eligible seats (Orchestrator, CredibleSourcesResearchAgent, ContextAgent, DataCrew-*) are never eligible
	assert.equal(isRosterEligibleSeat("Orchestrator"), false);
	assert.equal(isRosterEligibleSeat("CredibleSourcesResearchAgent"), false);
	assert.equal(isRosterEligibleSeat("ContextAgent"), false);
	assert.equal(isRosterEligibleSeat("DataCrew-Catalog"), false);
	assert.equal(isRosterEligibleSeat("WebCrew-Standards"), false);

	// 2. FactChecker, CloudArchitect, and Synthesizer join the conversation in sequence;
	// RivalChallenger and Thinker do NOT join this conversation.
	arrivalManager.activateAgent("FactChecker", councilAssignments.FactChecker, undefined, "conv-strict-1");
	assert.deepEqual(
		arrivalManager.getRoster().map((a) => a.id),
		["FactChecker"],
		"FactChecker appears first as she joins",
	);

	arrivalManager.activateAgent("CloudArchitect", councilAssignments.CloudArchitect, undefined, "conv-strict-1");
	assert.deepEqual(
		arrivalManager.getRoster().map((a) => a.id),
		["FactChecker", "CloudArchitect"],
		"CloudArchitect appears second as he joins",
	);

	arrivalManager.activateAgent("Synthesizer", councilAssignments.Synthesizer, undefined, "conv-strict-1");
	assert.deepEqual(
		arrivalManager.getRoster().map((a) => a.id),
		["FactChecker", "CloudArchitect", "Synthesizer"],
		"Synthesizer appears third as she joins",
	);

	// Build conversation object where only FactChecker, CloudArchitect, Synthesizer spoke
	const conv: Conversation = {
		id: "conv-strict-1",
		title: "Strict Roster Test",
		createdAt: 1000,
		updatedAt: 2000,
		topic: "Test topic",
		mode: "sample",
		status: "completed",
		workflowEvents: [],
		auditEvents: [],
		agentAssignments: councilAssignments,
		messages: [
			{
				id: "m-u",
				fromSeat: "user",
				type: "user",
				content: "Test topic",
				timestamp: 1000,
			},
			{
				id: "m-o",
				fromSeat: "Orchestrator",
				type: "orchestrator",
				content: "Convening council",
				timestamp: 1010,
			},
			{
				id: "m-fc",
				fromSeat: "FactChecker",
				type: "proposal",
				content: "FactChecker findings",
				confidence: 0.88,
				timestamp: 1100,
			},
			{
				id: "m-ca",
				fromSeat: "CloudArchitect",
				type: "proposal",
				content: "CloudArchitect findings",
				confidence: 0.85,
				timestamp: 1200,
			},
			{
				id: "m-syn",
				fromSeat: "Synthesizer",
				type: "consensus",
				content: "Synthesizer consensus",
				confidence: 0.9,
				timestamp: 1300,
			},
		],
	};

	const participatingIds = extractParticipatingSeatIds(conv);
	assert.deepEqual(participatingIds, ["FactChecker", "CloudArchitect", "Synthesizer"]);
	assert.ok(!participatingIds.includes("RivalChallenger"), "Non-joining RivalChallenger must be excluded");
	assert.ok(!participatingIds.includes("Thinker"), "Non-joining Thinker must be excluded");

	// Prune assignments and rebuild historical roster
	const filteredAssignments = filterAssignmentsToParticipants(conv.agentAssignments, participatingIds);
	assert.deepEqual(Object.keys(filteredAssignments || {}), [
		"FactChecker",
		"CloudArchitect",
		"Synthesizer",
	]);

	const historicalRoster = buildParticipatingAgentRoster({
		...conv,
		agentAssignments: filteredAssignments,
	});
	assert.deepEqual(
		historicalRoster.map((a) => a.id),
		["FactChecker", "CloudArchitect", "Synthesizer"],
		"Historical roster must only contain agents that actually joined the conversation",
	);
});

test("DemoPresentationQueue: reveals seat_thinking during speaker transition before message", async () => {
	const revealedTypes: string[] = [];
	const queue = new DemoPresentationQueue(
		(item) => {
			revealedTypes.push(`${item.type}:${item.fromSeat || item.id}`);
		},
		() => {},
		{
			minReadingTimeMs: 40,
			maxReadingTimeMs: 40,
			transitionDelayMs: 30,
			audioTimeoutMs: 0,
		},
	);

	queue.enqueue({
		id: "m1",
		type: "message",
		fromSeat: "FactChecker",
		payload: {},
		textLength: 10,
	});
	queue.enqueue({
		id: "t2",
		type: "seat_thinking",
		fromSeat: "CloudArchitect",
		payload: {},
	});
	queue.enqueue({
		id: "m2",
		type: "message",
		fromSeat: "CloudArchitect",
		payload: {},
		textLength: 10,
	});

	// Initially m1 is revealed
	assert.deepEqual(revealedTypes, ["message:FactChecker"]);

	// After reading time (40ms) but during transition window (30ms), seat_thinking is revealed before m2!
	await new Promise((r) => setTimeout(r, 52));
	assert.ok(
		revealedTypes.includes("seat_thinking:CloudArchitect"),
		"seat_thinking must be revealed during transition window",
	);

	// After transition window completes, m2 is revealed in chronological order
	await new Promise((r) => setTimeout(r, 50));
	assert.deepEqual(revealedTypes, [
		"message:FactChecker",
		"seat_thinking:CloudArchitect",
		"message:CloudArchitect",
	]);

	queue.destroy();
});
