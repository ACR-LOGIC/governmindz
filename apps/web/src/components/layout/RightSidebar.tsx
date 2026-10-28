import React from "react";
import {
	Users,
	TrendingUp,
	ShieldCheck,
	CheckCircle2,
	BrainCircuit,
	Radio,
	Database,
	Server,
	Zap,
} from "lucide-react";
import type { AgentProfile } from "../../types";
import { AgentAvatar } from "../common/AgentAvatar";
import { isRosterEligibleSeat } from "../../services/conversationSync";

interface ChartPoint {
	round: number;
	conf: number;
}

interface RightSidebarProps {
	agents: AgentProfile[];
	activeAgentId?: string | null;
	onSelectAgent: (agent: AgentProfile) => void;
	chartData: Record<string, ChartPoint[]>;
	finalConfidence?: number;
	consensusReached?: boolean;
	consensusMethod?: string;
	auditVerified?: boolean;
	auditCount: number;
	inquiryScore?: number;
	currentRound: number;
	isOpen: boolean;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
	agents,
	activeAgentId,
	onSelectAgent,
	chartData,
	finalConfidence,
	consensusReached,
	consensusMethod,
	auditVerified,
	auditCount,
	currentRound,
	isOpen,
}) => {
	if (!isOpen) return null;

	const visibleAgents = agents.filter((a) => isRosterEligibleSeat(a.id));

	const colors: Record<string, string> = {
		FactChecker: "#7dd3fc",
		CloudArchitect: "#34d399",
		Synthesizer: "#c4b5fd",
		RivalChallenger: "#fb7185",
		Thinker: "#fbbf24",
	};

	const W = 280;
	const H = 130;
	const pad = 16;
	const thrY = H - pad - 0.75 * (H - 2 * pad);

	return (
		<aside id="tour-roster" className="w-80 bg-[#0c101e] border-l border-[#1e2842] flex flex-col shrink-0 h-[calc(100vh-4rem)] select-none overflow-y-auto glass-panel">
			{/* Section 1: Active Roster */}
			<div className="p-4 border-b border-[#1e2842]/60 bg-[#0f1424]/30 backdrop-blur-sm shrink-0">
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
						<Users className="w-3.5 h-3.5 text-teal-400" />
						<span>Agent Roster</span>
					</div>
					<span
						data-testid="roster-count-badge"
						className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#18203a] text-slate-400 border border-[#2c385c]"
					>
						{visibleAgents.filter((a) => a.status !== "idle").length}/{visibleAgents.length} joined
					</span>
				</div>

				<div className="text-[10px] text-slate-400 mb-2.5 flex items-center gap-1">
					<BrainCircuit className="w-3 h-3 text-amber-400 shrink-0" />
					<span>Assigned agents appear as they join the conversation</span>
				</div>

				{visibleAgents.length === 0 ? (
					<div className="p-5 rounded-xl border border-dashed border-[#1e2842]/50 text-center text-xs text-slate-400 animate-fadeIn bg-[#12182b]/50">
						<Users className="w-6 h-6 mx-auto mb-2.5 text-slate-500 opacity-60" />
						<p className="font-medium text-slate-300">Roster Empty</p>
						<p className="text-[11px] text-slate-400 mt-1">
							Assigned agents join dynamically as they enter the conversation.
						</p>
					</div>
				) : (
					<div className="space-y-2">
						{visibleAgents.map((agent) => {
							const isCurrentSpeaker = activeAgentId === agent.id;
							const isWorking =
								isCurrentSpeaker || (agent.status !== "idle" && agent.status !== "completed");
							const isArriving = agent.arrivalStage && agent.arrivalStage !== "working";
							const color = colors[agent.id] || "#94a3b8";
							return (
								<button
									type="button"
									key={agent.id}
									data-testid="roster-agent-card"
									data-agent-id={agent.id}
									onClick={() => onSelectAgent(agent)}
									className={`w-full flex items-center justify-between p-2.5 rounded-xl bg-[#12182b] hover:bg-[#161f38] border transition-all text-left group motion-safe:animate-scaleIn ${
										isCurrentSpeaker
											? `border-${color.slice(1) === "dd3fc" ? "sky" : color.slice(1) === "d399" ? "emerald" : color.slice(1) === "b5fd" ? "purple" : color.slice(1) === "7185" ? "rose" : "amber"}-500/60 ring-1 ring-${color.slice(1) === "dd3fc" ? "sky" : color.slice(1) === "d399" ? "emerald" : color.slice(1) === "b5fd" ? "purple" : color.slice(1) === "7185" ? "rose" : "amber"}-500/50 bg-[#17203a]`
											: isArriving
												? "border-[#2c385c] ring-1 ring-amber-500/40"
												: "border-[#1e2842]/50 hover:border-[#2c385c]"
									}`}
									title={`Click to watch ${agent.name}'s live reasoning scratchpad & epistemic hypotheses`}
								>
									<div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
										{/* Character Avatar with status pip */}
										<AgentAvatar
											seatId={agent.id}
											avatarId={agent.avatarId}
											humanName={agent.humanName}
											size="sm"
											showStatusPip={true}
											status={isArriving ? "queued" : isWorking ? agent.status || "analyzing" : agent.status}
										/>

										<div className="truncate flex-1 min-w-0">
											<div className="text-xs font-semibold text-slate-200 group-hover:text-white truncate flex items-center gap-1">
												<span>{agent.humanName ? `${agent.humanName} · ${agent.role}` : agent.name}</span>
											</div>
											<div className="text-[10px] text-amber-300/80 truncate font-mono">
												{agent.arrivalMessage
													? `“${agent.arrivalMessage}”`
													: agent.currentTask || agent.jobTask || agent.domainExpertise || agent.role}
											</div>
										</div>
									</div>

									{/* Live Watch indicator, arrival badge, or confidence */}
									<div className="ml-2 shrink-0 flex items-center gap-1">
										{agent.arrivalStage === "holding" ? (
											<span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 animate-pulse">
												JOINING
											</span>
										) : agent.arrivalStage === "greeting" ? (
											<span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-700/60 animate-fadeIn">
												JOINED
											</span>
										) : isCurrentSpeaker ? (
											<span className="flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/60 text-amber-300 animate-pulse uppercase">
												<Radio className="w-2.5 h-2.5 text-amber-400" />
												<span>{agent.status === "challenging" ? "CHALLENGING" : agent.status === "synthesizing" ? "SYNTHESIZING" : "SPEAKING"}</span>
											</span>
										) : isWorking ? (
											<span className="flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 animate-pulse">
												<Radio className="w-2.5 h-2.5 text-emerald-400" />
												<span>ACTIVE</span>
											</span>
										) : agent.confidence != null ? (
											<span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#18203a] text-teal-300 border border-[#2c385c]">
												{(agent.confidence * 100).toFixed(0)}%
											</span>
										) : (
											<span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#18203a] text-slate-400 border border-[#2c385c]">
												{agent.status}
											</span>
										)}
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Section 2: Confidence Trajectory Chart */}
			<div className="p-4 border-b border-[#1e2842]/60 bg-[#0f1424]/30 backdrop-blur-sm shrink-0">
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
						<TrendingUp className="w-3.5 h-3.5 text-amber-400" />
						<span>Confidence Trajectory</span>
					</div>
					<span className="text-[10px] font-mono text-slate-400">Round {currentRound}</span>
				</div>

				{/* SVG trajectory plot */}
				<div className="bg-[#12182b] border border-[#1e2842]/50 rounded-xl p-2.5">
					<svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 overflow-visible">
						{/* Background grid */}
						<line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#1e2842" strokeWidth="1" />
						<line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#1e2842" strokeWidth="1" />

						{/* 75% consensus threshold guideline */}
						<line
							x1={pad}
							y1={thrY}
							x2={W - pad}
							y2={thrY}
							stroke="#f4b942"
							strokeWidth="1"
							strokeDasharray="3 3"
							opacity="0.5"
						/>
						<text x={W - pad - 65} y={thrY - 4} fill="#f4b942" fontSize="9" fontFamily="monospace" fontWeight="600">
							Target 75%
						</text>

						{/* Trajectory paths */}
						{["FactChecker", "CloudArchitect", "Synthesizer"].map((seat) => {
							const pts = chartData[seat] || [];
							if (pts.length === 0) return null;
							const d = pts
								.map((p, i) => {
									const x = pad + (i / Math.max(pts.length - 1, 1)) * (W - 2 * pad);
									const y = H - pad - p.conf * (H - 2 * pad);
									return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
								})
								.join(" ");

							return (
								<g key={seat}>
									<path d={d} fill="none" stroke={colors[seat]} strokeWidth="2" strokeLinecap="round" />
									{pts.map((p, i) => {
										const x = pad + (i / Math.max(pts.length - 1, 1)) * (W - 2 * pad);
										const y = H - pad - p.conf * (H - 2 * pad);
										return (
											<circle
												key={i}
												cx={x}
												cy={y}
												r="2.5"
												fill={colors[seat]}
												stroke="#0a0e1a"
												strokeWidth="1.5"
											/>
										);
									})}
								</g>
							);
						})}
					</svg>

					{/* Legend */}
					<div className="flex items-center justify-around pt-2 border-t border-[#1e2842]/50 mt-1 text-[10px]">
						<div className="flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-full bg-[#7dd3fc]" />
							<span className="text-slate-400">FactChecker</span>
						</div>
						<div className="flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-full bg-[#34d399]" />
							<span className="text-slate-400">Architect</span>
						</div>
						<div className="flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-full bg-[#c4b5fd]" />
							<span className="text-slate-400">Synthesizer</span>
						</div>
					</div>
				</div>

				{/* Final Score summary card */}
				{finalConfidence != null && (
					<div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-amber-950/30 to-emerald-950/30 border border-amber-600/30 shadow-lg shadow-amber-950/20">
						<div className="flex items-center justify-between mb-1.5">
							<div className="text-[10px] uppercase font-mono text-amber-300 font-bold flex items-center gap-1">
								<Zap className="w-3 h-3 text-amber-400 shrink-0" />
								<span>Final Deliberation</span>
							</div>
							<span className="text-[10px] font-mono text-slate-400">{consensusMethod || "synthesizer"}</span>
						</div>
						<div className="flex items-end gap-1">
							<div className="text-2xl font-mono font-bold text-[#f4b942]">
								{(finalConfidence * 100).toFixed(1)}%
							</div>
							<span className="text-[10px] text-emerald-400 font-mono font-bold align-bottom">
								Calibrated
							</span>
						</div>
						<div className="mt-1 text-[10px] text-slate-400">
							{consensusReached ? "Consensus Achieved" : "Deliberation Completed"}
						</div>
					</div>
				)}
			</div>

			{/* Section 3: Trust & Audit Ledger Status */}
			<div className="p-4 border-b border-[#1e2842]/60 bg-[#0f1424]/30 backdrop-blur-sm shrink-0">
				<div className="flex items-center justify-between mb-2">
					<div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
						<ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
						<span>Cryptographic Ledger</span>
					</div>
				</div>

				<div className="p-2.5 rounded-xl bg-[#12182b] border border-[#1e2842]/50 space-y-2 text-xs">
					<div className="flex items-center justify-between">
						<span className="text-slate-400">Audit Trail:</span>
						<span className="font-mono text-slate-200 font-bold">{auditCount} events</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-slate-400">Chain Integrity:</span>
						<span
							className={`inline-flex items-center gap-1.5 font-mono font-bold text-[11px] ${
								auditVerified ? "text-emerald-400" : "text-amber-400"
							}`}
						>
							<CheckCircle2 className="w-3 h-3" />
							{auditVerified ? "HMAC Verified" : "Active Ledger"}
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-slate-400">Genesis Hash:</span>
						<span className="font-mono text-[10px] text-teal-400">c910699e…</span>
					</div>
				</div>
			</div>

			{/* Section 4: Sponsor Integrations */}
			<div className="p-4 space-y-3">
				<div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
					Sponsor Stack
				</div>

				<div className="p-2.5 rounded-xl bg-[#12182b] border border-[#1e2842]/50 space-y-2 text-xs">
					<div className="flex items-start gap-2 p-1.5 rounded-lg bg-emerald-950/10 border border-emerald-900/30">
						<Database className="w-4 h-4 text-emerald-400 shrink-0" />
						<div>
							<div className="font-semibold text-slate-200 flex items-center justify-between">
								<span>Zetaris Lightning</span>
								<span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
									READ-ONLY SQL
								</span>
							</div>
							<div className="text-[11px] text-slate-400 mt-0.5">
								Federated enterprise data integration with strict query statement guards.
							</div>
						</div>
					</div>

					<div className="pt-2 border-t border-[#1e2842]/30">
						<div className="flex items-start gap-2 p-1.5 rounded-lg bg-sky-950/10 border border-sky-900/30">
							<Server className="w-4 h-4 text-sky-400 shrink-0" />
							<div>
								<div className="font-semibold text-slate-200 flex items-center justify-between">
									<span>Meterless Runtime</span>
									<span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
										NVIDIA NEMOTRON
									</span>
								</div>
								<div className="text-[11px] text-slate-400 mt-0.5">
									OpenAI-compatible inference runtime with automated token redaction.
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</aside>
	);
};
