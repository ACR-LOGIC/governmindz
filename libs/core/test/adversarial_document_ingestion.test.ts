/**
 * adversarial_document_ingestion.test.ts
 *
 * Empirical Challenger Test Suite for Requirement R3 (Milestone 2):
 * - Adversarial stress testing of document evidence ingestion (CSV, XLSX, PDF)
 * - Malformed, corrupted, truncated, and zero-length files
 * - Massive datasets, unicode cells, special characters, and bracketed filenames
 * - Coordinate injection, tampering, and substring collision vulnerabilities in verifyCitation
 * - Verification of RivalChallenger epistemic triggers and trigger bypass analysis
 */

import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-ignore
import zlib from "node:zlib";
import {
	DocumentIngestionService,
	parseCsvDocument,
	parseXlsxDocument,
	parsePdfDocument,
} from "../src/documents/DocumentIngestionService.js";
import {
	RivalChallenger,
	isValidDocumentCoordinate,
	DOCUMENT_COORDINATE_PATTERNS,
} from "../src/memory/RivalChallenger.js";
import type { AgentMessage } from "../src/debate/AgentMessage.js";

// ---------------------------------------------------------------------------
// Helper generators for adversarial test inputs
// ---------------------------------------------------------------------------

function createValidZipBuffer(files: Array<{ name: string; content: Buffer }>): Buffer {
	const parts: Buffer[] = [];
	for (const file of files) {
		const nameBuf = Buffer.from(file.name, "utf8");
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0); // Local file header signature
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(0, 6);
		header.writeUInt16LE(0, 8); // compression 0 (stored)
		header.writeUInt16LE(0, 10);
		header.writeUInt16LE(0, 12);
		header.writeUInt32LE(0, 14);
		header.writeUInt32LE(file.content.length, 18);
		header.writeUInt32LE(file.content.length, 22);
		header.writeUInt16LE(nameBuf.length, 26);
		header.writeUInt16LE(0, 28);

		parts.push(header, nameBuf, file.content);
	}
	return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// 1. MALFORMED & CORRUPTED FILE STRESS TESTING
// ---------------------------------------------------------------------------

test("Adversarial 1.1: Malformed & Truncated CSV Ingestion", async () => {
	const service = new DocumentIngestionService();

	// Case A: Unclosed quote at end of file
	const unclosedQuoteCsv = 'id,name,tier\n1,"Acme Corporation,Tier 1\n2,"Broken unclosed quote';
	const resA = await service.ingest({
		filename: "unclosed.csv",
		content: unclosedQuoteCsv,
	});
	assert.ok(resA.chunks.length > 0, "Parser must not crash on unclosed quotes");
	assert.equal(resA.format, "csv");

	// Case B: Null bytes and binary noise in CSV
	const nullByteCsv = "id,value\n1,\x00\x00\x00\n2,\xFF\xFE\xFD";
	const resB = await service.ingest({
		filename: "nulls.csv",
		content: nullByteCsv,
	});
	assert.equal(resB.format, "csv");
	assert.ok(resB.chunks.length >= 2);

	// Case C: CSV with mismatched column counts and empty delimiters
	const raggedCsv = "col1,col2,col3\n1\n2,two,three,four,five\n,,,,\n";
	const resC = await service.ingest({
		filename: "ragged.csv",
		content: raggedCsv,
	});
	assert.ok(resC.chunks.length >= 3);
});

