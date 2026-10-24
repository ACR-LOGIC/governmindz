import type { AgentProfile } from "../types";

export const AGENT_REGISTRY: Record<
	string,
	Omit<AgentProfile, "status" | "currentTask" | "evidenceCount" | "confidence" | "lastActiveTime" | "liveReasoning">
> = {
	FactChecker: {
		id: "FactChecker",
		name: "Fact Checker",
		creativeTitle: "Chief Forensic Truth Arbiter",
		role: "Federated Evidence & Data Verification",
		domainExpertise: "Epistemic Verification & Schema Provenance",
		initials: "FC",
		avatarGradient: "from-sky-500 via-blue-600 to-indigo-900",
		accentColor: "#7dd3fc",
	},
	CloudArchitect: {
		id: "CloudArchitect",
		name: "Cloud Architect",
		creativeTitle: "High Zero-Trust Sentinel",
		role: "Least Privilege & Safety Guard",
		domainExpertise: "Least-Privilege Bastion & Firewall Enforcer",
		initials: "CA",
		avatarGradient: "from-emerald-500 via-teal-600 to-emerald-950",
		accentColor: "#34d399",
	},
	Synthesizer: {
		id: "Synthesizer",
		name: "Synthesizer",
		creativeTitle: "Chancellor of Calibrated Synthesis",
		role: "Consensus Arbiter & Final Decision",
		domainExpertise: "Multi-Agent Consensus & Final Decree",
		initials: "SY",
		avatarGradient: "from-purple-500 via-violet-600 to-indigo-950",
		accentColor: "#c4b5fd",
	},
	RivalChallenger: {
		id: "RivalChallenger",
		name: "Rival Challenger",
		creativeTitle: "Grand Adversarial Inquisitor",
		role: "Adversarial Review & Challenge Intervention",
		domainExpertise: "Interrogation & Falsification Engine",
		initials: "RC",
		avatarGradient: "from-rose-500 via-red-600 to-rose-950",
		accentColor: "#fb7185",
	},
	Thinker: {
		id: "Thinker",
		name: "Thinker Agent",
		creativeTitle: "High Cosmic Ontologist",
		role: "Exploratory Inquiry & Hidden Angles",
		domainExpertise: "Edge-Case Dialectics & Temporal Horizon Analysis",
		initials: "TK",
		avatarGradient: "from-amber-400 via-yellow-600 to-amber-950",
		accentColor: "#fbbf24",
	},
	ContextAgent: {
		id: "ContextAgent",
		name: "Context Agent",
		creativeTitle: "Master Archivist of Memory",
		role: "Memory & Assumption Assessor",
		domainExpertise: "Cross-Round Transcripts & Historical State",
		initials: "CX",
		avatarGradient: "from-teal-400 via-cyan-600 to-teal-950",
		accentColor: "#2dd4bf",
	},
	CredibleSourcesResearchAgent: {
		id: "CredibleSourcesResearchAgent",
		name: "Credible Research",
		creativeTitle: "Imperial Web Intelligence Scout",
		role: "Source Citation & Authority Verifier",
		domainExpertise: "Live Web Telemetry & Authoritative Citations",
		initials: "CR",
		avatarGradient: "from-cyan-500 via-sky-600 to-blue-950",
		accentColor: "#38bdf8",
	},
	SocialCommunityResearchAgent: {
		id: "SocialCommunityResearchAgent",
		name: "Community Agent",
		creativeTitle: "Tribune of Public Sentiment",
		role: "Social & Perspective Assessment",
		domainExpertise: "Ecosystem Consensus & Stakeholder Impact",
		initials: "SR",
		avatarGradient: "from-orange-500 via-amber-600 to-orange-950",
		accentColor: "#fb923c",
	},
	Orchestrator: {
		id: "Orchestrator",
		name: "GovernMindz Core",
		creativeTitle: "Mission Director & State Arbiter",
		role: "Workflow State & Lifecycle Engine",
		domainExpertise: "Workflow State Machine & Council Dispatch",
		initials: "GM",
		avatarGradient: "from-yellow-400 via-amber-500 to-yellow-950",
		accentColor: "#f4b942",
	},
	user: {
		id: "user",
		name: "Operator",
		creativeTitle: "High Sovereign Reviewer",
		role: "Human Reviewer",
		domainExpertise: "Human Oversight & Final Ratification",
		initials: "OP",
		avatarGradient: "from-slate-400 via-slate-600 to-slate-800",
		accentColor: "#e2e8f0",
	},
};

export function getAgentProfile(seatId: string): AgentProfile {
	const template = AGENT_REGISTRY[seatId] || {
		id: seatId,
		name: seatId,
		creativeTitle: "Autonomous Council Member",
		role: "Autonomous Agent Seat",
		domainExpertise: "Specialized Analysis & Verification",
		initials: seatId.slice(0, 2).toUpperCase(),
		avatarGradient: "from-slate-600 to-slate-800",
		accentColor: "#94a3b8",
	};

	return {
		...template,
		status: "idle",
		evidenceCount: 0,
		confidence: null,
		liveReasoning: [],
	};
}

export function getAllAgentProfiles(): AgentProfile[] {
	return [
		getAgentProfile("FactChecker"),
		getAgentProfile("CloudArchitect"),
		getAgentProfile("Synthesizer"),
		getAgentProfile("RivalChallenger"),
		getAgentProfile("Thinker"),
		getAgentProfile("CredibleSourcesResearchAgent"),
		getAgentProfile("ContextAgent"),
		getAgentProfile("SocialCommunityResearchAgent"),
	];
}
