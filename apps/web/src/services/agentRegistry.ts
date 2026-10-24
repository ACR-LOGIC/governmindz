import type { AgentProfile } from "../types";

export const AGENT_REGISTRY: Record<string, Omit<AgentProfile, "status" | "currentTask" | "evidenceCount" | "confidence" | "lastActiveTime">> = {
	FactChecker: {
		id: "FactChecker",
		name: "Fact Checker",
		role: "Federated Evidence & Data Verification",
		initials: "FC",
		avatarGradient: "from-sky-500 via-blue-600 to-indigo-900",
		accentColor: "#7dd3fc",
	},
	CloudArchitect: {
		id: "CloudArchitect",
		name: "Cloud Architect",
		role: "Least Privilege & Safety Guard",
		initials: "CA",
		avatarGradient: "from-emerald-500 via-teal-600 to-emerald-950",
		accentColor: "#34d399",
	},
	Synthesizer: {
		id: "Synthesizer",
		name: "Synthesizer",
		role: "Consensus Arbiter & Final Decision",
		initials: "SY",
		avatarGradient: "from-purple-500 via-violet-600 to-indigo-950",
		accentColor: "#c4b5fd",
	},
	RivalChallenger: {
		id: "RivalChallenger",
		name: "Rival Challenger",
		role: "Adversarial Review & Challenge Intervention",
		initials: "RC",
		avatarGradient: "from-rose-500 via-red-600 to-rose-950",
		accentColor: "#fb7185",
	},
	Thinker: {
		id: "Thinker",
		name: "Thinker Agent",
		role: "Exploratory Inquiry & Hidden Angles",
		initials: "TK",
		avatarGradient: "from-amber-400 via-yellow-600 to-amber-950",
		accentColor: "#fbbf24",
	},
	ContextAgent: {
		id: "ContextAgent",
		name: "Context Agent",
		role: "Memory & Assumption Assessor",
		initials: "CX",
		avatarGradient: "from-teal-400 via-cyan-600 to-teal-950",
		accentColor: "#2dd4bf",
	},
	CredibleSourcesResearchAgent: {
		id: "CredibleSourcesResearchAgent",
		name: "Credible Research",
		role: "Source Citation & Authority Verifier",
		initials: "CR",
		avatarGradient: "from-cyan-500 via-sky-600 to-blue-950",
		accentColor: "#38bdf8",
	},
	SocialCommunityResearchAgent: {
		id: "SocialCommunityResearchAgent",
		name: "Community Agent",
		role: "Social & Perspective Assessment",
		initials: "SR",
		avatarGradient: "from-orange-500 via-amber-600 to-orange-950",
		accentColor: "#fb923c",
	},
	Orchestrator: {
		id: "Orchestrator",
		name: "GovernMindz Core",
		role: "Workflow State & Lifecycle Engine",
		initials: "GM",
		avatarGradient: "from-yellow-400 via-amber-500 to-yellow-950",
		accentColor: "#f4b942",
	},
	user: {
		id: "user",
		name: "Operator",
		role: "Human Reviewer",
		initials: "OP",
		avatarGradient: "from-slate-400 via-slate-600 to-slate-800",
		accentColor: "#e2e8f0",
	},
};

export function getAgentProfile(seatId: string): AgentProfile {
	const template = AGENT_REGISTRY[seatId] || {
		id: seatId,
		name: seatId,
		role: "Autonomous Agent Seat",
		initials: seatId.slice(0, 2).toUpperCase(),
		avatarGradient: "from-slate-600 to-slate-800",
		accentColor: "#94a3b8",
	};

	return {
		...template,
		status: "idle",
		evidenceCount: 0,
		confidence: null,
	};
}