test("Adversarial 1.2: Corrupted XLSX Headers & Decompression Explosions", async () => {
	const service = new DocumentIngestionService();

	// Case A: Completely random garbage bytes disguised as .xlsx
	const garbageBuffer = Buffer.from("\xDE\xAD\xBE\xEF\x01\x02\x03\x04\x05", "latin1");
	const resA = await service.ingest({
		filename: "corrupt.xlsx",
		content: garbageBuffer,
	});
	// Must gracefully fallback to text table parsing or return 0 chunks without throwing
	assert.ok(resA, "Must return a parsed document result without throwing");
	assert.equal(resA.format, "xlsx");

	// Case B: Truncated ZIP local file header (< 30 bytes)
	const truncatedZip = Buffer.from("\x50\x4B\x03\x04\x14\x00", "latin1");
	const resB = await service.ingest({
		filename: "truncated_header.xlsx",
		content: truncatedZip,
	});
	assert.ok(resB);
	// In the current implementation, any non-valid ZIP buffer falls back to plaintext table parsing.
	// This causes truncated binary bytes to be interpreted as utf8 text and create pseudo-cells.
	assert.ok(resB.chunks.length >= 0);
	if (resB.chunks.length > 0) {
		assert.match(resB.chunks[0].text, /PK/);
	}

	// Case C: ZIP header with invalid compressed size exceeding buffer bounds
	const bombHeader = Buffer.alloc(40);
	bombHeader.writeUInt32LE(0x04034b50, 0);
	bombHeader.writeUInt16LE(20, 4);
	bombHeader.writeUInt16LE(0, 8); // compression 0
	bombHeader.writeUInt32LE(999999, 18); // claimed compressed size 999k
	bombHeader.writeUInt32LE(999999, 22);
	bombHeader.writeUInt16LE(4, 26); // name length 4
	bombHeader.writeUInt16LE(0, 28);
	Buffer.from("test", "utf8").copy(bombHeader, 30);

	const resC = await service.ingest({
		filename: "size_bomb.xlsx",
		content: bombHeader,
	});
	assert.ok(resC);
	assert.equal(resC.format, "xlsx");

	// Case D: Valid ZIP with corrupted deflate stream
	const corruptedDeflate = Buffer.alloc(30);
	corruptedDeflate.writeUInt32LE(0x04034b50, 0);
	corruptedDeflate.writeUInt16LE(20, 4);
	corruptedDeflate.writeUInt16LE(8, 8); // compression 8 (deflate)
	corruptedDeflate.writeUInt32LE(10, 18);
	corruptedDeflate.writeUInt32LE(20, 22);
	corruptedDeflate.writeUInt16LE(12, 26);
	Buffer.from("xl/dummy.xml", "utf8").copy(corruptedDeflate, 30);
	const corruptZipData = Buffer.concat([corruptedDeflate, Buffer.from("NOT_DEFLATE_DATA", "utf8")]);

	const resD = await service.ingest({
		filename: "corrupt_deflate.xlsx",
		content: corruptZipData,
	});
	assert.ok(resD);
});

test("Adversarial 1.3: Invalid PDF Streams & Missing Structural Markers", async () => {
	const service = new DocumentIngestionService();

	// Case A: Truncated stream without 'endstream'
	const truncatedPdf = Buffer.from(
		"%PDF-1.4\n<< /Length 50 >>\nstream\r\nSome arbitrary uncompressed text in a broken stream",
		"latin1",
	);
	const resA = await service.ingest({
		filename: "broken_stream.pdf",
		content: truncatedPdf,
	});
	assert.ok(resA);
	assert.equal(resA.format, "pdf");
	assert.ok(resA.chunks.length > 0, "Fallback text extractor must salvage chunks");

	// Case B: Corrupted FlateDecode stream bytes
	const corruptFlatePdf = Buffer.from(
		"%PDF-1.4\n<< /Filter /FlateDecode >>\nstream\r\n\xFF\x00\xAA\xBB\xCC\r\nendstream\n%%EOF",
		"latin1",
	);
	const resB = await service.ingest({
		filename: "corrupt_flate.pdf",
		content: corruptFlatePdf,
	});
	assert.ok(resB);
	assert.equal(resB.format, "pdf");
});

test("Adversarial 1.4: Zero-Length Files & Whitespace-Only Buffers", async () => {
	const service = new DocumentIngestionService();

	// CSV zero-length
	const resCsv = await service.ingest({ filename: "empty.csv", content: Buffer.alloc(0) });
	assert.equal(resCsv.totalChunks, 0);
	assert.equal(resCsv.chunks.length, 0);
	assert.equal(resCsv.metadata.fileSizeBytes, 0);

	// XLSX zero-length
	const resXlsx = await service.ingest({ filename: "empty.xlsx", content: "" });
	assert.equal(resXlsx.totalChunks, 0);
	assert.equal(resXlsx.chunks.length, 0);

	// PDF zero-length
	const resPdf = await service.ingest({ filename: "empty.pdf", content: "   \n\r\t  \n" });
	assert.equal(resPdf.totalChunks, 0);
	assert.equal(resPdf.chunks.length, 0);

	// Ingestion with completely omitted content/dataUrl/filePath
	const resEmpty = await service.ingest({ filename: "omitted.csv" });
	assert.equal(resEmpty.totalChunks, 0);
	assert.equal(resEmpty.metadata.fileSizeBytes, 0);
});

// ---------------------------------------------------------------------------
// 2. MASSIVE FILES & EXTREME DATA SHAPES
// ---------------------------------------------------------------------------

