import type {
	AnswerMap,
	StageComparison,
	StageEvaluation,
	StageSignal,
	StartupStage,
} from "../types/index.js";

export const STAGE_LABELS: Record<StartupStage, string> = {
	idea: "Idea stage",
	pre_validation: "Pre-validation",
	pre_seed: "Pre-seed",
	seed: "Seed",
	early_revenue: "Early revenue",
	growth: "Growth stage",
	scaling: "Scaling business",
	unsure: "Not sure",
};

export const STAGE_ORDER: StartupStage[] = [
	"idea",
	"pre_validation",
	"pre_seed",
	"seed",
	"early_revenue",
	"growth",
	"scaling",
];

const DEVELOPMENT_STAGE_ORDER = [
	"idea",
	"planning",
	"design",
	"proof_of_concept",
	"prototype",
	"mvp_in_progress",
	"functional_mvp",
	"public_product",
	"active_users",
	"revenue",
	"established",
];

function asBoolean(value: unknown): boolean {
	return value === true;
}

function asText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function developmentIndex(answers: AnswerMap): number {
	const status = asText(answers["development.current_status"]);
	const index = DEVELOPMENT_STAGE_ORDER.indexOf(status);
	return index === -1 ? 0 : index;
}

function hasSignal(answers: AnswerMap): StageSignal[] {
	const development = developmentIndex(answers);
	const hasRevenue =
		asBoolean(answers["financial.has_revenue"]) ||
		asBoolean(answers["financial.paying_customers"]) ||
		asBoolean(answers["development.paying_customers"]);
	const hasUsers = asBoolean(answers["development.users_testing"]);
	const launched = asBoolean(answers["development.publicly_launched"]);
	const funded = asBoolean(answers["financial.external_funding"]);
	const workingProduct = development >= DEVELOPMENT_STAGE_ORDER.indexOf("functional_mvp");
	const buildingProduct = development >= DEVELOPMENT_STAGE_ORDER.indexOf("prototype");
	const marketDefined =
		asText(answers["project.target_customer"]).length > 0 &&
		asText(answers["project.problem"]).length > 0;

	return [
		{
			id: "market_defined",
			label: "Target customer and problem are defined",
			present: marketDefined,
			weight: 1,
			source: "questionnaire:project_identity",
		},
		{
			id: "building_product",
			label: "A prototype or later exists",
			present: buildingProduct,
			weight: 2,
			source: "questionnaire:development_status",
		},
		{
			id: "working_product",
			label: "A functional MVP exists",
			present: workingProduct,
			weight: 3,
			source: "questionnaire:development_status",
		},
		{
			id: "users_testing",
			label: "Users are actively testing the product",
			present: hasUsers,
			weight: 2,
			source: "questionnaire:development_status",
		},
		{
			id: "revenue",
			label: "The product generates revenue",
			present: hasRevenue,
			weight: 4,
			source: "questionnaire:financial_position",
		},
		{
			id: "publicly_launched",
			label: "The product has been publicly launched",
			present: launched,
			weight: 1,
			source: "questionnaire:development_status",
		},
		{
			id: "external_funding",
			label: "External funding is in place",
			present: funded,
			weight: 2,
			source: "questionnaire:financial_position",
		},
	];
}

export class StageEvaluator {
	evaluate(answers: AnswerMap): StageEvaluation {
		const signals = hasSignal(answers);
		const development = developmentIndex(answers);
		const signal = (id: string) => signals.find((s) => s.id === id)?.present ?? false;

		let stage: StartupStage = "idea";
		let rationale =
			"Evidence shows an early-stage idea without a validated customer problem or working product.";

		if (signal("revenue") && signal("users_testing")) {
			stage = "early_revenue";
			rationale =
				"Revenue and active users are present, which places the project at an early revenue stage.";
		} else if (signal("revenue")) {
			stage = "early_revenue";
			rationale =
				"Revenue evidence is present while broader user validation is still limited, so the assessed stage is early revenue.";
		} else if (signal("external_funding") && signal("working_product") && signal("users_testing")) {
			stage = "seed";
			rationale =
				"A functional product, active users and external funding together support a seed-stage assessment.";
		} else if (signal("external_funding") && signal("working_product")) {
			stage = "pre_seed";
			rationale =
				"A functional product and external funding are present, while repeatable customer acquisition is not yet evidenced.";
		} else if (signal("working_product") && signal("users_testing")) {
			stage = "pre_seed";
			rationale =
				"A functional MVP exists and users are testing it, without evidence of repeatable acquisition or revenue.";
		} else if (signal("working_product")) {
			stage = "pre_validation";
			rationale =
				"A functional MVP exists, but customer validation, acquisition and revenue evidence is missing.";
		} else if (development >= DEVELOPMENT_STAGE_ORDER.indexOf("prototype")) {
			stage = "pre_validation";
			rationale =
				"A prototype or proof of concept exists, and validation with real customers is the next milestone.";
		} else if (signal("market_defined")) {
			stage = "pre_validation";
			rationale =
				"The customer problem is defined and research is underway, with no built product yet.";
		}

		const answeredSignals = signals.filter((s) => s.present).length;
		const confidence = Math.min(
			0.95,
			0.35 + (answeredSignals / signals.length) * 0.6,
		);
		const evidenceCoverage = Math.round(
			(answeredSignals / signals.length) * 100,
		);

		return {
			stage,
			label: STAGE_LABELS[stage],
			confidence: Math.round(confidence * 100) / 100,
			evidenceCoverage,
			rationale,
			signals,
		};
	}

	compare(selfReported: StartupStage, evaluated: StageEvaluation): StageComparison {
		const selfIndex = STAGE_ORDER.indexOf(selfReported);
		const assessedIndex = STAGE_ORDER.indexOf(evaluated.stage);
		const matches = selfReported === evaluated.stage;
		const gapInStages =
			selfIndex === -1 || assessedIndex === -1 ? 0 : Math.abs(selfIndex - assessedIndex);

		let message: string;
		if (matches) {
			message = `Your self-reported stage matches the evidence-based assessment: ${evaluated.label}.`;
		} else if (selfReported === "unsure") {
			message = `Based on the evidence available, the assessed stage is ${evaluated.label}. ${evaluated.rationale}`;
		} else if (gapInStages === 1) {
			message = `Your self-reported stage (${STAGE_LABELS[selfReported]}) is one step away from the evidence-based assessment (${evaluated.label}). ${evaluated.rationale}`;
		} else if (assessedIndex > selfIndex) {
			message = `The evidence supports a stage ahead of your self-assessment: ${evaluated.label}. ${evaluated.rationale}`;
		} else {
			message = `The evidence supports a stage behind your self-assessment: ${evaluated.label}. ${evaluated.rationale} Missing evidence and validation steps are listed with the findings.`;
		}

		return {
			selfReported,
			selfReportedLabel: STAGE_LABELS[selfReported],
			assessed: evaluated.stage,
			assessedLabel: evaluated.label,
			matches,
			gapInStages,
			message,
		};
	}
}
