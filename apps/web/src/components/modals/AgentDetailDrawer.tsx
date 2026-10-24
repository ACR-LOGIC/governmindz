import React from "react";
import { X, CheckCircle2, AlertTriangle, ShieldCheck, Cpu, Bot, Sparkles } from "lucide-react";
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

	return (
		<div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-fadeIn">
			<div className="w-full max-w-md bg-[#0c101e] border-l border-[#1e2842] h-full flex flex-col shadow-2xl p-6 overflow-y-auto animate-slideLeft">
				{/* Top bar with close button */}
				<div className="flex items-center justify-between pb-4 border-b border-[#1e2842] mb-6">
					<div className="flex items-center gap-3">
						<AgentAvatar seatId={agent.id} size="lg" showStatusPip={true} status={agent.status} />
						<div>
							<h3 className="font-display font-bold text-base text-slate-100">{agent.name}</h3>
							<p className="text-xs text-slate-400">{agent.role}</p>
						</div>
					</div>

					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#18203a] transition-colors"
						title="Close agent inspection drawer"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Agent Status & Meta */}
				<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3 mb-6">
					<div className="flex items-center justify-between text-xs">
						<span className="text-slate-400">Current Status:</span>
						<span className="font-mono font-bold text-teal-400 uppercase text-[11px] px-2 py-0.5 rounded bg-teal-950/60 border border-teal-800">
							{agent.status}
						</span>
					</div>

					<div className="flex items-center justify-between text-xs">
						<span className="text-slate-400">Total Positions Submitted:</span>
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

				{/* Role Directive & System Description */}
				<div className="space-y-2 mb-6">
					<h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
						<Bot className="w-4 h-4 text-teal-400" />
						<span>Role Mandate & Boundaries</span>
					</h4>
					<p className="text-xs text-slate-400 leading-relaxed bg-[#12182b] p-3 rounded-xl border border-[#1e2842]">
						{agent.id === "FactChecker" &&
							"Responsible for strictly verifying database entities, owners, and data classification against cached or live Zetaris federated catalogs. Rejects hallucinations."}
						{agent.id === "CloudArchitect" &&
							"Enforces least-privilege principles, statement limits, read-only SQL assertions, and zero-trust policy boundaries before granting agent access."}
						{agent.id === "Synthesizer" &&
							"Supervises debate convergence, detects consensus breaches, compiles final actionable recommendations, and triggers audit sign-off."}
						{agent.id === "RivalChallenger" &&
							"Independent adversarial challenger. Proactively interrogates unverified assumptions and disputes claims lacking explicit audit evidence."}
						{agent.id === "Thinker" &&
							"Exploratory thinker agent that probes hidden governance angles, long-term retention policies, and edge-case operational gaps."}
						{!["FactChecker", "CloudArchitect", "Synthesizer", "RivalChallenger", "Thinker"].includes(
							agent.id,
						) && "Specialized agent in the GovernMindz multi-agent orchestration collective."}
					</p>
				</div>

				{/* Contributions in this debate */}
				<div className="space-y-3 flex-1">
					<h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
						<Sparkles className="w-4 h-4 text-amber-400" />
						<span>Deliberation History ({agentMessages.length})</span>
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

								{msg.structured?.evidence && msg.structured.evidence.length > 0 && (
									<div className="text-[10.5px] text-emerald-400 flex items-center gap-1">
										<CheckCircle2 className="w-3 h-3 shrink-0" />
										<span>Evidence cited: {msg.structured.evidence.length} points</span>
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
