import React, { useEffect, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { FinalAnswerCard } from "./FinalAnswerCard";
import { ParallelCrewStack } from "./ParallelCrewStack";
import type { ChatMessage, AgentProfile, ScenarioItem, Conversation } from "../../types";
import type { CrewRound } from "../../types/crew";
import { AGENT_REGISTRY, getAgentProfile } from "../../services/agentRegistry";
import { AgentAvatar } from "../common/AgentAvatar";
import {
	ArrowDown,
	ShieldCheck,
	Sparkles,
	Database,
	Play,
	Pause,
	RotateCcw,
	ArrowRight,
	Layers,
	Volume2,
	VolumeX,
	Flame,
	Search,
	Scale,
	MessageSquare,
} from "lucide-react";
import { ttsService } from "../../services/ttsService";
import type { DemoQueueState } from "../../services/demoPresentationQueue";
import { useConversationAutoScroll } from "../../services/autoScrollController";
import { resolveActivityPhase, type ActiveAgentActivity } from "../../services/conversationSync";

interface GroupConversationProps {
	conversation?: Conversation | null;
	messages: ChatMessage[];
	agentRoster?: AgentProfile[];
	activeAgentThinking: string | null;
	activeAgentActivity?: ActiveAgentActivity | null;
	inquiryScore?: number;
	finalConfidence?: number;
	consensusMethod?: string;
	rounds?: number;
	auditVerified?: boolean;
	onSelectAgent: (seatId: string) => void;
	onStartPrompt: (prompt: string) => void;
	onRate?: (messageId: string, rating: "up" | "down" | null, seatId: string) => void;
	onRateMessage?: (messageId: string, rating: "up" | "down" | null, seatId?: string) => void;
	activeScenario?: ScenarioItem | null;
	allScenarios?: ScenarioItem[];
	onSelectScenario?: (file: string) => void;
	mode?: "live" | "demo" | "sample";
	activeCrewRound?: CrewRound | null;
	isCrewClosing?: boolean;
	holdingMessage?: string | null;
	demoQueueState?: DemoQueueState;
	onPauseDemo?: () => void;
	onResumeDemo?: () => void;
	onResetDemo?: () => void;
	onExploreZetaris?: () => void;
}

const PHASE_LABELS: Record<
	ActiveAgentActivity["phase"],
	{ label: string; colorClass: string; defaultDescription: string }
> = {
	researching: {
		label: "Researching Evidence",
		colorClass: "bg-sky-950/80 text-sky-300 border-sky-500/40",
		defaultDescription: "Querying governed catalogs, tables, and external reference sources…",
	},
	analyzing: {
		label: "Analyzing & Formulating",
		colorClass: "bg-amber-950/80 text-amber-300 border-amber-500/40",
		defaultDescription: "Evaluating evidence constraints and formulating initial position…",
	},
	responding: {
		label: "Responding to Council",
		colorClass: "bg-indigo-950/80 text-indigo-300 border-indigo-500/40",
		defaultDescription: "Addressing peer challenges and refining calibrated confidence…",
	},
	challenging: {
		label: "Adversarial Challenge",
		colorClass: "bg-rose-950/80 text-rose-300 border-rose-500/40",
		defaultDescription: "Stress-testing claims for unsupported certainty or missing receipts…",
	},
	synthesizing: {
		label: "Synthesizing Consensus",
		colorClass: "bg-emerald-950/80 text-emerald-300 border-emerald-500/40",
		defaultDescription: "Reconciling team positions, dissent, and verified evidence into final decision…",
	},
};

export const GroupConversation: React.FC<GroupConversationProps> = ({
	conversation,
	messages,
	agentRoster,
	activeAgentThinking,
	activeAgentActivity = null,
	inquiryScore,
	finalConfidence,
	consensusMethod,
	rounds,
	auditVerified,
	onSelectAgent,
	onStartPrompt,
	onRateMessage,
	activeScenario,
	allScenarios = [],
	onSelectScenario,
	mode = "sample",
	activeCrewRound = null,
	isCrewClosing = false,
	holdingMessage = null,
	demoQueueState = "idle",
	onPauseDemo,
	onResumeDemo,
	onResetDemo,
	onExploreZetaris,
}) => {
	const [filterMode, setFilterMode] = useState<"all" | "consensus">("all");
	const [isAudioPlaying, setIsAudioPlaying] = useState(false);
	const [audioProgress, setAudioProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
	const [isMainMuted, setIsMainMuted] = useState(() => ttsService.isGroupMuted("main"));

	const resolvedActivity: ActiveAgentActivity | null =
		activeAgentActivity ||
		(activeAgentThinking
			? {
					seatId: activeAgentThinking,
					phase: resolveActivityPhase(activeAgentThinking),
					startedAt: Date.now(),
				}
			: null);

	const activityKey = [
		resolvedActivity?.seatId || "",
		resolvedActivity?.phase || "",
		resolvedActivity?.detail || "",
		holdingMessage || "",
		conversation?.status || "",
		activeCrewRound?.roundId || "",
	].join("|");

	const {
		containerRef,
		contentRef,
		bottomAnchorRef,
		scrollState,
		handleContainerScroll,
		jumpToLatest,
	} = useConversationAutoScroll({
		conversationId: conversation?.id || "default",
		messages,
		activityKey,
	});

	useEffect(() => {
		const unsub = ttsService.subscribeSequential((isPlaying, current, total) => {
			setIsAudioPlaying(isPlaying);
			setAudioProgress({ current: current + 1, total });
		});
		return unsub;
	}, []);

	useEffect(() => {
		const unsubMute = ttsService.subscribeGroupMute((groupId, muted) => {
			if (groupId === "main") {
				setIsMainMuted(muted);
			}
		});
		return unsubMute;
	}, []);

	// Determine final consensus / supervisor presentation message
	const finalMessage =
		conversation?.status === "completed"
			? [...messages]
					.reverse()
					.find(
						(m) =>
							m.type === "final" ||
							(m.type === "summary" && m.fromSeat === "Supervisor") ||
							(m.type === "consensus" && m.fromSeat === "Synthesizer") ||
							(m.fromSeat === "Synthesizer" && (m.structured as any)?.verdict) ||
							(m.fromSeat === "Orchestrator" && (m.round || 0) >= 1 && m.type !== "orchestrator"),
					)
			: undefined;

	// Get other scenarios for the quick switch cards
	const otherScenarios = allScenarios.filter(
		(s) => s.file !== activeScenario?.file,
	);

	// Clean group chat filter: all deliberation vs consensus & conclusions only
	const visibleMessages =
		filterMode === "consensus"
			? messages.filter(
					(m) =>
						m.type === "user" ||
						m.type === "orchestrator" ||
						m.type === "final" ||
						m.type === "consensus" ||
						m.type === "summary",
				)
			: messages;

	const activeProfile = resolvedActivity
		? agentRoster?.find((a) => a.id === resolvedActivity.seatId) ||
			(conversation?.agentAssignments?.[resolvedActivity.seatId]
				? getAgentProfile(
						resolvedActivity.seatId,
						conversation.agentAssignments[resolvedActivity.seatId],
					)
				: AGENT_REGISTRY[resolvedActivity.seatId] || getAgentProfile(resolvedActivity.seatId))
		: null;

	const phaseInfo = resolvedActivity ? PHASE_LABELS[resolvedActivity.phase] : null;

	return (
		<div
			id="tour-chat"
			ref={containerRef}
			onScroll={handleContainerScroll}
			className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5 relative"
		>
			<div ref={contentRef} className="max-w-4xl mx-auto space-y-5">
				{/* Top Status Bar: Council Complexity banner if score exists */}
				{inquiryScore != null && (
					<div className="p-3 rounded-xl bg-[#12182b] border border-[#1e2842] flex items-center justify-between text-xs animate-fadeIn flex-wrap gap-2">
						<div className="flex items-center gap-2">
							<span className="text-slate-400 font-medium">Council Complexity:</span>
							<span className="font-mono font-bold text-amber-300">
								{inquiryScore <= 1 ? `${(inquiryScore * 100).toFixed(0)}%` : `Level ${inquiryScore}/10`}
							</span>
						</div>
						<div className="text-[11px] text-slate-400">
							{(inquiryScore <= 1 ? inquiryScore >= 0.7 : inquiryScore >= 7)
								? "High Complexity · Full Cross-Functional Council & Challenger Review"
								: (inquiryScore <= 1 ? inquiryScore >= 0.4 : inquiryScore >= 4)
									? "Moderate Complexity · Multi-Seat Deliberation"
									: "Standard Inquiry · Core Review"}
						</div>
					</div>
				)}

				{/* Deliverable Contract & Authoritative Output Banner */}
				{conversation?.contract && (
					<div className="p-3 rounded-xl bg-gradient-to-r from-[#172038] via-[#121a2e] to-[#172038] border border-[#2b3a62] flex items-center justify-between text-xs animate-fadeIn flex-wrap gap-2">
						<div className="flex items-center gap-2.5">
							<span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
							<div>
								<span className="font-bold text-slate-200">Deliverable Contract: </span>
								<span className="font-mono font-bold text-amber-400 uppercase">
									{conversation.contract.primaryOutputType}
								</span>
								<span className="text-slate-400 ml-1.5 font-mono text-[11px]">
									({conversation.contract.fileFormat.toUpperCase()})
								</span>
							</div>
						</div>

						<div className="flex items-center gap-2">
							{conversation.supervisorDecision === "APPROVED" && conversation.primaryArtifact ? (
								<div className="flex items-center gap-2">
									<span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10.5px] font-mono font-semibold flex items-center gap-1">
										<ShieldCheck className="w-3.5 h-3.5" />
										Validated &amp; Approved
									</span>
									<a
										href={conversation.primaryArtifact.downloadUrl}
										download
										className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] transition-colors"
									>
										Get {conversation.contract.primaryOutputType}
									</a>
								</div>
							) : (
								<span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10.5px] font-mono">
									Parallel Generation in Progress
								</span>
							)}
						</div>
					</div>
				)}

				{/* Empty State: Live Mode */}
				{messages.length === 0 && mode === "live" && (
					<div className="my-12 text-center max-w-2xl mx-auto space-y-4 animate-fadeIn">
						<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 via-sky-500/20 to-indigo-500/20 border border-teal-500/30 shadow-xl shadow-black/40">
							<Sparkles className="w-8 h-8 text-teal-400" />
						</div>

						<div className="space-y-2">
							<h2 className="font-display font-bold text-3xl text-slate-100 tracking-tight">
								What do you want to know?
							</h2>
							<p className="text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
								Ask any live federated data compliance question, query Zetaris catalog,
								or engage the multi-agent council in real-time deliberation.
							</p>
						</div>
					</div>
				)}

				{/* Empty State: Demo Mode Active Template Showcase & Quick Launch */}
				{messages.length === 0 && mode !== "live" && (
					<div className="my-6 text-center max-w-2xl mx-auto space-y-5 animate-fadeIn">
						<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 via-teal-500/20 to-sky-500/20 border border-[#2c385c] shadow-xl shadow-black/40">
							<ShieldCheck className="w-7 h-7 text-[#f4b942]" />
						</div>

						<div className="space-y-1.5">
							<h2 className="font-display font-bold text-2xl text-slate-100">
								GovernMindz Deliberative Mission Control
							</h2>
							<p className="text-sm text-slate-400 leading-relaxed">
								Watch specialized, role-separated AI agents investigate compliance questions,
								query Zetaris federated databases, exchange verified claims, and forge cryptographic
								audit trails.
							</p>
						</div>

						{/* Active Template Hero Card */}
						{activeScenario && (
							<div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#18203a] via-[#12182b] to-[#0c101e] border-2 border-amber-500/40 shadow-2xl text-left space-y-3 relative overflow-hidden">
								<div className="flex items-center justify-between border-b border-[#2c385c] pb-3">
									<div className="flex items-center gap-2">
										<Database className="w-4 h-4 text-amber-400" />
										<span className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
											Active Governance Template: {activeScenario.id || activeScenario.file.replace(".json", "")}
										</span>
									</div>
									<span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950/60 border border-teal-800 text-teal-300">
										{activeScenario.rows || 3} Federated Rows
									</span>
								</div>

								<div>
									<div className="text-[10px] uppercase font-mono text-slate-400 mb-1">
										Compliance Inquiry Question:
									</div>
									<p className="text-sm font-semibold text-slate-100 leading-relaxed">
										“{activeScenario.topic}”
									</p>
								</div>

								<div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
									<div className="text-xs text-slate-400">
										Ready to run multi-agent deliberation over cached Zetaris federated catalog.
									</div>
									<button
										type="button"
										onClick={() => onStartPrompt(activeScenario.topic)}
										className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-950/50 transition-all active:scale-[0.98] shrink-0"
									>
										<Play className="w-3.5 h-3.5 fill-current" />
										<span>Run Deliberation on this Template</span>
									</button>
								</div>
							</div>
						)}

						{/* Alternative Governance Templates Quick Switch */}
						{otherScenarios.length > 0 && (
							<div className="space-y-3 pt-1 text-left">
								<div className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
									<Layers className="w-3.5 h-3.5 text-teal-400" />
									<span>Or switch to another Governance Benchmark:</span>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{otherScenarios.map((sc) => (
										<button
											key={sc.file}
											type="button"
											onClick={() => {
												onSelectScenario?.(sc.file);
											}}
											className="p-3.5 rounded-xl bg-[#12182b] hover:bg-[#18203a] border border-[#1e2842] hover:border-[#2c385c] transition-all text-left group flex flex-col justify-between"
										>
											<div>
												<div className="flex items-center justify-between text-xs font-bold text-teal-300 mb-1 group-hover:text-teal-200">
													<span>{sc.id || sc.file.replace(".json", "")}</span>
													<span className="text-[10px] font-mono text-slate-400">{sc.rows || 3} rows</span>
												</div>
												<div className="text-xs text-slate-400 group-hover:text-slate-200 line-clamp-2">
													{sc.topic}
												</div>
											</div>
											<div className="mt-2 text-[11px] font-semibold text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
												<span>Select Template</span>
												<ArrowRight className="w-3 h-3" />
											</div>
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Stream Mode & Sequential Audio Player Bar */}
				{messages.length > 0 && (
					<div className="flex items-center justify-between pb-3 border-b border-[#22222a] text-xs flex-wrap gap-2">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
								Council Stream:
							</span>
							<button
								type="button"
								onClick={() => ttsService.toggleGroupMute("main")}
								aria-label={isMainMuted ? "Unmute Main audio" : "Mute Main audio"}
								title={isMainMuted ? "Unmute Main audio" : "Mute Main audio"}
								className={`p-1.5 rounded-lg transition-all border focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none ${
									isMainMuted
										? "bg-[#16161c] hover:bg-[#202028] text-slate-500 hover:text-slate-300 border-[#262630]"
										: "bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/30"
								}`}
							>
								{isMainMuted ? (
									<VolumeX className="w-3.5 h-3.5 text-slate-400" />
								) : (
									<Volume2 className="w-3.5 h-3.5 text-amber-400" />
								)}
							</button>

							<button
								type="button"
								onClick={() => {
									if (isAudioPlaying) {
										ttsService.stop();
									} else {
										ttsService.playSequential(visibleMessages, "main");
									}
								}}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
									isAudioPlaying
										? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-950/40"
										: "text-slate-300 hover:text-amber-300 bg-[#16161c] hover:bg-[#202028] border-[#262630]"
								}`}
								title={isAudioPlaying ? "Stop sequential audio playback" : "Listen to all agents speaking their arguments in order"}
							>
								{isAudioPlaying ? (
									<>
										<VolumeX className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
										<span>Stop Deliberation Audio ({audioProgress.current}/{audioProgress.total})</span>
									</>
								) : (
									<>
										<Volume2 className="w-3.5 h-3.5 text-amber-400" />
										<span>Listen to Deliberation</span>
									</>
								)}
							</button>

							{/* Demo Presentation Pacing Controls */}
							{mode !== "live" && (demoQueueState === "playing" || demoQueueState === "paused") && (
								<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#12182b] border border-[#232f50] text-xs">
									<span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
										Demo:
									</span>
									{demoQueueState === "playing" ? (
										<button
											type="button"
											onClick={onPauseDemo}
											className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1a233c] hover:bg-[#222e4f] text-amber-300 font-medium text-[11px] transition-colors"
											title="Pause demo presentation"
										>
											<Pause className="w-3 h-3" />
											<span>Pause</span>
										</button>
									) : (
										<button
											type="button"
											onClick={onResumeDemo}
											className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors"
											title="Resume demo presentation"
										>
											<Play className="w-3 h-3 fill-current" />
											<span>Resume</span>
										</button>
									)}
									<button
										type="button"
										onClick={onResetDemo}
										className="p-1 rounded-md text-slate-400 hover:text-rose-300 hover:bg-[#1a233c] transition-colors"
										title="Reset demo presentation"
									>
										<RotateCcw className="w-3 h-3" />
									</button>
								</div>
							)}
						</div>

						<div className="flex items-center gap-1 bg-[#16161c] p-1 rounded-xl border border-[#262630]">
							<button
								type="button"
								onClick={() => setFilterMode("all")}
								className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
									filterMode === "all"
										? "bg-[#262632] text-amber-300 shadow-sm"
										: "text-slate-400 hover:text-slate-200"
								}`}
							>
								All Deliberation ({messages.length})
							</button>
							<button
								type="button"
								onClick={() => setFilterMode("consensus")}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
									filterMode === "consensus"
										? "bg-[#262632] text-teal-300 shadow-sm"
										: "text-slate-400 hover:text-slate-200"
								}`}
							>
								<ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
								<span>Consensus & Conclusions Only</span>
							</button>
						</div>
					</div>
				)}

				{/* Parallel Crew Research Stack with Barrier Synchronization */}
				{activeCrewRound && (
					<ParallelCrewStack
						round={activeCrewRound}
						isClosing={isCrewClosing}
					/>
				)}

				{/* Messages Stream */}
				{visibleMessages.map((m) => {
					const assignment = conversation?.agentAssignments?.[m.fromSeat];
					const agentProfile =
						agentRoster?.find((a) => a.id === m.fromSeat) ||
						(assignment ? getAgentProfile(m.fromSeat, assignment) : undefined);

					if (m === finalMessage) {
						return (
							<React.Fragment key={m.id}>
								<MessageBubble
									message={m}
									agentProfile={agentProfile}
									onSelectAgent={onSelectAgent}
									onRateMessage={onRateMessage}
								/>
								<FinalAnswerCard
									message={m}
									conversation={conversation}
									finalConfidence={finalConfidence}
									consensusMethod={consensusMethod}
									rounds={rounds}
									auditVerified={auditVerified}
									onExploreZetaris={onExploreZetaris}
								/>
							</React.Fragment>
						);
					}

					return (
						<MessageBubble
							key={m.id}
							message={m}
							agentProfile={agentProfile}
							onSelectAgent={onSelectAgent}
							onRateMessage={onRateMessage}
						/>
					);
				})}

				{/* Non-Blocking Holding Message Indicator (Transient status; never added to transcript or audit logs) */}
				{holdingMessage && (
					<div
						data-testid="holding-status-indicator"
						className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0e1424]/90 border border-teal-500/40 text-xs text-teal-300 max-w-md animate-fadeIn glass-panel shadow-xl shadow-black/40"
					>
						<div className="relative w-2 h-2 shrink-0">
							<span className="w-2 h-2 rounded-full bg-teal-400 animate-ping-dot absolute" />
						</div>
						<span className="font-medium text-slate-200 leading-tight">{holdingMessage}</span>
					</div>
				)}

				{/* Active Agent Activity Indicator (driven by real workflow events) */}
				{resolvedActivity && activeProfile && phaseInfo && (
					<div
						data-testid="active-agent-indicator"
						data-active-seat={resolvedActivity.seatId}
						data-active-phase={resolvedActivity.phase}
						className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#12182b]/90 border border-amber-500/40 max-w-xl glass-panel shadow-xl shadow-amber-950/20 animate-fadeIn"
					>
						<AgentAvatar
							seatId={resolvedActivity.seatId}
							avatarId={activeProfile.avatarId}
							humanName={activeProfile.humanName}
							size="sm"
							status={
								resolvedActivity.phase === "challenging"
									? "challenging"
									: resolvedActivity.phase === "synthesizing"
										? "synthesizing"
										: resolvedActivity.phase === "researching"
											? "researching"
											: "analyzing"
							}
							showStatusPip={true}
						/>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex items-center gap-2 flex-wrap">
								<span className="font-bold text-xs text-amber-300">
									{activeProfile.humanName || activeProfile.name}
								</span>
								<span className="text-[11px] text-slate-400">
									· {activeProfile.role || resolvedActivity.seatId}
								</span>
								<span
									className={`inline-flex items-center gap-1 text-[9.5px] font-mono font-bold uppercase px-2 py-0.5 rounded-md border ${phaseInfo.colorClass}`}
								>
									{resolvedActivity.phase === "challenging" && <Flame className="w-2.5 h-2.5" />}
									{resolvedActivity.phase === "researching" && <Search className="w-2.5 h-2.5" />}
									{resolvedActivity.phase === "synthesizing" && <Scale className="w-2.5 h-2.5" />}
									{(resolvedActivity.phase === "analyzing" || resolvedActivity.phase === "responding") && (
										<MessageSquare className="w-2.5 h-2.5" />
									)}
									<span>{phaseInfo.label}</span>
									{typeof resolvedActivity.round === "number" && (
										<span>· R{resolvedActivity.round}</span>
									)}
								</span>
							</div>
							<div className="text-xs text-slate-300 truncate">
								{resolvedActivity.detail || phaseInfo.defaultDescription}
							</div>
						</div>
					</div>
				)}

				<div ref={bottomAnchorRef} />
			</div>

			{/* Compact "New Activity / Jump to Latest" Control when user scrolls up */}
			{!scrollState.isFollowing && (
				<button
					type="button"
					data-testid="jump-to-latest"
					onClick={jumpToLatest}
					className="fixed bottom-20 right-8 flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-2xl shadow-black/60 transition-all hover:scale-105 active:scale-95 z-30 border border-amber-300/60"
					title="Jump to latest deliberation activity"
				>
					<ArrowDown className="w-3.5 h-3.5" />
					<span>
						{scrollState.unreadCount > 0
							? `New Activity (${scrollState.unreadCount}) · Jump to Latest`
							: scrollState.hasNewActivity
								? "New Activity · Jump to Latest"
								: "Jump to Latest"}
					</span>
				</button>
			)}
		</div>
	);
};
