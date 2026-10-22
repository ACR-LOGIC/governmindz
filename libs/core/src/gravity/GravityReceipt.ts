// Copyright (c) 2026 ACR Logic.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { GravitySignals } from "./GravityFormula";

/**
 * GravityReceipt — verifiable execution proof for a gravity-coordinated task.
 *
 * The signing key is resolved exclusively from the KMS_MASTER_KEY environment
 * variable. No development/placeholder signing key is retained in baseline.
 */

export interface GravityReceipt {
	taskId: string;
	timestamp: number;
	engineVersion: "1.1.0-gravity";
	appliedSignals: GravitySignals;
	calculatedGravity: number;
	adkExecutionId: string;
	mcpToolReceipts: string[];
	modelArmorShieldId: string;
	signature: string;
}

type GravityReceiptPayload = Pick<
	GravityReceipt,
	| "taskId"
	| "timestamp"
	| "engineVersion"
	| "appliedSignals"
	| "calculatedGravity"
	| "adkExecutionId"
	| "mcpToolReceipts"
	| "modelArmorShieldId"
>;

function getSigningKey(): string {
	const key = process.env.KMS_MASTER_KEY;

	if (process.env.NODE_ENV === "production") {
		if (!key) {
			throw new Error(
				"[GravityReceipt] KMS_MASTER_KEY is not defined in production. Receipt signing/verification is disabled.",
			);
		}
		const keyBuf = Buffer.from(key, "base64");
		if (keyBuf.length !== 32) {
			throw new Error(
				`[GravityReceipt] KMS_MASTER_KEY must decode to exactly 32 bytes (got ${keyBuf.length}). Generate with: openssl rand -base64 32`,
			);
		}
	}

	if (!key) {
		throw new Error(
			"[GravityReceipt] KMS_MASTER_KEY is not defined. Set it in the environment to sign receipts.",
		);
	}

	return key;
}

function serializeReceiptPayload(payload: GravityReceiptPayload): string {
	return JSON.stringify({
		taskId: payload.taskId,
		timestamp: payload.timestamp,
		engineVersion: payload.engineVersion,
		appliedSignals: payload.appliedSignals,
		calculatedGravity: payload.calculatedGravity,
		adkExecutionId: payload.adkExecutionId,
		mcpToolReceipts: payload.mcpToolReceipts,
		modelArmorShieldId: payload.modelArmorShieldId,
	});
}

function sign(dataToSign: string): string {
	return createHmac("sha256", getSigningKey()).update(dataToSign).digest("hex");
}

export function mintGravityReceipt(
	params: Omit<GravityReceipt, "timestamp" | "engineVersion" | "signature">,
): GravityReceipt {
	const timestamp = Date.now();
	const engineVersion = "1.1.0-gravity";

	const signature = sign(
		serializeReceiptPayload({ ...params, timestamp, engineVersion }),
	);

	return {
		...params,
		timestamp,
		engineVersion,
		signature,
	};
}

export function verifyGravityReceipt(receipt: GravityReceipt): boolean {
	const expected = Buffer.from(sign(serializeReceiptPayload(receipt)), "hex");
	const received = Buffer.from(receipt.signature, "hex");

	if (expected.length !== received.length) {
		return false;
	}

	return timingSafeEqual(expected, received);
}
