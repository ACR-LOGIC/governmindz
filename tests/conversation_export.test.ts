import assert from "node:assert/strict";
import { test } from "node:test";
import zlib from "node:zlib";
import {
	buildConversationExport,
	ExportBuildError,
} from "../libs/core/src/exports/ConversationExport.js";

const conversation = {
	id: "conv_export_test",
	title: "Vendor Risk Assessment",
	topic: "Assess vendor risk and recommend a remediation path.",
	mode: "demo",
	status: "completed",
	createdAt: 1700000000000,
	updatedAt: 1700000005000,
	finalConfidence: 0.82,
	inquiryScore: 7,
	messages: [
		{ id: "m1", fromSeat: "user", type: "user", content: "Assess vendor risk.", timestamp: 1700000000000 },
		{
			id: "m2",
			fromSeat: "FactChecker",
			type: "proposal",
			content: "The vendor's access controls require independent evidence.",
			confidence: 0.77,
			round: 1,
			timestamp: 1700000001000,
		},
		{
			id: "m3",
			fromSeat: "Synthesizer",
			type: "final",
			content: "The council recommends a staged remediation with independent verification.",
			confidence: 0.82,
			timestamp: 1700000005000,
			structured: {
				position: "The council recommends a staged remediation with independent verification.",
				evidence: ["Control inventory snapshot"],
				caveats: ["Vendor attestations remain unverified."],
			},
		},
	],
	auditEvents: [
		{
			id: "a1",
			event_type: "final_answer",
			timestamp: 1700000005000,
			previous_hash: "genesis",
			hash: "abc123",
			signature: "sig",
		},
	],
	agentAssignments: {
		FactChecker: { humanName: "Riley", role: "Fact verification" },
		Synthesizer: { humanName: "Morgan", role: "Synthesis" },
	},
};

function readZipEntry(zip: Buffer, targetPath: string): Buffer {
	let offset = 0;
	while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
		const method = zip.readUInt16LE(offset + 8);
		const compressedSize = zip.readUInt32LE(offset + 18);
		const nameLength = zip.readUInt16LE(offset + 26);
		const extraLength = zip.readUInt16LE(offset + 28);
		const name = zip.slice(offset + 30, offset + 30 + nameLength).toString("utf8");
		const dataStart = offset + 30 + nameLength + extraLength;
		const data = zip.slice(dataStart, dataStart + compressedSize);
		if (name === targetPath) {
			if (method === 0) return data;
			if (method === 8) return zlib.inflateRawSync(data);
			throw new Error(`Unsupported compression method ${method}`);
		}
		offset = dataStart + compressedSize;
	}
	throw new Error(`ZIP entry not found: ${targetPath}`);
}

test("DOCX export produces a valid OOXML package with a truthful status", async () => {
	const generated = await buildConversationExport(conversation, "docx", {
		generatedAt: new Date("2026-01-02T03:04:05.000Z"),
	});
	assert.equal(generated.filename, "vendor-risk-assessment-executive-brief.docx");
	assert.equal(generated.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
	assert.equal(generated.data.subarray(0, 2).toString("utf8"), "PK");
	const documentXml = readZipEntry(generated.data, "word/document.xml").toString("utf8");
	assert.match(documentXml, /The council recommends a staged remediation/);
	assert.match(documentXml, /Final Governance Answer/);
	assert.doesNotMatch(documentXml, /All facts verified/i);
});

test("XLSX export contains structured sheets and no fabricated confidence", async () => {
	const generated = await buildConversationExport(conversation, "xlsx", {
		generatedAt: new Date("2026-01-02T03:04:05.000Z"),
	});
	assert.equal(generated.data.subarray(0, 2).toString("utf8"), "PK");
	const workbook = readZipEntry(generated.data, "xl/workbook.xml").toString("utf8");
	assert.match(workbook, /Summary/);
	assert.match(workbook, /Messages/);
	assert.match(workbook, /Audit Events/);
	const summary = readZipEntry(generated.data, "xl/worksheets/sheet1.xml").toString("utf8");
	assert.match(summary, /82\.0%/);
	assert.doesNotMatch(summary, /Verified by GovernMindz/i);
});

test("PDF renderer receives N/A instead of a fabricated confidence", async () => {
	let html = "";
	const generated = await buildConversationExport(
		{
			...conversation,
			finalConfidence: null,
			messages: conversation.messages.map((message) => ({ ...message, confidence: null })),
		},
		"pdf",
		{
			generatedAt: new Date("2026-01-02T03:04:05.000Z"),
			renderPdf: async (input) => {
				html = input;
				return Buffer.from("%PDF-1.4\nstub\n");
			},
		},
	);
	assert.equal(generated.data.subarray(0, 8).toString("utf8"), "%PDF-1.4");
	assert.match(html, /Calibrated confidence<\/span>N\/A/);
	assert.match(html, /No calibrated confidence was recorded/i);
	assert.doesNotMatch(html, /92\.0/);
});

test("ZIP bundle includes all generated formats plus manifest and hashes", async () => {
	const generated = await buildConversationExport(conversation, "zip", {
		generatedAt: new Date("2026-01-02T03:04:05.000Z"),
		renderPdf: async () => Buffer.from("%PDF-1.4\nstub\n"),
	});
	assert.equal(generated.contentType, "application/zip");
	assert.equal(generated.data.subarray(0, 2).toString("utf8"), "PK");
	const manifest = JSON.parse(readZipEntry(generated.data, "manifest.json").toString("utf8"));
	assert.equal(manifest.evaluation.status, "EVALUATED");
	assert.equal(manifest.audit.verification, "NOT_PERFORMED");
	assert.equal(manifest.files.length, 8);
	assert.ok(manifest.files.some((file: { path: string }) => file.path === "exports/vendor-risk-assessment-executive-brief.pdf"));
	assert.ok(manifest.files.some((file: { path: string }) => file.path === "exports/vendor-risk-assessment-workbook.xlsx"));
	assert.ok(manifest.files.every((file: { sha256: string }) => /^[a-f0-9]{64}$/.test(file.sha256)));
	assert.match(readZipEntry(generated.data, "README.txt").toString("utf8"), /not independently verified/);
});

test("ZIP export rejects empty conversations", async () => {
	await assert.rejects(
		() => buildConversationExport({ title: "Empty", messages: [], status: "idle" }, "zip"),
		(error: unknown) => error instanceof ExportBuildError && error.statusCode === 422,
	);
});

test("empty single-format exports remain truthful rather than scored", async () => {
	const generated = await buildConversationExport(
		{ id: "empty", title: "Empty conversation", messages: [], status: "idle", finalConfidence: 0.99 },
		"json",
	);
	const payload = JSON.parse(generated.data.toString("utf8"));
	assert.equal(payload.evaluation.status, "NOT_EVALUATED");
	assert.equal(payload.evaluation.confidence, null);
	assert.equal(payload.evaluation.inquiryScore, null);
});
