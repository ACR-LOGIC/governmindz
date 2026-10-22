
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	mintGravityReceipt,
	verifyGravityReceipt,
} from "../src/gravity/GravityReceipt.js";

const TEST_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function withSigningKey(run: () => void): void {
	const previous = process.env.KMS_MASTER_KEY;
	process.env.KMS_MASTER_KEY = TEST_KEY;
	try {
		run();
	} finally {
		if (previous === undefined) delete process.env.KMS_MASTER_KEY;
		else process.env.KMS_MASTER_KEY = previous;
	}
}

test("mints and verifies a Gravity receipt", () => {
	withSigningKey(() => {
		const receipt = mintGravityReceipt({
			taskId: "test-task",
			appliedSignals: {
				urgency: 0.5,
				dependencyWeight: 0.5,
				relevance: 0.9,
				confidence: 0.8,
			},
			calculatedGravity: 0.72,
			adkExecutionId: "adk-test",
			mcpToolReceipts: ["zetaris_query"],
			modelArmorShieldId: "armor-test",
		});
		assert.equal(verifyGravityReceipt(receipt), true);
		assert.equal(
			verifyGravityReceipt({ ...receipt, taskId: "tampered" }),
			false,
		);
	});
});

test("refuses to mint without KMS_MASTER_KEY", () => {
	const previous = process.env.KMS_MASTER_KEY;
	delete process.env.KMS_MASTER_KEY;
	try {
		assert.throws(
			() =>
				mintGravityReceipt({
					taskId: "test-task",
					appliedSignals: {
						urgency: 0.5,
						dependencyWeight: 0.5,
						relevance: 0.9,
						confidence: 0.8,
					},
					calculatedGravity: 0.72,
					adkExecutionId: "adk-test",
					mcpToolReceipts: [],
					modelArmorShieldId: "armor-test",
				}),
			/KMS_MASTER_KEY/,
		);
	} finally {
		if (previous === undefined) delete process.env.KMS_MASTER_KEY;
		else process.env.KMS_MASTER_KEY = previous;
	}
});
