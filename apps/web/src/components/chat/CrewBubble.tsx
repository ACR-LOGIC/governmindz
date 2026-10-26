import React, { useEffect, useRef, useState } from "react";
import type { ActiveCrew } from "../../types/crew";
import { Database, Globe, CheckCircle2, AlertTriangle, Loader2, ArrowDown, ShieldCheck, XCircle, Clock } from "lucide-react";

interface CrewBubbleProps {
	crew: ActiveCrew;
	className?: string;
}

export const CrewBubble: React.FC<CrewBubbleProps> = ({ crew, className = "" }) => {
	const messageListRef = useRef<HTMLDivElement>(null);
	const [userScrolledUp, setUserScrolledUp] = useState(false);

	const isData = crew.type === "data";
	const isWeb = crew.type === "web";
	const isFailed = crew.status === "failed";
	const isTimedOut = crew.status === "timed_out";
	const isTerminalFailure = isFailed || isTimedOut;

	// Auto-scroll on new message unless user has scrolled up
	useEffect(() => {
		if (!userScrolledUp && messageListRef.current) {
			messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
		}
	}, [crew.messages.length, userScrolledUp]);

	const handleScroll = () => {
		if (!messageListRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = messageListRef.current;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
		setUserScrolledUp(!isAtBottom);
	};

	const scrollToBottom = () => {
		if (messageListRef.current) {
			messageListRef.current.scrollTo({
				top: messageListRef.current.scrollHeight,
				behavior: "smooth",
			});
			setUserScrolledUp(false);
		}
	};

	return (
		<div
			className={`flex flex-col rounded-2xl border bg-[#141824] shadow-xl overflow-hidden transition-all duration-200 ${
				crew.status === "ready"
					? "border-emerald-500/50 shadow-emerald-950/20"
					: crew.status === "wrapping_up"
						? "border-amber-500/50 shadow-amber-950/20"
						: isFailed
							? "border-rose-500/50 shadow-rose-950/20"
							: isTimedOut
								? "border-orange-500/50 shadow-orange-950/20"
								: "border-[#2b354f] shadow-black/40"
			} ${className}`}
		>
			{/* Crew Header */}
			<div className="px-4 py-3 bg-[#182035] border-b border-[#242e47] flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					<div
						className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
							isData
								? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
								: isWeb
									? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
									: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
						}`}
					>
						{isData ? <Database className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
					</div>
					<div className="min-w-0">
						<div className="text-xs font-bold text-slate-100 truncate">{crew.label}</div>
						<div className="text-[10px] font-mono text-slate-400">
							{crew.messages.length} log {crew.messages.length === 1 ? "entry" : "entries"}
						</div>
					</div>
				</div>

				{/* Crew Status Badge */}
				<div className="shrink-0">
					{crew.status === "ready" && (
						<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium font-mono animate-fadeIn">
							<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
							<span>Ready</span>
						</span>
					)}
					{crew.status === "wrapping_up" && (
						<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-medium font-mono animate-pulse">
							<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
							<span>Wrapping Up</span>
						</span>
					)}
					{crew.status === "talking" && (
						<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[11px] font-medium font-mono">
							<Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
							<span>Active Research</span>
						</span>
					)}
					{isFailed && (
						<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-medium font-mono">
							<XCircle className="w-3.5 h-3.5 text-rose-400" />
							<span>Failed</span>
						</span>
					)}
					{isTimedOut && (
						<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[11px] font-medium font-mono">
							<Clock className="w-3.5 h-3.5 text-orange-400" />
							<span>Timed Out</span>
						</span>
					)}
				</div>
			</div>

			{/* Isolated Scrollable Message List */}
			<div
				ref={messageListRef}
				onScroll={handleScroll}
				className="flex-1 p-3.5 space-y-2.5 overflow-y-auto max-h-56 min-h-[140px] text-xs font-sans text-slate-200 relative select-text"
			>
				{crew.messages.length === 0 ? (
					<div className="h-full flex items-center justify-center text-slate-500 italic text-[11px] py-6">
						{isTerminalFailure ? "No evidence was returned by this crew." : "Waiting for crew queries..."}
					</div>
				) : (
					crew.messages.map((msg) => {
						const isCheckpoint = msg.kind === "checkpoint";
						return (
							<div
								key={msg.id}
								className={`p-2.5 rounded-xl transition-all ${
									isCheckpoint
										? "bg-[#1d273f] border border-[#314068] shadow-sm"
										: "bg-[#181d2c] border border-[#222a3d]"
								}`}
							>
								<div className="flex items-center justify-between text-[10px] mb-1 gap-2">
									<span
										className={`font-semibold ${
											isCheckpoint ? "text-amber-300 font-mono" : "text-slate-400"
										}`}
									>
										{msg.author}
									</span>
									<span className="text-slate-500 font-mono">
										{new Date(msg.ts).toLocaleTimeString([], {
											minute: "2-digit",
											second: "2-digit",
										})}
									</span>
								</div>
								<div className="text-[11.5px] leading-relaxed text-slate-200 break-words">
									{msg.text}
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Jump to bottom button when scrolled up */}
			{userScrolledUp && (
				<button
					type="button"
					onClick={scrollToBottom}
					className="absolute bottom-12 right-4 px-2 py-1 rounded-md bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow-lg hover:bg-amber-400 transition-all z-10"
				>
					<ArrowDown className="w-3 h-3" />
					<span>Latest</span>
				</button>
			)}

			{/* Observational Footer: Persistent Summary or Observational Badge */}
			<div className="px-3.5 py-2 bg-[#121622] border-t border-[#1e2538] flex items-center justify-between text-[10px] text-slate-400">
				<div className="truncate pr-2">
					{crew.summary ? (
						<span
							className={`font-mono flex items-center gap-1 truncate ${
								isTerminalFailure ? "text-rose-300" : "text-emerald-400"
							}`}
							title={crew.failureReason || crew.summary}
						>
							{isTerminalFailure ? (
								<AlertTriangle className="w-3 h-3 shrink-0" />
							) : (
								<ShieldCheck className="w-3 h-3 shrink-0" />
							)}
							<span className="truncate">{crew.summary}</span>
						</span>
					) : (
						<span className="italic">
							{isTerminalFailure ? "Evidence excluded from verified record" : "Autonomous observational crew channel"}
						</span>
					)}
				</div>
				<span className="font-mono text-slate-500 uppercase tracking-wider shrink-0">
					{crew.type}
				</span>
			</div>
		</div>
	);
};
