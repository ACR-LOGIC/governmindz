import {
	evaluateConversation,
	type ConversationEvaluation,
	type EvaluationMessage,
} from "../scoring/ConversationEvaluation.js";
import { createZipBuffer, sha256Hex, type ZipEntry } from "./zip.js";
import type { Browser } from "@playwright/test";

export type ConversationExportFormat =
	| "pdf"
	| "docx"
	| "xlsx"
	| "csv"
	| "json"
	| "markdown"
	| "jsonl"
	| "zip";

export interface ExportArtifactDescriptor {
	id?: string;
	type?: string;
	format?: string;
	title?: string;
	filename?: string;
	mimeType?: string;
	sizeBytes?: number;
	summary?: string;
	status?: string;
}

export interface ExportArtifactFile {
	filename: string;
	data: Buffer;
	contentType: string;
	title?: string;
	sourceId?: string;
	kind?: string;
}

export interface ExportConversationMessage extends EvaluationMessage {
	toSeat?: string;
	timestamp?: number;
	round?: number;
	latency_ms?: number;
	structured?: {
		position?: string;
		evidence?: string[];
		caveats?: string[];
	} | null;
}

export interface ExportConversation {
	id?: string;
	title?: string;
	topic?: string;
	mode?: string;
	status?: string;
	createdAt?: number;
	updatedAt?: number;
	finalConfidence?: number | null;
	inquiryScore?: number | null;
	messages?: ExportConversationMessage[];
	auditEvents?: Array<{
		id?: string;
		event_type?: string;
		timestamp?: number;
		previous_hash?: string;
		hash?: string;
		signature?: string;
	}>;
	zetarisData?: {
		query?: string;
		columns?: string[];
		rows?: string[][];
		total?: number;
		source?: string;
		isSynthetic?: boolean;
	} | null;
	agentAssignments?: Record<string, { humanName?: string; role?: string }>;
	primaryArtifact?: ExportArtifactDescriptor | null;
	additionalArtifacts?: ExportArtifactDescriptor[];
	evidenceExport?: ExportArtifactDescriptor | null;
}

export interface ExportBuildOptions {
	generatedAt?: Date;
	artifactFiles?: ExportArtifactFile[];
	artifactWarnings?: string[];
	renderPdf?: (html: string) => Promise<Buffer>;
}

export interface GeneratedExport {
	filename: string;
	contentType: string;
	data: Buffer;
	format: ConversationExportFormat;
}

export class ExportBuildError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode = 400) {
		super(message);
		this.name = "ExportBuildError";
		this.statusCode = statusCode;
	}
}

interface DocumentModel {
	conversation: ExportConversation;
	evaluation: ConversationEvaluation;
	generatedAt: Date;
	finalMessage: ExportConversationMessage | null;
	evidence: string[];
	caveats: string[];
	agentMessages: ExportConversationMessage[];
	confidenceText: string;
	title: string;
	topic: string;
	safeName: string;
}

const MAX_MESSAGES = 1000;
const MAX_ROWS = 5000;
const MAX_COLLECTION_ITEMS = 500;
const MAX_TEXT = 200_000;
const MAX_SHORT_TEXT = 2_000;

function cleanText(value: unknown, max = MAX_TEXT): string {
	if (typeof value !== "string") return "";
	return value.replace(/\u0000/g, "").slice(0, max);
}

function shortText(value: unknown, max = MAX_SHORT_TEXT): string {
	return cleanText(value, max);
}

function finiteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, MAX_COLLECTION_ITEMS)
		.map((item) => shortText(item, 20_000).trim())
		.filter(Boolean);
}

function normalizeMessage(value: unknown): ExportConversationMessage | null {
	if (!value || typeof value !== "object") return null;
	const message = value as Record<string, unknown>;
	const structured = message.structured as Record<string, unknown> | null | undefined;
	return {
		id: shortText(message.id, 200),
		type: shortText(message.type, 80),
		fromSeat: shortText(message.fromSeat, 200),
		toSeat: shortText(message.toSeat, 200),
		content: cleanText(message.content),
		confidence: finiteNumber(message.confidence),
		round: finiteNumber(message.round) ?? undefined,
		timestamp: finiteNumber(message.timestamp) ?? undefined,
		latency_ms: finiteNumber(message.latency_ms) ?? undefined,
		structured: structured
			? {
					position: cleanText(structured.position),
					evidence: cleanStringArray(structured.evidence),
					caveats: cleanStringArray(structured.caveats),
				}
			: null,
	};
}

function normalizeArtifact(value: unknown): ExportArtifactDescriptor | null {
	if (!value || typeof value !== "object") return null;
	const artifact = value as Record<string, unknown>;
	const filename = shortText(artifact.filename, 255);
	if (!filename) return null;
	return {
		id: shortText(artifact.id, 200),
		type: shortText(artifact.type, 80),
		format: shortText(artifact.format, 40),
		title: shortText(artifact.title, 500),
		filename,
		mimeType: shortText(artifact.mimeType, 200),
		sizeBytes: finiteNumber(artifact.sizeBytes) ?? undefined,
		summary: shortText(artifact.summary, 2000),
		status: shortText(artifact.status, 80),
	};
}

