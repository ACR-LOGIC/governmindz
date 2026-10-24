import React from "react";
import {
	X,
	CheckCircle2,
	AlertTriangle,
	ShieldCheck,
	Cpu,
	Bot,
	Sparkles,
	BrainCircuit,
	Terminal,
	Radio,
	Activity,
} from "lucide-react";
import type { AgentProfile, ChatMessage } from "../../types";
import { AgentAvatar } from "../common/AgentAvatar";

interface AgentDetailDrawerProps {
	agent: AgentProfile | null;
	messages: ChatMessage[];
	onClose: () => void;
}

const CATCHPHRASES: Record<string, string> = {
	FactChecker: "“Wait... let me inspect the primary keys first!” 🔍",
	CloudArchitect: "“Who left 0.0.0.0/0 open in the firewall?! 🧱”",
	Synthesizer: "“Order in the court! We have calibrated consensus. ⚖️”",
	RivalChallenger: "“Disputed! Show me the cryptographic hash or it didn't happen! 🥊”",
	Thinker: "“Pondering the existential entropy of this retention policy... ☕”",
	ContextAgent: "“I distinctly recall what you stated in round one. 📜”",
	CredibleSourcesResearchAgent: "“Querying authoritative registries and peer-reviewed journals... 🌐”",
	SocialCommunityResearchAgent: "“Assessing ecosystem stakeholder impact and user sentiment... 👥”",
	Orchestrator: "“GovernMindz flight director on deck. All seats report in! 🛰️”",
	user: "“Operator review: inspecting multi-agent deliberation. ☕”",
};

