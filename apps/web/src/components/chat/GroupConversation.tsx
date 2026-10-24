import React, { useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { FinalAnswerCard } from "./FinalAnswerCard";
import type { ChatMessage, AgentProfile } from "../../types";
import { AGENT_REGISTRY } from "../../services/agentRegistry";
import { ArrowDown, Bot, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";

interface GroupConversationProps {
	messages: ChatMessage[];
	activeAgentThinking: string | null;
	inquiryScore?: number;
	finalConfidence?: number;
	consensusMethod?: string;
	rounds?: number;
	auditVerified?: boolean;
	onSelectAgent: (seatId: string) => void;
	onStartPrompt: (prompt: string) => void;
}

export const GroupConversation: React.FC<GroupConversationProps> = ({
	messages,
	activeAgentThinking,
	inquiryScore,
	finalConfidence,
	consensusMethod,
	rounds,
	auditVerified,
	onSelectAgent,
	onStartPrompt,
}) => {
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [showScrollBottom, setShowScrollBottom] = useState(false);

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

	return (
		<div
			ref={containerRef}
			onScroll={handleScroll}
			className="flex-1 overflow-y-auto px-4 py-6 relative"
		>
			<div className="max-w-4xl mx-auto space-y-2">
				{/* Inquiry Score Banner if available */}
				{inquiryScore != null && (
					<div className="mb-6 p-3 rounded-xl bg-[#12182b] border border-[#1e2842] flex items-center justify-between text-xs animate-fadeIn">
						<div className="flex items-center gap-2">
							<span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
							<span className="text-slate-400">Inquiry Complexity Assessment:</span>
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

				{/* Empty State Welcome Card */}
				{messages.length === 0 && (
					<div className="my-12 text-center max-w-xl mx-auto space-y-6">
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

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
							<button
								type="button"
								onClick={() =>
									onStartPrompt(
										"Which governance controls should a data team verify before exposing Zetaris federated data to an external agent, and what evidence supports the recommendation?",
									)
								}
								className="p-3 rounded-xl bg-[#12182b] hover:bg-[#18203a] border border-[#1e2842] hover:border-[#2c385c] transition-all group"
							>
								<div className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-1">
									<Sparkles className="w-3.5 h-3.5" />
									<span>Federated Data Access</span>
								</div>
								<div className="text-xs text-slate-400 group-hover:text-slate-200">
									Verify database ownership and least-privilege SQL roles before exposing data.
								</div>
							</button>

							<button
								type="button"
								onClick={() =>
									onStartPrompt(
										"How should read-only query statement limits and confidential classifications be enforced on federated tables?",
									)
								}
								className="p-3 rounded-xl bg-[#12182b] hover:bg-[#18203a] border border-[#1e2842] hover:border-[#2c385c] transition-all group"
							>
								<div className="flex items-center gap-2 text-xs font-bold text-teal-300 mb-1">
									<Bot className="w-3.5 h-3.5" />
									<span>Safety & Policy Gates</span>
								</div>
								<div className="text-xs text-slate-400 group-hover:text-slate-200">
									Review client-side statement guards and HMAC cryptographic audit verification.
								</div>
							</button>
						</div>
					</div>
				)}

				{/* Messages Stream */}
				{messages.map((m) => {
					// If this is the final consensus message, we render the highlighted FinalAnswerCard!
					if (m === finalMessage) {
						return (
							<React.Fragment key={m.id}>
								<MessageBubble message={m} onSelectAgent={onSelectAgent} />
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
					return <MessageBubble key={m.id} message={m} onSelectAgent={onSelectAgent} />;
				})}

				{/* Active Agent Thinking Indicator */}
				{activeAgentThinking && (
					<div className="flex items-center gap-3 p-3 rounded-xl bg-[#12182b]/80 border border-[#1e2842] max-w-sm animate-pulse">
						<div
							className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
							style={{
								backgroundColor: AGENT_REGISTRY[activeAgentThinking]?.accentColor || "#5eead4",
							}}
						>
							{AGENT_REGISTRY[activeAgentThinking]?.initials || "AG"}
						</div>
						<div className="text-xs text-slate-300">
							<span className="font-semibold text-slate-100">
								{AGENT_REGISTRY[activeAgentThinking]?.name || activeAgentThinking}
							</span>{" "}
							is investigating & reasoning…
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Scroll to bottom button */}
			{showScrollBottom && (
				<button
					type="button"
					onClick={scrollToBottom}
					className="fixed bottom-20 right-8 sm:right-96 p-2 rounded-full bg-[#18203a] hover:bg-teal-600 text-white shadow-xl border border-[#2c385c] transition-all z-10"
					title="Scroll to latest message"
				>
					<ArrowDown className="w-4 h-4" />
				</button>
			)}
		</div>
	);
};
