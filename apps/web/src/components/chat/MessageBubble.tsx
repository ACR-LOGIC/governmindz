import React, { useState } from "react";
import {
	ShieldAlert,
	CheckCircle2,
	AlertCircle,
	CornerDownRight,
	Clock,
	Sparkles,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import type { ChatMessage } from "../../types";
import { AGENT_REGISTRY } from "../../services/agentRegistry";

interface MessageBubbleProps {
	message: ChatMessage;
	onSelectAgent?: (seatId: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
	message,
	onSelectAgent,
}) => {
	const [expanded, setExpanded] = useState(false);
	const isUser = message.fromSeat === "user";
	const isOrchestrator = message.fromSeat === "Orchestrator";

	const profile = AGENT_REGISTRY[message.fromSeat] || {
		id: message.fromSeat,
		name: message.fromSeat,
		role: "Agent Seat",
		initials: message.fromSeat.slice(0, 2).toUpperCase(),
		avatarGradient: "from-slate-600 to-slate-800",
		accentColor: "#94a3b8",
	};

	const st = message.structured;
	const selfConf = st?.confidence_self ?? st?.confidenceSelf ?? message.confidence;
	const expertConf = st?.confidence_expert_agreement ?? st?.confidenceExpertAgreement;
	const evidence = st?.evidence || [];
	const caveats = st?.caveats || [];
	const supports = st?.supports || [];
	const dissents = st?.dissents_from || st?.dissentsFrom || [];

	const formatTime = (ts: number) => {
		return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	};

	// Message type badge styling
	const getTypeBadge = (type: string) => {
		switch (type) {
			case "proposal":
				return { label: "Initial Proposal", bg: "bg-sky-950/60 text-sky-300 border-sky-800/60" };
			case "challenge":
				return { label: "Adversarial Challenge", bg: "bg-rose-950/60 text-rose-300 border-rose-800/60" };
			case "rebuttal":
				return { label: "Seat Rebuttal", bg: "bg-indigo-950/60 text-indigo-300 border-indigo-800/60" };
			case "refinement":
				return { label: "Position Refinement", bg: "bg-teal-950/60 text-teal-300 border-teal-800/60" };
			case "consensus":
				return { label: "Consensus Vote", bg: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" };
			case "escalation":
				return { label: "Escalated Intervention", bg: "bg-amber-950/60 text-amber-300 border-amber-800/60" };
			case "summary":
				return { label: "Transcript Synthesis", bg: "bg-purple-950/60 text-purple-300 border-purple-800/60" };
			default:
				return { label: type, bg: "bg-slate-900 text-slate-300 border-slate-700" };
		}
	};

	const badge = getTypeBadge(message.type);

	if (isUser) {
		return (
			<div className="flex justify-end gap-3 mb-6 animate-fadeIn">
				<div className="max-w-2xl bg-gradient-to-r from-amber-950/40 via-[#18203a] to-[#12182b] border border-amber-500/30 rounded-2xl rounded-tr-sm p-4 shadow-lg shadow-black/30">
					<div className="flex items-center justify-between gap-4 mb-1.5 text-xs">
						<span className="font-bold text-amber-300">You (Operator)</span>
						<span className="text-[10px] font-mono text-slate-400">{formatTime(message.timestamp)}</span>
					</div>
					<div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">{message.content}</div>
				</div>

				<div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0 shadow-md">
					OP
				</div>
			</div>
		);
	}

	return (
		<div className="flex gap-3 mb-6 animate-fadeIn group">
			{/* Avatar with click to inspect */}
			<button
				type="button"
				onClick={() => onSelectAgent?.(message.fromSeat)}
				className="w-9 h-9 rounded-xl bg-gradient-to-br shrink-0 flex items-center justify-center font-bold text-xs text-white shadow-md transition-transform hover:scale-105 active:scale-95"
				style={{
					backgroundImage: `linear-gradient(135deg, ${profile.accentColor} 0%, #0f1424 100%)`,
				}}
				title={`Inspect ${profile.name}`}
			>
				{profile.initials}
			</button>

			{/* Bubble container */}
			<div className="flex-1 max-w-3xl min-w-0">
				{/* Header info */}
				<div className="flex items-baseline flex-wrap gap-2 mb-1.5">
					<button
						type="button"
						onClick={() => onSelectAgent?.(message.fromSeat)}
						className="font-bold text-xs hover:underline transition-colors"
						style={{ color: profile.accentColor }}
					>
						{profile.name}
					</button>

					<span className="text-[11px] text-slate-400">· {profile.role}</span>

					{/* Message type badge */}
					<span
						className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border font-semibold ${badge.bg}`}
					>
						{badge.label}
					</span>

					{message.round != null && (
						<span className="text-[10px] font-mono text-slate-400">Round {message.round}</span>
					)}

					<span className="ml-auto text-[10px] font-mono text-slate-400 flex items-center gap-1">
						{message.latency_ms != null && (
							<span className="text-slate-400">{message.latency_ms}ms ·</span>
						)}
						{formatTime(message.timestamp)}
					</span>
				</div>

				{/* Card Body */}
				<div className="bg-[#12182b] border border-[#1e2842] hover:border-[#2c385c] rounded-2xl rounded-tl-sm p-4 shadow-md transition-colors">
					{/* Quoted reply context if present */}
					{message.replyToExcerpt && (
						<div className="mb-3 px-3 py-1.5 rounded-lg bg-[#0c101e]/80 border-l-2 border-teal-500 text-xs text-slate-400 flex items-start gap-1.5">
							<CornerDownRight className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
							<span className="italic truncate">{message.replyToExcerpt}</span>
						</div>
					)}

					{/* Main position text */}
					<div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
						{st?.position || message.content}
					</div>

					{/* Confidence bar row */}
					{selfConf != null && (
						<div className="mt-3 pt-3 border-t border-[#1e2842] flex items-center gap-3 text-xs">
							<span className="text-[11px] font-mono text-slate-400">Self-Confidence:</span>
							<div className="flex-1 h-1.5 bg-[#18203a] rounded-full overflow-hidden max-w-xs">
								<div
									className="h-full rounded-full transition-all duration-500"
									style={{
										width: `${Math.min(100, Math.max(0, selfConf * 100))}%`,
										backgroundColor: profile.accentColor,
									}}
								/>
							</div>
							<span className="font-mono text-xs font-bold" style={{ color: profile.accentColor }}>
								{(selfConf * 100).toFixed(0)}%
							</span>

							{expertConf != null && (
								<span className="text-[11px] font-mono text-slate-400 ml-2">
									Expert Agreement: <b className="text-slate-300">{(expertConf * 100).toFixed(0)}%</b>
								</span>
							)}
						</div>
					)}

					{/* Evidence and Caveat Chips */}
					{(evidence.length > 0 || caveats.length > 0 || supports.length > 0 || dissents.length > 0) && (
						<div className="mt-3 pt-2 flex flex-wrap gap-1.5">
							{evidence.map((ev, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-emerald-950/40 border border-emerald-800/40 text-emerald-300"
								>
									<CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
									<span>{ev}</span>
								</span>
							))}

							{caveats.map((cav, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-amber-950/40 border border-amber-800/40 text-amber-300"
								>
									<AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
									<span>{cav}</span>
								</span>
							))}

							{supports.map((sup, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-sky-950/40 border border-sky-800/40 text-sky-300"
								>
									<span>Supports {sup}</span>
								</span>
							))}

							{dissents.map((dis, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-rose-950/40 border border-rose-800/40 text-rose-300"
								>
									<ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
									<span>Dissents from {dis}</span>
								</span>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
