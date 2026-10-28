export interface DemoScenarioOption {
	id: string;
	file: string;
	title: string;
	category: string;
	promptLabel?: string;
	icon: "research" | "decision" | "claims";
	question: string;
	description: string;
}

export const DEMO_SCENARIOS: DemoScenarioOption[] = [
	{
		id: "fragmented-intelligence",
		file: "01-fragmented-intelligence.json",
		title: "1. Solving Fragmented Intelligence",
		category: "Track 01 · Cross-Silo Data Reconciliation",
		promptLabel: "Track 01 · Fragmented Data",
		icon: "research",
		question:
			"Reconcile conflicting supplier delivery dates and inventory records across fragmented ERP export (Postgres), Logistics Ticket API, and Risk Feed without fabricating missing data.",
		description:
			"Discovers and reconciles conflicting records across ERP, Logistics API, and Risk feeds with explicit provenance attribution.",
	},
	{
		id: "explain-why",
		file: "02-explain-why.json",
		title: "2. The Agent That Can Explain Why",
		category: "Track 02 · Evidence-Backed Reasoning",
		promptLabel: "Track 02 · Explain Why",
		icon: "claims",
		question:
			"Why did SMB churn rise in Q3 across enterprise accounts, and what evidence-backed recommendations explain the underlying driver?",
		description:
			"Evaluates competing hypotheses, critiques unsupported assertions, cites telemetry evidence, and discloses limitations.",
	},
	{
		id: "reasoning-architecture",
		file: "03-reasoning-architecture.json",
		title: "3. Reasoning Architecture",
		category: "Track 03 · Policy Gates & Auditable Memory",
		promptLabel: "Track 03 · Reasoning Architecture",
		icon: "decision",
		question:
			"Process high-priority clinic scheduling and resource allocation requests by evaluating operational policies, historical H-MEM precedents, and cryptographic audit constraints.",
		description:
			"Demonstrates 12-state reasoning, operational policy gates, persistent memory retrieval, and tamper-proof audit trails.",
	},
];