export function normalizeConversation(input: unknown): ExportConversation {
	if (!input || typeof input !== "object") {
		throw new ExportBuildError("A conversation object is required.");
	}
	const source = input as Record<string, unknown>;
	const rawMessages = Array.isArray(source.messages) ? source.messages.slice(0, MAX_MESSAGES) : [];
	const messages = rawMessages
		.map(normalizeMessage)
		.filter((message): message is ExportConversationMessage => message !== null);
	const zetaris = source.zetarisData as Record<string, unknown> | null | undefined;
	const normalizedZetaris = zetaris
		? {
				query: cleanText(zetaris.query, 20_000),
				columns: cleanStringArray(zetaris.columns),
				rows: Array.isArray(zetaris.rows)
					? zetaris.rows.slice(0, MAX_ROWS).map((row) =>
							Array.isArray(row)
								? row.slice(0, 100).map((cell) => shortText(String(cell ?? ""), 5000))
								: [],
						)
					: [],
				total: finiteNumber(zetaris.total) ?? 0,
				source: shortText(zetaris.source, 200),
				isSynthetic: zetaris.isSynthetic === true,
			}
		: null;
	const auditEvents = Array.isArray(source.auditEvents)
		? source.auditEvents.slice(0, MAX_MESSAGES).map((value) => {
				const event = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
				return {
					id: shortText(event.id, 200),
					event_type: shortText(event.event_type, 200),
					timestamp: finiteNumber(event.timestamp) ?? undefined,
					previous_hash: shortText(event.previous_hash, 500),
					hash: shortText(event.hash, 500),
					signature: shortText(event.signature, 1000),
				};
			})
		: [];
	const assignments = source.agentAssignments;
	const normalizedAssignments =
		assignments && typeof assignments === "object"
			? Object.fromEntries(
					Object.entries(assignments as Record<string, unknown>)
						.slice(0, 200)
						.map(([seat, value]) => {
							const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
							return [
								shortText(seat, 200),
								{
									humanName: shortText(record.humanName, 500),
									role: shortText(record.role, 500),
								},
							];
						}),
				)
			: undefined;

	return {
		id: shortText(source.id, 200),
		title: shortText(source.title, 500),
		topic: cleanText(source.topic, 20_000),
		mode: shortText(source.mode, 40),
		status: shortText(source.status, 40),
		createdAt: finiteNumber(source.createdAt) ?? undefined,
		updatedAt: finiteNumber(source.updatedAt) ?? undefined,
		finalConfidence: finiteNumber(source.finalConfidence),
		inquiryScore: finiteNumber(source.inquiryScore),
		messages,
		auditEvents,
		zetarisData: normalizedZetaris,
		agentAssignments: normalizedAssignments,
		primaryArtifact: normalizeArtifact(source.primaryArtifact),
		additionalArtifacts: Array.isArray(source.additionalArtifacts)
			? source.additionalArtifacts
					.slice(0, 100)
					.map(normalizeArtifact)
					.filter((artifact): artifact is ExportArtifactDescriptor => artifact !== null)
			: [],
		evidenceExport: normalizeArtifact(source.evidenceExport),
	};
}

export function safeExportFilename(value: string, fallback = "governmindz-report"): string {
	const normalized = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
	if (!normalized) return fallback;
	const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
	return windowsReserved.test(normalized) ? `${fallback}-${normalized}` : normalized;
}

function buildModel(conversation: ExportConversation, generatedAt: Date): DocumentModel {
	const evaluation = evaluateConversation({
		messages: conversation.messages,
		topic: conversation.topic,
		status: conversation.status,
		finalConfidence: conversation.finalConfidence,
		inquiryScore: conversation.inquiryScore,
	});
	const finalMessage =
		[...(conversation.messages || [])]
			.reverse()
			.find((message) => message.type === "final" || message.fromSeat === "Synthesizer") || null;
	const evidence = finalMessage?.structured?.evidence || [];
	const caveats = finalMessage?.structured?.caveats || [];
	const agentMessages = (conversation.messages || []).filter(
		(message) => message.fromSeat !== "user" && message.type !== "user" && message.type !== "final",
	);
	const title = conversation.title || conversation.topic || "GovernMindz Governance Briefing";
	const topic = conversation.topic || "No inquiry recorded";
	const confidenceText =
		evaluation.confidence == null
			? "N/A"
			: `${(evaluation.confidence * 100).toFixed(1)}%`;
	return {
		conversation,
		evaluation,
		generatedAt,
		finalMessage,
		evidence,
		caveats,
		agentMessages,
		confidenceText,
		title,
		topic,
		safeName: safeExportFilename(title),
	};
}

function formatTimestamp(value: number | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return "Not recorded";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Not recorded" : date.toISOString();
}

function displayConfidence(value: number | null | undefined): string {
	return typeof value === "number" && Number.isFinite(value)
		? `${(value * 100).toFixed(1)}%`
		: "N/A";
}

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function sanitizeXmlText(value: unknown): string {
	return String(value ?? "").replace(
		// eslint-disable-next-line no-control-regex
		/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
		"",
	);
}

