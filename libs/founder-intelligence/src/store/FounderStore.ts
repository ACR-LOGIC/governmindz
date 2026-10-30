import type {
	AssessmentResult,
	FounderOnboardingState,
} from "../types/index.js";

export interface FounderStore {
	loadOnboarding(ownerId: string): FounderOnboardingState | null;
	saveOnboarding(ownerId: string, state: FounderOnboardingState): FounderOnboardingState;
	saveAssessment(ownerId: string, assessment: AssessmentResult): void;
	loadLatestAssessment(ownerId: string): AssessmentResult | null;
	listAssessments(ownerId: string): AssessmentResult[];
}

export class InMemoryFounderStore implements FounderStore {
	private readonly onboarding = new Map<string, FounderOnboardingState>();
	private readonly assessments = new Map<string, AssessmentResult[]>();

	loadOnboarding(ownerId: string): FounderOnboardingState | null {
		return this.onboarding.get(ownerId) ?? null;
	}

	saveOnboarding(
		ownerId: string,
		state: FounderOnboardingState,
	): FounderOnboardingState {
		this.onboarding.set(ownerId, state);
		return state;
	}

	saveAssessment(ownerId: string, assessment: AssessmentResult): void {
		const existing = this.assessments.get(ownerId) ?? [];
		existing.push(assessment);
		this.assessments.set(ownerId, existing);
	}

	loadLatestAssessment(ownerId: string): AssessmentResult | null {
		const list = this.assessments.get(ownerId) ?? [];
		return list.length > 0 ? list[list.length - 1] : null;
	}

	listAssessments(ownerId: string): AssessmentResult[] {
		return [...(this.assessments.get(ownerId) ?? [])];
	}
}
