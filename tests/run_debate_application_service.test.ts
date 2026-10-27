import assert from "node:assert/strict";
import { test } from "node:test";
import {
	RunDebateApplicationService,
	type RunDebateExecutor,
	type RunDebatePersistence,
} from "../apps/gateway/src/application/RunDebateApplicationService.js";
import type { RunOutput, RunParams } from "../apps/gateway/src/debateRunner.js";

const output = { mode: "sample" } as RunOutput;
const params = { mode: "sample", conversationId: "conversation-1" } as RunParams;

test("RunDebateApplicationService persists completed runs after the executor succeeds", async () => {
	const calls: string[] = [];
	const executor: RunDebateExecutor = {
		execute: async () => {
			calls.push("execute");
			return output;
		},
	};
	const persistence: RunDebatePersistence = {
		saveCompleted: (conversationId) => calls.push(`completed:${conversationId}`),
		saveFailed: (conversationId) => calls.push(`failed:${conversationId}`),
	};

	const result = await new RunDebateApplicationService(executor, persistence).execute(params);

	assert.equal(result, output);
	assert.deepEqual(calls, ["execute", "completed:conversation-1"]);
});

test("RunDebateApplicationService marks failed runs and rethrows the original error", async () => {
	const failure = new Error("debate failed");
	const calls: string[] = [];
	const executor: RunDebateExecutor = {
		execute: async () => {
			throw failure;
		},
	};
	const persistence: RunDebatePersistence = {
		saveCompleted: (conversationId) => calls.push(`completed:${conversationId}`),
		saveFailed: (conversationId) => calls.push(`failed:${conversationId}`),
	};

	await assert.rejects(
		new RunDebateApplicationService(executor, persistence).execute(params),
		(error) => error === failure,
	);
	assert.deepEqual(calls, ["failed:conversation-1"]);
});
