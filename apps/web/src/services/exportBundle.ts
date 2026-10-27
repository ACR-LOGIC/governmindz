import type { Conversation } from "../types";

export type ConversationExportFormat =
	| "pdf"
	| "docx"
	| "xlsx"
	| "csv"
	| "json"
	| "markdown"
	| "jsonl"
	| "zip";

export interface ConversationExportResult {
	blob: Blob;
	filename: string;
	warnings: string[];
}

export class ConversationExportError extends Error {
	readonly status: number;
	readonly warnings: string[];

	constructor(message: string, status = 0, warnings: string[] = []) {
		super(message);
		this.name = "ConversationExportError";
		this.status = status;
		this.warnings = warnings;
	}
}

function scopedConversation(conversation: Conversation) {
	return {
		id: conversation.id,
		title: conversation.title,
		topic: conversation.topic,
		mode: conversation.mode,
		status: conversation.status,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
		finalConfidence: conversation.finalConfidence,
		inquiryScore: conversation.inquiryScore,
		messages: conversation.messages,
		auditEvents: conversation.auditEvents,
		zetarisData: conversation.zetarisData,
		agentAssignments: conversation.agentAssignments,
		primaryArtifact: conversation.primaryArtifact,
		additionalArtifacts: conversation.additionalArtifacts,
		evidenceExport: conversation.evidenceExport,
	};
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
	if (!disposition) return fallback;
	const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1]);
		} catch {
			// Fall through to the ASCII filename.
		}
	}
	const asciiMatch = /filename="([^"]+)"/i.exec(disposition);
	return asciiMatch?.[1] || fallback;
}

export async function requestConversationExport(
	conversation: Conversation,
	format: ConversationExportFormat,
	signal?: AbortSignal,
): Promise<ConversationExportResult> {
	const response = await fetch("/api/exports", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			format,
			conversation: scopedConversation(conversation),
		}),
		signal,
	});
	const warningCount = Number(response.headers.get("X-Export-Warnings") || "0");
	if (!response.ok) {
		let message = `Export failed (${response.status}).`;
		try {
			const payload = (await response.json()) as { error?: string };
			if (payload?.error) message = payload.error;
		} catch {
			// Keep the status-based message.
		}
		throw new ConversationExportError(
			message,
			response.status,
			warningCount > 0 ? [`${warningCount} artifact warning(s) were reported by the server.`] : [],
		);
	}
	const fallback = `governmindz-${format}`;
	const filename = filenameFromDisposition(response.headers.get("Content-Disposition"), fallback);
	const blob = await response.blob();
	return {
		blob,
		filename,
		warnings:
			warningCount > 0
				? [`${warningCount} referenced artifact(s) were unavailable or skipped; check manifest.json.`]
				: [],
	};
}

export function saveBrowserBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.rel = "noopener";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadConversationExport(
	conversation: Conversation,
	format: ConversationExportFormat,
	signal?: AbortSignal,
): Promise<ConversationExportResult> {
	const result = await requestConversationExport(conversation, format, signal);
	saveBrowserBlob(result.blob, result.filename);
	return result;
}

export async function downloadConversationArchive(
	conversation: Conversation,
	signal?: AbortSignal,
): Promise<ConversationExportResult> {
	return downloadConversationExport(conversation, "zip", signal);
}
