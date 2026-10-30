import type {
	AnswerMap,
	AnswerValue,
	AssessmentResult,
	FounderOnboardingState,
	OnboardingProgress,
	StartupStage,
} from "../types/index.js";
import { QuestionnaireEngine } from "../questionnaire/QuestionnaireEngine.js";
import { StageEvaluator, STAGE_LABELS } from "../assessment/StageEvaluator.js";
import { RULESET_VERSION, ScoringEngine } from "../assessment/ScoringEngine.js";
import type { FounderStore } from "../store/FounderStore.js";

export interface OnboardingSnapshot {
	questions: ReturnType<QuestionnaireEngine["listVisible"]>;
	answers: AnswerMap;
	progress: OnboardingProgress;
	nextQuestionId: string | null;
	updatedAt: number;
}

export class FounderIntelligenceService {
	readonly questionnaire = new QuestionnaireEngine();
	readonly stageEvaluator = new StageEvaluator();
	readonly scoring = new ScoringEngine();

	constructor(private readonly store: FounderStore) {}

	getOnboarding(ownerId: string): OnboardingSnapshot {
		const state = this.store.loadOnboarding(ownerId);
		const answers = state?.answers ?? {};
		const visible = this.questionnaire.listVisible(answers);
		return {
			questions: visible,
			answers,
			progress: this.questionnaire.getProgress(answers),
			nextQuestionId: this.questionnaire.getNextQuestion(answers)?.id ?? null,
			updatedAt: state?.updatedAt ?? 0,
		};
	}

	saveAnswer(
		ownerId: string,
		questionId: string,
		value: AnswerValue,
	): { state: FounderOnboardingState; error?: string } {
		const current = this.store.loadOnboarding(ownerId);
		const answers = current?.answers ?? {};
		const result = this.questionnaire.applyAnswer(answers, questionId, value);
		if (result.error) {
			return { state: current ?? { answers, answeredAt: {}, updatedAt: 0 }, error: result.error };
		}
		const answeredAt = {
			...(current?.answeredAt ?? {}),
			[questionId]: Date.now(),
		};
		const state: FounderOnboardingState = {
			answers: result.answers,
			answeredAt,
			project: current?.project,
			updatedAt: Date.now(),
		};
		return { state: this.store.saveOnboarding(ownerId, state) };
	}

	saveProject(
		ownerId: string,
		project: FounderOnboardingState["project"],
	): FounderOnboardingState {
		const current = this.store.loadOnboarding(ownerId);
		const state: FounderOnboardingState = {
			answers: current?.answers ?? {},
			answeredAt: current?.answeredAt ?? {},
			project,
			updatedAt: Date.now(),
		};
		return this.store.saveOnboarding(ownerId, state);
	}

	buildAssessment(ownerId: string): AssessmentResult {
		const state = this.store.loadOnboarding(ownerId);
		const answers = state?.answers ?? {};
		const selfReported = this.resolveSelfReportedStage(answers);
		const stageEvaluation = this.stageEvaluator.evaluate(answers);
		const stageComparison = this.stageEvaluator.compare(selfReported, stageEvaluation);
		const { scores, overall, weighting } = this.scoring.evaluate(answers);

		return {
			id: `assessment:${Date.now()}:${ownerId}`,
			createdAt: Date.now(),
			rulesetVersion: RULESET_VERSION,
			selfReportedStage: selfReported,
			stageEvaluation,
			stageComparison,
			scores,
			overall,
			weighting,
		};
	}

	runAssessment(ownerId: string): AssessmentResult {
		const assessment = this.buildAssessment(ownerId);
		this.store.saveAssessment(ownerId, assessment);
		return assessment;
	}

	getLatestAssessment(ownerId: string): AssessmentResult | null {
		return this.store.loadLatestAssessment(ownerId);
	}

	listAssessments(ownerId: string): AssessmentResult[] {
		return this.store.listAssessments(ownerId);
	}

	private resolveSelfReportedStage(answers: AnswerMap): StartupStage {
		const raw = answers["stage.self_reported"];
		if (typeof raw !== "string") return "unsure";
		const known = Object.keys(STAGE_LABELS) as StartupStage[];
		return known.includes(raw as StartupStage) ? (raw as StartupStage) : "unsure";
	}
}
