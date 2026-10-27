import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateConversation } from "../libs/core/src/scoring/ConversationEvaluation.js";

test("empty conversations are not evaluated and carry no confidence", () => {
	const evaluation = evaluateConversation({
		messages: [],
		topic: "",
		status: "idle",
		finalConfidence: 0.92,
		inquiryScore: 5,
	});

	assert.equal(evaluation.status, "NOT_EVALUATED");
	assert.equal(evaluation.evaluated, false);
	assert.equal(evaluation.confidence, null);
	assert.equal(evaluation.inquiryScore, null);
});

test("topics without an answer remain not evaluated", () => {
	const evaluation = evaluateConversation({
		messages: [{ fromSeat: "user", type: "user", content: "Assess the vendor risk." }],
		topic: "Assess the vendor risk.",
		status: "idle",
	});

	assert.equal(evaluation.status, "NO_SUBSTANTIVE_ANSWER");
	assert.equal(evaluation.confidence, null);
});

test("running deliberations are marked incomplete rather than scored", () => {
	const evaluation = evaluateConversation({
		messages: [
			{ fromSeat: "user", type: "user", content: "Assess the vendor risk." },
			{ fromSeat: "FactChecker", type: "proposal", content: "Partial research finding." },
		],
		topic: "Assess the vendor risk.",
		status: "running",
		finalConfidence: 0.77,
	});

	assert.equal(evaluation.status, "INCOMPLETE");
	assert.equal(evaluation.confidence, null);
});

test("placeholder final messages do not count as an answer", () => {
	const evaluation = evaluateConversation({
		topic: "Assess the vendor risk.",
		status: "completed",
		messages: [
			{
				fromSeat: "Synthesizer",
				type: "final",
				content: "No final consensus reached.",
				confidence: 0.91,
			},
		],
		finalConfidence: 0.91,
	});

	assert.equal(evaluation.status, "NO_SUBSTANTIVE_ANSWER");
	assert.equal(evaluation.confidence, null);
});

test("a substantive final answer is evaluated even without a confidence score", () => {
	const evaluation = evaluateConversation({
		topic: "Assess the vendor risk.",
		status: "completed",
		messages: [
			{
				fromSeat: "Synthesizer",
				type: "final",
				content: "The council recommends a staged remediation with independent verification.",
			},
		],
	});

	assert.equal(evaluation.status, "EVALUATED");
	assert.equal(evaluation.evaluated, true);
	assert.equal(evaluation.confidence, null);
	assert.match(evaluation.confidenceIssue || "", /No calibrated confidence/i);
});

test("a valid zero confidence is preserved instead of replaced", () => {
	const evaluation = evaluateConversation({
		topic: "Assess the vendor risk.",
		status: "completed",
		finalConfidence: 0,
		messages: [
			{
				fromSeat: "Synthesizer",
				type: "final",
				content: "The council could not substantiate the vendor claim.",
				confidence: 0.8,
			},
		],
	});

	assert.equal(evaluation.status, "EVALUATED");
	assert.equal(evaluation.confidence, 0);
	assert.equal(evaluation.confidenceSource, "final");
});

test("out-of-range confidence is withheld", () => {
	const evaluation = evaluateConversation({
		topic: "Assess the vendor risk.",
		status: "completed",
		finalConfidence: 92,
		messages: [
			{
				fromSeat: "Synthesizer",
				type: "final",
				content: "The council recommends a staged remediation with independent verification.",
			},
		],
	});

	assert.equal(evaluation.status, "EVALUATED");
	assert.equal(evaluation.confidence, null);
	assert.match(evaluation.confidenceIssue || "", /0-1 range/);
});
