// biome-ignore-all lint/style/noNonNullAssertion: legacy code pending refactor
// Copyright (c) 2026 ACR Logic.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PromptRegistry {
	private static cache: Map<string, string> = new Map();
	private static promptDir =
		process.env.PROCESS_PROMPTS_DIR ||
		path.resolve(__dirname, "..", "..", "prompts");

	static load(role: string): string {
		if (PromptRegistry.cache.has(role)) {
			return PromptRegistry.cache.get(role)!;
		}

		const filePath = path.join(PromptRegistry.promptDir, `${role}.prompt`);
		if (!fs.existsSync(filePath)) {
			throw new Error(`Prompt file not found for role: ${role} at ${filePath}`);
		}

		const prompt = fs.readFileSync(filePath, "utf8");
		PromptRegistry.cache.set(role, prompt);
		return prompt;
	}
}
