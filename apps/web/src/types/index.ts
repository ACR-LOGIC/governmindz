export type AgentId =
	| "FactChecker"
	| "CloudArchitect"
	| "Synthesizer"
	| "RivalChallenger"
	| "Thinker"
	| "ContextAgent"
	| "CredibleSourcesResearchAgent"
	| "SocialCommunityResearchAgent"
	| "Orchestrator"
	| "Supervisor"
	| "DesignAssistant"
	| "DataCrew-Catalog"
	| "DataCrew-Query"
	| "DataCrew-Anomaly"
	| "DataCrew-Provenance"
	| "WebCrew-Standards"
	| "WebCrew-Freshness"
	| "WebCrew-Scholarly"
	| "WebCrew-Counter"
	| "user";

export type DeliverableType =
	| "presentation"
	| "report"
	| "spreadsheet"
	| "chart"
	| "written_answer"
	| "multiple";

export type DeliverableFormat =
	| "pptx"
	| "pdf"
	| "docx"
	| "csv"
	| "xlsx"
	| "svg"
	| "png"
	| "text"
	| "json";

export interface DeliverableContract {
	contractId: string;
	originalUserRequest: string;
	primaryOutputType: DeliverableType;
	requiredDeliverables: Array<{
		id: string;
		type: DeliverableType;
		format: DeliverableFormat;
		title: string;
		filename: string;
		description: string;
		requiredSections: string[];
	}>;
	requiredSections: string[];
	fileFormat: DeliverableFormat;
	requiredVisuals: string[];
	audienceToneStyle: string;
	requiresFile: boolean;
	supplementaryEvidenceExport: boolean;
	createdAt: number;
}

export interface ArtifactDescriptor {
	id: string;
	contractId: string;
	type: DeliverableType;
	format: DeliverableFormat;
	title: string;
	filename: string;
	filePath: string;
	mimeType: string;
	sizeBytes: number;
	viewUrl: string;
	downloadUrl: string;
	summary: string;
	status: "validated" | "failed" | "rejected";
	validationDetails: {
		exists: boolean;
		readable: boolean;
		sizeBytes: number;
		formatMatches: boolean;
		hasExpectedContent: boolean;
		error?: string;
	};
	createdAt: number;
}

export type AgentStatus =
	| "idle"
	| "queued"
	| "researching"
	| "analyzing"
	| "challenging"
	| "synthesizing"
	| "completed"
	| "error";

export interface AgentProfile {
	id: string;
	name: string;
	humanName?: string;
	avatarId?: string;
	role: string;
	jobTask?: string;
	creativeTitle?: string;
	domainExpertise?: string;
	initials: string;
	avatarGradient: string;
	accentColor: string;
	status: AgentStatus;
	currentTask?: string;
	evidenceCount?: number;
	confidence?: number | null;
	lastActiveTime?: number;
	liveReasoning?: string[];
	arrivalStage?: "pop_in" | "holding" | "greeting" | "assigned" | "working";
	arrivalMessage?: string;
}

export interface StructuredOutput {
	position?: string;
	confidence_self?: number;
	confidenceSelf?: number;
	confidence_expert_agreement?: number;
	confidenceExpertAgreement?: number;
	evidence?: string[];
	caveats?: string[];
	supports?: string[];
	dissents_from?: string[];
	dissentsFrom?: string[];
}

export type MessageType =
	| "user"
	| "orchestrator"
	| "proposal"
	| "challenge"
	| "rebuttal"
	| "refinement"
	| "consensus"
	| "escalation"
	| "summary"
	| "intervention"
	| "acknowledgment"
	| "final";

export interface MessageContractMessage {
	type: string;
	text: string;
	replyTo?: string;
}

export interface MessageContractResult {
	conclusion: string;
	confidence: number;
	evidenceIds: string[];
	unresolvedQuestions: string[];
}

export interface MessageContractExecution {
	taskId: string;
	status: "pending" | "running" | "completed" | "error" | string;
	round?: number;
	latency_ms?: number;
	auditRef?: string;
}

