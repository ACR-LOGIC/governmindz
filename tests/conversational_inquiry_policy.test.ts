import assert from "node:assert/strict";
import { test } from "node:test";
import { isConversationalInquiry } from "../apps/gateway/src/application/ConversationalInquiryPolicy.js";

test("isConversationalInquiry recognizes short greetings", () => {
	assert.equal(isConversationalInquiry("  Hello there  "), true);
});

test("isConversationalInquiry recognizes supported basic questions", () => {
	assert.equal(isConversationalInquiry("What can you do?"), true);
	assert.equal(isConversationalInquiry("Who are you?"), true);
});

test("isConversationalInquiry rejects domain-specific questions", () => {
	assert.equal(isConversationalInquiry("Hello, assess this governance risk"), false);
});

test("isConversationalInquiry rejects long conversational-looking topics", () => {
	assert.equal(isConversationalInquiry("Hello " + "there ".repeat(10)), false);
});

test("isConversationalInquiry rejects unrelated statements", () => {
	assert.equal(isConversationalInquiry("Please review this request"), false);
});
