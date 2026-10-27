import type {
	DocumentFileInput,
	ParsedDocumentResult,
} from "@governmindz/core/documents/DocumentIngestionService";

export type DocumentEvidenceEventSink = (event: Record<string, unknown>) => void;

export interface DocumentEvidenceIngestionPort {
	ingest(input: DocumentFileInput): Promise<ParsedDocumentResult>;
	getAllChunks(): unknown[];
	formatEvidenceContext(): string;
}

export interface DocumentEvidenceIngestionDependencies {
	createService(): DocumentEvidenceIngestionPort;
	warn?(...args: unknown[]): void;
}

export class DocumentEvidenceIngestionService {
	constructor(private readonly dependencies: DocumentEvidenceIngestionDependencies) {}

	async ingest(
		attachments: DocumentFileInput[] | undefined,
		eventSink?: DocumentEvidenceEventSink,
	): Promise<string> {
		if (!attachments || attachments.length === 0) return "";

		const docService = this.dependencies.createService();
		for (const attachment of attachments) {
			try {
				const parsed = await docService.ingest(attachment);
				eventSink?.({
					type: "document_ingested",
					documentId: parsed.documentId,
					filename: parsed.filename,
					format: parsed.format,
					chunksCount: parsed.totalChunks,
					sha256: parsed.sha256,
				});
			} catch (error) {
				(this.dependencies.warn ?? console.warn)("Failed to ingest document:", String(attachment?.filename), error);
			}
		}

		return docService.getAllChunks().length > 0 ? `\n${docService.formatEvidenceContext()}` : "";
	}
}