export interface MessageGenerationContract {
	schemaVersion: "1.0";
	message: MessageContractMessage;
	result: MessageContractResult;
	execution: MessageContractExecution;
}

export interface ChatMessage {
	id: string;
	fromSeat: string;
	toSeat?: string;
	type: MessageType;
	content: string;
	structured?: StructuredOutput;
	round?: number;
	confidence?: number;
	timestamp: number;
	latency_ms?: number;
	replyToId?: string;
	replyToExcerpt?: string;
	userRating?: "up" | "down" | null;
	envelope?: MessageGenerationContract;
}

export interface WebSearchResultItem {
	title: string;
	url: string;
	snippet: string;
	source: string;
	publishedDate?: string;
	verificationStatus?: "verified" | "authoritative" | "provisional";
}

export interface AuditEvent {
	id: string;
	event_type: string;
	session_id: string;
	timestamp: number;
	payload: Record<string, unknown>;
	previous_hash: string;
	hash: string;
	signature: string;
	linked_decay_hash?: string;
}

export interface ZetarisData {
	query: string;
	columns: string[];
	rows: unknown[][];
	total: number;
	isSynthetic?: boolean;
	evidenceSource?: string;
}

export interface WorkflowTimelineEvent {
	id: string;
	state: string;
	timestamp: number;
	trigger: string;
	agent?: string;
	details?: string;
}

export interface ScenarioItem {
	file: string;
	id: string;
	title?: string;
	topic: string;
	rows?: number;
}

export interface SeatAssignment {
	seatId?: string;
	humanName: string;
	avatarId?: string;
	role?: string;
	jobTask: string;
}

export interface Conversation {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	topic: string;
	mode: "live" | "demo" | "sample";
	scenarioId?: string;
	messages: ChatMessage[];
	auditEvents: AuditEvent[];
	zetarisData?: ZetarisData | null;
	finalConfidence?: number;
	status: "idle" | "running" | "completed" | "error";
	inquiryScore?: number;
	workflowEvents: WorkflowTimelineEvent[];
	agentAssignments?: Record<string, SeatAssignment>;
	webSearchData?: {
		query: string;
		total: number;
		source: string;
		results: WebSearchResultItem[];
	} | null;
	contract?: DeliverableContract | null;
	primaryArtifact?: ArtifactDescriptor | null;
	additionalArtifacts?: ArtifactDescriptor[];
	evidenceExport?: ArtifactDescriptor | null;
	supervisorResponse?: string | null;
	supervisorDecision?: "APPROVED" | "REJECTED" | null;
	dataCrewReport?: any;
	webCrewReport?: any;
}

export interface HealthStatus {
	meterless?: {
		state: string;
		configured?: boolean;
		model?: string;
		reason?: string;
		endpoint?: string;
	};
	zetaris?: {
		ok: boolean;
		configured?: boolean;
		rows?: number;
		reason?: string;
	};
}

export type ActiveTab = "chat" | "explorer" | "evidence" | "founder";

export interface MessageFeedbackPayload {
	conversationId: string;
	messageId: string;
	seatId: string;
	rating: "up" | "down";
	round?: number;
	userComment?: string;
}

export interface AgentCredibilityRecord {
	seatId: string;
	alpha: number;
	beta: number;
	sampleCount: number;
	credibilityScore: number;
	weightMultiplier: number;
	updatedAt: number;
}

export type VerificationStatus =
	| "VERIFIED"
	| "GENESIS_MISMATCH"
	| "BROKEN_CHAIN_LINK"
	| "PAYLOAD_HASH_MISMATCH"
	| "INVALID_SIGNATURE";

export interface BlockVerificationDetail {
	index: number;
	id: string;
	eventType: string;
	expectedPreviousHash: string;
	actualPreviousHash: string;
	expectedHash: string;
	actualHash: string;
	signatureValid: boolean;
	status: VerificationStatus;
	timestamp?: number;
	payload?: Record<string, unknown>;
	error?: string;
}

