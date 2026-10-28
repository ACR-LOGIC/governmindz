/**
 * GovernMindz Agent Human Name Rotation & 3D Character Persona Service
 *
 * Rotates and assigns friendly coworker personas and matching 3D character
 * profile avatars (Priya, Marcus, Arturo, Val, Lucy, Kenji, Sophia, RJ, Tom, Jovita,
 * Raul, etc.) to specialized agent seats at the start of each deliberation,
 * along with specific domain specializations.
 */

import { getCartoonPerson } from "./cartoonPeople";

export const HUMAN_NAMES_POOL: string[] = [
	"Priya",
	"Marcus",
	"Arturo",
	"Val",
	"Lucy",
	"Kenji",
	"Sophia",
	"RJ",
	"Vicky",
	"Shaniqua",
	"Luis",
	"Tom",
	"Jovita",
	"Elvia",
	"Raul",
	"Alex",
	"Meche",
	"Emely",
	"Leah",
	"Abby",
];

export interface SeatAssignment {
	seatId: string;
	humanName: string;
	avatarId: string;
	role: string;
	jobTask: string;
}

export const SEAT_ROLES: Record<string, string> = {
	FactChecker: "Fact Checker",
	CloudArchitect: "Cloud Architect",
	Synthesizer: "Synthesizer",
	RivalChallenger: "Rival Challenger",
	Thinker: "Thinker Agent",
	CredibleSourcesResearchAgent: "Credible Research",
	ContextAgent: "Context Agent",
	SocialCommunityResearchAgent: "Community Agent",
	Supervisor: "Delivery Supervisor",
};

export const SEAT_JOB_TASKS: Record<string, string> = {
	FactChecker:
		"Inspect database schemas, primary keys, and catalog definitions to verify empirical accuracy against Zetaris.",
	CredibleSourcesResearchAgent:
		"Cross-reference claims with authoritative technical standards, peer-reviewed docs, and official registries.",
	CloudArchitect:
		"Evaluate least-privilege security boundaries, statement limits, and zero-trust cloud infrastructure safety.",
	Synthesizer:
		"Weigh calibrated confidence, reconcile team disagreements, and formulate unified consensus recommendations.",
	RivalChallenger:
		"Stress-test assumptions, probe contradictory findings, and request cryptographic receipts for all claims.",
	Thinker:
		"Probe operational edge cases, unexamined hypotheses, and contingency protocols before decisions finalize.",
	ContextAgent:
		"Track conversation transcripts, assess historical memory precedents, and ensure context continuity.",
	SocialCommunityResearchAgent:
		"Assess user experience impact, stakeholder feedback, and community sentiment.",
	Supervisor:
		"Validate deliverable contracts, executive summaries, and cryptographic proof readiness.",
};

/**
 * Assigns unique human names, matching 3D character avatars, and focus areas
 */
export const CANONICAL_COWORKER_IDENTITIES: Record<string, { humanName: string; avatarId: string }> = {
	FactChecker: { humanName: "Priya", avatarId: "priya" },
	CloudArchitect: { humanName: "Marcus", avatarId: "marcus" },
	Synthesizer: { humanName: "Val", avatarId: "val" },
	RivalChallenger: { humanName: "Arturo", avatarId: "arturo" },
	Thinker: { humanName: "Lucy", avatarId: "lucy" },
	CredibleSourcesResearchAgent: { humanName: "Raul", avatarId: "raul" },
	ContextAgent: { humanName: "Kenji", avatarId: "kenji" },
	SocialCommunityResearchAgent: { humanName: "Sophia", avatarId: "sophia" },
	Supervisor: { humanName: "Jovita", avatarId: "jovita" },
	Orchestrator: { humanName: "Marcus", avatarId: "marcus" },
};

export function assignHumanCouncil(
	seatIds: string[] = [
		"FactChecker",
		"CloudArchitect",
		"Synthesizer",
		"RivalChallenger",
		"Thinker",
	],
): Record<string, SeatAssignment> {
	const assignments: Record<string, SeatAssignment> = {};

	seatIds.forEach((seatId) => {
		const canonical = CANONICAL_COWORKER_IDENTITIES[seatId] || { humanName: "Priya", avatarId: "priya" };
		const role = SEAT_ROLES[seatId] || seatId;
		const jobTask =
			SEAT_JOB_TASKS[seatId] ||
			"support the multi-agent council with specialized analysis and verification.";

		assignments[seatId] = {
			seatId,
			humanName: canonical.humanName,
			avatarId: canonical.avatarId,
			role,
			jobTask,
		};
	});

	return assignments;
}

/**
 * Generates the friendly task delegation announcement formatted for the orchestrator
 */
export function generateTaskDelegationAnnouncement(
	assignments: Record<string, { humanName: string; jobTask: string; role?: string; seatId?: string; avatarId?: string }>,
	mode: string = "sample",
): string {
	const lines: string[] = [];
	lines.push(
		`🏛️ Inquiry initiated in ${mode.toUpperCase()} mode. Council convening for deliberation.`,
	);
	lines.push("");
	lines.push("Coworker Assignments & Focus Areas for this deliberation:");

	// Prioritize major active seats in order
	const orderedSeatIds = [
		"FactChecker",
		"CloudArchitect",
		"Synthesizer",
		"RivalChallenger",
		"Thinker",
		"SocialCommunityResearchAgent",
	];

	const activeSeats = orderedSeatIds
		.filter((id) => assignments[id])
		.concat(Object.keys(assignments).filter((id) => !orderedSeatIds.includes(id)));

	for (const seatId of activeSeats) {
		const a = assignments[seatId];
		const role = a.role || SEAT_ROLES[seatId] || seatId;
		const cartoon = getCartoonPerson(a.avatarId || a.humanName);
		lines.push(`• ${a.humanName} [${cartoon.tagline}], assigned as ${role}: ${a.jobTask}`);
	}

	lines.push("");
	lines.push("Agents will join the roster as they enter the deliberation...");

	return lines.join("\n");
}
