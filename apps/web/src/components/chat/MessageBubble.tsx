import React, { useState, useEffect } from "react";
import {
	ShieldAlert,
	CheckCircle2,
	AlertCircle,
	CornerDownRight,
	Clock,
	Sparkles,
	ChevronDown,
	ChevronUp,
	MessageSquare,
	ShieldCheck,
	Flame,
	Search,
	Scale,
	Lightbulb,
	Copy,
	Check,
	Volume2,
	VolumeX,
	ThumbsUp,
	ThumbsDown,
} from "lucide-react";
import type { ChatMessage, AgentProfile } from "../../types";
import { AGENT_REGISTRY, getAgentProfile } from "../../services/agentRegistry";
import { AgentAvatar } from "../common/AgentAvatar";
import { ttsService } from "../../services/ttsService";

interface MessageBubbleProps {
	message: ChatMessage;
	agentProfile?: AgentProfile;
	onSelectAgent?: (seatId: string) => void;
	onRateMessage?: (messageId: string, rating: "up" | "down" | null) => void;
}

// Funny character catchphrases matching each seat's persona
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

export const MessageBubble: React.FC<MessageBubbleProps> = ({
	message,
	agentProfile,
	onSelectAgent,
	onRateMessage,
}) => {
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isSpeakingThis, setIsSpeakingThis] = useState(false);
	const [rating, setRating] = useState<"up" | "down" | null>(message.userRating || null);

	useEffect(() => {
		setRating(message.userRating || null);
	}, [message.userRating]);

	const handleRate = (newRating: "up" | "down") => {
		const next = rating === newRating ? null : newRating;
		setRating(next);
		onRateMessage?.(message.id, next);
	};

	const isUser = message.fromSeat === "user";
	const isOrchestrator = message.fromSeat === "Orchestrator";

	const profile =
		agentProfile || AGENT_REGISTRY[message.fromSeat] || getAgentProfile(message.fromSeat);

	const st = message.structured;
	const selfConf = st?.confidence_self ?? st?.confidenceSelf ?? message.confidence;
	const expertConf = st?.confidence_expert_agreement ?? st?.confidenceExpertAgreement;
	const evidence = st?.evidence || [];
	const caveats = st?.caveats || [];
	const supports = st?.supports || [];
	const dissents = st?.dissents_from || st?.dissentsFrom || [];
	const catchphrase = CATCHPHRASES[message.fromSeat];
	const rawContent = st?.position || message.content;

	// Listen to TTS state
	useEffect(() => {
		const unsub = ttsService.subscribe((isSpeaking, seatId, msgId) => {
			setIsSpeakingThis(isSpeaking && msgId === message.id);
		});
		return unsub;
	}, [message.id]);

	const formatTime = (ts: number) => {
		return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	};

	const handleCopy = () => {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(rawContent);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleToggleSpeak = () => {
		if (isSpeakingThis) {
			ttsService.stop();
		} else {
			ttsService.speak(rawContent, message.fromSeat, message.id);
		}
	};

	// Message type badge styling
	const getTypeBadge = (type: string) => {
		switch (type) {
			case "proposal":
				return { label: "Initial Proposal", bg: "bg-sky-950/70 text-sky-300 border-sky-700/60", icon: Search };
			case "challenge":
				return { label: "Adversarial Challenge", bg: "bg-rose-950/70 text-rose-300 border-rose-700/60", icon: Flame };
			case "rebuttal":
				return { label: "Seat Rebuttal", bg: "bg-indigo-950/70 text-indigo-300 border-indigo-700/60", icon: ShieldAlert };
			case "refinement":
				return { label: "Position Refinement", bg: "bg-teal-950/70 text-teal-300 border-teal-700/60", icon: Sparkles };
			case "consensus":
				return { label: "Consensus Vote", bg: "bg-emerald-950/70 text-emerald-300 border-emerald-700/60", icon: Scale };
			case "escalation":
				return { label: "Intervention Escalation", bg: "bg-amber-950/70 text-amber-300 border-amber-700/60", icon: AlertCircle };
			case "summary":
				return { label: "Transcript Synthesis", bg: "bg-purple-950/70 text-purple-300 border-purple-700/60", icon: Sparkles };
			default:
				return { label: type, bg: "bg-slate-900 text-slate-300 border-slate-700", icon: MessageSquare };
		}
	};

	const badge = getTypeBadge(message.type);
	const BadgeIcon = badge.icon;

	// User Bubble Rendering
	if (isUser) {
		return (
			<div className="flex justify-end gap-3 mb-6 animate-fadeIn group">
				<div className="max-w-2xl bg-gradient-to-r from-[#1e1e24] via-[#16161a] to-[#121214] border border-[#2e2e38] rounded-2xl rounded-tr-sm p-4 shadow-xl shadow-black/40 relative">
					{/* Header */}
					<div className="flex items-center justify-between gap-4 mb-2 text-xs border-b border-[#2e2e38] pb-2">
						<div className="flex items-center gap-2">
							<span className="font-bold text-amber-300">You (Operator)</span>
							<span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
								HUMAN REVIEWER
							</span>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleCopy}
								className="p-1 rounded text-slate-400 hover:text-white transition-colors"
								title="Copy to clipboard"
							>
								{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
							</button>
							<span className="text-[10px] font-mono text-slate-400">{formatTime(message.timestamp)}</span>
						</div>
					</div>

					{/* Catchphrase */}
					<div className="text-[11px] italic text-amber-200/60 mb-2 font-mono">
						{catchphrase}
					</div>

					{/* Content */}
					<div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-sans">
						{message.content}
					</div>
				</div>

				{/* Avatar */}
				<AgentAvatar seatId="user" size="md" className="ring-2 ring-amber-500/40" />
			</div>
		);
	}

	// Multi-Agent Group Chat Bubble Rendering
	return (
		<div className="flex gap-3 mb-6 animate-fadeIn group">
			{/* Character Avatar with interactive inspect */}
			<button
				type="button"
				onClick={() => onSelectAgent?.(message.fromSeat)}
				className="shrink-0 transition-transform hover:scale-110 active:scale-95 focus:outline-none"
				title={`Inspect ${profile.name} — ${profile.role}`}
			>
				<AgentAvatar
					seatId={message.fromSeat}
					avatarId={profile.avatarId}
					humanName={profile.humanName}
					size="lg"
					showStatusPip={true}
					status={message.type === "challenge" ? "challenging" : message.type === "consensus" ? "completed" : "analyzing"}
					className={`ring-2 shadow-lg ${isSpeakingThis ? "ring-amber-400 animate-pulse" : ""}`}
				/>
			</button>

			{/* Bubble container */}
			<div className="flex-1 max-w-3xl min-w-0">
				{/* Group Message Header */}
				<div className="flex items-center flex-wrap gap-2 mb-2">
					<button
						type="button"
						onClick={() => onSelectAgent?.(message.fromSeat)}
						className="font-bold text-sm hover:underline transition-colors flex items-center gap-1.5"
						style={{ color: profile.accentColor }}
					>
						<span>{profile.humanName ? `${profile.humanName} (${profile.role})` : profile.name}</span>
					</button>

					<span className="text-[11px] text-slate-400 font-medium">· {profile.role}</span>

					{/* Assigned Job Task Badge */}
					{profile.jobTask && (
						<span
							className="text-[9.5px] font-mono px-2 py-0.5 rounded-md font-semibold border shadow-sm max-w-xs truncate"
							style={{
								backgroundColor: `${profile.accentColor}15`,
								borderColor: `${profile.accentColor}40`,
								color: profile.accentColor,
							}}
							title={`Job Task: ${profile.jobTask}`}
						>
							Task: {profile.jobTask}
						</span>
					)}

					{/* Message type badge with icon */}
					<span
						className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase px-2.5 py-0.5 rounded-full border font-semibold ${badge.bg}`}
					>
						<BadgeIcon className="w-2.5 h-2.5" />
						<span>{badge.label}</span>
					</span>

					{message.round != null && (
						<span className="text-[10px] font-mono text-slate-400 bg-[#16161a] px-2 py-0.5 rounded-md border border-[#26262e]">
							Round {message.round}
						</span>
					)}

					{/* Addressed Agent if present */}
					{message.toSeat && message.toSeat !== "all" && (
						<span className="text-[10px] font-mono text-teal-300 bg-teal-950/50 px-2 py-0.5 rounded-md border border-teal-800/40">
							Replying to @{message.toSeat}
						</span>
					)}

					{/* Equalizer Visual Cue when actively speaking */}
					{isSpeakingThis && (
						<span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
							<span className="w-1 h-2 bg-amber-400 animate-bounce" />
							<span className="w-1 h-3 bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
							<span className="w-1 h-1.5 bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
							<span className="ml-1 text-[9px]">Speaking…</span>
						</span>
					)}

					{/* Header Actions: Copy + Text-to-Speech Toggle + Thumbs Rating */}
					<div className="ml-auto flex items-center gap-1.5 text-slate-400">
						{/* Thumbs Up / Down ratings */}
						<div className="flex items-center gap-0.5 border-r border-[#26262e] pr-1.5 mr-0.5">
							<button
								type="button"
								onClick={() => handleRate("up")}
								className={`p-1 rounded-md transition-all ${
									rating === "up"
										? "text-emerald-400 bg-emerald-950/60 ring-1 ring-emerald-500/50"
										: "text-slate-400 hover:text-emerald-300 hover:bg-[#1a1a20]"
								}`}
								title="Rate response accurate & verified (Thumbs Up)"
								aria-label="Thumbs up rating"
							>
								<ThumbsUp className={`w-3.5 h-3.5 ${rating === "up" ? "fill-emerald-400/30" : ""}`} />
							</button>

							<button
								type="button"
								onClick={() => handleRate("down")}
								className={`p-1 rounded-md transition-all ${
									rating === "down"
										? "text-rose-400 bg-rose-950/60 ring-1 ring-rose-500/50"
										: "text-slate-400 hover:text-rose-300 hover:bg-[#1a1a20]"
								}`}
								title="Rate response disputed or flawed (Thumbs Down)"
								aria-label="Thumbs down rating"
							>
								<ThumbsDown className={`w-3.5 h-3.5 ${rating === "down" ? "fill-rose-400/30" : ""}`} />
							</button>
						</div>

						<button
							type="button"
							onClick={handleToggleSpeak}
							className="p-1 rounded-md hover:text-amber-400 hover:bg-[#1a1a20] transition-colors"
							title={isSpeakingThis ? "Stop speaking" : `Listen to ${profile.name}'s voice`}
						>
							{isSpeakingThis ? (
								<VolumeX className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
							) : (
								<Volume2 className="w-3.5 h-3.5" />
							)}
						</button>

						<button
							type="button"
							onClick={handleCopy}
							className="p-1 rounded-md hover:text-white hover:bg-[#1a1a20] transition-colors"
							title="Copy position to clipboard"
						>
							{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
						</button>

						<span className="text-[10px] font-mono text-slate-400">
							{message.latency_ms != null && <span>{message.latency_ms}ms · </span>}
							{formatTime(message.timestamp)}
						</span>
					</div>
				</div>

				{/* Group Message Card Body with Dark Graphite Accent */}
				<div
					className={`bg-[#16161a] border border-[#26262e] hover:border-[#383844] rounded-2xl rounded-tl-sm p-4 shadow-xl transition-all relative overflow-hidden ${
						isSpeakingThis ? "ring-1 ring-amber-500/60 shadow-amber-950/20" : ""
					}`}
					style={{
						borderLeftWidth: "4px",
						borderLeftColor: profile.accentColor,
					}}
				>
					{/* Subtle Background Character Glow */}
					<div
						className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-10"
						style={{ backgroundColor: profile.accentColor }}
					/>

					{/* Humorous Persona Catchphrase / Thought Bubble */}
					{catchphrase && (
						<div
							className="text-[11px] italic font-mono mb-2 flex items-center gap-1.5 opacity-85"
							style={{ color: profile.accentColor }}
						>
							<span>{catchphrase}</span>
						</div>
					)}

					{/* Quoted reply context if present */}
					{message.replyToExcerpt && (
						<div className="mb-3 px-3 py-1.5 rounded-lg bg-[#0e0e12] border-l-2 border-teal-500 text-xs text-slate-400 flex items-start gap-1.5">
							<CornerDownRight className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
							<span className="italic truncate">{message.replyToExcerpt}</span>
						</div>
					)}

					{/* Main position text */}
					<div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-sans">
						{rawContent}
					</div>

					{/* Confidence bar row */}
					{selfConf != null && (
						<div className="mt-3 pt-3 border-t border-[#26262e] flex items-center gap-3 text-xs flex-wrap">
							<span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
								<Sparkles className="w-3 h-3 text-amber-400" />
								<span>Self-Confidence:</span>
							</span>
							<div className="flex-1 h-2 bg-[#22222a] rounded-full overflow-hidden max-w-xs min-w-[100px]">
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
								<span className="text-[11px] font-mono text-slate-400 ml-auto bg-[#1e1e26] px-2 py-0.5 rounded-md border border-[#2e2e3a]">
									Expert Agreement: <b className="text-slate-200">{(expertConf * 100).toFixed(0)}%</b>
								</span>
							)}
						</div>
					)}

					{/* Evidence, Caveats, Supports, and Dissents Chips */}
					{(evidence.length > 0 || caveats.length > 0 || supports.length > 0 || dissents.length > 0) && (
						<div className="mt-3 pt-2 flex flex-wrap gap-1.5">
							{evidence.map((ev, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 font-mono"
								>
									<CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
									<span>{ev}</span>
								</span>
							))}

							{caveats.map((cav, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-amber-950/40 border border-amber-800/40 text-amber-300 font-mono"
								>
									<AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
									<span>{cav}</span>
								</span>
							))}

							{supports.map((sup, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-sky-950/40 border border-sky-800/40 text-sky-300 font-mono"
								>
									<CheckCircle2 className="w-3 h-3 text-sky-400 shrink-0" />
									<span>Supports @{sup}</span>
								</span>
							))}

							{dissents.map((dis, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-rose-950/40 border border-rose-800/40 text-rose-300 font-mono"
								>
									<ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
									<span>Dissents from @{dis}</span>
								</span>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
