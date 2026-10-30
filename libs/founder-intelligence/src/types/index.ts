export type OnboardingSectionId =
	| "founder_profile"
	| "financial_position"
	| "business_legal"
	| "project_identity"
	| "development_status"
	| "self_reported_stage"
	| "team_capacity"
	| "help_requested";

export type AnswerValue = string | number | boolean | string[] | null;

export type AnswerMap = Record<string, AnswerValue>;

export type QuestionKind =
	| "text"
	| "long_text"
	| "single_select"
	| "multi_select"
	| "number"
	| "boolean";

export interface QuestionOption {
	value: string;
	label: string;
	hint?: string;
}

export interface VisibilityRule {
	questionId: string;
	equals?: AnswerValue[];
	notEquals?: AnswerValue[];
}

export interface QuestionDefinition {
	id: string;
	section: OnboardingSectionId;
	prompt: string;
	helpText?: string;
	kind: QuestionKind;
	options?: QuestionOption[];
	required?: boolean;
	visibleWhen?: VisibilityRule[];
	sensitive?: boolean;
}

export interface QuestionAnswer {
	questionId: string;
	value: AnswerValue;
	answeredAt: number;
}

export interface SectionProgress {
	section: OnboardingSectionId;
	label: string;
	answered: number;
	total: number;
	percent: number;
}

export interface OnboardingProgress {
	answered: number;
	total: number;
	percent: number;
	complete: boolean;
	sections: SectionProgress[];
}

export type StartupStage =
	| "idea"
	| "pre_validation"
	| "pre_seed"
	| "seed"
	| "early_revenue"
	| "growth"
	| "scaling"
	| "unsure";

export interface StageSignal {
	id: string;
	label: string;
	present: boolean;
	weight: number;
	source: string;
}

export interface StageEvaluation {
	stage: StartupStage;
	label: string;
	confidence: number;
	evidenceCoverage: number;
	rationale: string;
	signals: StageSignal[];
}

export interface StageComparison {
	selfReported: StartupStage;
	selfReportedLabel: string;
	assessed: StartupStage;
	assessedLabel: string;
	matches: boolean;
	gapInStages: number;
	message: string;
}

export type EvidenceVerificationStatus =
	| "detected"
	| "implemented"
	| "tested"
	| "verified"
	| "inferred"
	| "unknown";

export type EvidenceKind = "answer" | "repository" | "external";

export interface EvidenceRef {
	id: string;
	kind: EvidenceKind;
	source: string;
	detail?: string;
	path?: string;
	line?: number;
	commitSha?: string;
	verificationStatus: EvidenceVerificationStatus;
}

export type FindingStatus =
	| "confirmed_problem"
	| "potential_problem"
	| "recommendation"
	| "missing_information"
	| "strength";

export interface Finding {
	id: string;
	scoreId: string;
	title: string;
	detail: string;
	status: FindingStatus;
	severity: "low" | "medium" | "high";
	confidence: number;
	evidence: EvidenceRef[];
	missingEvidence?: string[];
}

export type ScoreId =
	| "technical_readiness"
	| "market_opportunity"
	| "business_readiness"
	| "founder_capacity"
	| "overall_readiness";

export interface ScoreBand {
	label: string;
	min: number;
	max: number;
}

export interface ScoreResult {
	id: ScoreId;
	label: string;
	score: number;
	band: string;
	confidence: number;
	evidenceCoverage: number;
	findings: Finding[];
	missingEvidence: string[];
	weight: number;
}

export interface AssessmentResult {
	id: string;
	createdAt: number;
	rulesetVersion: string;
	selfReportedStage: StartupStage;
	stageEvaluation: StageEvaluation;
	stageComparison: StageComparison;
	scores: ScoreResult[];
	overall: ScoreResult;
	weighting: { scoreId: ScoreId; weight: number; rationale: string }[];
}

export interface FounderProjectLink {
	projectId?: string;
	sourceType?: "github_repository" | "local_project";
	repositoryUrl?: string;
	localPath?: string;
}

export interface FounderOnboardingState {
	answers: AnswerMap;
	answeredAt: Record<string, number>;
	project?: FounderProjectLink;
	updatedAt: number;
}
