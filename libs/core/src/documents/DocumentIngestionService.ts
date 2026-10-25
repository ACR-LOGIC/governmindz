/**
 * DocumentIngestionService.ts
 *
 * Implements Requirement R3 (F18, F19): Multi-format enterprise document evidence ingestion
 * supporting CSV, XLSX, and PDF formats for compliance and governance reviews.
 *
 * Coordinates:
 * - CSV: [Filename.csv, Line N]
 * - XLSX: [Filename.xlsx, SheetName!CellCoordinate]
 * - PDF: [Filename.pdf, Page P, Chunk C]
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
// @ts-ignore
import zlib from "node:zlib";

export type DocumentFormat = "csv" | "xlsx" | "pdf" | "txt" | "md" | "unknown";

export interface DocumentFileInput {
	id?: string;
	filename: string;
	content?: Buffer | string;
	dataUrl?: string;
	filePath?: string;
	mimeType?: string;
	size?: number;
}

export interface DocumentCitationCoordinate {
	documentId: string;
	filename: string;
	format: DocumentFormat;
	coordinateString: string; // e.g. "Line 42" | "Sheet1!B14" | "Page 2, Chunk 1"
	citationTag: string; // e.g. "[VendorRisk.csv, Line 42]" | "[PolicyMatrix.xlsx, Sheet1!B14]" | "[NIST.pdf, Page 2, Chunk 1]"
	pageNumber?: number;
	chunkIndex?: number;
	sheetName?: string;
	cellCoordinate?: string;
	lineNumber?: number;
	contentSnippet: string;
}

export interface DocumentEvidenceChunk {
	id: string;
	documentId: string;
	filename: string;
	format: DocumentFormat;
	coordinate: DocumentCitationCoordinate;
	text: string;
	charCount: number;
	tokenEstimate: number;
}

export interface ParsedDocumentResult {
	documentId: string;
	filename: string;
	format: DocumentFormat;
	sha256: string;
	totalChunks: number;
	chunks: DocumentEvidenceChunk[];
	metadata: {
		pageCount?: number;
		lineCount?: number;
		sheetNames?: string[];
		cellCount?: number;
		fileSizeBytes: number;
	};
}

// ---------------------------------------------------------------------------
// Helper: Minimal ZIP archive extractor for OpenXML .xlsx files
// ---------------------------------------------------------------------------
interface ZipEntry {
	path: string;
	data: Buffer;
}

function findZipSignature(buf: any, start: number): number {
	for (let i = start; i <= buf.length - 4; i++) {
		if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) {
			return i;
		}
	}
	return -1;
}

function extractZipEntries(buffer: any): ZipEntry[] {
	const entries: ZipEntry[] = [];
	let offset = 0;

	while (offset + 30 <= buffer.length) {
		const sig = buffer.readUInt32LE(offset);
		if (sig !== 0x04034b50) {
			const nextSig = findZipSignature(buffer, offset + 1);
			if (nextSig === -1) break;
			offset = nextSig;
			continue;
		}

		const compression = buffer.readUInt16LE(offset + 8);
		const compressedSize = buffer.readUInt32LE(offset + 18);
		const uncompressedSize = buffer.readUInt32LE(offset + 22);
		const fileNameLength = buffer.readUInt16LE(offset + 26);
		const extraFieldLength = buffer.readUInt16LE(offset + 28);

		const headerEnd = offset + 30;
		const nameEnd = headerEnd + fileNameLength;
		if (nameEnd > buffer.length) break;

		const fileName = (Buffer as any).from(buffer.subarray(headerEnd, nameEnd)).toString("utf8");
		const dataStart = nameEnd + extraFieldLength;
		const dataEnd = dataStart + compressedSize;
		if (dataEnd > buffer.length) break;

		const compressedData: any = buffer.subarray(dataStart, dataEnd);
		let decompressedData: any;

		if (compression === 0) {
			decompressedData = (Buffer as any).from(compressedData);
		} else if (compression === 8) {
			try {
				decompressedData = zlib.inflateRawSync(compressedData);
			} catch {
				try {
					decompressedData = zlib.inflateSync(compressedData);
				} catch {
					decompressedData = (Buffer as any).alloc(0);
				}
			}
		} else {
			decompressedData = (Buffer as any).alloc(0);
		}

		if (decompressedData.length > 0) {
			entries.push({ path: fileName, data: decompressedData });
		}

		offset = dataEnd;
	}

	return entries;
}

// ---------------------------------------------------------------------------
// CSV Parser: RFC 4180 line numbered chunking
// ---------------------------------------------------------------------------
export function parseCsvDocument(
	filename: string,
	documentId: string,
	rawText: string,
): { chunks: DocumentEvidenceChunk[]; lineCount: number } {
	const lines = rawText.split(/\r?\n/);
	const chunks: DocumentEvidenceChunk[] = [];
	let headerColumns: string[] = [];

	if (lines.length > 0 && lines[0].trim()) {
		headerColumns = parseCsvLine(lines[0]);
	}

	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1;
		const rawLine = lines[i].trim();
		if (!rawLine) continue;

		let formattedSnippet = rawLine;
		if (i > 0 && headerColumns.length > 0) {
			const values = parseCsvLine(rawLine);
			const paired = values.map((val, idx) => {
				const col = headerColumns[idx] ?? `Col${idx + 1}`;
				return `${col}: ${val}`;
			});
			formattedSnippet = paired.join(" | ");
		}

		const coordString = `Line ${lineNum}`;
		const tag = `[${filename}, ${coordString}]`;

		chunks.push({
			id: `${documentId}_line_${lineNum}`,
			documentId,
			filename,
			format: "csv",
			coordinate: {
				documentId,
				filename,
				format: "csv",
				coordinateString: coordString,
				citationTag: tag,
				lineNumber: lineNum,
				contentSnippet: formattedSnippet.slice(0, 300),
			},
			text: `${tag}: ${formattedSnippet}`,
			charCount: formattedSnippet.length,
			tokenEstimate: Math.ceil(formattedSnippet.length / 4),
		});
	}

	return { chunks, lineCount: lines.length };
}

function parseCsvLine(line: string): string[] {
	const values: string[] = [];
	let current = "";
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i += 2;
				continue;
			}
			inQuotes = !inQuotes;
		} else if (char === "," && !inQuotes) {
			values.push(current.trim());
			current = "";
		} else {
			current += char;
		}
		i++;
	}
	values.push(current.trim());
	return values;
}

/**
 * Converts a 0-indexed column number to standard Excel column letters (A..Z, AA..ZZ, etc.).
 */
