import type { AgentProfile } from "../types";
import { SEAT_JOB_TASKS } from "./nameRotation";

export const DEFAULT_HUMAN_NAMES: Record<string, string> = {
	FactChecker: "Vicky",
	CloudArchitect: "Luis",
	Synthesizer: "Shaniqua",
	RivalChallenger: "RJ",
	Thinker: "Lucy",
	CredibleSourcesResearchAgent: "Arturo",
	ContextAgent: "Tom",
	SocialCommunityResearchAgent: "Jovita",
	Orchestrator: "Raul",
	user: "Operator",
};

export const AGENT_REGISTRY: Record<
	string,
	Omit<AgentProfile, "status" | "currentTask" | "evidenceCount" | "confidence" | "lastActiveTime" | "liveReasoning">
> = {
	FactChecker: {
		id: "FactChecker",
		name: "Fact Checker",
		humanName: "Vicky",
		jobTask: SEAT_JOB_TASKS.FactChecker,
		role: "Fact Checker",
		domainExpertise: "Federated Evidence & Data Verification",
		initials: "FC",
		avatarGradient: "from-sky-500 via-blue-600 to-indigo-900",
		accentColor: "#7dd3fc",
	},
	CloudArchitect: {
		id: "CloudArchitect",
		name: "Cloud Architect",
		humanName: "Luis",
		jobTask: SEAT_JOB_TASKS.CloudArchitect,
		role: "Cloud Architect",
		domainExpertise: "Least Privilege & Safety Guard",
		initials: "CA",
		avatarGradient: "from-emerald-500 via-teal-600 to-emerald-950",
		accentColor: "#34d399",
	},
	Synthesizer: {
		id: "Synthesizer",
		name: "Synthesizer",
		humanName: "Shaniqua",
		jobTask: SEAT_JOB_TASKS.Synthesizer,
		role: "Synthesizer",
		domainExpertise: "Consensus Arbiter & Final Decision",
		initials: "SY",
		avatarGradient: "from-purple-500 via-violet-600 to-indigo-950",
		accentColor: "#c4b5fd",
	},
	RivalChallenger: {
		id: "RivalChallenger",
		name: "Rival Challenger",
		humanName: "RJ",
		jobTask: SEAT_JOB_TASKS.RivalChallenger,
		role: "Rival Challenger",
		domainExpertise: "Adversarial Review & Challenge Intervention",
		initials: "RC",
		avatarGradient: "from-rose-500 via-red-600 to-rose-950",
		accentColor: "#fb7185",
	},
	Thinker: {
		id: "Thinker",
		name: "Thinker Agent",
		humanName: "Lucy",
		jobTask: SEAT_JOB_TASKS.Thinker,
		role: "Thinker Agent",
		domainExpertise: "Exploratory Inquiry & Hidden Angles",
		initials: "TK",
		avatarGradient: "from-amber-400 via-yellow-600 to-amber-950",
		accentColor: "#fbbf24",
	},
	ContextAgent: {
		id: "ContextAgent",
		name: "Context Agent",
		humanName: "Tom",
		jobTask: SEAT_JOB_TASKS.ContextAgent,
		role: "Context Agent",
		domainExpertise: "Memory & Assumption Assessor",
		initials: "CX",
		avatarGradient: "from-teal-400 via-cyan-600 to-teal-950",
		accentColor: "#2dd4bf",
	},
	CredibleSourcesResearchAgent: {
		id: "CredibleSourcesResearchAgent",
		name: "Credible Research",
		humanName: "Arturo",
		jobTask: SEAT_JOB_TASKS.CredibleSourcesResearchAgent,
		role: "Credible Research",
		domainExpertise: "Source Citation & Authority Verifier",
		initials: "CR",
		avatarGradient: "from-cyan-500 via-sky-600 to-blue-950",
		accentColor: "#38bdf8",
	},
	SocialCommunityResearchAgent: {
		id: "SocialCommunityResearchAgent",
		name: "Community Agent",
		humanName: "Jovita",
		jobTask: SEAT_JOB_TASKS.SocialCommunityResearchAgent,
		role: "Community Agent",
		domainExpertise: "Social & Perspective Assessment",
		initials: "SR",
		avatarGradient: "from-orange-500 via-amber-600 to-orange-950",
		accentColor: "#fb923c",
	},
	Orchestrator: {
		id: "Orchestrator",
		name: "GovernMindz Core",
		humanName: "Raul",
		jobTask: "Directs council workflow lifecycle, assigns job tasks, and coordinates state transitions.",
		role: "Workflow State & Lifecycle Engine",
		domainExpertise: "Workflow State Machine & Council Dispatch",
		initials: "GM",
		avatarGradient: "from-yellow-400 via-amber-500 to-yellow-950",
		accentColor: "#f4b942",
	},
	user: {
		id: "user",
		name: "Operator",
		humanName: "You",
		jobTask: "Reviews multi-agent deliberation and ratifies final decisions.",
		role: "Human Reviewer",
		domainExpertise: "Human Oversight & Final Ratification",
		initials: "OP",
		avatarGradient: "from-slate-400 via-slate-600 to-slate-800",
		accentColor: "#e2e8f0",
	},
};

export function getAgentProfile(
	seatId: string,
	assignment?: { humanName?: string; jobTask?: string },
): AgentProfile {
	const template = AGENT_REGISTRY[seatId] || {
		id: seatId,
		name: seatId,
		humanName: DEFAULT_HUMAN_NAMES[seatId] || "Alex",
		jobTask: "support the multi-agent council with specialized analysis and verification.",
		role: "Autonomous Agent Seat",
		domainExpertise: "Specialized Analysis & Verification",
		initials: seatId.slice(0, 2).toUpperCase(),
		avatarGradient: "from-slate-600 to-slate-800",
		accentColor: "#94a3b8",
	};

	const humanName = assignment?.humanName || template.humanName || DEFAULT_HUMAN_NAMES[seatId] || "Alex";
	const jobTask = assignment?.jobTask || template.jobTask || "support council deliberation.";

	return {
		...template,
		humanName,
		jobTask,
		status: "idle",
		evidenceCount: 0,
		confidence: null,
		liveReasoning: [],
	};
}

export function getAllAgentProfiles(
	assignments?: Record<string, { humanName?: string; jobTask?: string }>,
): AgentProfile[] {
	return [
		getAgentProfile("FactChecker", assignments?.FactChecker),
		getAgentProfile("CloudArchitect", assignments?.CloudArchitect),
		getAgentProfile("Synthesizer", assignments?.Synthesizer),
		getAgentProfile("RivalChallenger", assignments?.RivalChallenger),
		getAgentProfile("Thinker", assignments?.Thinker),
		getAgentProfile("CredibleSourcesResearchAgent", assignments?.CredibleSourcesResearchAgent),
		getAgentProfile("ContextAgent", assignments?.ContextAgent),
		getAgentProfile("SocialCommunityResearchAgent", assignments?.SocialCommunityResearchAgent),
	];
}
