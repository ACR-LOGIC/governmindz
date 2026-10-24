import React, { useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { FinalAnswerCard } from "./FinalAnswerCard";
import type { ChatMessage, AgentProfile, ScenarioItem } from "../../types";
import { AGENT_REGISTRY } from "../../services/agentRegistry";
import { ArrowDown, Bot, ShieldCheck, Sparkles, AlertCircle, Database, Play, ArrowRight, Layers } from "lucide-react";

interface GroupConversationProps {
	messages: ChatMessage[];
	agentRoster?: AgentProfile[];
	activeAgentThinking: string | null;
	inquiryScore?: number;
	finalConfidence?: number;
	consensusMethod?: string;
	rounds?: number;
	auditVerified?: boolean;
	onSelectAgent: (seatId: string) => void;
	onStartPrompt: (prompt: string) => void;
	onRateMessage?: (messageId: string, rating: "up" | "down" | null) => void;
	activeScenario?: ScenarioItem | null;
	allScenarios?: ScenarioItem[];
	onSelectScenario?: (file: string) => void;
}

export const GroupConversation: React.FC<GroupConversationProps> = ({
	messages,
	agentRoster,
	activeAgentThinking,
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
}) => {
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [showScrollBottom, setShowScrollBottom] = useState(false);
	const [filterMode, setFilterMode] = useState<"all" | "consensus">("all");

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages, activeAgentThinking]);

	const handleScroll = () => {
		if (!containerRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
		const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
		setShowScrollBottom(!isNearBottom);
	};

	// Determine final consensus message
	const finalMessage = messages.find(
		(m) =>
			m.type === "final" ||
			(m.type === "consensus" && m.fromSeat === "Synthesizer" && (m.round || 0) >= 1),
	);

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

	return (
		<div
			id="tour-chat"
			ref={containerRef}
			onScroll={handleScroll}
			className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 relative"
		>
			<div className="max-w-4xl mx-auto space-y-6">
				{/* Top Status Bar: Inquiry Assessment & Mode banner if score exists */}
				{inquiryScore != null && (
					<div className="p-3.5 rounded-xl bg-[#12182b] border border-[#1e2842] flex items-center justify-between text-xs animate-fadeIn">
						<div className="flex items-center gap-2">
							<span className="text-slate-400 font-mono">Assessed Inquiry Score:</span>
							<span className="font-mono font-bold text-amber-300">{inquiryScore} / 10</span>
						</div>
						<div className="text-[11px] text-slate-400">
							{inquiryScore >= 7
								? "High Complexity (Requires Deep Research + Challenger Intervention)"
								: inquiryScore >= 4
									? "Moderate Complexity (Multi-Seat Deliberation)"
									: "Standard Inquiry"}
						</div>
					</div>
				)}

				{/* Empty State: Active Template Showcase & Quick Launch */}
				{messages.length === 0 && (
					<div className="my-8 text-center max-w-2xl mx-auto space-y-6 animate-fadeIn">
						<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 via-teal-500/20 to-sky-500/20 border border-[#2c385c] shadow-xl shadow-black/40">
							<ShieldCheck className="w-8 h-8 text-[#f4b942]" />
						</div>

						<div className="space-y-2">
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
							<div className="p-5 rounded-2xl bg-gradient-to-b from-[#18203a] via-[#12182b] to-[#0c101e] border-2 border-amber-500/40 shadow-2xl text-left space-y-3 relative overflow-hidden">
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
							<div className="space-y-3 pt-2 text-left">
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

				{/* Stream Mode Toggle Bar */}
				{messages.length > 0 && (
					<div className="flex items-center justify-between pb-3 border-b border-[#22222a] text-xs">
						<div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
							Deliberation Stream Filter:
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

				{/* Messages Stream */}
				{visibleMessages.map((m) => {
					const agentProfile = agentRoster?.find((a) => a.id === m.fromSeat);
					// If this is the final consensus message, we render the highlighted FinalAnswerCard!
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
									finalConfidence={finalConfidence}
									consensusMethod={consensusMethod}
									rounds={rounds}
									auditVerified={auditVerified}
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

				{/* Active Agent Thinking Indicator */}
				{activeAgentThinking && (
					<div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#12182b]/80 border border-[#1e2842] max-w-md animate-pulse shadow-lg">
						<div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
							<Bot className="w-4 h-4 animate-spin" />
						</div>
						<div className="text-xs text-slate-300">
							<span className="font-bold text-amber-300">
								{AGENT_REGISTRY[activeAgentThinking]?.name || activeAgentThinking}
							</span>{" "}
							is evaluating evidence and formulating arguments…
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Floating Scroll to Bottom button */}
			{showScrollBottom && (
				<button
					type="button"
					onClick={scrollToBottom}
					className="fixed bottom-24 right-8 p-3 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xl transition-all hover:scale-105 active:scale-95 z-20"
					title="Scroll to latest deliberation message"
				>
					<ArrowDown className="w-4 h-4" />
				</button>
			)}
		</div>
	);
};