export function getExcelColumnName(colIndex: number): string {
	let dividend = colIndex + 1;
	let colName = "";
	while (dividend > 0) {
		const modulo = (dividend - 1) % 26;
		colName = String.fromCharCode(65 + modulo) + colName;
		dividend = Math.floor((dividend - modulo) / 26);
	}
	return colName;
}

/**
 * Normalizes a citation tag or coordinate string for canonical exact matching.
 */
export function normalizeCitationTag(tag: string): string {
	return tag
		.trim()
		.toLowerCase()
		.replace(/\s*,\s*/g, ", ")
		.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// XLSX Parser: OpenXML ZIP cell coordinates [Sheet!Cell]
// ---------------------------------------------------------------------------
export function parseXlsxDocument(
	filename: string,
	documentId: string,
	buffer: Buffer,
): { chunks: DocumentEvidenceChunk[]; sheetNames: string[]; cellCount: number } {
	const chunks: DocumentEvidenceChunk[] = [];
	const sheetNames: string[] = [];
	let cellCount = 0;

	// 1. Extract ZIP entries
	const entries = extractZipEntries(buffer);
	const entryMap = new Map<string, Buffer>(entries.map((e) => [e.path, e.data]));

	// 2. Parse Shared Strings: xl/sharedStrings.xml
	const sharedStrings: string[] = [];
	const sstData = entryMap.get("xl/sharedStrings.xml") ?? entryMap.get("xl/sharedstrings.xml");
	if (sstData) {
		const xml = sstData.toString("utf8");
		const matches = xml.matchAll(/<si>(?:(?!<\/si>).)*?<t[^>]*>([\s\S]*?)<\/t>/gi);
		for (const m of matches) {
			sharedStrings.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
		}
	}

	// 3. Parse Workbook for sheet names: xl/workbook.xml
	const wbData = entryMap.get("xl/workbook.xml");
	if (wbData) {
		const xml = wbData.toString("utf8");
		const matches = xml.matchAll(/<sheet[^>]+name="([^"]+)"[^>]+sheetId="([^"]+)"/gi);
		for (const m of matches) {
			sheetNames.push(m[1]);
		}
	}
	if (sheetNames.length === 0) sheetNames.push("Sheet1");

	// 4. Parse Worksheets: xl/worksheets/sheet*.xml
	let sheetIndex = 0;
	for (const [entryPath, data] of entryMap.entries()) {
		if (/xl\/worksheets\/sheet\d+\.xml/i.test(entryPath)) {
			const sheetName = sheetNames[sheetIndex] || `Sheet${sheetIndex + 1}`;
			sheetIndex++;
			const xml = data.toString("utf8");

			// Match cell: <c r="B14" t="s"><v>0</v></c> or <c r="A1"><v>123</v></c>
			const cellMatches = xml.matchAll(/<c\s+r="([A-Z]+[0-9]+)"(?:[^>]*t="([a-z]+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>/gi);

			for (const m of cellMatches) {
				const cellCoord = m[1];
				const cellType = m[2];
				const valRaw = m[3] ?? m[4] ?? "";

				let cellValue = valRaw.trim();
				if (cellType === "s") {
					const idx = parseInt(valRaw, 10);
					if (!isNaN(idx) && idx < sharedStrings.length) {
						cellValue = sharedStrings[idx];
					}
				}

				if (!cellValue) continue;
				cellCount++;

				const coordString = `${sheetName}!${cellCoord}`;
				const tag = `[${filename}, ${coordString}]`;
				const snippet = `${coordString}: ${cellValue}`;

				chunks.push({
					id: `${documentId}_${coordString.replace(/[^A-Za-z0-9]/g, "_")}`,
					documentId,
					filename,
					format: "xlsx",
					coordinate: {
						documentId,
						filename,
						format: "xlsx",
						coordinateString: coordString,
						citationTag: tag,
						sheetName,
						cellCoordinate: cellCoord,
						contentSnippet: snippet.slice(0, 300),
					},
					text: `${tag}: ${cellValue}`,
					charCount: snippet.length,
					tokenEstimate: Math.ceil(snippet.length / 4),
				});
			}
		}
	}

	// Fallback if not an OpenXML zip or no cells parsed (e.g. plain text table mock)
	if (chunks.length === 0) {
		const text = buffer.toString("utf8");
		const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
		for (let r = 0; r < lines.length; r++) {
			const cols = lines[r].split(/[\t,;|]/);
			for (let c = 0; c < cols.length; c++) {
				const val = cols[c].trim();
				if (!val) continue;
				const colLetter = getExcelColumnName(c);
				const cellCoord = `${colLetter}${r + 1}`;
				const coordString = `Sheet1!${cellCoord}`;
				const tag = `[${filename}, ${coordString}]`;
				const snippet = `${coordString}: ${val}`;
				cellCount++;

				chunks.push({
					id: `${documentId}_${coordString.replace(/[^A-Za-z0-9]/g, "_")}`,
					documentId,
					filename,
					format: "xlsx",
					coordinate: {
						documentId,
						filename,
						format: "xlsx",
						coordinateString: coordString,
						citationTag: tag,
						sheetName: "Sheet1",
						cellCoordinate: cellCoord,
						contentSnippet: snippet,
					},
					text: `${tag}: ${val}`,
					charCount: snippet.length,
					tokenEstimate: Math.ceil(snippet.length / 4),
				});
			}
		}
	}

	return { chunks, sheetNames, cellCount };
}

// ---------------------------------------------------------------------------
// PDF Parser: Page and Paragraph extraction [Page P, Chunk C]
// ---------------------------------------------------------------------------
export function parsePdfDocument(
	filename: string,
	documentId: string,
	buffer: Buffer,
): { chunks: DocumentEvidenceChunk[]; pageCount: number } {
	const chunks: DocumentEvidenceChunk[] = [];
	const rawText = buffer.toString("latin1");

	// Extract stream contents
	const pageTexts: string[] = [];
	const streamMatches = rawText.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);

	for (const sm of streamMatches) {
		const streamRaw = Buffer.from(sm[1], "latin1");
		let uncompressed: string = "";

		try {
			uncompressed = zlib.inflateSync(streamRaw).toString("utf8");
		} catch {
			try {
				uncompressed = zlib.inflateRawSync(streamRaw).toString("utf8");
			} catch {
				uncompressed = streamRaw.toString("utf8");
			}
		}

		// Look for PDF text objects: BT ... ET
		const textBlocks: string[] = [];
		const btMatches = uncompressed.matchAll(/BT[\s\S]*?ET/g);
		for (const btm of btMatches) {
			const block = btm[0];
			// Matches strings in parentheses: (text) Tj or [(t1) (t2)] TJ
			const stringMatches = block.matchAll(/\(([^)]+)\)\s*(?:Tj|'|")/g);
			for (const stm of stringMatches) {
				textBlocks.push(stm[1]);
			}
			const arrayMatches = block.matchAll(/\[(.*?)\]\s*TJ/g);
			for (const arm of arrayMatches) {
				const innerStrings = arm[1].matchAll(/\(([^)]+)\)/g);
				for (const ism of innerStrings) {
					textBlocks.push(ism[1]);
				}
			}
		}

		if (textBlocks.length > 0) {
			pageTexts.push(textBlocks.join(" "));
		}
	}

	// If stream extraction produced no text, fallback to form feed or regex text extraction
	if (pageTexts.length === 0) {
		const fullStr = buffer.toString("utf8");
		// Split by form feeds \f or Page markers
		const pages = fullStr.split(/\f|---+\s*Page\s*\d+\s*---+/i).filter((p) => p.trim().length > 0);
		if (pages.length > 0) {
			pageTexts.push(...pages);
		} else {
			// Extract any readable text paragraphs
			pageTexts.push(fullStr);
		}
	}

	const pageCount = pageTexts.length;

	for (let pIdx = 0; pIdx < pageTexts.length; pIdx++) {
		const pageNum = pIdx + 1;
		const pageContent = pageTexts[pIdx].trim();
		if (!pageContent) continue;

		// Split page into paragraph chunks (split by double newline or ~200-300 words)
		const rawParagraphs = pageContent.split(/\r?\n\s*\r?\n/).filter((p) => p.trim().length > 0);
		const paragraphs: string[] = [];

		if (rawParagraphs.length > 0) {
			paragraphs.push(...rawParagraphs);
		} else {
			// Chunk by word count
			const words = pageContent.split(/\s+/);
			const chunkSize = 150;
			for (let w = 0; w < words.length; w += chunkSize) {
				paragraphs.push(words.slice(w, w + chunkSize).join(" "));
			}
		}

		for (let cIdx = 0; cIdx < paragraphs.length; cIdx++) {
			const chunkNum = cIdx + 1;
			const pText = paragraphs[cIdx].trim();
			if (!pText) continue;

			const coordString = `Page ${pageNum}, Chunk ${chunkNum}`;
			const tag = `[${filename}, ${coordString}]`;

			chunks.push({
				id: `${documentId}_p${pageNum}_c${chunkNum}`,
				documentId,
				filename,
				format: "pdf",
				coordinate: {
					documentId,
					filename,
					format: "pdf",
					coordinateString: coordString,
					citationTag: tag,
					pageNumber: pageNum,
					chunkIndex: chunkNum,
					contentSnippet: pText.slice(0, 300),
				},
				text: `${tag}: ${pText}`,
				charCount: pText.length,
				tokenEstimate: Math.ceil(pText.length / 4),
			});
		}
	}

	return { chunks, pageCount };
}

// ---------------------------------------------------------------------------
// DocumentIngestionService
// ---------------------------------------------------------------------------
export class DocumentIngestionService {
	private readonly documents: Map<string, ParsedDocumentResult> = new Map();
	private readonly chunksByTag: Map<string, DocumentEvidenceChunk> = new Map();
	private readonly allChunks: DocumentEvidenceChunk[] = [];

	detectFormat(filename: string, mimeType?: string): DocumentFormat {
		const dotIdx = filename.lastIndexOf(".");
		const ext = dotIdx !== -1 ? filename.slice(dotIdx + 1).toLowerCase() : "";
		if (ext === "csv") return "csv";
		if (ext === "xlsx" || ext === "xls") return "xlsx";
		if (ext === "pdf") return "pdf";
		if (ext === "txt") return "txt";
		if (ext === "md" || ext === "markdown") return "md";

		if (mimeType) {
			if (mimeType.includes("csv")) return "csv";
			if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xlsx";
			if (mimeType.includes("pdf")) return "pdf";
			if (mimeType.includes("text")) return "txt";
		}

		return "unknown";
	}

	async ingest(input: DocumentFileInput): Promise<ParsedDocumentResult> {
		let buffer: any;

		if (input.content) {
			buffer = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content;
		} else if (input.dataUrl) {
			const base64Index = input.dataUrl.indexOf(";base64,");
			if (base64Index !== -1) {
				const base64 = input.dataUrl.substring(base64Index + 8);
				buffer = Buffer.from(base64, "base64");
			} else {
				buffer = Buffer.from(input.dataUrl, "utf8");
			}
		} else if (input.filePath) {
			buffer = (Buffer as any).from(fs.readFileSync(input.filePath), "utf8");
		} else {
			buffer = (Buffer as any).alloc(0);
		}

		const contentString = typeof buffer.toString === "function" ? buffer.toString("binary") : String(buffer);
		const sha256 = createHash("sha256").update(contentString).digest("hex");
		const documentId = input.id || `doc_${sha256.slice(0, 12)}`;
		const format = this.detectFormat(input.filename, input.mimeType);

		let parsedChunks: DocumentEvidenceChunk[] = [];
		const metadata: ParsedDocumentResult["metadata"] = {
			fileSizeBytes: buffer.length,
		};

		if (format === "csv") {
			const res = parseCsvDocument(input.filename, documentId, buffer.toString("utf8"));
			parsedChunks = res.chunks;
			metadata.lineCount = res.lineCount;
		} else if (format === "xlsx") {
			const res = parseXlsxDocument(input.filename, documentId, buffer);
			parsedChunks = res.chunks;
			metadata.sheetNames = res.sheetNames;
			metadata.cellCount = res.cellCount;
		} else if (format === "pdf") {
			const res = parsePdfDocument(input.filename, documentId, buffer);
			parsedChunks = res.chunks;
			metadata.pageCount = res.pageCount;
		} else {
			// Fallback: generic text/markdown chunking
			const text = buffer.toString("utf8");
			const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
			metadata.lineCount = lines.length;
			for (let i = 0; i < lines.length; i++) {
				const lineNum = i + 1;
				const coordString = `Line ${lineNum}`;
				const tag = `[${input.filename}, ${coordString}]`;
				parsedChunks.push({
					id: `${documentId}_line_${lineNum}`,
					documentId,
					filename: input.filename,
					format,
					coordinate: {
						documentId,
						filename: input.filename,
						format,
						coordinateString: coordString,
						citationTag: tag,
						lineNumber: lineNum,
						contentSnippet: lines[i].slice(0, 300),
					},
					text: `${tag}: ${lines[i]}`,
					charCount: lines[i].length,
					tokenEstimate: Math.ceil(lines[i].length / 4),
				});
			}
		}

		const result: ParsedDocumentResult = {
			documentId,
			filename: input.filename,
			format,
			sha256,
			totalChunks: parsedChunks.length,
			chunks: parsedChunks,
			metadata,
		};

		this.documents.set(documentId, result);
		for (const chunk of parsedChunks) {
			this.allChunks.push(chunk);
			const fullTag = chunk.coordinate.citationTag.toLowerCase();
			const normalizedFullTag = normalizeCitationTag(chunk.coordinate.citationTag);
			const bareTag = chunk.coordinate.citationTag.replace(/^\[|\]$/g, "").toLowerCase().trim();
			const normalizedBareTag = normalizeCitationTag(bareTag);

			this.chunksByTag.set(fullTag, chunk);
			this.chunksByTag.set(normalizedFullTag, chunk);
			this.chunksByTag.set(bareTag, chunk);
			this.chunksByTag.set(normalizedBareTag, chunk);
		}

		return result;
	}

	async ingestAll(inputs: DocumentFileInput[]): Promise<ParsedDocumentResult[]> {
		const results: ParsedDocumentResult[] = [];
		for (const input of inputs) {
			results.push(await this.ingest(input));
		}
		return results;
	}

	/**
	 * Search ingested document chunks by query keywords.
	 */
	search(query: string, maxResults = 10): DocumentEvidenceChunk[] {
		const terms = query
			.toLowerCase()
			.split(/\s+/)
			.filter((t) => t.length > 2);

		if (terms.length === 0) {
			return this.allChunks.slice(0, maxResults);
		}

		const scored = this.allChunks.map((chunk) => {
			let score = 0;
			const lowerText = chunk.text.toLowerCase();
			for (const term of terms) {
				if (lowerText.includes(term)) {
					score += 1;
				}
			}
			return { chunk, score };
		});

		return scored
			.filter((s) => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, maxResults)
			.map((s) => s.chunk);
	}

	/**
	 * Verify that a cited coordinate string (e.g. "[VendorRisk.csv, Line 42]"
	 * or "[NIST.pdf, Page 2, Chunk 1]") corresponds to an actual ingested chunk.
	 * Performs strict exact matching on normalized/canonical coordinate tags.
	 */
	verifyCitation(citationTag: string): {
		verified: boolean;
		chunk?: DocumentEvidenceChunk;
		reason?: string;
	} {
		if (!citationTag || typeof citationTag !== "string") {
			return {
				verified: false,
				reason: "Citation tag must be a non-empty string.",
			};
		}

		const cleanTag = citationTag.trim().toLowerCase();
		if (!cleanTag || cleanTag === "[]") {
			return {
				verified: false,
				reason: "Citation tag cannot be empty.",
			};
		}

		// Exact match on full tag (e.g. "[singlerule.csv, line 1]")
		const direct = this.chunksByTag.get(cleanTag);
		if (direct) {
			return { verified: true, chunk: direct };
		}

		// Exact match on normalized full tag (e.g. whitespace variations)
		const normalizedDirect = this.chunksByTag.get(normalizeCitationTag(cleanTag));
		if (normalizedDirect) {
			return { verified: true, chunk: normalizedDirect };
		}

		// Exact match on bare tag without brackets (e.g. "singlerule.csv, line 1")
		const bare = cleanTag.replace(/^\[|\]$/g, "").trim();
		if (!bare) {
			return {
				verified: false,
				reason: "Citation tag cannot be empty.",
			};
		}

		const bareMatch = this.chunksByTag.get(bare);
		if (bareMatch) {
			return { verified: true, chunk: bareMatch };
		}

		const normalizedBare = this.chunksByTag.get(normalizeCitationTag(bare));
		if (normalizedBare) {
			return { verified: true, chunk: normalizedBare };
		}

		return {
			verified: false,
			reason: `Citation '${citationTag}' not found in ingested document coordinates.`,
		};
	}

	/**
	 * Formats chunks into structured evidence context for agent prompts.
	 */
	formatEvidenceContext(chunks: DocumentEvidenceChunk[] = this.allChunks): string {
		if (chunks.length === 0) return "";

		const lines: string[] = [
			"Enterprise Compliance & Document Evidence Repository:",
			"Ground your claims in these exact document coordinates (e.g. [Filename, Coordinate]).",
			"",
		];

		for (const chunk of chunks) {
			lines.push(`- ${chunk.coordinate.citationTag}: ${chunk.coordinate.contentSnippet}`);
		}

		return lines.join("\n");
	}

	getAllChunks(): DocumentEvidenceChunk[] {
		return [...this.allChunks];
	}

	getDocument(id: string): ParsedDocumentResult | undefined {
		return this.documents.get(id);
	}

	getAllDocuments(): ParsedDocumentResult[] {
		return Array.from(this.documents.values());
	}

	clear(): void {
		this.documents.clear();
		this.chunksByTag.clear();
		this.allChunks.length = 0;
	}
}

export const sharedDocumentIngestionService = new DocumentIngestionService();
