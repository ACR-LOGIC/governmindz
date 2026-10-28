import React, { useState, useEffect } from "react";
import {
	ShieldAlert,
	CheckCircle2,
	AlertCircle,
	CornerDownRight,
	Sparkles,
	ChevronDown,
	ChevronUp,
	MessageSquare,
	Flame,
	Search,
	Scale,
	Copy,
	Check,
	Volume2,
	VolumeX,
	ThumbsUp,
	ThumbsDown,
	Sliders,
} from "lucide-react";
import type { ChatMessage, AgentProfile } from "../../types";
import { AGENT_REGISTRY, getAgentProfile } from "../../services/agentRegistry";
import { AgentAvatar } from "../common/AgentAvatar";
import { ttsService } from "../../services/ttsService";

interface MessageBubbleProps {
	message: ChatMessage;
	agentProfile?: AgentProfile;
	onSelectAgent?: (seatId: string) => void;
	onRate?: (messageId: string, rating: "up" | "down" | null, seatId: string) => void;
	onRateMessage?: (messageId: string, rating: "up" | "down" | null, seatId?: string) => void;
}

function renderFormattedContent(text: string) {
	const parts = text.split(/(@\w+)/g);
	return parts.map((part, index) => {
		if (part.startsWith("@")) {
			return (
				<span
					key={index}
					className="inline-flex items-center font-semibold text-teal-300 bg-teal-950/70 border border-teal-700/50 px-1.5 py-0.5 rounded text-[12.5px] mx-0.5 shadow-sm"
				>
					{part}
				</span>
			);
		}
		return part;
	});
}

