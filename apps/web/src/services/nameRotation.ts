/**
 * GovernMindz Agent Human Name Rotation & Cartoon Character Persona Service
 *
 * Randomly rotates and assigns friendly human names and matching cartoon character
 * profile avatars (Vicky, Arturo, Luis, Shaniqua, RJ, Lucy, Tom, Jovita, Elvia,
 * Raul, Alejandro aka Alex, Meche, Emely, Val, Leah, Abby, etc.) to specialized agent
 * seats at the start of each deliberation, along with specific job tasks and instructions.
 */

import { getCartoonPerson } from "./cartoonPeople";

export const HUMAN_NAMES_POOL: string[] = [
	"Vicky",
	"Arturo",
	"Luis",
	"Shaniqua",
	"RJ",
	"Lucy",
	"Tom",
	"Jovita",
	"Elvia",
	"Raul",
	"Alejandro aka Alex",
	"Meche",
	"Emely",
	"Val",
	"Leah",
	"Abby",
	"Carlos",
	"Maya",
	"Kenji",
	"Sofia",
	"Darius",
	"Chloe",
	"Priya",
	"Marcus",
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
};

export const SEAT_JOB_TASKS: Record<string, string> = {
	FactChecker:
		"strictly inspect and verify database entities, primary keys, and schema definitions against the Zetaris catalog — no hallucinations allowed!",
	CredibleSourcesResearchAgent:
		"check, search, and verify claims using only reliable web sources, official documentation, and government standards.",
	CloudArchitect:
		"enforce least-privilege security boundaries, statement limits, and verify zero-trust firewall policies.",
	Synthesizer:
		"monitor council convergence, calibrate confidence scores, and deliver the final synthesized consensus decree.",
	RivalChallenger:
		"interrogate unverified assumptions, challenge weak arguments, and demand cryptographic audit proof.",
	Thinker:
		"probe hidden governance angles, exploratory hypotheses, and edge-case retention risks.",
	ContextAgent:
		"cross-reference round-by-round transcripts and assess historical memory.",
	SocialCommunityResearchAgent:
		"assess ecosystem stakeholder impact, user experience, and community sentiment.",
};

/**
 * Shuffles an array randomly using Fisher-Yates
 */
function shuffle<T>(arr: T[]): T[] {
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

/**
 * Assigns unique human names, matching cartoon character avatars, and job tasks
 */
export function assignHumanCouncil(
	seatIds: string[] = [
		"FactChecker",
		"CloudArchitect",
		"Synthesizer",
		"RivalChallenger",
		"Thinker",
		"CredibleSourcesResearchAgent",
		"ContextAgent",
	],
): Record<string, SeatAssignment> {
	const shuffledNames = shuffle(HUMAN_NAMES_POOL);
	const assignments: Record<string, SeatAssignment> = {};

	seatIds.forEach((seatId, idx) => {
		const humanName = shuffledNames[idx % shuffledNames.length];
		const cartoon = getCartoonPerson(humanName);
		const role = SEAT_ROLES[seatId] || seatId;
		const jobTask =
			SEAT_JOB_TASKS[seatId] ||
			"support the multi-agent council with specialized analysis and verification.";

		assignments[seatId] = {
			seatId,
			humanName,
			avatarId: cartoon.id,
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
		`🏛️ Council Convened for Task Delegation: Inquiry initiated in ${mode.toUpperCase()} mode.`,
	);
	lines.push("");
	lines.push("Assignments, Personas & Job Tasks for this deliberation:");

	// Prioritize major active seats in order
	const orderedSeatIds = [
		"FactChecker",
		"CredibleSourcesResearchAgent",
		"CloudArchitect",
		"Synthesizer",
		"RivalChallenger",
		"Thinker",
		"ContextAgent",
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
	lines.push("All cartoon council members have received their assignments. Commencing deliberation...");

	return lines.join("\n");
}
