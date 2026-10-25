import { test } from "node:test";
import assert from "node:assert/strict";
import {
	type CrewRound,
	type ActiveCrew,
	type CrewMessage,
	isCrewRoundReady,
	canReleaseBarrier,
	hasSoftDeadlinePassed,
	appendCrewMessage,
} from "../apps/web/src/types/crew.js";

test("Crew types: ActiveCrew and CrewMessage initialization", () => {
	const message: CrewMessage = {
		id: "msg-1",
		crewId: "data-crew",
		author: "DataCrew-Catalog",
		text: "Examining Zetaris schemas",
		ts: 1000,
		kind: "chat",
	};

	const crew: ActiveCrew = {
		id: "data-crew",
		type: "data",
		label: "Data Research Crew",
		status: "talking",
		messages: [message],
		softDeadlineAt: 5000,
	};

	assert.equal(crew.id, "data-crew");
	assert.equal(crew.type, "data");
	assert.equal(crew.status, "talking");
	assert.equal(crew.messages.length, 1);
	assert.equal(crew.messages[0].kind, "chat");
});

test("isCrewRoundReady: returns false if any required crew is still talking or wrapping up", () => {
	const round: CrewRound = {
		roundId: "round-1",
		crewIds: ["data-crew", "web-crew"],
		mainChatId: "conv-1",
		crews: {
			"data-crew": {
				id: "data-crew",
				type: "data",
				label: "Data Crew",
				status: "ready",
				messages: [],
				softDeadlineAt: 5000,
				summary: "Data report ready",
			},
			"web-crew": {
				id: "web-crew",
				type: "web",
				label: "Web Crew",
				status: "talking",
				messages: [],
				softDeadlineAt: 5000,
			},
		},
		barrierReleased: false,
		summaryPosted: false,
	};

	// Only 1 of 2 is ready; barrier must NOT be ready!
	assert.equal(isCrewRoundReady(round), false);
	assert.equal(canReleaseBarrier(round), false);

	// Even if web-crew reaches wrapping_up, barrier is still NOT ready!
	round.crews["web-crew"].status = "wrapping_up";
	assert.equal(isCrewRoundReady(round), false);
	assert.equal(canReleaseBarrier(round), false);
});

test("isCrewRoundReady: returns true only when every required crew is ready", () => {
	const round: CrewRound = {
		roundId: "round-1",
		crewIds: ["data-crew", "web-crew"],
		mainChatId: "conv-1",
		crews: {
			"data-crew": {
				id: "data-crew",
				type: "data",
				label: "Data Crew",
				status: "ready",
				messages: [],
				softDeadlineAt: 5000,
				summary: "Data findings verified",
			},
			"web-crew": {
				id: "web-crew",
				type: "web",
				label: "Web Crew",
				status: "ready",
				messages: [],
				softDeadlineAt: 5000,
				summary: "External citations verified",
			},
		},
		barrierReleased: false,
		summaryPosted: false,
	};

	assert.equal(isCrewRoundReady(round), true);
	assert.equal(canReleaseBarrier(round), true);
});

test("canReleaseBarrier: enforces idempotency; cannot release twice", () => {
	const round: CrewRound = {
		roundId: "round-1",
		crewIds: ["data-crew", "web-crew"],
		mainChatId: "conv-1",
		crews: {
			"data-crew": {
				id: "data-crew",
				type: "data",
				label: "Data Crew",
				status: "ready",
				messages: [],
				softDeadlineAt: 5000,
			},
			"web-crew": {
				id: "web-crew",
				type: "web",
				label: "Web Crew",
				status: "ready",
				messages: [],
				softDeadlineAt: 5000,
			},
		},
		barrierReleased: true, // Already released
		summaryPosted: true,
	};

	assert.equal(isCrewRoundReady(round), true);
	assert.equal(canReleaseBarrier(round), false);
});

test("hasSoftDeadlinePassed: transitions correctly after deadline", () => {
	const crew: ActiveCrew = {
		id: "data-crew",
		type: "data",
		label: "Data Crew",
		status: "talking",
		messages: [],
		softDeadlineAt: 10000,
	};

	assert.equal(hasSoftDeadlinePassed(crew, 9000), false);
	assert.equal(hasSoftDeadlinePassed(crew, 10000), true);
	assert.equal(hasSoftDeadlinePassed(crew, 12000), true);

	// If status is already ready, deadline does not apply
	crew.status = "ready";
	assert.equal(hasSoftDeadlinePassed(crew, 15000), false);
});

test("appendCrewMessage: preserves ordering and prevents duplicate messages", () => {
	let crew: ActiveCrew = {
		id: "data-crew",
		type: "data",
		label: "Data Crew",
		status: "talking",
		messages: [],
		softDeadlineAt: 10000,
	};

	const msg1: CrewMessage = {
		id: "m-1",
		crewId: "data-crew",
		author: "DataCrew-Catalog",
		text: "Initial schema discovered",
		ts: 100,
		kind: "chat",
	};

	const msg2: CrewMessage = {
		id: "m-2",
		crewId: "data-crew",
		author: "DataCrew-Anomaly",
		text: "Checkpoint: Outlier detected",
		ts: 200,
		kind: "checkpoint",
	};

	crew = appendCrewMessage(crew, msg2);
	crew = appendCrewMessage(crew, msg1); // Out of order arrival

	// Should be sorted by ts
	assert.equal(crew.messages.length, 2);
	assert.equal(crew.messages[0].id, "m-1");
	assert.equal(crew.messages[1].id, "m-2");

	// Duplicate message with same ID should be ignored
	crew = appendCrewMessage(crew, msg1);
	assert.equal(crew.messages.length, 2);
});

test("isCrewRoundReady: safely handles missing or empty round", () => {
	assert.equal(isCrewRoundReady(null as any), false);
	assert.equal(
		isCrewRoundReady({
			roundId: "empty",
			crewIds: [],
			mainChatId: "c1",
			crews: {},
			barrierReleased: false,
			summaryPosted: false,
		}),
		false,
	);
});
