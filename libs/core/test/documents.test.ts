/**
 * documents.test.ts
 *
 * Verifies Requirement R3 (F18, F19):
 * - Multi-format parsing for CSV (Line N), XLSX (Sheet!Cell), and PDF (Page P, Chunk C)
 * - Coordinate generation and precision grounding
 * - Coordinate search and verification in DocumentIngestionService
 * - RivalChallenger epistemic triggers for document coordinate citations
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

// Helper to construct a minimal valid OpenXML .xlsx ZIP buffer
function createMockXlsxBuffer(sheetName: string, cellCoord: string, cellValue: string): Buffer {
	// Construct minimal OpenXML XML files
	const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets>
    <sheet name="${sheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

	const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">
  <si><t>${cellValue}</t></si>
</sst>`;

	const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="${cellCoord}" t="s"><v>0</v></c>
    </row>
  </sheetData>
</worksheet>`;

	const files = [
		{ name: "xl/workbook.xml", content: Buffer.from(workbookXml, "utf8") },
		{ name: "xl/sharedStrings.xml", content: Buffer.from(sharedStringsXml, "utf8") },
		{ name: "xl/worksheets/sheet1.xml", content: Buffer.from(worksheetXml, "utf8") },
	];

	// Create zip archive with stored (uncompressed) entries
	const parts: Buffer[] = [];
	for (const file of files) {
		const nameBuf = Buffer.from(file.name, "utf8");
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0); // Local file header signature
		header.writeUInt16LE(20, 4);        // Version needed
		header.writeUInt16LE(0, 6);         // General flag
		header.writeUInt16LE(0, 8);         // Compression: 0 = Stored
		header.writeUInt16LE(0, 10);        // Mod time
		header.writeUInt16LE(0, 12);        // Mod date
		header.writeUInt32LE(0, 14);        // CRC32
		header.writeUInt32LE(file.content.length, 18); // Compressed size
		header.writeUInt32LE(file.content.length, 22); // Uncompressed size
		header.writeUInt16LE(nameBuf.length, 26);      // Filename length
		header.writeUInt16LE(0, 28);                   // Extra field length

		parts.push(header, nameBuf, file.content);
	}

	return Buffer.concat(parts);
}

// Helper to construct a minimal valid PDF buffer with text stream
function createMockPdfBuffer(pages: string[]): Buffer {
	const parts: string[] = ["%PDF-1.4\n"];

	for (let i = 0; i < pages.length; i++) {
		const pageText = pages[i];
		// Build standard PDF page and content stream
		const streamContent = `BT /F1 12 Tf 72 712 Td (${pageText}) Tj ET`;
		const streamBuf = Buffer.from(streamContent, "utf8");
		const deflated = zlib.deflateSync(streamBuf);

		parts.push(
			`\n<< /Type /Page /Parent 1 0 R >>\n`,
			`<< /Length ${deflated.length} /Filter /FlateDecode >>\nstream\r\n`,
			deflated.toString("latin1"),
			`\r\nendstream\n`,
		);
	}

	parts.push("%%EOF\n");
	return Buffer.from(parts.join(""), "latin1");
}

test("CSV Parser: extracts line coordinates and formats header-value pairs", () => {
	const csvText = [
		"VendorID,VendorName,RiskTier,ComplianceStatus",
		"V-101,Acme Cloud,Tier 1,Compliant",
		"V-102,Beta Analytics,Tier 3,Pending Audit",
		"V-103,Omega Data Lake,Tier 2,Non-Compliant",
	].join("\n");

	const { chunks, lineCount } = parseCsvDocument("VendorRiskRegistry.csv", "doc_csv_1", csvText);

	assert.equal(lineCount, 4);
	assert.equal(chunks.length, 4);

	// Line 1: Header
	assert.equal(chunks[0].coordinate.coordinateString, "Line 1");
	assert.equal(chunks[0].coordinate.citationTag, "[VendorRiskRegistry.csv, Line 1]");

	// Line 2: First data line with mapped header columns
	assert.equal(chunks[1].coordinate.lineNumber, 2);
	assert.equal(chunks[1].coordinate.coordinateString, "Line 2");
	assert.equal(chunks[1].coordinate.citationTag, "[VendorRiskRegistry.csv, Line 2]");
	assert.match(chunks[1].text, /VendorID: V-101/);
	assert.match(chunks[1].text, /RiskTier: Tier 1/);

	// Line 4:
	assert.equal(chunks[3].coordinate.citationTag, "[VendorRiskRegistry.csv, Line 4]");
	assert.match(chunks[3].text, /Omega Data Lake/);
});

test("CSV Parser: handles RFC 4180 quoted fields and commas", () => {
	const csvText = [
		'ID,Description,Notes',
		'1,"High risk, requires audit","Approved by CISO on 2024-10-12"',
	].join('\n');

	const { chunks } = parseCsvDocument("AuditLog.csv", "doc_csv_2", csvText);
	assert.equal(chunks.length, 2);
	assert.match(chunks[1].coordinate.contentSnippet, /High risk, requires audit/);
	assert.equal(chunks[1].coordinate.citationTag, "[AuditLog.csv, Line 2]");
});

test("XLSX Parser: extracts sheet name and exact cell coordinates [Sheet!Cell]", () => {
	const xlsxBuf = createMockXlsxBuffer("AccessMatrix", "B14", "DENY_EXTERNAL_ACCESS_POLICY_V2");

	const { chunks, sheetNames, cellCount } = parseXlsxDocument("PolicyMatrix.xlsx", "doc_xlsx_1", xlsxBuf);

	assert.ok(sheetNames.includes("AccessMatrix"));
	assert.ok(cellCount >= 1);

	const b14Chunk = chunks.find((c) => c.coordinate.cellCoordinate === "B14");
	assert.ok(b14Chunk, "Chunk for cell B14 must exist");
	assert.equal(b14Chunk?.coordinate.sheetName, "AccessMatrix");
	assert.equal(b14Chunk?.coordinate.coordinateString, "AccessMatrix!B14");
	assert.equal(b14Chunk?.coordinate.citationTag, "[PolicyMatrix.xlsx, AccessMatrix!B14]");
	assert.match(b14Chunk?.text ?? "", /DENY_EXTERNAL_ACCESS_POLICY_V2/);

	// Test fallback multi-letter columns (A..Z, AA..ZZ)
	const wideTable = Array.from({ length: 28 }, (_, i) => `Col_${i}`).join(",") + "\n";
	const fallbackResult = parseXlsxDocument("Wide.xlsx", "doc_wide_fb", Buffer.from(wideTable, "utf8"));
	const a1 = fallbackResult.chunks.find((c) => c.coordinate.cellCoordinate === "A1");
	const aa1 = fallbackResult.chunks.find((c) => c.coordinate.cellCoordinate === "AA1");
	const ab1 = fallbackResult.chunks.find((c) => c.coordinate.cellCoordinate === "AB1");
	assert.ok(a1, "A1 must exist for column 0");
	assert.ok(aa1, "AA1 must exist for column 26");
	assert.ok(ab1, "AB1 must exist for column 27");
});

test("PDF Parser: extracts text chunked by page and paragraph [Page P, Chunk C]", () => {
	const pdfBuf = createMockPdfBuffer([
		"Page 1: NIST SP 800-53 Access Control Policy requires multi-factor authentication.",
		"Page 2: Cryptographic audit trails must be HMAC-SHA256 chained and tamper-evident.",
	]);

	const { chunks, pageCount } = parsePdfDocument("NIST_SP800-53.pdf", "doc_pdf_1", pdfBuf);

	assert.ok(pageCount >= 2);
	assert.ok(chunks.length >= 2);

	const p1Chunk = chunks.find((c) => c.coordinate.pageNumber === 1);
	assert.ok(p1Chunk);
	assert.equal(p1Chunk?.coordinate.coordinateString, "Page 1, Chunk 1");
	assert.equal(p1Chunk?.coordinate.citationTag, "[NIST_SP800-53.pdf, Page 1, Chunk 1]");
	assert.match(p1Chunk?.text ?? "", /NIST SP 800-53/);

	const p2Chunk = chunks.find((c) => c.coordinate.pageNumber === 2);
	assert.ok(p2Chunk);
	assert.equal(p2Chunk?.coordinate.coordinateString, "Page 2, Chunk 1");
	assert.equal(p2Chunk?.coordinate.citationTag, "[NIST_SP800-53.pdf, Page 2, Chunk 1]");
	assert.match(p2Chunk?.text ?? "", /HMAC-SHA256 chained/);
});

test("DocumentIngestionService: ingests multiple document formats and builds unified index", async () => {
	const service = new DocumentIngestionService();

	// Ingest CSV
	const csvRes = await service.ingest({
		filename: "AccessRules.csv",
		content: "RuleID,Action,Target\nR-101,ALLOW,SEC_DATA\nR-102,DENY,NY_TAXI.customers",
	});
	assert.equal(csvRes.format, "csv");
	assert.equal(csvRes.totalChunks, 3);

	// Ingest XLSX
	const xlsxBuf = createMockXlsxBuffer("Rules", "C5", "RESTRICTED_PII_TABLE");
	const xlsxRes = await service.ingest({
		filename: "DataClass.xlsx",
		content: xlsxBuf,
	});
	assert.equal(xlsxRes.format, "xlsx");

	// Ingest PDF
	const pdfBuf = createMockPdfBuffer(["Federal Information Security Modernization Act Section 4"]);
	const pdfRes = await service.ingest({
		filename: "FISMA.pdf",
		content: pdfBuf,
	});
	assert.equal(pdfRes.format, "pdf");

	// Verify all chunks registered
	const allChunks = service.getAllChunks();
	assert.ok(allChunks.length >= 5);

	// Keyword search
	const searchResults = service.search("NY_TAXI");
	assert.ok(searchResults.length > 0);
	assert.match(searchResults[0].text, /NY_TAXI\.customers/);

	// Citation verification
	const verifyCsv = service.verifyCitation("[AccessRules.csv, Line 2]");
	assert.equal(verifyCsv.verified, true);
	assert.ok(verifyCsv.chunk);

	const verifyXlsx = service.verifyCitation("[DataClass.xlsx, Rules!C5]");
	assert.equal(verifyXlsx.verified, true);

	const verifyMissing = service.verifyCitation("[NonExistent.pdf, Page 99, Chunk 1]");
	assert.equal(verifyMissing.verified, false);

	// Out-of-bounds lines and bare substrings must not verify
	const verifyFakeLine = service.verifyCitation("[AccessRules.csv, Line 200]");
	assert.equal(verifyFakeLine.verified, false);

	const verifyBareCsv = service.verifyCitation("csv");
	assert.equal(verifyBareCsv.verified, false);

	const verifyEmpty = service.verifyCitation("");
	assert.equal(verifyEmpty.verified, false);
});

test("DocumentIngestionService: formats evidence context for deliberation agents", async () => {
	const service = new DocumentIngestionService();
	await service.ingest({
		filename: "Policy.csv",
		content: "Section,Requirement\n1.1,Dual-authorization required for production exports",
	});

	const context = service.formatEvidenceContext();
	assert.match(context, /Enterprise Compliance & Document Evidence Repository/);
	assert.match(context, /\[Policy\.csv, Line 2\]/);
	assert.match(context, /Dual-authorization required/);
});

test("RivalChallenger: coordinate regex validation", () => {
	assert.ok(isValidDocumentCoordinate("[VendorRisk.csv, Line 42]"));
	assert.ok(isValidDocumentCoordinate("[PolicyMatrix.xlsx, Sheet1!B14]"));
	assert.ok(isValidDocumentCoordinate("[PolicyMatrix.xlsx, AccessRules!A1:D10]"));
	assert.ok(isValidDocumentCoordinate("[NIST_SP800-53.pdf, Page 2, Chunk 1]"));

	// Invalid / malformed coordinates
	assert.equal(isValidDocumentCoordinate("[VendorRisk.csv]"), false);
	assert.equal(isValidDocumentCoordinate("[PolicyMatrix.xlsx, B14]"), false); // missing sheet
	assert.equal(isValidDocumentCoordinate("[Policy.pdf, Page 2]"), false); // missing chunk
	assert.equal(isValidDocumentCoordinate("Just a random string"), false);
});

test("RivalChallenger: triggers invalid_coordinate_citation on malformed citations", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.9 }),
	});

	const malformedMsg: AgentMessage = {
		id: "msg_1",
		fromSeat: "FactChecker",
		toSeat: "all",
		type: "proposal",
		confidence: 0.85,
		round: 1,
		timestamp: Date.now(),
		content: "Based on Policy.pdf, we should deny access.",
		structured: {
			position: "Based on Policy.pdf, we should deny access.",
			confidenceSelf: 0.85,
			confidence_self: 0.85,
			confidenceExpertAgreement: 0.8,
			confidence_expert_agreement: 0.8,
			evidence: ["[Policy.pdf, Page 2]"], // Malformed: missing Chunk number
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
	assert.ok(invalidTrigger, "Should fire invalid_coordinate_citation trigger");
	assert.equal(invalidTrigger?.targetSeat, "FactChecker");
	assert.match(invalidTrigger?.description ?? "", /malformed or invalid document coordinate/);

	// Test fabricated coordinate citation when document repository is active
	const fakeMsg: AgentMessage = {
		id: "msg_fake_doc",
		fromSeat: "FactChecker",
		toSeat: "all",
		type: "proposal",
		confidence: 0.9,
		round: 1,
		timestamp: Date.now(),
		content: "The policy allows public download.",
		structured: {
			position: "The policy allows public download.",
			confidenceSelf: 0.9,
			confidence_self: 0.9,
			confidenceExpertAgreement: 0.9,
			confidence_expert_agreement: 0.9,
			evidence: ["[NonExistentDoc.csv, Line 9999]"],
			caveats: [],
		},
	};

	const fakeTriggers = challenger.scanForTriggers({
		messages: [fakeMsg],
		evidenceContext: "Enterprise Compliance & Document Evidence Repository:\n- [RealDoc.csv, Line 1]: Prohibits public download",
		round: 1,
		inquiryScore: 5,
	});

	const fakeCoordTrigger = fakeTriggers.find((t) => t.type === "invalid_coordinate_citation");
	assert.ok(fakeCoordTrigger, "Should fire invalid_coordinate_citation for fabricated coordinate");
	assert.match(fakeCoordTrigger?.description ?? "", /non-existent or ungrounded document coordinate/);
});

test("RivalChallenger: triggers missing_document_coordinate when document claims lack coordinates", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.9 }),
	});

	const missingCoordMsg: AgentMessage = {
		id: "msg_2",
		fromSeat: "CloudArchitect",
		toSeat: "all",
		type: "proposal",
		confidence: 0.8,
		round: 1,
		timestamp: Date.now(),
		content: "The compliance policy matrix requires strict firewall boundaries.",
		structured: {
			position: "The compliance policy matrix requires strict firewall boundaries.",
			confidenceSelf: 0.8,
			confidence_self: 0.8,
			confidenceExpertAgreement: 0.8,
			confidence_expert_agreement: 0.8,
			evidence: ["General security best practice"], // Missing exact coordinate citation
			caveats: [],
		},
	};

	const docEvidenceContext = [
		"Enterprise Compliance & Document Evidence Repository:",
		"- [PolicyMatrix.xlsx, Sheet1!B14]: Firewalls required",
	].join("\n");

	const triggers = challenger.scanForTriggers({
		messages: [missingCoordMsg],
		evidenceContext: docEvidenceContext,
		round: 1,
		inquiryScore: 5,
	});

	const missingTrigger = triggers.find((t) => t.type === "missing_document_coordinate");
	assert.ok(missingTrigger, "Should fire missing_document_coordinate trigger");
	assert.equal(missingTrigger?.targetSeat, "CloudArchitect");
});

test("RivalChallenger: verifyCoordinateCitation epistemic helper", () => {
	const challenger = new RivalChallenger({
		complete: async () => ({ content: "{}", confidence: 0.9 }),
	});

	// Valid format and in index
	const valid = challenger.verifyCoordinateCitation(
		"[Policy.csv, Line 42]",
		["[Policy.csv, Line 42]", "[Rules.xlsx, Sheet1!A1]"],
	);
	assert.equal(valid.valid, true);
	assert.equal(valid.format, "csv");

	// Valid format but missing from index
	const missingFromIndex = challenger.verifyCoordinateCitation(
		"[Policy.csv, Line 99]",
		["[Policy.csv, Line 42]"],
	);
	assert.equal(missingFromIndex.valid, false);
	assert.match(missingFromIndex.reason ?? "", /not found in available document index/);

	// Malformed syntax
	const malformed = challenger.verifyCoordinateCitation("Policy.csv Line 42");
	assert.equal(malformed.valid, false);
	assert.match(malformed.reason ?? "", /Malformed coordinate syntax/);
});