function escapeXml(value: unknown): string {
	return sanitizeXmlText(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function htmlList(items: string[], emptyText: string): string {
	if (items.length === 0) return `<p class="empty">${escapeHtml(emptyText)}</p>`;
	return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function buildPrintHtml(model: DocumentModel): string {
	const { conversation, evaluation, finalMessage, evidence, caveats, agentMessages } = model;
	const zetarisRows = conversation.zetarisData?.rows || [];
	const zetarisHeaders = conversation.zetarisData?.columns || [];
	const auditEvents = conversation.auditEvents || [];
	const finalAnswer = evaluation.answer || "No substantive final answer has been recorded.";
	const inquiryScore = evaluation.inquiryScore == null ? "N/A" : `${evaluation.inquiryScore}/10`;

	const auditRows =
		auditEvents.length === 0
			? `<tr><td colspan="4">No audit events were recorded for this conversation.</td></tr>`
			: auditEvents
					.slice(-30)
					.map(
						(event) => `<tr>
							<td>${escapeHtml(event.event_type || "Unspecified event")}</td>
							<td>${escapeHtml(formatTimestamp(event.timestamp))}</td>
							<td class="mono">${escapeHtml(event.hash || "Not recorded")}</td>
							<td class="mono">${escapeHtml(event.previous_hash || "Not recorded")}</td>
						</tr>`,
					)
					.join("");

	const agentRows =
		agentMessages.length === 0
			? `<tr><td colspan="5">No council contributions were recorded.</td></tr>`
			: agentMessages
					.map((message) => {
						const assignment = message.fromSeat ? conversation.agentAssignments?.[message.fromSeat] : undefined;
						return `<tr>
							<td>${escapeHtml(assignment?.humanName || message.fromSeat || "Unknown seat")}</td>
							<td>${escapeHtml(message.round ?? "N/A")}</td>
							<td>${escapeHtml(message.type || "contribution")}</td>
							<td>${escapeHtml(displayConfidence(message.confidence))}</td>
							<td class="preline">${escapeHtml(message.structured?.position || message.content || "No content recorded.")}</td>
						</tr>`;
					})
					.join("");

	const zetarisTable = conversation.zetarisData
		? `<section class="section">
				<h2>Zetaris Evidence Snapshot</h2>
				<p class="muted">Source: ${escapeHtml(conversation.zetarisData.source || "Not recorded")} · Rows: ${escapeHtml(conversation.zetarisData.total ?? zetarisRows.length)}${conversation.zetarisData.isSynthetic ? " · Synthetic fixture" : ""}</p>
				<pre class="query">${escapeHtml(conversation.zetarisData.query || "No query recorded.")}</pre>
				<table>
					<thead><tr>${(zetarisHeaders.length ? zetarisHeaders : ["Result"]).map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
					<tbody>
						${
							zetarisRows.length === 0
								? `<tr><td colspan="${Math.max(1, zetarisHeaders.length)}">No rows recorded.</td></tr>`
								: zetarisRows
										.slice(0, 500)
										.map(
											(row) =>
												`<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
										)
										.join("")
						}
					</tbody>
				</table>
				${zetarisRows.length > 500 ? `<p class="muted">Showing the first 500 of ${zetarisRows.length} captured rows.</p>` : ""}
			</section>`
		: "";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.title)} - GovernMindz Governance Briefing</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #172033; background: #ffffff; }
  body { font-family: "Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.48; }
  h1, h2, h3 { color: #0f172a; margin: 0; }
  h1 { font-size: 23pt; line-height: 1.12; letter-spacing: -0.03em; }
  h2 { font-size: 13pt; margin: 0 0 8pt; border-bottom: 1.5pt solid #d8a327; padding-bottom: 4pt; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; }
  p { margin: 0 0 8pt; }
  ul { margin: 4pt 0 12pt 16pt; padding: 0; }
  li { margin: 0 0 3pt; }
  .cover { border-top: 7pt solid #0f172a; padding-top: 18pt; margin-bottom: 20pt; }
  .brand { color: #b7791f; font-size: 9pt; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 8pt; }
  .subtitle { color: #475569; font-size: 11pt; margin-top: 8pt; overflow-wrap: anywhere; }
  .meta { width: 100%; border-collapse: collapse; margin: 16pt 0 18pt; font-size: 9.5pt; }
  .meta td { border: 1pt solid #dde3ec; padding: 7pt 8pt; vertical-align: top; width: 25%; }
  .meta .label { color: #64748b; font-size: 7.8pt; letter-spacing: 0.08em; text-transform: uppercase; display: block; font-weight: 700; margin-bottom: 2pt; }
  .callout { border: 1.2pt solid #d8a327; background: #fffbeb; border-radius: 6pt; padding: 12pt 14pt; margin-bottom: 16pt; }
  .callout.unavailable { border-color: #94a3b8; background: #f8fafc; }
  .callout-head { display: flex; justify-content: space-between; gap: 12pt; align-items: flex-start; border-bottom: 0.8pt solid #e5c56c; padding-bottom: 7pt; margin-bottom: 9pt; }
  .callout.unavailable .callout-head { border-color: #d5dce7; }
  .callout-title { font-weight: 800; font-size: 12pt; color: #78350f; }
  .callout.unavailable .callout-title { color: #334155; }
  .confidence { white-space: nowrap; font-weight: 800; font-size: 13pt; color: #92400e; }
  .confidence.na { color: #64748b; }
  .answer { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11pt; }
  .status-note { margin-top: 8pt; color: #b45309; font-size: 9.5pt; }
  .section { margin: 0 0 17pt; break-inside: auto; }
  .section.keep { break-inside: avoid; }
  .muted { color: #64748b; font-size: 9pt; }
  .empty { color: #64748b; font-style: italic; }
  table { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin: 6pt 0 10pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: #0f172a; color: #ffffff; text-align: left; padding: 6pt 6pt; font-size: 7.8pt; text-transform: uppercase; letter-spacing: 0.05em; }
  td { border: 0.6pt solid #dde3ec; padding: 5pt 6pt; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  .mono { font-family: Consolas, "SFMono-Regular", monospace; font-size: 7.4pt; word-break: break-all; }
  .preline { white-space: pre-wrap; }
  .query { white-space: pre-wrap; overflow-wrap: anywhere; background: #0b1220; color: #e2e8f0; border-radius: 5pt; padding: 9pt; font-family: Consolas, monospace; font-size: 8pt; }
  .note { color: #475569; font-size: 8.8pt; border-left: 2.5pt solid #cbd5e1; padding-left: 8pt; }
  .footer-note { border-top: 0.7pt solid #cbd5e1; margin-top: 20pt; padding-top: 8pt; color: #64748b; font-size: 7.8pt; }
  .pill { display: inline-block; border: 0.8pt solid #cbd5e1; border-radius: 99pt; padding: 2pt 7pt; font-size: 8pt; color: #475569; }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">GovernMindz · Governance Intelligence</div>
    <h1>${escapeHtml(model.title)}</h1>
    <div class="subtitle">${escapeHtml(model.topic)}</div>
  </div>

  <table class="meta">
    <tr>
      <td><span class="label">Generated</span>${escapeHtml(model.generatedAt.toISOString())}</td>
      <td><span class="label">Mode</span>${escapeHtml(conversation.mode || "Not recorded")}</td>
      <td><span class="label">Evaluation</span>${escapeHtml(evaluation.label)}</td>
      <td><span class="label">Inquiry score</span>${escapeHtml(inquiryScore)}</td>
    </tr>
    <tr>
      <td><span class="label">Calibrated confidence</span>${escapeHtml(model.confidenceText)}</td>
      <td><span class="label">Council seats</span>${escapeHtml(Object.keys(conversation.agentAssignments || {}).length || "Not recorded")}</td>
      <td><span class="label">Audit events</span>${escapeHtml((conversation.auditEvents || []).length)}</td>
      <td><span class="label">Conversation</span>${escapeHtml(conversation.id || "Not recorded")}</td>
    </tr>
  </table>

  <div class="callout ${evaluation.evaluated ? "" : "unavailable"}">
    <div class="callout-head">
      <div>
        <div class="callout-title">Final Governance Answer</div>
        <div class="muted">${escapeHtml(evaluation.label)}</div>
      </div>
      <div class="confidence ${evaluation.confidence == null ? "na" : ""}">${escapeHtml(model.confidenceText)}</div>
    </div>
    <div class="answer">${escapeHtml(finalAnswer)}</div>
    ${
			evaluation.evaluated
				? ""
				: `<div class="status-note">${escapeHtml(evaluation.label)}: ${escapeHtml(evaluation.reason)}</div>`
		}
    ${
			evaluation.confidenceIssue && evaluation.evaluated
				? `<div class="status-note">${escapeHtml(evaluation.confidenceIssue)}</div>`
				: ""
		}
  </div>

  <section class="section keep">
    <h2>Executive Summary</h2>
    <p>${escapeHtml(
			finalMessage?.structured?.position ||
				finalMessage?.content ||
				"No executive summary was recorded for this conversation.",
		)}</p>
  </section>

  <section class="section">
    <h2>Evidence Citations</h2>
    ${htmlList(evidence, "No evidence citations were recorded.")}
    <p class="note">Citations are reproduced from the recorded final answer. Their existence does not by itself establish independent factual verification.</p>
  </section>

  <section class="section">
    <h2>Operational Caveats and Constraints</h2>
    ${htmlList(caveats, "No caveats were recorded.")}
  </section>

  <section class="section">
    <h2>Council Contributions</h2>
    <table>
      <thead><tr><th>Seat</th><th>Round</th><th>Type</th><th>Confidence</th><th>Position</th></tr></thead>
      <tbody>${agentRows}</tbody>
    </table>
  </section>

  ${zetarisTable}

  <section class="section">
    <h2>Audit Ledger</h2>
    <p class="muted">Recorded events: ${escapeHtml(auditEvents.length)}. Verification: not performed by this export pipeline.</p>
    <table>
      <thead><tr><th>Event</th><th>Recorded at</th><th>Hash</th><th>Previous hash</th></tr></thead>
      <tbody>${auditRows}</tbody>
    </table>
  </section>

  <div class="footer-note">
    <p>Generated by GovernMindz. Evaluation status, confidence, consensus, evidence provenance, and audit verification are separate properties and must not be treated as interchangeable.</p>
    <p>This report contains recorded conversation data. It does not independently certify the truth of any claim.</p>
  </div>
</body>
</html>`;
}

function buildCsv(model: DocumentModel): string {
	const rows: Array<Array<string | number>> = [
		["Section", "Order", "Speaker", "Round", "Type", "Content", "Confidence", "Provenance"],
		["Evaluation", "", "System", "", model.evaluation.status, `${model.evaluation.label}: ${model.evaluation.reason}`, model.confidenceText, "Computed by GovernMindz"],
		["Final Answer", "", model.finalMessage?.fromSeat || "System", "", "final", model.evaluation.answer || "No substantive final answer recorded.", model.confidenceText, "Recorded conversation"],
	];
	for (const [index, item] of model.evidence.entries()) {
		rows.push(["Evidence", index + 1, model.finalMessage?.fromSeat || "System", "", "citation", item, "", "Recorded citation; independent verification not implied"]);
	}
	for (const [index, item] of model.caveats.entries()) {
		rows.push(["Caveat", index + 1, model.finalMessage?.fromSeat || "System", "", "constraint", item, "", "Recorded conversation"]);
	}
	for (const [index, message] of (model.conversation.messages || []).entries()) {
		rows.push([
			"Message",
			index + 1,
			message.fromSeat || "Unknown",
			message.round ?? "",
			message.type || "",
			message.structured?.position || message.content || "",
			displayConfidence(message.confidence),
			`Recorded conversation; message ${message.id || index + 1}`,
		]);
	}
	for (const [index, event] of (model.conversation.auditEvents || []).entries()) {
		rows.push([
			"Audit",
			index + 1,
			"Audit ledger",
			"",
			event.event_type || "event",
			`hash=${event.hash || "N/A"}; previous=${event.previous_hash || "N/A"}`,
			"",
			"Recorded audit event; verification not performed by export pipeline",
		]);
	}
	const escapeCsv = (value: string | number): string => {
		const text = String(value ?? "");
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

function buildJson(model: DocumentModel): string {
	const payload = {
		exportSchemaVersion: "1.0",
		exportType: "governmindz_conversation",
		generatedAt: model.generatedAt.toISOString(),
		evaluation: model.evaluation,
		conversation: {
			id: model.conversation.id,
			title: model.title,
			topic: model.topic,
			mode: model.conversation.mode,
			status: model.conversation.status,
			createdAt: model.conversation.createdAt ?? null,
			updatedAt: model.conversation.updatedAt ?? null,
			finalConfidence: model.conversation.finalConfidence ?? null,
			inquiryScore: model.conversation.inquiryScore ?? null,
			messages: model.conversation.messages || [],
			agentAssignments: model.conversation.agentAssignments || {},
			zetarisData: model.conversation.zetarisData || null,
			artifacts: {
				primary: model.conversation.primaryArtifact || null,
				additional: model.conversation.additionalArtifacts || [],
				evidenceExport: model.conversation.evidenceExport || null,
			},
			audit: {
				eventCount: (model.conversation.auditEvents || []).length,
				events: model.conversation.auditEvents || [],
				verification: "NOT_PERFORMED",
				note: "Audit events are recorded metadata. This export does not assert that the hash chain was verified.",
			},
		},
	};
	return `${JSON.stringify(payload, null, 2)}\n`;
}

function buildJsonl(model: DocumentModel): string {
	const lines: string[] = [
		JSON.stringify({
			recordType: "conversation_summary",
			generatedAt: model.generatedAt.toISOString(),
			conversationId: model.conversation.id || null,
			topic: model.topic,
			evaluation: model.evaluation,
			auditVerification: "NOT_PERFORMED",
		}),
	];
	for (const [index, event] of (model.conversation.auditEvents || []).entries()) {
		lines.push(
			JSON.stringify({
				recordType: "audit_event",
				sequence: index + 1,
				...event,
			}),
		);
	}
	return `${lines.join("\n")}\n`;
}

function buildMarkdown(model: DocumentModel): string {
	const lines: string[] = [
		`# ${model.title}`,
		"",
		`**Inquiry:** ${model.topic}`,
		`**Generated:** ${model.generatedAt.toISOString()}`,
		`**Evaluation:** ${model.evaluation.label}`,
		`**Calibrated confidence:** ${model.confidenceText}`,
		`**Inquiry score:** ${model.evaluation.inquiryScore == null ? "N/A" : `${model.evaluation.inquiryScore}/10`}`,
		"",
		"## Final Governance Answer",
		"",
		model.evaluation.answer || "No substantive final answer has been recorded.",
		"",
	];
	if (!model.evaluation.evaluated) {
		lines.push(`> ${model.evaluation.label}: ${model.evaluation.reason}`, "");
	}
	if (model.evaluation.confidenceIssue && model.evaluation.evaluated) {
		lines.push(`> ${model.evaluation.confidenceIssue}`, "");
	}
	if (model.evidence.length) {
		lines.push("## Evidence Citations", "");
		for (const item of model.evidence) lines.push(`- ${item}`);
		lines.push("", "Citations are reproduced as recorded. Their presence does not establish independent factual verification.", "");
	} else {
		lines.push("## Evidence Citations", "", "No evidence citations were recorded.", "");
	}
	if (model.caveats.length) {
		lines.push("## Operational Caveats", "");
		for (const item of model.caveats) lines.push(`- ${item}`);
		lines.push("");
	}
	lines.push("## Council Contributions", "");
	for (const message of model.agentMessages) {
		const assignment = message.fromSeat ? model.conversation.agentAssignments?.[message.fromSeat] : undefined;
		lines.push(
			`### ${assignment?.humanName || message.fromSeat || "Unknown seat"} - Round ${message.round ?? "N/A"}`,
			"",
			message.structured?.position || message.content || "No content recorded.",
			"",
			`- Type: ${message.type || "contribution"}`,
			`- Confidence: ${displayConfidence(message.confidence)}`,
			"",
		);
	}
	if (model.conversation.zetarisData) {
		lines.push("## Zetaris Evidence Snapshot", "", "```sql", model.conversation.zetarisData.query || "-- No query recorded", "```", "");
		lines.push(`Source: ${model.conversation.zetarisData.source || "Not recorded"}; rows: ${model.conversation.zetarisData.total ?? model.conversation.zetarisData.rows?.length ?? 0}`, "");
	}
	lines.push("## Audit Ledger", "");
	lines.push(`Recorded events: ${(model.conversation.auditEvents || []).length}. Verification: not performed by this export pipeline.`, "");
	for (const event of (model.conversation.auditEvents || []).slice(-30)) {
		lines.push(`- ${event.event_type || "event"} | ${formatTimestamp(event.timestamp)} | \`${event.hash || "N/A"}\``);
	}
	lines.push("", "---", "", "Generated by GovernMindz. Evaluation, confidence, consensus, evidence verification, and audit verification are separate properties.");
	return `${lines.join("\n")}\n`;
}

function columnName(index: number): string {
	let result = "";
	let value = index + 1;
	while (value > 0) {
		const remainder = (value - 1) % 26;
		result = String.fromCharCode(65 + remainder) + result;
		value = Math.floor((value - 1) / 26);
	}
	return result;
}

function xlsxCell(value: string | number | null | undefined, row: number, column: number, style = 0): string {
	const ref = `${columnName(column)}${row}`;
	if (value == null || value === "") return `<c r="${ref}" s="${style}"/>`;
	if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
	return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function xlsxSheet(rows: Array<Array<string | number | null | undefined>>, widths: number[]): string {
	const maxColumns = Math.max(1, ...rows.map((row) => row.length));
	const body = rows
		.map((row, rowIndex) => {
			const style = rowIndex === 0 ? 1 : 0;
			const cells = Array.from({ length: maxColumns }, (_, columnIndex) =>
				xlsxCell(row[columnIndex], rowIndex + 1, columnIndex, style),
			).join("");
			return `<row r="${rowIndex + 1}">${cells}</row>`;
		})
		.join("");
	const columns = widths
		.map(
			(width, index) =>
				`<col min="${index + 1}" max="${index + 1}" width="${Math.max(8, Math.min(80, width))}" customWidth="1"/>`,
		)
		.join("");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function buildXlsx(model: DocumentModel): Buffer {
	const summaryRows: Array<Array<string | number | null>> = [
		["Field", "Value", "Notes"],
		["Title", model.title, "Conversation title"],
		["Inquiry", model.topic, "Recorded inquiry"],
		["Generated", model.generatedAt.toISOString(), "Export timestamp"],
		["Evaluation status", model.evaluation.status, model.evaluation.reason],
		["Calibrated confidence", model.confidenceText, model.evaluation.confidenceIssue || "Recorded calibrated confidence"],
		["Inquiry score", model.evaluation.inquiryScore ?? "N/A", "Inquiry complexity, not answer confidence"],
		["Final answer", model.evaluation.answer || "No substantive final answer recorded.", "Recorded answer"],
		["Audit events", (model.conversation.auditEvents || []).length, "Verification not performed by export pipeline"],
	];
	for (const item of model.evidence) summaryRows.push(["Evidence citation", item, "Independent factual verification not implied"]);
	for (const item of model.caveats) summaryRows.push(["Caveat", item, "Recorded constraint"]);

	const messageRows: Array<Array<string | number | null>> = [
		["Sequence", "Timestamp", "Seat", "Round", "Type", "Confidence", "Position", "Evidence", "Caveats"],
		...(model.conversation.messages || []).map((message, index) => [
			index + 1,
			formatTimestamp(message.timestamp),
			message.fromSeat || "Unknown",
			message.round ?? "",
			message.type || "",
			displayConfidence(message.confidence),
			message.structured?.position || message.content || "",
			(message.structured?.evidence || []).join("\n"),
			(message.structured?.caveats || []).join("\n"),
		]),
	];

	const evidenceRows: Array<Array<string | number | null>> = [
		["Sequence", "Citation", "Provenance"],
		...(model.evidence.length
			? model.evidence.map((item, index) => [index + 1, item, "Recorded citation"])
			: [[1, "No evidence citations were recorded.", "N/A"]]),
	];

	const auditRows: Array<Array<string | number | null>> = [
		["Sequence", "Event ID", "Event Type", "Timestamp", "Previous Hash", "Hash", "Signature", "Verification"],
		...((model.conversation.auditEvents || []).length
			? (model.conversation.auditEvents || []).map((event, index) => [
					index + 1,
					event.id || "",
					event.event_type || "",
					formatTimestamp(event.timestamp),
					event.previous_hash || "",
					event.hash || "",
					event.signature || "",
					"Not performed by export pipeline",
				])
			: [[1, "", "No audit events recorded", "", "", "", "", "N/A"]]),
	];

	const zetarisRows: Array<Array<string | number | null>> = [
		...(model.conversation.zetarisData?.columns?.length
			? [model.conversation.zetarisData.columns]
			: [["Result"]]),
		...(model.conversation.zetarisData?.rows?.length
			? model.conversation.zetarisData.rows
			: [["No Zetaris rows recorded."]]),
	];

	const sheets = [
		{ name: "Summary", xml: xlsxSheet(summaryRows, [30, 80, 45]) },
		{ name: "Messages", xml: xlsxSheet(messageRows, [10, 22, 22, 8, 14, 12, 80, 50, 40]) },
		{ name: "Evidence", xml: xlsxSheet(evidenceRows, [10, 100, 35]) },
		{ name: "Audit Events", xml: xlsxSheet(auditRows, [10, 30, 25, 22, 45, 45, 45, 32]) },
		{ name: "Zetaris", xml: xlsxSheet(zetarisRows, Array.from({ length: Math.max(1, zetarisRows[0].length) }, () => 24)) },
	];

	const workbookSheets = sheets
		.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
		.join("");
	const workbookRels = sheets
		.map(
			(sheet, index) =>
				`<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
		)
		.join("");
	const sheetOverrides = sheets
		.map(
			(_sheet, index) =>
				`<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
		)
		.join("");

	const files: ZipEntry[] = [
		{
			path: "[Content_Types].xml",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
		},
		{
			path: "_rels/.rels",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
		},
		{
			path: "xl/workbook.xml",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`,
		},
		{
			path: "xl/_rels/workbook.xml.rels",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
		},
		{
			path: "xl/styles.xml",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
		},
		...sheets.map((sheet, index) => ({
			path: `xl/worksheets/sheet${index + 1}.xml`,
			content: sheet.xml,
		})),
	];
	return createZipBuffer(files);
}

function wordTextRuns(value: string): string {
	const lines = sanitizeXmlText(value).split(/\r?\n/);
	return lines
		.map(
			(line, index) =>
				`${index > 0 ? "<w:r><w:br/></w:r>" : ""}<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
		)
		.join("");
}

function wordParagraph(
	text: string,
	options: { style?: string; bold?: boolean; color?: string; size?: number; spaceAfter?: number } = {},
): string {
	const runProperties = [
		options.bold ? "<w:b/>" : "",
		options.color ? `<w:color w:val="${options.color}"/>` : "",
		options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : "",
	].join("");
	return `<w:p><w:pPr>${options.style ? `<w:pStyle w:val="${options.style}"/>` : ""}${options.spaceAfter != null ? `<w:spacing w:after="${options.spaceAfter}"/>` : ""}</w:pPr>${runProperties ? `<w:r><w:rPr>${runProperties}</w:rPr><w:t xml:space="preserve"></w:t></w:r>` : ""}${wordTextRuns(text)}</w:p>`;
}

function wordTable(headers: string[], rows: string[][], widths: number[]): string {
	const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
	const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers
		.map(
			(headerText, index) =>
				`<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="0F172A"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${escapeXml(headerText)}</w:t></w:r></w:p></w:tc>`,
		)
		.join("")}</w:tr>`;
	const body = rows
		.map(
			(row) =>
				`<w:tr>${headers
					.map(
						(_header, index) =>
							`<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${escapeXml(row[index] || "")}</w:t></w:r></w:p></w:tc>`,
					)
					.join("")}</w:tr>`,
		)
		.join("");
	return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="DDE3EC"/><w:left w:val="single" w:sz="4" w:color="DDE3EC"/><w:bottom w:val="single" w:sz="4" w:color="DDE3EC"/><w:right w:val="single" w:sz="4" w:color="DDE3EC"/><w:insideH w:val="single" w:sz="4" w:color="DDE3EC"/><w:insideV w:val="single" w:sz="4" w:color="DDE3EC"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${header}${body}</w:tbl>`;
}

function buildDocx(model: DocumentModel): Buffer {
	const { conversation, evaluation } = model;
	const finalAnswer = evaluation.answer || "No substantive final answer has been recorded.";
	const auditRows = (conversation.auditEvents || []).length
		? (conversation.auditEvents || [])
				.slice(-40)
				.map((event) => [
					event.event_type || "event",
					formatTimestamp(event.timestamp),
					event.hash || "Not recorded",
					event.previous_hash || "Not recorded",
					"Not performed",
				])
		: [["No audit events recorded", "", "", "", "N/A"]];
	const agentRows = model.agentMessages.length
		? model.agentMessages.map((message) => {
				const assignment = message.fromSeat ? conversation.agentAssignments?.[message.fromSeat] : undefined;
				return [
					assignment?.humanName || message.fromSeat || "Unknown seat",
					String(message.round ?? "N/A"),
					message.type || "contribution",
					displayConfidence(message.confidence),
					message.structured?.position || message.content || "No content recorded.",
				];
			})
		: [["No council contributions recorded", "", "", "", ""]];
	const evidenceRows = model.evidence.length
		? model.evidence.map((item, index) => [String(index + 1), item, "Recorded citation"])
		: [["1", "No evidence citations recorded.", "N/A"]];
	const caveatParagraphs = model.caveats.length
		? model.caveats.map((item) => wordParagraph(`- ${item}`, { style: "BodyText", size: 19 })).join("")
		: wordParagraph("No caveats were recorded.", { style: "BodyText", size: 19, color: "64748B" });
	const zetarisParagraphs = conversation.zetarisData
		? `${wordParagraph("Zetaris Evidence Snapshot", { style: "Heading1" })}${wordParagraph(
				`Source: ${conversation.zetarisData.source || "Not recorded"}; rows: ${conversation.zetarisData.total ?? conversation.zetarisData.rows?.length ?? 0}`,
				{ style: "BodyText", size: 19, color: "64748B" },
			)}${wordParagraph(conversation.zetarisData.query || "No query recorded.", { style: "Code", size: 17 })}`
		: "";

	const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${wordParagraph("GOVERNMINDZ · GOVERNANCE INTELLIGENCE", { style: "Kicker" })}
    ${wordParagraph(model.title, { style: "Title" })}
    ${wordParagraph(model.topic, { style: "Subtitle" })}
    ${wordParagraph(`Generated ${model.generatedAt.toISOString()} · Evaluation: ${evaluation.label} · Confidence: ${model.confidenceText}`, { style: "Meta" })}
    ${wordParagraph("Final Governance Answer", { style: "Heading1" })}
    ${wordParagraph(finalAnswer, { style: "BodyText" })}
    ${
			evaluation.evaluated
				? ""
				: wordParagraph(`${evaluation.label}: ${evaluation.reason}`, {
						style: "Callout",
						color: "B45309",
						size: 19,
					})
		}
    ${
			evaluation.confidenceIssue && evaluation.evaluated
				? wordParagraph(evaluation.confidenceIssue, { style: "Callout", color: "B45309", size: 19 })
				: ""
		}
    ${wordParagraph("Evidence Citations", { style: "Heading1" })}
    ${wordTable(["#", "Citation", "Provenance"], evidenceRows, [600, 5200, 2400])}
    ${wordParagraph("Evidence is reproduced as recorded. Its presence does not establish independent factual verification.", { style: "SmallText", color: "64748B" })}
    ${wordParagraph("Operational Caveats and Constraints", { style: "Heading1" })}
    ${caveatParagraphs}
    ${wordParagraph("Council Contributions", { style: "Heading1" })}
    ${wordTable(["Seat", "Round", "Type", "Confidence", "Position"], agentRows, [1700, 700, 1100, 1100, 3600])}
    ${zetarisParagraphs}
    ${wordParagraph("Audit Ledger", { style: "Heading1" })}
    ${wordParagraph(
			`Recorded events: ${(conversation.auditEvents || []).length}. Verification: not performed by this export pipeline.`,
			{ style: "BodyText", size: 19, color: "64748B" },
		)}
    ${wordTable(["Event", "Recorded at", "Hash", "Previous hash", "Verification"], auditRows, [1800, 1700, 3000, 2400, 1200])}
    ${wordParagraph("Generated by GovernMindz. Evaluation status, confidence, consensus, evidence verification, and audit verification are separate properties and must not be treated as interchangeable.", { style: "SmallText", color: "64748B" })}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader"/>
      <w:footerReference w:type="default" r:id="rIdFooter"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

	const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Aptos"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="46"/><w:szCs w:val="46"/><w:color w:val="0F172A"/></w:rPr><w:pPr><w:spacing w:after="180"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="23"/><w:color w:val="475569"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Kicker"><w:name w:val="Kicker"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="B7791F"/><w:caps/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="17"/><w:color w:val="64748B"/></w:rPr><w:pPr><w:spacing w:after="240"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:color="D8A327"/></w:pBdr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFFBEB"/><w:pBdr><w:left w:val="single" w:sz="16" w:color="D8A327"/></w:pBdr><w:spacing w:before="100" w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="SmallText"><w:name w:val="Small Text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="17"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="17"/><w:color w:val="E2E8F0"/></w:rPr><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="0B1220"/><w:spacing w:before="80" w:after="160"/></w:pPr></w:style>
</w:styles>`;

	const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:rPr><w:b/><w:color w:val="B7791F"/><w:sz w:val="17"/></w:rPr><w:t>GOVERNMINDZ</w:t></w:r><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">  ·  Governance Briefing  ·  ${escapeXml(model.generatedAt.toISOString())}</w:t></w:r></w:p>
</w:hdr>`;

	const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">Generated by GovernMindz  ·  Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
</w:ftr>`;

	const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="708"/>
  <w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>`;

	const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(model.title)}</dc:title>
  <dc:subject>${escapeXml(model.topic)}</dc:subject>
  <dc:creator>GovernMindz</dc:creator>
  <cp:lastModifiedBy>GovernMindz</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${model.generatedAt.toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${model.generatedAt.toISOString()}</dcterms:modified>
</cp:coreProperties>`;

	const files: ZipEntry[] = [
		{
			path: "[Content_Types].xml",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
		},
		{
			path: "_rels/.rels",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
		},
		{ path: "word/document.xml", content: documentXml },
		{ path: "word/styles.xml", content: stylesXml },
		{ path: "word/settings.xml", content: settingsXml },
		{ path: "word/header1.xml", content: headerXml },
		{ path: "word/footer1.xml", content: footerXml },
		{
			path: "word/_rels/document.xml.rels",
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`,
		},
		{ path: "docProps/core.xml", content: coreXml },
	];
	return createZipBuffer(files);
}

async function renderPdfWithPlaywright(html: string): Promise<Buffer> {
	let browser: Browser | null = null;
	try {
		const { chromium } = await import("@playwright/test");
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: "load" });
		await page.evaluate(async () => {
			const fontSet = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
			if (fontSet?.ready) await fontSet.ready;
		});
		await page.emulateMedia({ media: "print" });
		const pdf = await page.pdf({
			format: "A4",
			printBackground: true,
			displayHeaderFooter: true,
			headerTemplate: `<div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 7px; color: #94a3b8; width: 100%; padding: 0 14mm; display:flex; justify-content:space-between;"><span>GOVERNMINDZ · GOVERNANCE BRIEFING</span><span>CONFIDENTIAL</span></div>`,
			footerTemplate: `<div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 7px; color: #94a3b8; width: 100%; padding: 0 14mm; display:flex; justify-content:space-between;"><span>Generated by GovernMindz</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
			margin: { top: "16mm", right: "14mm", bottom: "17mm", left: "14mm" },
		});
		return Buffer.from(pdf);
	} catch (error) {
		throw new ExportBuildError(
			`PDF generation is unavailable. Ensure Playwright Chromium is installed. ${error instanceof Error ? error.message : ""}`,
			503,
		);
	} finally {
		if (browser) await browser.close().catch(() => undefined);
	}
}

function artifactFilenameSet(conversation: ExportConversation): Set<string> {
	const descriptors = [
		conversation.primaryArtifact,
		conversation.evidenceExport,
		...(conversation.additionalArtifacts || []),
	].filter(Boolean) as ExportArtifactDescriptor[];
	return new Set(descriptors.map((artifact) => artifact.filename || "").filter(Boolean));
}

export async function buildConversationExport(
	conversationInput: unknown,
	format: ConversationExportFormat,
	options: ExportBuildOptions = {},
): Promise<GeneratedExport> {
	const allowedFormats: ConversationExportFormat[] = [
		"pdf",
		"docx",
		"xlsx",
		"csv",
		"json",
		"markdown",
		"jsonl",
		"zip",
	];
	if (!allowedFormats.includes(format)) {
		throw new ExportBuildError(`Unsupported export format: ${String(format)}`);
	}
	const conversation = normalizeConversation(conversationInput);
	const generatedAt = options.generatedAt || new Date();
	const model = buildModel(conversation, generatedAt);
	const base = model.safeName;

	if (format === "zip") {
		if (!model.evaluation.evaluated) {
			throw new ExportBuildError(
				`A complete archive cannot be created for this conversation. ${model.evaluation.label}: ${model.evaluation.reason}`,
				422,
			);
		}
		const files: ZipEntry[] = [];
		const manifestFiles: Array<{
			path: string;
			contentType: string;
			description: string;
			sizeBytes: number;
			sha256: string;
		}> = [];
		const addFile = (entryPath: string, data: Buffer, contentType: string, description: string) => {
			files.push({ path: entryPath, content: data });
			manifestFiles.push({
				path: entryPath,
				contentType,
				description,
				sizeBytes: data.length,
				sha256: sha256Hex(data),
			});
		};

		const addFormat = async (itemFormat: Exclude<ConversationExportFormat, "zip">) => {
			const generated = await buildConversationExport(conversation, itemFormat, {
				...options,
				generatedAt,
			});
			addFile(`exports/${generated.filename}`, generated.data, generated.contentType, describeFormat(itemFormat));
		};

		await addFormat("pdf");
		await addFormat("docx");
		await addFormat("xlsx");
		await addFormat("csv");
		await addFormat("json");
		await addFormat("markdown");
		await addFormat("jsonl");

		const allowedArtifacts = artifactFilenameSet(conversation);
		const usedArtifactNames = new Set<string>();
		for (const artifact of options.artifactFiles || []) {
			const original = artifact.filename;
			if (!allowedArtifacts.has(original)) {
				throw new ExportBuildError(
					`Artifact ${original} is not referenced by this conversation and cannot be included.`,
					403,
				);
			}
			const extensionIndex = original.lastIndexOf(".");
			const extension = extensionIndex > 0 ? original.slice(extensionIndex).toLowerCase() : "";
			const stem = safeExportFilename(
				extensionIndex > 0 ? original.slice(0, extensionIndex) : original,
				"artifact",
			);
			let safeName = `${stem}${extension}`;
			let counter = 2;
			while (usedArtifactNames.has(safeName)) {
				safeName = `${stem}-${counter}${extension}`;
				counter += 1;
			}
			usedArtifactNames.add(safeName);
			addFile(
				`artifacts/${safeName}`,
				artifact.data,
				artifact.contentType || "application/octet-stream",
				artifact.title || describeArtifact(original, artifact.kind),
			);
		}

		const artifactWarnings = options.artifactWarnings || [];
		const readme = Buffer.from(
			[
				"GovernMindz Conversation Archive",
				"",
				`Title: ${model.title}`,
				`Generated: ${generatedAt.toISOString()}`,
				`Evaluation: ${model.evaluation.label} (${model.evaluation.status})`,
				`Confidence: ${model.confidenceText}`,
				"",
				"Contents:",
				"- exports/: PDF, DOCX, XLSX, CSV, JSON, Markdown, and audit JSONL exports.",
				"- artifacts/: Referenced artifacts only, when available.",
				"- manifest.json: File sizes, content types, and SHA-256 hashes.",
				"- README.txt: This file.",
				"",
				...(artifactWarnings.length
					? ["Artifact warnings:", ...artifactWarnings.map((warning) => `- ${warning}`), ""]
					: []),
				"Verification status: factual claims and the audit hash chain were not independently verified by this archive builder.",
				"",
			].join("\n"),
			"utf8",
		);
		addFile("README.txt", readme, "text/plain; charset=utf-8", "Archive contents and validation notes");
		const manifest = {
			schemaVersion: "1.0",
			archiveType: "governmindz_conversation_archive",
			generatedAt: generatedAt.toISOString(),
			conversation: {
				id: conversation.id || null,
				title: model.title,
				topic: model.topic,
				mode: conversation.mode || null,
				status: conversation.status || null,
			},
			evaluation: model.evaluation,
			audit: {
				eventCount: (conversation.auditEvents || []).length,
				verification: "NOT_PERFORMED",
			},
			artifactWarnings,
			files: manifestFiles,
			note: "The manifest hashes describe exported bytes. It does not hash itself. They do not independently verify factual claims or the audit chain.",
		};
		const manifestData = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
		files.push({ path: "manifest.json", content: manifestData });

		return {
			filename: `${base}-archive.zip`,
			contentType: "application/zip",
			data: createZipBuffer(files),
			format,
		};
	}

	if (format === "pdf") {
		const html = buildPrintHtml(model);
		const data = options.renderPdf ? await options.renderPdf(html) : await renderPdfWithPlaywright(html);
		return { filename: `${base}-executive-brief.pdf`, contentType: "application/pdf", data, format };
	}
	if (format === "docx") {
		return {
			filename: `${base}-executive-brief.docx`,
			contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			data: buildDocx(model),
			format,
		};
	}
	if (format === "xlsx") {
		return {
			filename: `${base}-workbook.xlsx`,
			contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			data: buildXlsx(model),
			format,
		};
	}
	if (format === "csv") {
		return {
			filename: `${base}-dataset.csv`,
			contentType: "text/csv; charset=utf-8",
			data: Buffer.from(buildCsv(model), "utf8"),
			format,
		};
	}
	if (format === "json") {
		return {
			filename: `${base}-record.json`,
			contentType: "application/json; charset=utf-8",
			data: Buffer.from(buildJson(model), "utf8"),
			format,
		};
	}
	if (format === "markdown") {
		return {
			filename: `${base}-brief.md`,
			contentType: "text/markdown; charset=utf-8",
			data: Buffer.from(buildMarkdown(model), "utf8"),
			format,
		};
	}
	return {
		filename: `${base}-audit.jsonl`,
		contentType: "application/x-ndjson; charset=utf-8",
		data: Buffer.from(buildJsonl(model), "utf8"),
		format,
	};
}

function describeFormat(format: ConversationExportFormat): string {
	switch (format) {
		case "pdf":
			return "Executive briefing PDF";
		case "docx":
			return "Editable executive briefing";
		case "xlsx":
			return "Structured workbook with summary, messages, evidence, audit, and Zetaris sheets";
		case "csv":
			return "Flat tabular export";
		case "json":
			return "Structured conversation record and evaluation";
		case "markdown":
			return "Markdown governance brief";
		case "jsonl":
			return "Audit ledger stream";
		default:
			return "Conversation export";
	}
}

function describeArtifact(filename: string, kind?: string): string {
	return `${kind || "Referenced"} artifact: ${filename}`;
}
