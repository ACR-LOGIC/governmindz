import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateInquiryScore } from "../apps/gateway/src/application/InquiryScorePolicy.js";

test("calculateInquiryScore returns the baseline score", () => {
	assert.equal(calculateInquiryScore("routine governance review", 0), 5);
});

test("calculateInquiryScore adds complexity for long topics", () => {
	assert.equal(calculateInquiryScore("x".repeat(121), 0), 6);
});

test("calculateInquiryScore adds complexity for larger evidence sets", () => {
	assert.equal(calculateInquiryScore("routine governance review", 6), 6);
});

test("calculateInquiryScore adds risk weight for matching keywords", () => {
	assert.equal(calculateInquiryScore("Review the confidential access dispute", 0), 7);
});

test("calculateInquiryScore stays within the ten-point upper bound", () => {
	const score = calculateInquiryScore(`${"x".repeat(121)} confidential conflict dispute uncertain`, 6);
	assert.equal(score, 9);
	assert.ok(score <= 10);
});
