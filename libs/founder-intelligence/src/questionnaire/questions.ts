import type {
	OnboardingSectionId,
	QuestionDefinition,
	QuestionOption,
} from "../types/index.js";

export const SECTION_LABELS: Record<OnboardingSectionId, string> = {
	founder_profile: "Founder profile",
	financial_position: "Financial position and funding",
	business_legal: "Business and legal status",
	project_identity: "Project identity and purpose",
	development_status: "Project development status",
	self_reported_stage: "Your stage assessment",
	team_capacity: "Team and operating capacity",
	help_requested: "What you want GovernMindz to do",
};

export const SECTION_ORDER: OnboardingSectionId[] = [
	"founder_profile",
	"financial_position",
	"business_legal",
	"project_identity",
	"development_status",
	"self_reported_stage",
	"team_capacity",
	"help_requested",
];

const EMPLOYMENT_OPTIONS: QuestionOption[] = [
	{ value: "employed_full_time", label: "Employed full-time" },
	{ value: "employed_part_time", label: "Employed part-time" },
	{ value: "unemployed", label: "Currently unemployed" },
	{ value: "full_time_entrepreneur", label: "Full-time entrepreneur" },
	{ value: "student", label: "Student" },
	{ value: "other", label: "Other" },
];

const CONTRIBUTION_OPTIONS: QuestionOption[] = [
	{ value: "developer", label: "Developer" },
	{ value: "technical_cofounder", label: "Technical cofounder" },
	{ value: "business_founder", label: "Business founder" },
	{ value: "designer", label: "Designer" },
	{ value: "marketer", label: "Marketing" },
	{ value: "operations", label: "Operations" },
	{ value: "other", label: "Other" },
];

const BUDGET_OPTIONS: QuestionOption[] = [
	{ value: "0", label: "$0" },
	{ value: "under_100", label: "Under $100 / month" },
	{ value: "100_500", label: "$100–$500 / month" },
	{ value: "500_2000", label: "$500–$2,000 / month" },
	{ value: "2000_5000", label: "$2,000–$5,000 / month" },
	{ value: "over_5000", label: "Over $5,000 / month" },
	{ value: "prefer_not_to_disclose", label: "Prefer not to disclose" },
];

const FUNDING_OPTIONS: QuestionOption[] = [
	{ value: "none_planned", label: "No external funding planned" },
	{ value: "friends_family", label: "Friends and family" },
	{ value: "grant", label: "Grants" },
	{ value: "accelerator", label: "Accelerators" },
	{ value: "preseed", label: "Pre-seed" },
	{ value: "seed", label: "Seed" },
	{ value: "series_a_or_later", label: "Series A or later" },
	{ value: "venture_capital", label: "Venture capital" },
	{ value: "other", label: "Other" },
];

const LEGAL_FORM_OPTIONS: QuestionOption[] = [
	{ value: "sole_proprietorship", label: "Sole proprietorship" },
	{ value: "llc", label: "LLC" },
	{ value: "incorporated", label: "Incorporated company" },
	{ value: "not_yet_formed", label: "Not formed yet" },
	{ value: "individual_founder", label: "Operating as an individual founder" },
];

const DEVELOPMENT_STATUS_OPTIONS: QuestionOption[] = [
	{ value: "idea", label: "Just an idea" },
	{ value: "planning", label: "Planning and research" },
	{ value: "design", label: "Early design or wireframes" },
	{ value: "proof_of_concept", label: "Proof of concept" },
	{ value: "prototype", label: "Prototype" },
	{ value: "mvp_in_progress", label: "MVP under development" },
	{ value: "functional_mvp", label: "Functional MVP" },
	{ value: "public_product", label: "Publicly available product" },
	{ value: "active_users", label: "Product with active users" },
	{ value: "revenue", label: "Product generating revenue" },
	{ value: "established", label: "Established business" },
];

const STAGE_OPTIONS: QuestionOption[] = [
	{ value: "idea", label: "Idea stage" },
	{ value: "pre_validation", label: "Pre-validation" },
	{ value: "pre_seed", label: "Pre-seed" },
	{ value: "seed", label: "Seed" },
	{ value: "early_revenue", label: "Early revenue" },
	{ value: "growth", label: "Growth stage" },
	{ value: "scaling", label: "Scaling business" },
	{ value: "unsure", label: "Not sure" },
];

const PROJECT_TYPE_OPTIONS: QuestionOption[] = [
	{ value: "personal", label: "Personal project" },
	{ value: "commercial_product", label: "Commercial product" },
	{ value: "open_source", label: "Open-source project" },
	{ value: "internal_tool", label: "Internal business tool" },
	{ value: "other", label: "Other" },
];