function resolveTargetDisplayName(seatId?: string): string | null {
	if (!seatId || seatId === "all" || seatId === "council") return null;
	const profile = AGENT_REGISTRY[seatId] || getAgentProfile(seatId);
	if (!profile) return seatId;
	const human = profile.humanName || profile.name;
	return human && human !== seatId ? `${human} (${profile.role || seatId})` : human;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
	message,
	agentProfile,
	onSelectAgent,
	onRate,
	onRateMessage,
}) => {
	const [showInspector, setShowInspector] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isSpeakingThis, setIsSpeakingThis] = useState(false);
	const [rating, setRating] = useState<"up" | "down" | null>(message.userRating || null);

	useEffect(() => {
		setRating(message.userRating || null);
	}, [message.userRating]);

	const handleRate = (newRating: "up" | "down") => {
		const next = rating === newRating ? null : newRating;
		setRating(next);
		onRate?.(message.id, next, message.fromSeat);
		onRateMessage?.(message.id, next, message.fromSeat);
	};

	const isUser = message.fromSeat === "user";

	const profile =
		agentProfile || AGENT_REGISTRY[message.fromSeat] || getAgentProfile(message.fromSeat);

	const st = message.structured;
	const selfConf = st?.confidence_self ?? st?.confidenceSelf ?? message.confidence;
	const expertConf = st?.confidence_expert_agreement ?? st?.confidenceExpertAgreement;
	const rawContent = st?.position || message.content;
	const dissents = st?.dissents_from ?? st?.dissentsFrom ?? [];
	const supports = st?.supports ?? [];
	const evidenceItems = st?.evidence ?? [];

	useEffect(() => {
		const unsub = ttsService.subscribe((isSpeaking, _seatId, msgId) => {
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

	const handleJumpToRepliedMessage = () => {
		if (!message.replyToId || typeof document === "undefined") return;
		const el = document.getElementById(`msg-${message.replyToId}`);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "center" });
		}
	};

	const getTypeBadge = (type: string) => {
		switch (type) {
			case "acknowledgment":
				return { label: "Assignment Accepted", bg: "bg-teal-950/70 text-teal-300 border-teal-700/60", icon: CheckCircle2 };
			case "proposal":
				return { label: "Proposal", bg: "bg-sky-950/70 text-sky-300 border-sky-700/60", icon: Search };
			case "challenge":
				return { label: "Challenge", bg: "bg-rose-950/70 text-rose-300 border-rose-700/60", icon: Flame };
			case "rebuttal":
				return { label: "Rebuttal", bg: "bg-indigo-950/70 text-indigo-300 border-indigo-700/60", icon: ShieldAlert };
			case "refinement":
				return { label: "Refinement", bg: "bg-teal-950/70 text-teal-300 border-teal-700/60", icon: Sparkles };
			case "consensus":
			case "final":
				return { label: "Consensus", bg: "bg-emerald-950/70 text-emerald-300 border-emerald-700/60", icon: Scale };
			case "escalation":
				return { label: "Escalation", bg: "bg-amber-950/70 text-amber-300 border-amber-700/60", icon: AlertCircle };
			case "summary":
				return { label: "Synthesis", bg: "bg-purple-950/70 text-purple-300 border-purple-700/60", icon: Sparkles };
			default:
				return { label: type, bg: "bg-slate-900 text-slate-300 border-slate-700", icon: MessageSquare };
		}
	};

	const badge = getTypeBadge(message.type);
	const BadgeIcon = badge.icon;
	const targetDisplay = resolveTargetDisplayName(message.toSeat);

	const displayName = isUser ? "Operator" : profile.humanName || profile.name;
	const shortRoleTitle = isUser
		? "Human Reviewer"
		: message.fromSeat === "Orchestrator"
			? "Orchestrator / Mission Director"
			: profile.role || message.fromSeat;

	// User Bubble Rendering
	if (isUser) {
		return (
			<div
				id={`msg-${message.id}`}
				data-testid="conversation-message"
				data-from-seat="user"
				className="flex justify-end gap-3 mb-6 animate-fadeIn group"
			>
				<div className="max-w-2xl bg-gradient-to-r from-[#1e1e24] via-[#16161a] to-[#121214] border border-[#2e2e38] rounded-2xl rounded-tr-sm p-4 shadow-xl shadow-black/40 relative hover-lift">
					<div className="flex items-center justify-between gap-4 mb-2 text-xs border-b border-[#2e2e38]/50 pb-2">
						<div className="flex items-center gap-1.5">
							<span className="font-bold text-amber-300 text-sm">{displayName}</span>
							<span className="text-xs text-slate-400 font-medium">· {shortRoleTitle}</span>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleCopy}
								className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#2e2e38]/50 transition-colors"
								title="Copy to clipboard"
							>
								{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
							</button>
							<span className="text-[10px] font-mono text-slate-400">{formatTime(message.timestamp)}</span>
						</div>
					</div>

					<div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-sans">
						{message.content}
					</div>
				</div>

				<AgentAvatar seatId="user" avatarId="operator" size="md" className="ring-2 ring-amber-500/40" />
			</div>
		);
	}

	// Multi-Agent Group Chat Bubble Rendering
	return (
		<div
			id={`msg-${message.id}`}
			data-testid="conversation-message"
			data-from-seat={message.fromSeat}
			data-message-type={message.type}
			className="flex gap-3 mb-6 animate-fadeIn group"
		>
			{/* Character Avatar with interactive inspect */}
			<button
				type="button"
				onClick={() => onSelectAgent?.(message.fromSeat)}
				className="shrink-0 transition-transform hover:scale-110 active:scale-95 focus:outline-none"
				title={`Inspect ${displayName} · ${shortRoleTitle}`}
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
				<div className="flex items-center flex-wrap gap-2 mb-1.5">
					<button
						type="button"
						onClick={() => onSelectAgent?.(message.fromSeat)}
						className="font-bold text-sm hover:underline transition-colors flex items-center gap-1.5"
						style={{ color: profile.accentColor }}
					>
						<span>{displayName}</span>
					</button>

					<span className="text-xs text-slate-400 font-medium">· {shortRoleTitle}</span>

					{message.type !== "orchestrator" && (
						<span
							className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-md border font-semibold ${badge.bg}`}
						>
							<BadgeIcon className="w-2.5 h-2.5" />
							<span>{badge.label}</span>
							{typeof message.round === "number" && (
								<span className="opacity-80">· R{message.round}</span>
							)}
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

					{/* Header Actions */}
					<div className="ml-auto flex items-center gap-1.5 text-slate-400">
						<button
							type="button"
							onClick={() => setShowInspector(!showInspector)}
							className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-mono transition-all ${
								showInspector
									? "bg-teal-950/80 text-teal-300 border-teal-700/60"
									: "text-slate-400 hover:text-slate-200 bg-[#14141a] hover:bg-[#1e1e26] border-[#2a2a36]"
							}`}
							title="Toggle Details & Execution Inspector"
							aria-label="Toggle Details & Execution Inspector"
						>
							<Sliders className="w-3 h-3 text-teal-400" />
							<span className="hidden sm:inline">Details</span>
							{showInspector ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
						</button>

						<div className="flex items-center gap-0.5 border-r border-[#26262e] pr-1.5 mr-0.5">
							<button
								type="button"
								onClick={() => handleRate("up")}
								className={`p-1 rounded-lg transition-all ${
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
								className={`p-1 rounded-lg transition-all ${
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
							className="p-1 rounded-lg hover:text-amber-400 hover:bg-[#1a1a20] transition-colors"
							title={isSpeakingThis ? "Stop speaking" : `Listen to ${displayName}'s voice`}
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
							className="p-1 rounded-lg hover:text-white hover:bg-[#1a1a20] transition-colors"
							title="Copy position to clipboard"
						>
							{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
						</button>

						<span className="text-[10px] font-mono text-slate-400">
							{formatTime(message.timestamp)}
						</span>
					</div>
				</div>

				{/* Group Message Card Body */}
				<div
					className={`bg-[#16161a] border border-[#26262e] hover:border-[#383844] rounded-2xl rounded-tl-sm p-4 shadow-xl transition-all relative overflow-hidden ${
						isSpeakingThis ? "ring-1 ring-amber-500/60 shadow-amber-950/20" : ""
					}`}
					style={{
						borderLeftWidth: "4px",
						borderLeftColor: profile.accentColor,
					}}
				>
					<div
						className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[64px] pointer-events-none opacity-10"
						style={{ backgroundColor: profile.accentColor }}
					/>

					{/* Connected Reply / Challenge Context Banner */}
					{(targetDisplay || message.replyToExcerpt) && (
						<div
							data-testid="message-reply-link"
							onClick={handleJumpToRepliedMessage}
							className={`mb-3 px-3 py-2 rounded-xl bg-[#0e0e14] border-l-3 text-xs text-slate-300 flex flex-col gap-1 ${
								message.type === "challenge"
									? "border-rose-500/80 bg-rose-950/10"
									: "border-teal-500/80 bg-teal-950/10"
							} ${message.replyToId ? "cursor-pointer hover:bg-[#131622]/50 transition-colors" : ""}`}
						>
							<div className="flex items-center gap-1.5 font-mono text-[10.5px]">
								<CornerDownRight
									className={`w-3.5 h-3.5 shrink-0 ${
										message.type === "challenge" ? "text-rose-400" : "text-teal-400"
									}`}
								/>
								<span
									className={`font-semibold ${
										message.type === "challenge" ? "text-rose-300" : "text-teal-300"
									}`}
								>
									{message.type === "challenge"
										? `Challenging ${targetDisplay || "prior claim"}`
										: `Responding to ${targetDisplay || "prior turn"}`}
								</span>
							</div>
							{message.replyToExcerpt && (
								<span className="italic text-slate-400 line-clamp-2 pl-5 text-[11.5px]">
									“{message.replyToExcerpt}”
								</span>
							)}
						</div>
					)}

					{/* Main position text with formatted mentions */}
					<div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words font-sans">
						{renderFormattedContent(rawContent)}
					</div>

					{/* Epistemic stance tags */}
					{(supports.length > 0 || dissents.length > 0 || evidenceItems.length > 0) && (
						<div className="mt-3 flex items-center flex-wrap gap-1.5 text-[10.5px] font-mono">
							{supports.map((seat) => (
								<span
									key={`sup-${seat}`}
									className="px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-700/40 text-emerald-300"
								>
									Supports @{AGENT_REGISTRY[seat]?.humanName || seat}
								</span>
							))}
							{dissents.map((seat) => (
								<span
									key={`dis-${seat}`}
									className="px-2 py-0.5 rounded-md bg-rose-950/50 border border-rose-700/40 text-rose-300"
								>
									Dissents from @{AGENT_REGISTRY[seat]?.humanName || seat}
								</span>
							))}
							{evidenceItems.length > 0 && (
								<span className="px-2 py-0.5 rounded-md bg-sky-950/50 border border-sky-700/40 text-sky-300">
									{evidenceItems.length} Evidence {evidenceItems.length === 1 ? "Citation" : "Citations"}
								</span>
							)}
						</div>
					)}

					{/* Confidence bar row */}
					{selfConf != null && (
						<div className="mt-3 pt-2.5 border-t border-[#26262e] flex items-center gap-3 text-xs flex-wrap">
							<span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
								<Sparkles className="w-3 h-3 text-amber-400" />
								<span>Self-Confidence:</span>
							</span>
							<div className="flex-1 h-2 bg-[#22222a] rounded-full overflow-hidden max-w-xs min-w-[90px]">
								<div
									className="h-full rounded-full transition-all duration-700"
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
								<span className="text-[10.5px] font-mono text-slate-400 bg-[#1e1e26] px-2 py-0.5 rounded-md border border-[#2e2e3a]">
									Expert Agreement: <b className="text-slate-200">{(expertConf * 100).toFixed(0)}%</b>
								</span>
							)}

							<button
								type="button"
								onClick={() => onSelectAgent?.(message.fromSeat)}
								className="text-[10.5px] font-mono text-teal-400/90 hover:text-teal-300 transition-colors flex items-center gap-1 ml-auto hover:underline"
								title={`View ${displayName}'s verified reasoning records, citations, and caveats in Profile`}
							>
								<span>View Reasoning Records</span>
								<CornerDownRight className="w-3 h-3 text-teal-400" />
							</button>
						</div>
					)}

					{/* Expandable Details / Execution Inspector Panel */}
					{showInspector && (
						<div className="mt-3 p-3 rounded-xl bg-[#0c0e14] border border-[#242b3d] text-xs font-mono text-slate-300 space-y-2.5 animate-fadeIn glass-card">
							<div className="flex items-center justify-between border-b border-[#1b2234] pb-2">
								<div className="flex items-center gap-1.5 text-teal-300 font-bold text-[11px] uppercase tracking-wider">
									<Sliders className="w-3.5 h-3.5 text-teal-400" />
									<span>Execution & Deliberation Inspector</span>
								</div>
								<span className="text-[10px] text-slate-400 bg-[#151926] px-2 py-0.5 rounded border border-[#242b3d]">
									Envelope v{message.envelope?.schemaVersion || "1.0"}
								</span>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
								<div className="flex items-center gap-1.5">
									<span className="text-slate-400">Message Type:</span>
									<span className={`inline-flex items-center gap-1 text-[9.5px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${badge.bg}`}>
										<BadgeIcon className="w-2.5 h-2.5" />
										<span>{badge.label}</span>
									</span>
								</div>

								{message.round != null && (
									<div className="flex items-center gap-1.5">
										<span className="text-slate-400">Round:</span>
										<span className="text-slate-200 bg-[#16161f] px-2 py-0.5 rounded border border-[#252532]">
											Round {message.round}
										</span>
									</div>
								)}

								{(message.toSeat || message.envelope?.message?.replyTo) && (
									<div className="flex items-center gap-1.5">
										<span className="text-slate-400">Reply Target:</span>
										<span className="text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/40">
											@{message.envelope?.message?.replyTo || message.toSeat}
										</span>
									</div>
								)}

								{message.latency_ms != null && (
									<div className="flex items-center gap-1.5">
										<span className="text-slate-400">Response Latency:</span>
										<span className="text-amber-300">{message.latency_ms} ms</span>
									</div>
								)}

								<div className="flex items-center gap-1.5 truncate col-span-1 sm:col-span-2">
									<span className="text-slate-400 shrink-0">Execution Task ID:</span>
									<span className="text-slate-300 truncate font-mono text-[10px] bg-[#141824] px-1.5 py-0.5 rounded border border-[#22293d]">
										{message.envelope?.execution?.taskId || message.id}
									</span>
								</div>

								{profile.jobTask && (
									<div className="col-span-1 sm:col-span-2 pt-1 border-t border-[#1b2234]">
										<span className="text-slate-400 block mb-0.5 text-[10px] uppercase font-bold text-amber-300/80">
											Domain Task Assignment:
										</span>
										<span className="text-slate-200 text-[11px] leading-normal font-sans">
											{profile.jobTask}
										</span>
									</div>
								)}

								{message.envelope?.result?.evidenceIds && message.envelope.result.evidenceIds.length > 0 && (
									<div className="col-span-1 sm:col-span-2 pt-1">
										<span className="text-slate-400 block mb-1 text-[10px] uppercase font-bold text-emerald-400/80">
											Referenced Evidence IDs:
										</span>
										<div className="flex flex-wrap gap-1">
											{message.envelope.result.evidenceIds.map((eid, idx) => (
												<span key={idx} className="bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 px-2 py-0.5 rounded text-[10px]">
													{eid}
												</span>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
