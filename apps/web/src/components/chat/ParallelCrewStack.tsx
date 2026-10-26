import React, { useEffect, useState } from "react";
import type { CrewRound } from "../../types/crew";
import { CrewBubble } from "./CrewBubble";
import { Lock, Unlock, Users2, Sparkles, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { ttsService } from "../../services/ttsService";

interface ParallelCrewStackProps {
	round: CrewRound | null;
	isClosing?: boolean;
	className?: string;
}

export const ParallelCrewStack: React.FC<ParallelCrewStackProps> = ({
	round,
	isClosing = false,
	className = "",
}) => {
	const [isCrewsMuted, setIsCrewsMuted] = useState(() => ttsService.isGroupMuted("crews"));

	useEffect(() => {
		const unsub = ttsService.subscribeGroupMute((groupId, muted) => {
			if (groupId === "crews") {
				setIsCrewsMuted(muted);
			}
		});
		return unsub;
	}, []);

	if (!round || !round.crewIds || round.crewIds.length === 0) {
		return null;
	}

	const crews = round.crewIds.map((id) => round.crews[id]).filter(Boolean);
	const readyCount = crews.filter((c) => c.status === "ready").length;
	const totalCount = crews.length;
	const allReady = readyCount === totalCount && totalCount > 0;

	return (
		<div
			className={`w-full space-y-3 transition-all duration-200 ${
				isClosing
					? "opacity-0 scale-95 duration-200 pointer-events-none"
					: "opacity-100 scale-100 motion-safe:duration-150 motion-safe:animate-scaleIn"
			} motion-reduce:transform-none motion-reduce:transition-opacity ${className}`}
		>
			{/* Barrier Status Header */}
			<div className="p-3 rounded-xl bg-gradient-to-r from-[#141b2c] via-[#101524] to-[#141b2c] border border-[#232f4e] flex items-center justify-between text-xs flex-wrap gap-2 shadow-lg">
				<div className="flex items-center gap-2.5">
					<div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center">
						<Users2 className="w-3.5 h-3.5" />
					</div>
					<div>
						<div className="font-bold text-slate-200 flex items-center gap-2">
							<span>Parallel Research Crews</span>
							{/* Minimal Icon-Only Group Audio Toggle (Crews Group) */}
							<button
								type="button"
								onClick={() => ttsService.toggleGroupMute("crews")}
								aria-label={isCrewsMuted ? "Unmute Research Crews audio" : "Mute Research Crews audio"}
								title={isCrewsMuted ? "Unmute Research Crews audio" : "Mute Research Crews audio"}
								className={`p-1 rounded-lg transition-all border focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
									isCrewsMuted
										? "bg-[#141b2c] hover:bg-[#1a233c] text-slate-500 hover:text-slate-300 border-[#232f4e]"
										: "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 hover:text-indigo-200 border-indigo-500/40 shadow-sm"
								}`}
							>
								{isCrewsMuted ? (
									<VolumeX className="w-3.5 h-3.5 text-slate-400" />
								) : (
									<Volume2 className="w-3.5 h-3.5 text-indigo-400" />
								)}
							</button>
							<span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-800 text-indigo-300">
								Round #{round.roundId.slice(0, 8)}
							</span>
						</div>
						<div className="text-[11px] text-slate-400">
							Independent concurrent evidence collection across database catalog and web citations.
						</div>
					</div>
				</div>

				{/* Barrier Synchronization Status Badge */}
				<div className="flex items-center gap-2">
					{allReady ? (
						<div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono font-semibold animate-pulse">
							<Unlock className="w-3.5 h-3.5 text-emerald-400" />
							<span>Barrier Ready ({readyCount}/{totalCount})</span>
						</div>
					) : (
						<div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono">
							<Lock className="w-3.5 h-3.5 text-amber-400" />
							<span>Barrier Locked ({readyCount}/{totalCount} Ready)</span>
						</div>
					)}
				</div>
			</div>

			{/* Responsive Parallel Bubbles Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{crews.map((crew) => (
					<CrewBubble key={crew.id} crew={crew} />
				))}
			</div>

			{/* Barrier Notification Banner */}
			{allReady && (
				<div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 flex items-center justify-between text-xs text-emerald-300 animate-fadeIn">
					<div className="flex items-center gap-2 font-mono text-[11px]">
						<CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
						<span>All required research crews have reached ready state. Synchronizing findings...</span>
					</div>
					<Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
				</div>
			)}
		</div>
	);
};