test("Adversarial 2.1: Massive CSV File (10,000 Lines) Throughput & Bounds", async () => {
	const service = new DocumentIngestionService();
	const lines = ["RecordId,Timestamp,Status,RiskScore,EntityName,Notes"];
	for (let i = 1; i <= 10000; i++) {
		lines.push(`${i},2026-10-25T11:00:00Z,ACTIVE,${(i % 100) / 10},Vendor_${i},"Standard audit note for record ${i}"`);
	}
	const massiveCsv = lines.join("\n");

	const startTime = Date.now();
	const res = await service.ingest({
		filename: "massive_audit_trail.csv",
		content: massiveCsv,
	});
	const elapsedMs = Date.now() - startTime;

	assert.equal(res.totalChunks, 10001, "Must generate exactly 10,001 chunks (header + 10,000 rows)");
	assert.equal(res.metadata.lineCount, 10001);
	assert.ok(elapsedMs < 2000, `Parsing 10,000 lines must complete in <2000ms (actual: ${elapsedMs}ms)`);

	// Verify line bounds on chunks
	const firstChunk = res.chunks[0];
	assert.equal(firstChunk.coordinate.lineNumber, 1);
	const lastChunk = res.chunks[res.chunks.length - 1];
	assert.equal(lastChunk.coordinate.lineNumber, 10001);
	assert.equal(lastChunk.coordinate.citationTag, "[massive_audit_trail.csv, Line 10001]");
});

test("Adversarial 2.2: Unicode, Emoji, and Multilingual Cell Encodings", async () => {
	const service = new DocumentIngestionService();

	const unicodeCsv = [
		"ID,Language,PolicySummary",
		"1,Chinese,敏感数据访问控制策略（强制多因素认证）",
		"2,Arabic,سياسة أمان البيانات الموحدة عبر السحابة",
		"3,Russian,Политика криптографической защиты данных",
		"4,Emoji,🛡️ Secure Shield: 🔒 Lock all endpoints ⚠️ Alert on breach 🚨 Immediate Revoke",
	].join("\n");

	const res = await service.ingest({
		filename: "MultilingualPolicy.csv",
		content: unicodeCsv,
	});

	assert.equal(res.chunks.length, 5);
	assert.match(res.chunks[1].text, /敏感数据访问控制策略/);
	assert.match(res.chunks[2].text, /سياسة أمان البيانات/);
	assert.match(res.chunks[3].text, /Политика криптографической/);
	assert.match(res.chunks[4].text, /🛡️ Secure Shield/);
});

test("Adversarial 2.3: Filenames with Nested Brackets, Spaces, and Commas", async () => {
	const service = new DocumentIngestionService();

	const trickyFilename = "Audit [2024, Q3] - Final (v1.2).csv";
	const res = await service.ingest({
		filename: trickyFilename,
		content: "ID,Value\n1,Validated",
	});

	assert.equal(res.chunks.length, 2);
	const chunk = res.chunks[1];
	// Citation tag format: [Audit [2024, Q3] - Final (v1.2).csv, Line 2]
	assert.equal(chunk.coordinate.citationTag, `[${trickyFilename}, Line 2]`);

	// Verify regex matching behavior on tricky bracketed filenames
	assert.ok(
		isValidDocumentCoordinate(chunk.coordinate.citationTag),
		"Coordinate pattern regex MUST accept filenames containing brackets and commas",
	);
});

// ---------------------------------------------------------------------------
// 3. COORDINATE INJECTION, TAMPERING & SUBSTRING VULNERABILITY
// ---------------------------------------------------------------------------

test("Adversarial 3.1: Substring Collision Vulnerability in DocumentIngestionService.verifyCitation", async () => {
	const service = new DocumentIngestionService();

	// Ingest a small document with only Line 1 and Line 2
	await service.ingest({
		filename: "SingleRule.csv",
		content: "RuleID,Action\nR-01,ALLOW_ONLY_SEC",
	});

	// Line 1 and Line 2 exist. Line 100, Line 1000, Line 199999 DO NOT EXIST.
	const chunks = service.getAllChunks();
	assert.equal(chunks.length, 2); // Line 1 (header), Line 2 (data)

	// CHALLENGE A: Out-of-bounds coordinate Line 100
	const fakeLine100 = service.verifyCitation("[SingleRule.csv, Line 100]");

	// CHALLENGE B: Fake line with massive out-of-bounds index
	const fakeLine199999 = service.verifyCitation("[SingleRule.csv, Line 199999]");

	// CHALLENGE C: Naked substring inputs like "csv" or "line"
	const bareCsv = service.verifyCitation("csv");
	const bareLine = service.verifyCitation("line");
	const emptyString = service.verifyCitation("");

	// Valid line 1 and 2
	const validLine1 = service.verifyCitation("[SingleRule.csv, Line 1]");
	const validLine2 = service.verifyCitation("[SingleRule.csv, Line 2]");

	console.log("Remediation Diagnostic - Fake Line 100 verified:", fakeLine100.verified);
	console.log("Remediation Diagnostic - Fake Line 199999 verified:", fakeLine199999.verified);
	console.log("Remediation Diagnostic - Bare 'csv' verified:", bareCsv.verified);
	console.log("Remediation Diagnostic - Empty string '' verified:", emptyString.verified);

	// Strict verification: out-of-bounds line numbers and bare substrings MUST NOT verify
	assert.equal(fakeLine100.verified, false, "Fake Line 100 must not be verified (no substring collision)");
	assert.equal(fakeLine199999.verified, false, "Fake Line 199999 must not be verified");
	assert.equal(bareCsv.verified, false, "Bare 'csv' must not be verified");
	assert.equal(bareLine.verified, false, "Bare 'line' must not be verified");
	assert.equal(emptyString.verified, false, "Empty string must not be verified");

	// Legitimate lines MUST verify
	assert.equal(validLine1.verified, true);
	assert.equal(validLine2.verified, true);
});

