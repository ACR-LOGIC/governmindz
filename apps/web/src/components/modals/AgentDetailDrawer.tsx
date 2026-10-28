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

export const AgentDetailDrawer: React.FC<AgentDetailDrawerProps> = ({
	agent,
	messages,
	onClose,
}) => {
	if (!agent) return null;

	const agentMessages = messages.filter((m) => m.fromSeat === agent.id);
	const isWorking = agent.status === "analyzing" || agent.status === "challenging" || agent.status === "synthesizing";

	// Gather all structured reasoning records across messages
	const allEvidence = Array.from(new Set(agentMessages.flatMap((m) => m.structured?.evidence || [])));
	const allCaveats = Array.from(new Set(agentMessages.flatMap((m) => m.structured?.caveats || [])));
	const allSupports = Array.from(new Set(agentMessages.flatMap((m) => m.structured?.supports || [])));
	const allDissents = Array.from(
		new Set(agentMessages.flatMap((m) => m.structured?.dissents_from || m.structured?.dissentsFrom || [])),
	);

	return (
		<div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-[24px] flex justify-end animate-fadeIn">
			<div className="w-full max-w-md bg-[#0c101e]/95 border-l border-[#1e2842]/80 h-full flex flex-col shadow-2xl p-6 overflow-y-auto animate-slideLeft glass-panel">
				{/* Top bar with avatar, name, and creative title */}
				<div className="flex items-start justify-between pb-4 border-b border-[#1e2842] mb-6">
					<div className="flex items-center gap-3">
						<AgentAvatar
							seatId={agent.id}
							avatarId={agent.avatarId}
							humanName={agent.humanName}
							size="lg"
							showStatusPip={true}
							status={agent.status}
						/>
						<div>
							<h3 className="font-display font-bold text-base text-slate-100 flex items-center gap-1.5">
								<span>{agent.name}</span>
							</h3>
							{agent.humanName && (
								<div className="text-[12px] font-mono font-bold text-amber-300">
									Coworker Persona: {agent.humanName}
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

					{agent.humanName && (
						<div className="flex items-center justify-between text-xs">
							<span className="text-slate-400">Persona Identity:</span>
							<span className="font-mono font-bold text-amber-300 text-[11px] px-2 py-0.5 rounded bg-amber-950/50 border border-amber-800/40">
								{agent.humanName}
							</span>
						</div>
					)}

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

				{/* Assigned Job Task Card */}
				{agent.jobTask && (
					<div className="p-3.5 mb-6 rounded-xl bg-gradient-to-r from-amber-950/30 via-[#18203a] to-[#12182b] border border-amber-500/30 text-xs space-y-1.5 shadow-md">
						<div className="text-[10.5px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5">
							<Bot className="w-3.5 h-3.5 text-amber-400 shrink-0" />
							<span>{agent.humanName || agent.name}&apos;s Delegated Job Task:</span>
						</div>
						<div className="text-slate-200 text-xs leading-relaxed font-sans font-medium italic">
							&ldquo;{agent.jobTask}&rdquo;
						</div>
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

				{/* Agent Epistemic Reasoning Records (Moved from under self-confidence in chat) */}
				<div className="space-y-3 mb-6 p-4 rounded-xl bg-[#0e1322] border border-[#232f50] shadow-md">
					<div className="flex items-center justify-between border-b border-[#1b2542] pb-2">
						<h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
							<ShieldCheck className="w-4 h-4 text-emerald-400" />
							<span>Reasoning Records & Assertions</span>
						</h4>
						<span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-300">
							{allEvidence.length} Grounded Citations
						</span>
					</div>

					{/* Verified Grounding Evidence */}
					<div className="space-y-1.5">
						<div className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
							<CheckCircle2 className="w-3.5 h-3.5" />
							<span>Verified Grounding Evidence ({allEvidence.length})</span>
						</div>
						{allEvidence.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{allEvidence.map((ev, i) => (
									<span
										key={i}
										className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-emerald-950/50 border border-emerald-700/50 text-emerald-200 font-mono"
									>
										<CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
										<span>{ev}</span>
									</span>
								))}
							</div>
						) : (
							<div className="text-[11px] italic text-slate-500 font-mono">
								No specific evidence citations claimed yet.
							</div>
						)}
					</div>

					{/* Caveats & Boundary Limits */}
					{allCaveats.length > 0 && (
						<div className="space-y-1.5 pt-2 border-t border-[#18223c]">
							<div className="text-[11px] font-mono text-amber-400 font-semibold flex items-center gap-1">
								<AlertTriangle className="w-3.5 h-3.5" />
								<span>Operational Caveats & Policy Limits ({allCaveats.length})</span>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{allCaveats.map((cav, i) => (
									<span
										key={i}
										className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-amber-950/50 border border-amber-700/50 text-amber-200 font-mono"
									>
										<AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
										<span>{cav}</span>
									</span>
								))}
							</div>
						</div>
					)}

					{/* Peer Alignments (Supports & Dissents) */}
					{(allSupports.length > 0 || allDissents.length > 0) && (
						<div className="space-y-1.5 pt-2 border-t border-[#18223c]">
							<div className="text-[11px] font-mono text-teal-400 font-semibold">
								Peer Alignments & Cross-References:
							</div>
							<div className="flex flex-wrap gap-1.5">
								{allSupports.map((sup, i) => (
									<span
										key={i}
										className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-sky-950/50 border border-sky-800/50 text-sky-300 font-mono"
									>
										<CheckCircle2 className="w-3 h-3 text-sky-400 shrink-0" />
										<span>Supports @{sup}</span>
									</span>
								))}
								{allDissents.map((dis, i) => (
									<span
										key={i}
										className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-rose-950/50 border border-rose-800/50 text-rose-300 font-mono"
									>
										<AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
										<span>Dissents from @{dis}</span>
									</span>
								))}
							</div>
						</div>
					)}
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
