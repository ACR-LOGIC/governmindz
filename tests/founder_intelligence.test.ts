import test from "node:test";
import assert from "node:assert/strict";
import {
	FounderIntelligenceService,
	InMemoryFounderStore,
	QuestionnaireEngine,
	ScoringEngine,
	StageEvaluator,
} from "@governmindz/founder-intelligence";

const engine = new QuestionnaireEngine();

test("conditional questions stay hidden until their condition is met", () => {
	const answers = {};
	const visibleIds = engine.listVisible(answers).map((q) => q.id);
	assert.ok(!visibleIds.includes("financial.funding_source"));
	assert.ok(!visibleIds.includes("development.github_repo"));
	assert.ok(visibleIds.includes("founder.preferred_name"));
});

test("funding source becomes visible when external funding is declared", () => {
	const visibleIds = engine
		.listVisible({ "financial.external_funding": true })
		.map((q) => q.id);
	assert.ok(visibleIds.includes("financial.funding_source"));
});

test("development questions appear once the project is beyond planning", () => {
	const visibleIds = engine
		.listVisible({ "development.current_status": "prototype" })
		.map((q) => q.id);
	assert.ok(visibleIds.includes("development.github_repo"));
	assert.ok(visibleIds.includes("development.working_application"));
});

test("progress reports required completion and section breakdown", () => {
	const progress = engine.getProgress({});
	assert.ok(progress.total > 0);
	assert.equal(progress.answered, 0);
	assert.equal(progress.complete, false);
	assert.ok(progress.sections.length > 0);
});

test("answers are validated against question options", () => {
	const invalid = engine.applyAnswer({}, "stage.self_reported", "not_a_stage");
	assert.ok(invalid.error);
	const valid = engine.applyAnswer({}, "stage.self_reported", "seed");
	assert.equal(valid.error, undefined);
	assert.equal(valid.answers["stage.self_reported"], "seed");
});

test("stage evaluation reflects evidence rather than self-report", () => {
	const evaluator = new StageEvaluator();
	const idea = evaluator.evaluate({ "development.current_status": "idea" });
	assert.equal(idea.stage, "idea");

	const preSeed = evaluator.evaluate({
		"development.current_status": "functional_mvp",
		"development.users_testing": true,
		"financial.has_revenue": false,
		"financial.external_funding": false,
	});
	assert.equal(preSeed.stage, "pre_seed");

	const revenue = evaluator.evaluate({
		"development.current_status": "revenue",
		"development.users_testing": true,
		"financial.has_revenue": true,
	});
	assert.equal(revenue.stage, "early_revenue");
});

test("stage comparison explains gaps constructively", () => {
	const evaluator = new StageEvaluator();
	const evaluation = evaluator.evaluate({ "development.current_status": "idea" });
	const comparison = evaluator.compare("seed", evaluation);
	assert.equal(comparison.matches, false);
	assert.ok(comparison.gapInStages > 0);
	assert.match(comparison.message, /evidence/i);
});

test("business formation does not influence technical or market scores", () => {
	const scoring = new ScoringEngine();
	const withoutLegal = scoring.evaluateTechnicalReadiness({
		"development.current_status": "functional_mvp",
		"development.github_repo": true,
		"development.working_application": true,
	});
	const withLegal = scoring.evaluateTechnicalReadiness({
		"development.current_status": "functional_mvp",
		"development.github_repo": true,
		"development.working_application": true,
		"business.legal_form": "llc",
		"business.ein": true,
		"business.bank_account": true,
	});
	assert.equal(withoutLegal.score, withLegal.score);
});

test("overall score stays close to the weakest dimension", () => {
	const scoring = new ScoringEngine();
	const { scores, overall } = scoring.evaluate({
		"development.current_status": "functional_mvp",
		"development.github_repo": true,
		"development.working_application": true,
		"development.users_testing": true,
		"project.problem": "Teams lose track of compliance evidence across disconnected tools.",
		"project.target_customer": "Compliance leads at mid-sized SaaS companies",
		"project.differentiation": "Evidence-first verification with deterministic scoring",
		"founder.hours_per_week": 40,
		"financial.monthly_budget": "500_2000",
		"business.legal_form": "not_yet_formed",
	});
	const weakest = scores.reduce((low, score) => (score.score < low.score ? score : low));
	assert.ok(overall.score <= weakest.score + 20);
	assert.ok(scores.length === 4);
});

test("service persists answers and resumes onboarding state", () => {
	const service = new FounderIntelligenceService(new InMemoryFounderStore());
	service.saveAnswer("founder", "founder.preferred_name", "Ada");
	service.saveAnswer("founder", "founder.hours_per_week", 25);
	const snapshot = service.getOnboarding("founder");
	assert.equal(snapshot.answers["founder.preferred_name"], "Ada");
	assert.equal(snapshot.progress.answered, 2);
	assert.ok(snapshot.nextQuestionId);
});

test("assessment is stored and retrievable with evidence-based stage", () => {
	const service = new FounderIntelligenceService(new InMemoryFounderStore());
	service.saveAnswer("founder", "stage.self_reported", "seed");
	service.saveAnswer("founder", "development.current_status", "mvp_in_progress");
	const assessment = service.runAssessment("founder");
	assert.equal(assessment.selfReportedStage, "seed");
	assert.notEqual(assessment.stageEvaluation.stage, "seed");
	assert.equal(service.getLatestAssessment("founder")?.id, assessment.id);
	assert.equal(service.listAssessments("founder").length, 1);
});

test("unknown self-reported stage degrades to unsure without failing", () => {
	const service = new FounderIntelligenceService(new InMemoryFounderStore());
	service.saveAnswer("founder", "stage.self_reported", "not_a_stage");
	assert.ok(service.buildAssessment("founder").selfReportedStage === "unsure");
});