test("Adversarial 3.2: XLSX Plaintext Fallback Modulo Coordinate Collision", () => {
	// When XLSX parsing falls back to plaintext (non-ZIP buffer), multi-letter column conversion
	// ensures columns > 26 do not wrap modulo 26 or collide with A1
	const wideTable = [
		// 28 columns (0 through 27)
		Array.from({ length: 28 }, (_, i) => `Val_${i}`).join(","),
	].join("\n");

	const { chunks } = parseXlsxDocument("WideTable.xlsx", "doc_wide", Buffer.from(wideTable, "utf8"));

	// Find chunk for col 0 (colLetter A) and col 26 (colLetter AA)
	const a1Chunks = chunks.filter((c) => c.coordinate.cellCoordinate === "A1");
	assert.equal(
		a1Chunks.length,
		1,
		"Col 0 must produce coordinate A1 and must not collide with Col 26",
	);

	const aa1Chunks = chunks.filter((c) => c.coordinate.cellCoordinate === "AA1");
	assert.equal(
		aa1Chunks.length,
		1,
		"Col 26 must produce coordinate AA1 using standard multi-letter column conversion",
	);

	const ab1Chunks = chunks.filter((c) => c.coordinate.cellCoordinate === "AB1");
	assert.equal(
		ab1Chunks.length,
		1,
		"Col 27 must produce coordinate AB1",
	);
});

test("Adversarial 3.3: Coordinate Injection Attacks (SQL & Script Injections)", () => {
	// Attack payloads injected into coordinate tags
	const sqlInjection = "[Policy.csv, Line 1; DROP TABLE users; --]";
	const scriptInjection = "[Policy.xlsx, Sheet1!<script>alert(1)</script>]";
	const pathTraversal = "[../../../../etc/passwd, Line 1]";
	const negativeLine = "[Policy.csv, Line -5]";
	const floatLine = "[Policy.csv, Line 1.5]";

	// All of these MUST be rejected by isValidDocumentCoordinate
	assert.equal(isValidDocumentCoordinate(sqlInjection), false, "SQL injection in coordinate must be rejected");
	assert.equal(isValidDocumentCoordinate(scriptInjection), false, "Script injection in coordinate must be rejected");
	assert.equal(isValidDocumentCoordinate(negativeLine), false, "Negative line number must be rejected");
	assert.equal(isValidDocumentCoordinate(floatLine), false, "Float line number must be rejected");

	// Path traversal filename: regex matches, but document repository must not resolve it
	const service = new DocumentIngestionService();
	const traversalCheck = service.verifyCitation(pathTraversal);
	assert.equal(traversalCheck.verified, false, "Path traversal citation must not resolve in empty repository");
});

// ---------------------------------------------------------------------------
// 4. RIVAL CHALLENGER EPISTEMIC TRIGGERS & VERIFICATION GAPS
// ---------------------------------------------------------------------------