const GAP_OPTIONS: QuestionOption[] = [
	{ value: "development", label: "Development" },
	{ value: "architecture", label: "Architecture" },
	{ value: "product_management", label: "Product management" },
	{ value: "marketing", label: "Marketing" },
	{ value: "sales", label: "Sales" },
	{ value: "customer_discovery", label: "Customer discovery" },
	{ value: "finance", label: "Finance" },
	{ value: "legal", label: "Legal preparation" },
	{ value: "operations", label: "Operations" },
	{ value: "fundraising", label: "Fundraising" },
];

const HELP_OPTIONS: QuestionOption[] = [
	{ value: "evaluate_repository", label: "Evaluate my GitHub repository" },
	{ value: "identify_bugs", label: "Identify bugs and technical problems" },
	{ value: "improve_architecture", label: "Improve my architecture" },
	{ value: "finish_mvp", label: "Build or finish my MVP" },
	{ value: "validate_idea", label: "Validate my business idea" },
	{ value: "research_competitors", label: "Research competitors" },
	{ value: "identify_market", label: "Identify market opportunities" },
	{ value: "find_customers", label: "Find customers" },
	{ value: "marketing_strategy", label: "Develop a marketing strategy" },
	{ value: "promotional_content", label: "Create promotional content" },
	{ value: "website_or_landing", label: "Build a website or landing page" },
	{ value: "prepare_for_launch", label: "Prepare for launch" },
	{ value: "develop_pricing", label: "Develop pricing" },
	{ value: "find_funding", label: "Find funding opportunities" },
	{ value: "investor_materials", label: "Prepare investor materials" },
	{ value: "business_operations", label: "Improve business operations" },
	{ value: "action_plan", label: "Develop a 90-day action plan" },
	{ value: "other", label: "Other" },
];