export const AgentDetailDrawer: React.FC<AgentDetailDrawerProps> = ({
	agent,
	messages,
	onClose,
}) => {
	if (!agent) return null;

	const agentMessages = messages.filter((m) => m.fromSeat === agent.id);
	const catchphrase = CATCHPHRASES[agent.id];
	const isWorking = agent.status === "analyzing" || agent.status === "challenging" || agent.status === "synthesizing";

	return (
		<div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-fadeIn">
			<div className="w-full max-w-md bg-[#0c101e] border-l border-[#1e2842] h-full flex flex-col shadow-2xl p-6 overflow-y-auto animate-slideLeft">
				{/* Top bar with avatar, name, and creative title */}
				<div className="flex items-start justify-between pb-4 border-b border-[#1e2842] mb-6">
					<div className="flex items-center gap-3">
						<AgentAvatar seatId={agent.id} size="lg" showStatusPip={true} status={agent.status} />
						<div>
							<h3 className="font-display font-bold text-base text-slate-100 flex items-center gap-1.5">
								<span>{agent.name}</span>
							</h3>
							{agent.creativeTitle && (
								<div className="text-[11px] font-mono font-semibold text-amber-300">
									{agent.creativeTitle}
								</div>
							)}
							<p className="text-xs text-slate-400">{agent.role}</p>
						</div>
					</div>

					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#18203a] transition-colors"
						title="Close agent inspection drawer"
						aria-label="Close drawer"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Agent Status & Meta */}
				<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3 mb-6">
					<div className="flex items-center justify-between text-xs">
						<span className="text-slate-400">Current Status:</span>
						<span className="font-mono font-bold text-teal-400 uppercase text-[11px] px-2 py-0.5 rounded bg-teal-950/60 border border-teal-800 flex items-center gap-1">
							{isWorking && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />}
							<span>{agent.status}</span>
						</span>
					</div>

					{agent.domainExpertise && (
						<div className="flex items-start justify-between text-xs">
							<span className="text-slate-400 shrink-0 mr-2">Domain Focus:</span>
							<span className="font-mono text-slate-200 text-right text-[11px]">{agent.domainExpertise}</span>
						</div>
					)}

					<div className="flex items-center justify-between text-xs">
						<span className="text-slate-400">Deliberation Positions:</span>
						<span className="font-mono font-bold text-slate-200">{agentMessages.length}</span>
					</div>

					{agent.confidence != null && (
						<div className="flex items-center justify-between text-xs">
							<span className="text-slate-400">Calibrated Confidence:</span>
							<span className="font-mono font-bold text-amber-300">
								{(agent.confidence * 100).toFixed(0)}%
							</span>
						</div>
					)}
				</div>

				{catchphrase && (
					<div className="p-3 mb-6 rounded-xl bg-[#18203a] border border-[#2c385c] text-xs font-mono italic text-amber-300 flex items-center gap-2 shadow-inner">
						<Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
						<span>{catchphrase}</span>
					</div>
				)}

				{/* Live Reasoning & Cognitive Scratchpad */}
				<div className="space-y-2 mb-6">
					<div className="flex items-center justify-between">
						<h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
							<BrainCircuit className="w-4 h-4 text-amber-400" />
							<span>Live Reasoning & Hypothesis Watcher</span>
						</h4>
						{isWorking && (
							<span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50 animate-pulse">
								<Radio className="w-2.5 h-2.5" />
								<span>LIVE</span>
							</span>
						)}
					</div>

					<div className="p-3.5 rounded-xl bg-[#0a0d17] border border-[#1e2842] space-y-2 font-mono text-xs shadow-inner">
						{agent.liveReasoning && agent.liveReasoning.length > 0 ? (
							<div className="space-y-2">
								{agent.liveReasoning.map((step, idx) => (
									<div key={idx} className="flex items-start gap-2 text-slate-300">
										<span className="text-amber-400 shrink-0 font-bold">[{idx + 1}]</span>
										<span className="leading-relaxed text-[11px] text-slate-200">{step}</span>
									</div>
								))}
								{isWorking && (
									<div className="pt-2 border-t border-[#1a2238] flex items-center gap-2 text-teal-400 text-[11px]">
										<Activity className="w-3 h-3 animate-spin" />
										<span>Evaluating epistemic hypotheses and cross-agent rebuttals...</span>
									</div>
								)}
							</div>
						) : (
							<div className="text-slate-400 text-xs py-2 leading-relaxed">
								{isWorking ? (
									<div className="flex items-center gap-2 text-teal-300">
										<Activity className="w-3.5 h-3.5 animate-spin" />
										<span>Formulating hypothesis & querying federated catalog...</span>
									</div>
								) : (
									<span className="italic text-[11px]">
										Agent standing by. When the council begins inquiry deliberation, real-time
										hypotheses, schema checks, and scratchpad reasoning stream directly into this window.
									</span>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Role Directive & System Description */}
				<div className="space-y-2 mb-6">
					<h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
						<Bot className="w-4 h-4 text-teal-400" />
						<span>Role Mandate & Boundaries</span>
					</h4>
					<p className="text-xs text-slate-400 leading-relaxed bg-[#12182b] p-3 rounded-xl border border-[#1e2842]">
						{agent.id === "FactChecker" &&
							"Responsible for strictly verifying database entities, owners, and data classification against cached or live Zetaris federated catalogs. Rejects hallucinations and invalid schema mappings."}
						{agent.id === "CloudArchitect" &&
							"Enforces least-privilege principles, statement limits, read-only SQL assertions, and zero-trust policy boundaries before granting agent access."}
						{agent.id === "Synthesizer" &&
							"Supervises debate convergence, detects consensus breaches, compiles final actionable recommendations, and triggers audit sign-off."}
						{agent.id === "RivalChallenger" &&
							"Independent adversarial challenger. Proactively interrogates unverified assumptions and disputes claims lacking explicit audit evidence."}
						{agent.id === "Thinker" &&
							"Exploratory thinker agent that probes hidden governance angles, long-term retention policies, and edge-case operational gaps."}
						{agent.id === "CredibleSourcesResearchAgent" &&
							"Performs live web intelligence searches and prioritizes peer-reviewed publications, government regulations (NIST, FedRAMP, GDPR), and authoritative specifications."}
						{!["FactChecker", "CloudArchitect", "Synthesizer", "RivalChallenger", "Thinker", "CredibleSourcesResearchAgent"].includes(
							agent.id,
						) && "Specialized council seat in the GovernMindz multi-agent orchestration collective."}
					</p>
				</div>

				{/* Contributions in this debate */}
				<div className="space-y-3 flex-1">
					<h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
						<Sparkles className="w-4 h-4 text-amber-400" />
						<span>Deliberation History & Citations ({agentMessages.length})</span>
					</h4>

					{agentMessages.length > 0 ? (
						agentMessages.map((msg, i) => (
							<div key={i} className="p-3 rounded-xl bg-[#12182b] border border-[#1e2842] text-xs space-y-2">
								<div className="flex items-center justify-between text-[11px] text-slate-400">
									<span className="font-bold text-slate-200">
										{msg.type.toUpperCase()} · Round {msg.round || 0}
									</span>
									<span className="font-mono text-[10px]">
										{new Date(msg.timestamp).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
								</div>

								<div className="text-slate-300 leading-relaxed">
									{msg.structured?.position || msg.content}
								</div>

								{/* Detailed citations and evidence list */}
								{msg.structured?.evidence && msg.structured.evidence.length > 0 && (
									<div className="pt-2 border-t border-[#1a2238] space-y-1">
										<div className="text-[10px] uppercase font-mono text-emerald-400 font-bold">
											Verified Citations ({msg.structured.evidence.length})
										</div>
										{msg.structured.evidence.map((ev, eIdx) => (
											<div key={eIdx} className="text-[10.5px] text-emerald-300 flex items-start gap-1 font-mono">
												<CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
												<span>{ev}</span>
											</div>
										))}
									</div>
								)}
							</div>
						))
					) : (
						<div className="p-4 text-center text-xs text-slate-400 border border-dashed border-[#1e2842] rounded-xl">
							No positions submitted in the active debate yet.
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
