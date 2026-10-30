import type {
	AnswerMap,
	AnswerValue,
	OnboardingProgress,
	OnboardingSectionId,
	QuestionDefinition,
	SectionProgress,
	VisibilityRule,
} from "../types/index.js";
import {
	ONBOARDING_QUESTIONS,
	QUESTION_MAP,
	SECTION_LABELS,
	SECTION_ORDER,
} from "./questions.js";

export interface ValidationResult {
	valid: boolean;
	missingRequired: string[];
	invalidAnswers: string[];
}

function valuesMatch(answer: AnswerValue, candidates: AnswerValue[]): boolean {
	if (answer === null || answer === undefined) return false;
	const answerItems = Array.isArray(answer) ? answer : [answer];
	return candidates.some((candidate) => {
		const candidateItems = Array.isArray(candidate) ? candidate : [candidate];
		return answerItems.some((item) =>
			candidateItems.some((entry) => String(entry) === String(item)),
		);
	});
}

function ruleSatisfied(rule: VisibilityRule, answers: AnswerMap): boolean {
	const current = answers[rule.questionId];
	if (current === undefined || current === null) return false;
	if (rule.equals && !valuesMatch(current, rule.equals)) return false;
	if (rule.notEquals && valuesMatch(current, rule.notEquals)) return false;
	return true;
}

export class QuestionnaireEngine {
	private readonly questions: QuestionDefinition[];

	constructor(questions: QuestionDefinition[] = ONBOARDING_QUESTIONS) {
		this.questions = questions;
	}

	getQuestion(questionId: string): QuestionDefinition | undefined {
		return QUESTION_MAP[questionId] ?? this.questions.find((q) => q.id === questionId);
	}

	isVisible(question: QuestionDefinition, answers: AnswerMap): boolean {
		if (!question.visibleWhen || question.visibleWhen.length === 0) return true;
		return question.visibleWhen.every((rule) => ruleSatisfied(rule, answers));
	}

	listVisible(answers: AnswerMap): QuestionDefinition[] {
		return this.questions.filter((question) => this.isVisible(question, answers));
	}

	getSections(answers: AnswerMap): OnboardingSectionId[] {
		const visible = new Set(this.listVisible(answers).map((q) => q.section));
		return SECTION_ORDER.filter((section) => visible.has(section));
	}

	getProgress(answers: AnswerMap): OnboardingProgress {
		const visible = this.listVisible(answers);
		const sections: SectionProgress[] = SECTION_ORDER.map((section) => {
			const sectionQuestions = visible.filter((q) => q.section === section);
			const answered = sectionQuestions.filter(
				(q) => this.isAnswered(answers[q.id]),
			).length;
			const total = sectionQuestions.length;
			return {
				section,
				label: SECTION_LABELS[section],
				answered,
				total,
				percent: total === 0 ? 100 : Math.round((answered / total) * 100),
			};
		}).filter((section) => section.total > 0);

		const answered = visible.filter((q) => this.isAnswered(answers[q.id])).length;
		const total = visible.length;
		const missingRequired = visible.filter(
			(q) => q.required && !this.isAnswered(answers[q.id]),
		);

		return {
			answered,
			total,
			percent: total === 0 ? 0 : Math.round((answered / total) * 100),
			complete: total > 0 && missingRequired.length === 0,
			sections,
		};
	}

	isAnswered(value: AnswerValue | undefined): boolean {
		if (value === undefined || value === null) return false;
		if (typeof value === "string") return value.trim().length > 0;
		if (Array.isArray(value)) return value.length > 0;
		return true;
	}

	validateAnswer(question: QuestionDefinition, value: AnswerValue): boolean {
		if (!this.isAnswered(value)) return false;
		switch (question.kind) {
			case "boolean":
				return typeof value === "boolean";
			case "number":
				return typeof value === "number" && Number.isFinite(value);
			case "multi_select":
				return (
					Array.isArray(value) &&
					value.every((item) =>
						(question.options ?? []).some((option) => option.value === item),
					)
				);
			case "single_select":
				return (
					typeof value === "string" &&
					(question.options ?? []).some((option) => option.value === value)
				);
			case "text":
			case "long_text":
				return typeof value === "string";
			default:
				return false;
		}
	}

	validate(answers: AnswerMap): ValidationResult {
		const visible = this.listVisible(answers);
		const missingRequired = visible
			.filter((q) => q.required && !this.isAnswered(answers[q.id]))
			.map((q) => q.id);
		const invalidAnswers = visible
			.filter((q) => this.isAnswered(answers[q.id]))
			.filter((q) => !this.validateAnswer(q, answers[q.id]))
			.map((q) => q.id);
		return {
			valid: missingRequired.length === 0 && invalidAnswers.length === 0,
			missingRequired,
			invalidAnswers,
		};
	}

	getNextQuestion(answers: AnswerMap): QuestionDefinition | null {
		const visible = this.listVisible(answers);
		const unansweredRequired = visible.find(
			(q) => q.required && !this.isAnswered(answers[q.id]),
		);
		if (unansweredRequired) return unansweredRequired;
		return visible.find((q) => !this.isAnswered(answers[q.id])) ?? null;
	}

	applyAnswer(
		answers: AnswerMap,
		questionId: string,
		value: AnswerValue,
	): { answers: AnswerMap; error?: string } {
		const question = this.getQuestion(questionId);
		if (!question) {
			return { answers, error: `Unknown question: ${questionId}` };
		}
		if (!this.validateAnswer(question, value)) {
			return { answers, error: `Invalid answer for question: ${questionId}` };
		}
		const next: AnswerMap = { ...answers, [questionId]: value };
		return { answers: next };
	}
}
