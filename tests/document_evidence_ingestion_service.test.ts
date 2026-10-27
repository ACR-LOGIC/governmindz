import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentFileInput, ParsedDocumentResult } from "@governmindz/core/documents/DocumentIngestionService";
import { DocumentEvidenceIngestionService } from "../apps/gateway/src/services/DocumentEvidenceIngestionService.js";

function parsed(filename: string): ParsedDocumentResult {
	return {
		documentId: `id-${filename}`,
		filename,
		format: "txt",
		sha256: "hash",
		totalChunks: 1,
		chunks: [],
		metadata: {},
	};
}

function createService(
	ingest: (input: DocumentFileInput) => Promise<ParsedDocumentResult>,
	chunkCount = 1,
) {
	return {
		ingest,
		getAllChunks: () => Array.from({ length: chunkCount }),
		formatEvidenceContext: () => "[document evidence]",
	};
}

test("DocumentEvidenceIngestionService ingests attachments in order and emits metadata", async () => {
	const filenames: string[] = [];
	const events: Record<string, unknown>[] = [];
	const service = new DocumentEvidenceIngestionService({
		createService: () =>
			createService(async (input) => {
				filenames.push(input.filename);
				return parsed(input.filename);
			}),
	});

	const context = await service.ingest(
		[
			{ filename: "first.txt", content: "one" },
			{ filename: "second.txt", content: "two" },
		],
		(event) => events.push(event),
	);

	assert.deepEqual(filenames, ["first.txt", "second.txt"]);
	assert.equal(events.length, 2);
	assert.equal(events[0].type, "document_ingested");
	assert.equal(events[1].filename, "second.txt");
	assert.equal(context, "\n[document evidence]");
});

test("DocumentEvidenceIngestionService continues after a failed attachment", async () => {
	const warnings: unknown[][] = [];
	const events: Record<string, unknown>[] = [];
	const service = new DocumentEvidenceIngestionService({
		createService: () =>
			createService(async (input) => {
				if (input.filename === "bad.txt") throw new Error("parse failed");
				return parsed(input.filename);
			}),
		warn: (...args) => warnings.push(args),
	});

	const context = await service.ingest(
		[{ filename: "bad.txt" }, { filename: "good.txt" }],
		(event) => events.push(event),
	);

	assert.equal(warnings.length, 1);
	assert.equal(events.length, 1);
	assert.equal(events[0].filename, "good.txt");
	assert.equal(context, "\n[document evidence]");
});

test("DocumentEvidenceIngestionService returns no context when there are no chunks", async () => {
	const service = new DocumentEvidenceIngestionService({
		createService: () => createService(async (input) => parsed(input.filename), 0),
	});

	assert.equal(await service.ingest([{ filename: "empty.txt" }]), "");
	assert.equal(await service.ingest(undefined), "");
});
