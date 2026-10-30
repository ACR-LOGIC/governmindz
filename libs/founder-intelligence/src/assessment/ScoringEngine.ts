import type {
	AnswerMap,
	AnswerValue,
	EvidenceRef,
	Finding,
	ScoreId,
	ScoreResult,
} from "../types/index.js";

export const SCORE_LABELS: Record<ScoreId, string> = {
	technical_readiness: "Technical readiness",
	market_opportunity: "Market opportunity",
	business_readiness: "Business readiness",
	founder_capacity: "Founder operating capacity",
	overall_readiness: "Overall startup readiness",
};

export const RULESET_VERSION = "founder-intelligence-1.0.0";

const SCORE_WEIGHTS: { scoreId: ScoreId; weight: number; rationale: string }[] = [
	{
		scoreId: "technical_readiness",
		weight: 0.3,
		rationale:
			"A product that works is the precondition for every market and business outcome.",
	},
	{
		scoreId: "market_opportunity",
		weight: 0.3,
		rationale:
			"Market pull determines whether technical and business work converts into durable value.",
	},
	{
		scoreId: "business_readiness",
		weight: 0.2,
		rationale:
			"Business formation and revenue mechanics determine survivability, and are weighted independently from product quality.",
	},
	{
		scoreId: "founder_capacity",
		weight: 0.2,
		rationale:
			"Founder time, budget and team capacity set the realistic pace of every plan.",
	},
];

const DEVELOPMENT_MATURITY: Record<string, number> = {
	idea: 5,
	planning: 12,
	design: 20,
	proof_of_concept: 32,
	prototype: 45,
	mvp_in_progress: 58,
	functional_mvp: 72,
	public_product: 82,
	active_users: 90,
	revenue: 95,
	established: 98,
};

const BUDGET_CAPACITY: Record<string, number> = {
	"0": 5,
	under_100: 15,
	"100_500": 30,
	"500_2000": 50,
	"2000_5000": 70,
	over_5000: 90,
	prefer_not_to_disclose: 40,
};

const FUNDING_STAGE_SCORE: Record<string, number> = {
	none_planned: 10,
	friends_family: 30,
	grant: 35,
	accelerator: 40,
	preseed: 55,
	seed: 75,
	series_a_or_later: 90,
	venture_capital: 80,
	other: 35,
};

function asBoolean(value: AnswerValue | undefined): boolean {
	return value === true;
}

function asText(value: AnswerValue | undefined): string {
	return typeof value === "string" ? value.trim() : "";
}

function asArray(value: AnswerValue | undefined): string[] {
	return Array.isArray(value) ? value : [];
}

function answerEvidence(questionId: string, note: string): EvidenceRef {
	return {
		id: `answer:${questionId}`,
		kind: "answer",
		source: `questionnaire:${questionId}`,
		detail: note,
		verificationStatus: "detected",
	};
}

function finding(
	scoreId: ScoreId,
	id: string,
	title: string,
	detail: string,
	status: Finding["status"],
	severity: Finding["severity"],
	confidence: number,
	evidence: EvidenceRef[],
	missingEvidence?: string[],
): Finding {
	return {
		id,
		scoreId,
		title,
		detail,
		status,
		severity,
		confidence,
		evidence,
		missingEvidence,
	};
}

