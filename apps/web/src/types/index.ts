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
	| "user";

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
	| "final";

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

export type ActiveTab = "chat" | "explorer" | "evidence";