export interface AuditVerificationReport {
	verified: boolean;
	totalBlocks: number;
	corruptedBlockIndex: number | null;
	corruptedBlockId: string | null;
	status: VerificationStatus;
	details: BlockVerificationDetail[];
	blocks?: BlockVerificationDetail[];
	verifiedAt: number;
	genesisAnchor: string;
	terminalHash: string;
}

export interface AuditProofCertificate {
	certificateVersion: string;
	standard: string;
	certificateId: string;
	issuer: string;
	sessionId: string;
	timestamp: number;
	verificationResult: {
		verified: boolean;
		status: VerificationStatus;
		totalBlocks: number;
		genesisAnchor: string;
		terminalHeadHash: string;
		hmacAlgorithm: string;
		corruptedBlockIndex: number | null;
	};
	blockManifest: Array<{
		index: number;
		id: string;
		type: string;
		hash: string;
		previousHash: string;
		status: VerificationStatus;
	}>;
	attestationSignature: string;
}

export * from "./crew";

export interface WebhookConfig {
	id: string;
	name: string;
	url: string;
	secret: string;
	events: WebhookEvent[];
	active: boolean;
	createdAt: number;
	updatedAt: number;
	lastDelivery?: WebhookDelivery;
}

export type WebhookEvent =
	| "run.started"
	| "run.completed"
	| "run.failed"
	| "message.created"
	| "audit.verified"
	| "webhook.delivery_failed";

export interface WebhookDelivery {
	id: string;
	webhookId: string;
	event: WebhookEvent;
	status: "delivered" | "failed";
	statusCode: number | null;
	responseBody: string | null;
	durationMs: number;
	timestamp: number;
	error?: string;
}

export interface WebhookStats {
	totalDeliveries: number;
	successfulDeliveries: number;
	failedDeliveries: number;
	lastDeliveryAt: number | null;
}

export interface FounderQuestionOption {
	value: string;
	label: string;
	hint?: string;
}

export interface FounderQuestion {
	id: string;
	section: string;
	prompt: string;
	helpText?: string;
	kind: string;
	options?: FounderQuestionOption[];
	required?: boolean;
}

export interface FounderSectionProgress {
	section: string;
	label: string;
	answered: number;
	total: number;
	percent: number;
}

export interface FounderProgress {
	answered: number;
	total: number;
	percent: number;
	complete: boolean;
	sections: FounderSectionProgress[];
}

export interface FounderOnboardingSnapshot {
	questions: FounderQuestion[];
	answers: Record<string, string | number | boolean | string[] | null>;
	progress: FounderProgress;
	nextQuestionId: string | null;
	updatedAt: number;
}

export interface FounderEvidence {
	id: string;
	kind: string;
	source: string;
	detail?: string;
	verificationStatus: string;
}

export interface FounderFinding {
	id: string;
	scoreId: string;
	title: string;
	detail: string;
	status: string;
	severity: string;
	confidence: number;
	evidence: FounderEvidence[];
	missingEvidence?: string[];
}

export interface FounderScore {
	id: string;
	label: string;
	score: number;
	band: string;
	confidence: number;
	evidenceCoverage: number;
	findings: FounderFinding[];
	missingEvidence: string[];
	weight: number;
}

export interface FounderStageEvaluation {
	stage: string;
	label: string;
	confidence: number;
	evidenceCoverage: number;
	rationale: string;
	signals: { id: string; label: string; present: boolean; weight: number; source: string }[];
}

export interface FounderStageComparison {
	selfReported: string;
	selfReportedLabel: string;
	assessed: string;
	assessedLabel: string;
	matches: boolean;
	gapInStages: number;
	message: string;
}

export interface FounderAssessment {
	id: string;
	createdAt: number;
	rulesetVersion: string;
	selfReportedStage: string;
	stageEvaluation: FounderStageEvaluation;
	stageComparison: FounderStageComparison;
	scores: FounderScore[];
	overall: FounderScore;
	weighting: { scoreId: string; weight: number; rationale: string }[];
}