test("Adversarial 4.1: RivalChallenger catches malformed coordinate syntax", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.9 }),
	});

	const malformedMsg: AgentMessage = {
		id: "msg_malformed_coord",
		fromSeat: "FactChecker",
		toSeat: "all",
		type: "proposal",
		confidence: 0.9,
		round: 1,
		timestamp: Date.now(),
		content: "Policy requires encryption.",
		structured: {
			position: "Policy requires encryption.",
			confidenceSelf: 0.9,
			confidence_self: 0.9,
			confidenceExpertAgreement: 0.9,
			confidence_expert_agreement: 0.9,
			evidence: ["[Doc.pdf, Page 1]"], // Missing chunk number
			caveats: [],
		},
	};

	const triggers = challenger.scanForTriggers({
		messages: [malformedMsg],
		evidenceContext: "Standard evidence context",
		round: 1,
		inquiryScore: 5,
	});

	const invalidTrigger = triggers.find((t) => t.type === "invalid_coordinate_citation");
	assert.ok(invalidTrigger, "invalid_coordinate_citation trigger must fire on [Doc.pdf, Page 1]");
	assert.equal(invalidTrigger?.severity, "high");
});

test("Adversarial 4.2: RivalChallenger catches missing coordinates on policy claims", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.9 }),
	});

	const missingCoordMsg: AgentMessage = {
		id: "msg_missing_coord",
		fromSeat: "CloudArchitect",
		toSeat: "all",
		type: "proposal",
		confidence: 0.85,
		round: 1,
		timestamp: Date.now(),
		content: "The compliance policy matrix dictates restricted access.",
		structured: {
			position: "The compliance policy matrix dictates restricted access.",
			confidenceSelf: 0.85,
			confidence_self: 0.85,
			confidenceExpertAgreement: 0.8,
			confidence_expert_agreement: 0.8,
			evidence: ["Internal architectural standard"], // Missing coordinate tag
			caveats: [],
		},
	};

	const docEvidenceContext = [
		"Enterprise Compliance & Document Evidence Repository:",
		"- [Matrix.xlsx, Rules!A1]: Restricted access",
	].join("\n");

	const triggers = challenger.scanForTriggers({
		messages: [missingCoordMsg],
		evidenceContext: docEvidenceContext,
		round: 1,
		inquiryScore: 5,
	});

	const missingTrigger = triggers.find((t) => t.type === "missing_document_coordinate");
	assert.ok(missingTrigger, "missing_document_coordinate trigger must fire");
	assert.equal(missingTrigger?.targetSeat, "CloudArchitect");
});

test("Adversarial 4.3: Epistemic Gap Analysis — Fabricated Coordinates Bypass scanForTriggers", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.9 }),
	});

	// Agent fabricates a syntactically valid coordinate from a completely non-existent document
	const fabricatedMsg: AgentMessage = {
		id: "msg_fabricated",
		fromSeat: "FactChecker",
		toSeat: "all",
		type: "proposal",
		confidence: 0.95,
		round: 1,
		timestamp: Date.now(),
		content: "The compliance policy explicitly permits public export.",
		structured: {
			position: "The compliance policy explicitly permits public export.",
			confidenceSelf: 0.95,
			confidence_self: 0.95,
			confidenceExpertAgreement: 0.9,
			confidence_expert_agreement: 0.9,
			// Syntactically valid coordinate, but completely hallucinated document and line
			evidence: ["[CompletelyFakeSecretPolicy.csv, Line 99999]"],
			caveats: [],
		},
	};

	const docEvidenceContext = [
		"Enterprise Compliance & Document Evidence Repository:",
		"- [RealPolicy.csv, Line 1]: Prohibits public export",
	].join("\n");

	const triggers = challenger.scanForTriggers({
		messages: [fabricatedMsg],
		evidenceContext: docEvidenceContext,
		round: 1,
		inquiryScore: 5,
	});

	// Check if scanForTriggers caught the fake coordinate
	const caughtFake = triggers.some(
		(t) => t.type === "invalid_coordinate_citation" || t.type === "missing_document_coordinate",
	);

	console.log("Epistemic Verification Diagnostic - Fabricated coordinate caught by scanForTriggers:", caughtFake);

	assert.equal(
		caughtFake,
		true,
		"scanForTriggers must catch fabricated coordinate [CompletelyFakeSecretPolicy.csv, Line 99999] when repository is active",
	);

	const fakeTrigger = triggers.find((t) => t.type === "invalid_coordinate_citation");
	assert.ok(fakeTrigger, "invalid_coordinate_citation trigger must fire on non-existent coordinate");
	assert.equal(fakeTrigger?.severity, "high");
	assert.match(fakeTrigger?.description ?? "", /non-existent or ungrounded document coordinate/);

	// However, verifyCoordinateCitation DOES catch it when passed the available coordinates:
	const strictCheck = challenger.verifyCoordinateCitation(
		"[CompletelyFakeSecretPolicy.csv, Line 99999]",
		["[RealPolicy.csv, Line 1]"],
	);
	assert.equal(strictCheck.valid, false);
	assert.match(strictCheck.reason ?? "", /not found in available document index/);
});