export const ONBOARDING_QUESTIONS: QuestionDefinition[] = [
	{
		id: "founder.preferred_name",
		section: "founder_profile",
		prompt: "What should GovernMindz call you?",
		kind: "text",
		required: true,
	},
	{
		id: "founder.working_mode",
		section: "founder_profile",
		prompt: "Are you working on this project alone or with a team?",
		kind: "single_select",
		required: true,
		options: [
			{ value: "alone", label: "Working alone" },
			{ value: "with_team", label: "Working with a team" },
		],
	},
	{
		id: "founder.employment",
		section: "founder_profile",
		prompt: "What is your current employment situation?",
		helpText: "This affects the plan we build for you, not your score.",
		kind: "single_select",
		required: true,
		options: EMPLOYMENT_OPTIONS,
	},
	{
		id: "founder.hours_per_week",
		section: "founder_profile",
		prompt: "How many hours per week can you dedicate to this project?",
		kind: "number",
		required: true,
	},
	{
		id: "founder.experience",
		section: "founder_profile",
		prompt: "Which experience do you bring? Select everything that applies.",
		kind: "multi_select",
		options: [
			{ value: "technical", label: "Technical" },
			{ value: "business", label: "Business" },
			{ value: "marketing", label: "Marketing" },
			{ value: "industry", label: "Industry" },
			{ value: "sales", label: "Sales" },
			{ value: "none_yet", label: "None yet" },
		],
	},
	{
		id: "founder.contributor_type",
		section: "founder_profile",
		prompt: "What role do you play in the project?",
		kind: "single_select",
		required: true,
		options: CONTRIBUTION_OPTIONS,
	},
	{
		id: "founder.responsibilities",
		section: "founder_profile",
		prompt: "Which responsibilities do you currently handle?",
		kind: "multi_select",
		options: [
			{ value: "development", label: "Development" },
			{ value: "product", label: "Product" },
			{ value: "design", label: "Design" },
			{ value: "marketing", label: "Marketing" },
			{ value: "sales", label: "Sales" },
			{ value: "operations", label: "Operations" },
			{ value: "finance", label: "Finance" },
			{ value: "fundraising", label: "Fundraising" },
		],
	},
	{
		id: "financial.self_funded",
		section: "financial_position",
		prompt: "Is the project self-funded?",
		kind: "boolean",
		required: true,
	},
	{
		id: "financial.external_funding",
		section: "financial_position",
		prompt: "Does the project have external funding?",
		kind: "boolean",
		required: true,
	},
	{
		id: "financial.funding_source",
		section: "financial_position",
		prompt: "Which funding route are you planning or pursuing?",
		kind: "single_select",
		options: FUNDING_OPTIONS,
		visibleWhen: [{ questionId: "financial.external_funding", equals: [true] }],
	},
	{
		id: "financial.has_revenue",
		section: "financial_position",
		prompt: "Does the project currently generate revenue?",
		kind: "boolean",
		required: true,
	},
	{
		id: "financial.paying_customers",
		section: "financial_position",
		prompt: "Do you have paying customers?",
		kind: "boolean",
		required: true,
	},
	{
		id: "financial.seeking_investors",
		section: "financial_position",
		prompt: "Are you actively seeking investors?",
		kind: "boolean",
		required: true,
	},
	{
		id: "financial.bootstrap_plan",
		section: "financial_position",
		prompt: "Are you planning to bootstrap?",
		kind: "boolean",
		required: true,
	},
	{
		id: "financial.monthly_budget",
		section: "financial_position",
		prompt: "What monthly budget can the project spend?",
		kind: "single_select",
		options: BUDGET_OPTIONS,
	},
	{
		id: "financial.total_budget",
		section: "financial_position",
		prompt: "What total startup budget is available to you?",
		kind: "single_select",
		options: [
			{ value: "0", label: "$0" },
			{ value: "under_1000", label: "Under $1,000" },
			{ value: "1000_5000", label: "$1,000–$5,000" },
			{ value: "5000_20000", label: "$5,000–$20,000" },
			{ value: "20000_100000", label: "$20,000–$100,000" },
			{ value: "over_100000", label: "Over $100,000" },
			{ value: "prefer_not_to_disclose", label: "Prefer not to disclose" },
		],
	},
	{
		id: "financial.spend_willingness",
		section: "financial_position",
		prompt: "Where are you willing to spend money?",
		kind: "multi_select",
		options: [
			{ value: "infrastructure", label: "Infrastructure" },
			{ value: "marketing", label: "Marketing" },
			{ value: "development", label: "Development" },
			{ value: "services", label: "Services" },
			{ value: "none", label: "Nothing yet" },
		],
	},
	{
		id: "business.legal_form",
		section: "business_legal",
		prompt: "What is the business structure today?",
		helpText:
			"Business formation is evaluated separately from technical and product quality.",
		kind: "single_select",
		required: true,
		options: LEGAL_FORM_OPTIONS,
	},
	{
		id: "business.registered_name",
		section: "business_legal",
		prompt: "Is a business name registered?",
		kind: "boolean",
	},
	{
		id: "business.jurisdiction",
		section: "business_legal",
		prompt: "Which jurisdiction does the business operate in?",
		helpText: "Used only to point you to relevant legal guidance.",
		kind: "text",
		visibleWhen: [{ questionId: "business.registered_name", equals: [true] }],
	},
	{
		id: "business.ein",
		section: "business_legal",
		prompt: "Do you have an EIN or equivalent tax identifier?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "business.legal_form",
				equals: ["llc", "incorporated", "sole_proprietorship"],
			},
		],
	},
	{
		id: "business.bank_account",
		section: "business_legal",
		prompt: "Do you have a business bank account?",
		kind: "boolean",
	},
	{
		id: "business.website",
		section: "business_legal",
		prompt: "Do you have a business website?",
		kind: "boolean",
	},
	{
		id: "business.insurance_and_contracts",
		section: "business_legal",
		prompt:
			"Do you have business insurance, contracts, or other operational arrangements?",
		kind: "boolean",
	},
	{
		id: "business.commercial_agreements",
		section: "business_legal",
		prompt: "Do you have customers or commercial agreements?",
		kind: "boolean",
	},
	{
		id: "project.name",
		section: "project_identity",
		prompt: "What is the project called?",
		kind: "text",
		required: true,
	},
	{
		id: "project.what_it_does",
		section: "project_identity",
		prompt: "What does the project do?",
		helpText: "Describe it in your own words. Startup terminology is optional.",
		kind: "long_text",
		required: true,
	},
	{
		id: "project.problem",
		section: "project_identity",
		prompt: "What problem does it solve?",
		kind: "long_text",
		required: true,
	},
	{
		id: "project.who_has_problem",
		section: "project_identity",
		prompt: "Who experiences this problem?",
		kind: "long_text",
		required: true,
	},
	{
		id: "project.target_customer",
		section: "project_identity",
		prompt: "Who is the intended customer?",
		kind: "long_text",
		required: true,
	},
	{
		id: "project.inspiration",
		section: "project_identity",
		prompt: "What inspired the idea?",
		kind: "long_text",
	},
	{
		id: "project.why_needed",
		section: "project_identity",
		prompt: "Why do you believe this product needs to exist?",
		kind: "long_text",
	},
	{
		id: "project.differentiation",
		section: "project_identity",
		prompt: "What makes it different?",
		kind: "long_text",
	},
	{
		id: "project.project_type",
		section: "project_identity",
		prompt: "What kind of project is this?",
		kind: "single_select",
		options: PROJECT_TYPE_OPTIONS,
	},
	{
		id: "project.revenue_intent",
		section: "project_identity",
		prompt: "Is the project intended to generate revenue?",
		kind: "boolean",
	},
	{
		id: "project.long_term_vision",
		section: "project_identity",
		prompt: "What is your long-term vision for the project?",
		kind: "long_text",
	},
	{
		id: "development.current_status",
		section: "development_status",
		prompt: "What actually exists today?",
		kind: "single_select",
		required: true,
		options: DEVELOPMENT_STATUS_OPTIONS,
	},
	{
		id: "development.github_repo",
		section: "development_status",
		prompt: "Is there an existing GitHub repository?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "development.current_status",
				notEquals: ["idea", "planning"],
			},
		],
	},
	{
		id: "development.local_project",
		section: "development_status",
		prompt: "Is the project stored locally?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "development.current_status",
				notEquals: ["idea", "planning"],
			},
		],
	},
	{
		id: "development.working_application",
		section: "development_status",
		prompt: "Is there a working application?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "development.current_status",
				notEquals: ["idea", "planning"],
			},
		],
	},
	{
		id: "development.users_testing",
		section: "development_status",
		prompt: "Are users testing it?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "development.current_status",
				notEquals: ["idea", "planning"],
			},
		],
	},
	{
		id: "development.paying_customers",
		section: "development_status",
		prompt: "Are there paying customers?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "development.current_status",
				notEquals: ["idea", "planning"],
			},
		],
	},
	{
		id: "development.publicly_launched",
		section: "development_status",
		prompt: "Has the product been publicly launched?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "development.current_status",
				notEquals: ["idea", "planning"],
			},
		],
	},
	{
		id: "development.active_development",
		section: "development_status",
		prompt: "Is development actively continuing?",
		kind: "boolean",
		visibleWhen: [
			{
				questionId: "development.current_status",
				notEquals: ["idea", "planning"],
			},
		],
	},
	{
		id: "development.biggest_obstacle",
		section: "development_status",
		prompt: "What is the biggest obstacle preventing progress?",
		kind: "long_text",
	},
	{
		id: "stage.self_reported",
		section: "self_reported_stage",
		prompt: "What stage would you currently consider your startup to be in?",
		helpText:
			"GovernMindz records this answer and evaluates the evidence independently.",
		kind: "single_select",
		required: true,
		options: STAGE_OPTIONS,
	},
	{
		id: "team.has_cofounders",
		section: "team_capacity",
		prompt: "Do you have cofounders?",
		kind: "boolean",
	},
	{
		id: "team.has_employees",
		section: "team_capacity",
		prompt: "Do you have employees?",
		kind: "boolean",
	},
	{
		id: "team.has_contractors",
		section: "team_capacity",
		prompt: "Do you work with contractors?",
		kind: "boolean",
	},
	{
		id: "team.has_advisors",
		section: "team_capacity",
		prompt: "Do you have advisors, mentors, or investors involved?",
		kind: "boolean",
	},
	{
		id: "team.marketing_contributors",
		section: "team_capacity",
		prompt: "Do you have marketing contributors?",
		kind: "boolean",
	},
	{
		id: "team.uncovered_responsibilities",
		section: "team_capacity",
		prompt: "Which responsibilities are currently uncovered?",
		kind: "multi_select",
		options: GAP_OPTIONS,
	},
	{
		id: "team.missing_skills",
		section: "team_capacity",
		prompt: "Which skills are missing from the team?",
		kind: "multi_select",
		options: GAP_OPTIONS,
	},
	{
		id: "help.requested",
		section: "help_requested",
		prompt: "What would you most like GovernMindz to help you accomplish?",
		kind: "multi_select",
		required: true,
		options: HELP_OPTIONS,
	},
	{
		id: "help.priorities",
		section: "help_requested",
		prompt: "What are your immediate priorities?",
		kind: "long_text",
	},
];

export const QUESTION_MAP: Record<string, QuestionDefinition> = Object.fromEntries(
	ONBOARDING_QUESTIONS.map((q) => [q.id, q]),
);