function clamp(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function bandFor(score: number): string {
	if (score >= 80) return "Strong";
	if (score >= 60) return "Developing";
	if (score >= 40) return "Early";
	if (score >= 20) return "Emerging";
	return "Foundation";
}

function scoreResult(
	id: ScoreId,
	score: number,
	confidence: number,
	coverage: number,
	findings: Finding[],
	missingEvidence: string[],
): ScoreResult {
	const clamped = clamp(score);
	return {
		id,
		label: SCORE_LABELS[id],
		score: clamped,
		band: bandFor(clamped),
		confidence: Math.round(confidence * 100) / 100,
		evidenceCoverage: Math.round(coverage),
		findings,
		missingEvidence,
		weight: SCORE_WEIGHTS.find((w) => w.scoreId === id)?.weight ?? 0,
	};
}

export class ScoringEngine {
	evaluateTechnicalReadiness(answers: AnswerMap): ScoreResult {
		const findings: Finding[] = [];
		const missingEvidence: string[] = [];
		const status = asText(answers["development.current_status"]);
		const maturity = DEVELOPMENT_MATURITY[status] ?? 5;
		const hasRepository =
			asBoolean(answers["development.github_repo"]) ||
			asBoolean(answers["development.local_project"]);
		const hasWorkingApp = asBoolean(answers["development.working_application"]);
		const hasUsers = asBoolean(answers["development.users_testing"]);
		const active = asBoolean(answers["development.active_development"]);

		const score =
			maturity * 0.35 +
			(hasRepository ? 25 : 0) +
			(hasWorkingApp ? 20 : 0) +
			(hasUsers ? 12 : 0) +
			(active ? 8 : 0);

		if (hasRepository) {
			findings.push(
				finding(
					"technical_readiness",
					"tech.repository_present",
					"Source code is available for inspection",
					"A repository or local project is connected, so code-level evidence can be collected.",
					"strength",
					"low",
					0.9,
					[answerEvidence("development.github_repo", "Repository presence declared by the founder")],
				),
			);
		} else {
			missingEvidence.push("Repository or local project connection");
			findings.push(
				finding(
					"technical_readiness",
					"tech.no_repository",
					"No code is connected yet",
					"Without a connected repository, technical readiness is based on founder-declared status only and code-level checks cannot run.",
					"missing_information",
					"high",
					0.95,
					[],
					["Repository or local project connection"],
				),
			);
		}

		if (hasWorkingApp) {
			findings.push(
				finding(
					"technical_readiness",
					"tech.working_app",
					"A working application exists",
					"The founder reports a running application.",
					"strength",
					"low",
					0.8,
					[answerEvidence("development.working_application", "Working application declared by the founder")],
				),
			);
		} else {
			findings.push(
				finding(
					"technical_readiness",
					"tech.no_working_app",
					"No working application reported",
					"Product maturity is limited at this stage; shipping a minimal end-to-end path is the highest leverage technical step.",
					"potential_problem",
					"medium",
					0.8,
					[answerEvidence("development.current_status", `Declared development status: ${status || "unknown"}`)],
				),
			);
		}

		if (!hasUsers) {
			findings.push(
				finding(
					"technical_readiness",
					"tech.no_test_users",
					"No external testing reported",
					"Without testers, regressions and usability problems stay invisible until launch.",
					"potential_problem",
					"medium",
					0.7,
					[],
					["Tester feedback, test results, or a pilot cohort"],
				),
			);
		}

		const coverage = hasRepository ? 70 : 40;
		return scoreResult(
			"technical_readiness",
			score,
			hasRepository ? 0.72 : 0.55,
			coverage,
			findings,
			missingEvidence,
		);
	}

	evaluateMarketOpportunity(answers: AnswerMap): ScoreResult {
		const findings: Finding[] = [];
		const missingEvidence: string[] = [];
		const problem = asText(answers["project.problem"]);
		const customer = asText(answers["project.target_customer"]);
		const differentiation = asText(answers["project.differentiation"]);
		const validation = asBoolean(answers["development.users_testing"]);
		const paying = asBoolean(answers["development.paying_customers"]);

		let score = 0;
		if (problem.length > 10) score += 25;
		if (customer.length > 5) score += 20;
		if (differentiation.length > 5) score += 15;
		if (validation) score += 20;
		if (paying) score += 20;

		if (problem.length <= 10 || customer.length <= 5) {
			findings.push(
				finding(
					"market_opportunity",
					"market.problem_undefined",
					"Problem and customer are not yet specific",
					"Market assessment needs a named problem experienced by a specific audience before demand can be judged.",
					"missing_information",
					"high",
					0.9,
					[],
					["Problem statement", "Target customer description"],
				),
			);
		} else {
			findings.push(
				finding(
					"market_opportunity",
					"market.problem_defined",
					"Problem and audience are articulated",
					"The founder describes a specific problem for a specific audience, which is the base requirement for market research.",
					"strength",
					"low",
					0.85,
					[
						answerEvidence("project.problem", "Problem statement provided"),
						answerEvidence("project.target_customer", "Target customer provided"),
					],
				),
			);
		}

		if (!validation && !paying) {
			missingEvidence.push("Customer validation interviews or pilot results");
			findings.push(
				finding(
					"market_opportunity",
					"market.no_validation",
					"No customer validation evidence yet",
					"Demand is unverified. GovernMindz does not infer demand from the quality of the idea alone.",
					"potential_problem",
					"high",
					0.9,
					[],
					["Customer interviews", "Pilot or beta usage data"],
				),
			);
		}

		missingEvidence.push("Competitor and market-size research");
		findings.push(
			finding(
				"market_opportunity",
				"market.research_pending",
				"Competitive and market-size research has not run",
				"This score reflects founder-provided signals only. Competitors, pricing benchmarks and demand evidence require the market research phase.",
				"missing_information",
				"medium",
				0.95,
				[],
				["Competitor research", "Market sizing evidence", "Pricing benchmark data"],
			),
		);

		return scoreResult(
			"market_opportunity",
			score,
			0.5,
			validation || paying ? 55 : 30,
			findings,
			missingEvidence,
		);
	}

	evaluateBusinessReadiness(answers: AnswerMap): ScoreResult {
		const findings: Finding[] = [];
		const missingEvidence: string[] = [];
		const legalForm = asText(answers["business.legal_form"]);
		const formed = legalForm !== "" && legalForm !== "not_yet_formed";
		const hasRevenue = asBoolean(answers["financial.has_revenue"]);
		const hasCustomers = asBoolean(answers["financial.paying_customers"]);
		const registeredName = asBoolean(answers["business.registered_name"]);
		const ein = asBoolean(answers["business.ein"]);
		const bank = asBoolean(answers["business.bank_account"]);
		const website = asBoolean(answers["business.website"]);
		const agreements = asBoolean(answers["business.commercial_agreements"]);
		const insurance = asBoolean(answers["business.insurance_and_contracts"]);
		const fundingSource = asText(answers["financial.funding_source"]);
		const revenueIntent = asBoolean(answers["project.revenue_intent"]);

		let score = 0;
		if (formed) score += 20;
		if (registeredName) score += 8;
		if (ein) score += 8;
		if (bank) score += 12;
		if (website) score += 8;
		if (agreements) score += 10;
		if (insurance) score += 8;
		if (hasRevenue) score += 14;
		if (hasCustomers) score += 8;
		if (revenueIntent) score += 4;

		if (!formed) {
			findings.push(
				finding(
					"business_readiness",
					"business.not_formed",
					"No business entity yet",
					"Business formation is tracked separately from technical and product quality. Consider forming an entity when you take on contracts, revenue or meaningful liability, and take professional legal or accounting advice for your jurisdiction.",
					"recommendation",
					"medium",
					0.95,
					[answerEvidence("business.legal_form", `Declared legal form: ${legalForm || "unknown"}`)],
					["Jurisdiction-specific legal guidance"],
				),
			);
		} else {
			findings.push(
				finding(
					"business_readiness",
					"business.formed",
					"A business entity is in place",
					"Legal structure exists, which supports contracts, invoicing and funding conversations.",
					"strength",
					"low",
					0.9,
					[answerEvidence("business.legal_form", `Declared legal form: ${legalForm}`)],
				),
			);
		}

		if (!hasRevenue) {
			findings.push(
				finding(
					"business_readiness",
					"business.no_revenue",
					"No revenue recorded",
					"Revenue is the strongest business-readiness signal available and is currently absent.",
					"potential_problem",
					"high",
					0.9,
					[answerEvidence("financial.has_revenue", "Founder-declared revenue status")],
				),
			);
		}

		if (!asText(answers["financial.funding_source"]) && !asBoolean(answers["financial.seeking_investors"])) {
			missingEvidence.push("Funding strategy and readiness");
		}

		return scoreResult(
			"business_readiness",
			score,
			0.72,
			missingEvidence.length === 0 ? 75 : 55,
			findings,
			missingEvidence,
		);
	}

	evaluateFounderCapacity(answers: AnswerMap): ScoreResult {
		const findings: Finding[] = [];
		const missingEvidence: string[] = [];
		const hoursRaw = answers["founder.hours_per_week"];
		const hours = typeof hoursRaw === "number" ? hoursRaw : 0;
		const budget = asText(answers["financial.monthly_budget"]);
		const budgetScore = BUDGET_CAPACITY[budget] ?? 20;
		const teamSize =
			(asBoolean(answers["team.has_cofounders"]) ? 1 : 0) +
			(asBoolean(answers["team.has_employees"]) ? 1 : 0) +
			(asBoolean(answers["team.has_contractors"]) ? 1 : 0) +
			(asBoolean(answers["team.has_advisors"]) ? 1 : 0);
		const gaps = asArray(answers["team.missing_skills"]).length;
		const experience = asArray(answers["founder.experience"]);

		const hoursScore = Math.min(100, (hours / 40) * 100);
		const teamScore = Math.min(100, teamSize * 30);
		const experienceScore = Math.min(100, experience.length * 20);
		const gapPenalty = Math.min(30, gaps * 5);

		const score =
			hoursScore * 0.4 + budgetScore * 0.25 + teamScore * 0.15 + experienceScore * 0.2 - gapPenalty;

		findings.push(
			finding(
				"founder_capacity",
				"capacity.hours",
				`${hours} hours per week available`,
				hours >= 20
					? "Time availability supports sustained weekly execution on a focused milestone."
					: "Limited hours mean milestones must be scoped to what fits in the available time.",
				hours >= 20 ? "strength" : "potential_problem",
				hours >= 20 ? "low" : "medium",
				0.9,
				[answerEvidence("founder.hours_per_week", `Declared weekly hours: ${hours}`)],
			),
		);

		if (budget === "0" || budget === "prefer_not_to_disclose") {
			missingEvidence.push("Budget allocation for marketing, infrastructure and services");
		}

		if (gaps > 0) {
			findings.push(
				finding(
					"founder_capacity",
					"capacity.skill_gaps",
					`${gaps} capability area${gaps === 1 ? "" : "s"} not covered`,
					"Uncovered capabilities are the constraint most likely to slow the plan. Target the gaps that block the current milestone rather than all of them at once.",
					"potential_problem",
					"medium",
					0.85,
					[answerEvidence("team.missing_skills", "Declared missing skills")],
				),
			);
		}

		return scoreResult(
			"founder_capacity",
			score,
			0.75,
			hoursRaw === undefined ? 45 : 70,
			findings,
			missingEvidence,
		);
	}

	evaluate(answers: AnswerMap): {
		scores: ScoreResult[];
		overall: ScoreResult;
		weighting: { scoreId: ScoreId; weight: number; rationale: string }[];
	} {
		const technical = this.evaluateTechnicalReadiness(answers);
		const market = this.evaluateMarketOpportunity(answers);
		const business = this.evaluateBusinessReadiness(answers);
		const capacity = this.evaluateFounderCapacity(answers);
		const scores = [technical, market, business, capacity];

		const weighted = SCORE_WEIGHTS.reduce((total, weight) => {
			const score = scores.find((s) => s.id === weight.scoreId);
			return total + (score ? score.score * weight.weight : 0);
		}, 0);

		const weakest = scores.reduce((low, score) => (score.score < low.score ? score : low));
		const capped = Math.min(weighted, weakest.score + 20);

		const overallFindings: Finding[] = [
			finding(
				"overall_readiness",
				"overall.weakest_dimension",
				`Weakest dimension: ${weakest.label} (${weakest.score})`,
				"The overall readiness score is capped near the weakest dimension so a strong score in one area cannot hide a blocking gap in another.",
				"potential_problem",
				weakest.score < 40 ? "high" : "medium",
				0.9,
				weakest.findings.flatMap((f) => f.evidence).slice(0, 3),
			),
		];

		const overall = scoreResult(
			"overall_readiness",
			capped,
			Math.min(...scores.map((s) => s.confidence)),
			Math.round(scores.reduce((total, s) => total + s.evidenceCoverage, 0) / scores.length),
			overallFindings,
			scores.flatMap((s) => s.missingEvidence),
		);

		return { scores, overall, weighting: SCORE_WEIGHTS };
	}
}
