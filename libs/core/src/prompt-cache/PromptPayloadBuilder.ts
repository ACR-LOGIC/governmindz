// Copyright (c) 2026 ACR Logic.

import { createHash } from "node:crypto";
import { Logger } from "../kernel/Logger";
import type {
	PayloadBlock,
	PayloadBlockType,
	PromptPayload,
	ProviderPromptMessage,
} from "./types";

const DEFAULT_TYPE_ORDER: readonly PayloadBlockType[] = [
	"system",
	"context",
	"research",
	"validation",
	"instruction",
];

type SerializableBlock = {
	type: PayloadBlockType;
	role: string;
	content: string;
	priority: number;
	version: string;
	cacheable: boolean;
	metadata: Record<string, string | number | boolean | null>;
};

const VOLATILE_METADATA_KEYS = new Set([
	"timestamp",
	"ts",
	"createdat",
	"updatedat",
	"recordedat",
	"builtat",
	"sessionid",
	"runid",
	"requestid",
	"traceid",
	"correlationid",
	"nonce",
]);

export class PromptPayloadBuilder {
	private blocks: PayloadBlock[] = [];

	/**
	 * Add a block to the payload. Blocks are sorted canonically at build time.
	 */
	addBlock(block: PayloadBlock): this {
		this.blocks.push(block);
		return this;
	}

	addBlocks(blocks: PayloadBlock[]): this {
		this.blocks.push(...blocks);
		return this;
	}

	/**
	 * Build a deterministic JSON payload that can be rendered into a stable
	 * cacheable prefix plus a volatile suffix for provider-side prompt caching.
	 */
	build(): PromptPayload {
		const sortedBlocks = this.canonicalSort([...this.blocks]);
		const normalizedBlocks = sortedBlocks.map((block) =>
			this.normalizeBlock(block),
		);
		const staticPrefix = normalizedBlocks.filter((block) => block.cacheable);
		const dynamicSuffix = normalizedBlocks.filter((block) => !block.cacheable);
		const prefixHash = this.hash(this.serialize(staticPrefix));

		// Payload Delta Accounting: emit structured metrics for enterprise observability pipelines.
		const staticCount = staticPrefix.length;
		const dynamicCount = dynamicSuffix.length;
		const ratio = dynamicCount > 0 ? staticCount / dynamicCount : staticCount;
		const staticTokenEstimate = this.estimateTokens(
			staticPrefix.map((block) => block.content).join("\n"),
		);
		const dynamicTokenEstimate = this.estimateTokens(
			dynamicSuffix.map((block) => block.content).join("\n"),
		);

		Logger.info("prompt_payload.delta_accounting", {
			schemaVersion: "governmindz.prompt.v1",
			metric: "prompt_payload_delta_accounting",
			cacheKeyHint: prefixHash,
			counts: {
				static: staticCount,
				dynamic: dynamicCount,
				total: normalizedBlocks.length,
			},
			tokenEstimate: {
				static: staticTokenEstimate,
				dynamic: dynamicTokenEstimate,
			},
			ratios: {
				staticToDynamic: Number(ratio.toFixed(2)),
				cacheableShare:
					normalizedBlocks.length > 0
						? Number((staticCount / normalizedBlocks.length).toFixed(2))
						: 0,
			},
		});

		const envelope = {
			schemaVersion: "governmindz.prompt.v1" as const,
			blockOrder: DEFAULT_TYPE_ORDER,
			staticPrefix,
			dynamicSuffix,
			providerHints: {
				prefixHash,
				cacheableBlockCount: staticCount,
				dynamicBlockCount: dynamicCount,
				staticTokenEstimate,
				dynamicTokenEstimate,
				cacheSegments: ["system_rules", "compressed_round_history"],
			},
		};

		const canonical = this.serialize({
			schemaVersion: "governmindz.prompt.v1",
			envelope,
		});

		return {
			schemaVersion: "governmindz.prompt.v1",
			cacheKey: this.hash(canonical),
			prefixHash,
			canonical,
			blocks: normalizedBlocks,
			envelope,
			builtAt: Date.now(),
		};
	}

	private canonicalSort(blocks: PayloadBlock[]): PayloadBlock[] {
		return blocks.sort((a, b) => {
			const typeOrder =
				DEFAULT_TYPE_ORDER.indexOf(a.type) - DEFAULT_TYPE_ORDER.indexOf(b.type);
			if (typeOrder !== 0) {
				return typeOrder;
			}

			const roleOrder = a.role.localeCompare(b.role);
			if (roleOrder !== 0) {
				return roleOrder;
			}

			const priorityOrder = b.priority - a.priority;
			if (priorityOrder !== 0) {
				return priorityOrder;
			}

			return this.hash(a.content).localeCompare(this.hash(b.content));
		});
	}

	private normalizeBlock(block: PayloadBlock): SerializableBlock {
		const metadataEntries = Object.entries(block.metadata ?? {})
			.filter(([key]) => !this.isVolatileMetadataKey(key))
			.sort(([left], [right]) => left.localeCompare(right));

		return {
			type: block.type,
			role: block.role,
			content: block.content.trim(),
			priority: block.priority,
			version: block.version,
			cacheable: block.cacheable ?? block.type !== "instruction",
			metadata: Object.fromEntries(metadataEntries),
		};
	}

	private isVolatileMetadataKey(key: string): boolean {
		const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
		return VOLATILE_METADATA_KEYS.has(normalized);
	}

	private serialize(input: unknown): string {
		return JSON.stringify(input);
	}

	private hash(input: string): string {
		return createHash("sha256").update(input).digest("hex");
	}

	private estimateTokens(input: string): number {
		return Math.ceil(input.length / 4);
	}
}

export function renderPromptPayloadMessages(
	payload: PromptPayload,
): ProviderPromptMessage[] {
	const staticMessages = payload.envelope.staticPrefix.map((block) => ({
		role: "system" as const,
		content: renderBlock(block),
	}));

	const dynamicContent = payload.envelope.dynamicSuffix
		.map(renderBlock)
		.join("\n\n");
	const userMessage: ProviderPromptMessage = {
		role: "user",
		content: dynamicContent || payload.canonical,
	};

	return [...staticMessages, userMessage];
}

function renderBlock(block: PayloadBlock): string {
	const metadata =
		block.metadata && Object.keys(block.metadata).length > 0
			? `\nMETA:${JSON.stringify(block.metadata)}`
			: "";

	return (
		[
			`TYPE:${block.type}`,
			`ROLE:${block.role}`,
			`VERSION:${block.version}`,
			`PRIORITY:${block.priority}`,
			`CONTENT:${block.content.trim()}`,
		].join("\n") + metadata
	);
}
