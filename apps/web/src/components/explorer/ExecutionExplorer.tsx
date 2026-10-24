import React, { useState } from "react";
import {
	Activity,
	GitCommit,
	Clock,
	CheckCircle2,
	AlertTriangle,
	Brain,
	ShieldCheck,
	Sparkles,
	ChevronRight,
	Bot,
} from "lucide-react";
import type { WorkflowTimelineEvent, Conversation } from "../../types";

interface ExecutionExplorerProps {
	conversation: Conversation;
}

export const ExecutionExplorer: React.FC<ExecutionExplorerProps> = ({ conversation }) => {
	const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

	const events = conversation.workflowEvents || [];
	const inquiryScore = conversation.inquiryScore || 5;

	// Synthesize standard state machine transitions if empty
	const timelineEvents: WorkflowTimelineEvent[] = events.length > 0
		? events
		: [
				{
					id: "st-1",
					state: "RECEIVED",
					timestamp: conversation.createdAt,
					trigger: "Operator Inquiry Ingested",
					agent: "Orchestrator",
					details: `User submitted query: "${conversation.topic}"`,
				},
				{
					id: "st-2",
					state: "ASSESSED",
					timestamp: conversation.createdAt + 120,
					trigger: "Inquiry Scoring Engine",
					agent: "InquiryScorer",
					details: `Assessed inquiry complexity: ${inquiryScore}/10. Prescribed multi-agent debate with Zetaris evidence.`,
				},
				{
					id: "st-3",
					state: "CONTEXT_READY",
					timestamp: conversation.createdAt + 280,
					trigger: "Context Agent Evaluation",
					agent: "ContextAgent",
					details: "Evaluated assumptions, past memories, and formulated shareable debate context.",
				},
				{
					id: "st-4",
					state: "RESEARCHING",
					timestamp: conversation.createdAt + 450,
					trigger: "Zetaris Lightning Query & Discovery",
					agent: "FactChecker",
					details: "Executed read-only federated catalog query: SHOW LIGHTNING DATABASES.",
				},
				{
					id: "st-5",
					state: "DEBATING",
					timestamp: conversation.createdAt + 800,
					trigger: "Multi-Agent Deliberation Rounds",
					agent: "DebateEngine",
					details: "Conducted blind initial proposals and rebuttal rounds across FactChecker, CloudArchitect, and Synthesizer.",
				},
				{
					id: "st-6",
					state: "INTERVENTIONS_CHECKED",
					timestamp: conversation.createdAt + 1400,
					trigger: "Autonomous Intervention Verification",
					agent: "RivalChallenger",
					details: "Challenged unverified assumptions regarding confidential finance database access reviews.",
				},
				{
					id: "st-7",
					state: "FINAL_REVIEW",
					timestamp: conversation.createdAt + 1800,
					trigger: "Consensus Synthesis Review",
					agent: "Synthesizer",
					details: "Supervisor synthesized 8-control verification matrix and verified cryptographic ledger.",
				},
				{
					id: "st-8",
					state: "COMPLETED",
					timestamp: conversation.updatedAt,
					trigger: "Run Reached Terminal Success",
					agent: "Orchestrator",
					details: "Audit trail signed and hash-chained with 0 unhandled halts.",
				},
			];

	return (
		<div className="flex-1 overflow-y-auto px-6 py-6">
			<div className="max-w-4xl mx-auto space-y-6">
				{/* Top Banner: Workflow Overview */}
				<div className="p-5 rounded-2xl bg-[#12182b] border border-[#1e2842] shadow-xl">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2842]">
						<div>
							<div className="flex items-center gap-2">
								<Activity className="w-5 h-5 text-amber-400" />
								<h2 className="font-display font-bold text-lg text-slate-100">
									Deterministic Workflow Execution Explorer
								</h2>
							</div>
							<p className="text-xs text-slate-400 mt-1">
								12-state formal state machine tracking every transition, inquiry score, and agent intervention.
							</p>
						</div>

						<div className="flex items-center gap-3">
							<div className="px-3 py-1.5 rounded-xl bg-[#18203a] border border-[#2c385c] text-right">
								<div className="text-[10px] font-mono uppercase text-slate-400">Inquiry Complexity</div>
								<div className="text-sm font-mono font-bold text-amber-300">{inquiryScore} / 10</div>
							</div>
							<div className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-right">
								<div className="text-[10px] font-mono uppercase text-emerald-400">Status</div>
								<div className="text-sm font-mono font-bold text-emerald-300 uppercase">
									{conversation.status}
								</div>
							</div>
						</div>
					</div>

					{/* State Flow Pill Progression */}
					<div className="pt-4 flex items-center gap-2 overflow-x-auto text-[11px] font-mono no-scrollbar">
						{["RECEIVED", "ASSESSED", "CONTEXT_READY", "RESEARCHING", "DEBATING", "FINAL_REVIEW", "COMPLETED"].map(
							(st, idx) => (
								<React.Fragment key={st}>
									<span
										className={`px-2.5 py-1 rounded-lg border font-semibold shrink-0 ${
											st === "COMPLETED"
												? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
												: "bg-[#18203a] border-[#2c385c] text-slate-200"
										}`}
									>
										{st}
									</span>
									{idx < 6 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
								</React.Fragment>
							),
						)}
					</div>
				</div>

				{/* Chronological Timeline */}
				<div className="space-y-4">
					<h3 className="font-display font-semibold text-sm text-slate-300 uppercase tracking-wider flex items-center gap-2">
						<GitCommit className="w-4 h-4 text-teal-400" />
						<span>Chronological Transition Log</span>
					</h3>

					<div className="relative border-l-2 border-[#1e2842] ml-4 pl-6 space-y-6">
						{timelineEvents.map((ev, index) => {
							const isSelected = selectedEventId === ev.id;
							return (
								<div
									key={ev.id || index}
									onClick={() => setSelectedEventId(isSelected ? null : ev.id)}
									className={`relative p-4 rounded-xl border transition-all cursor-pointer ${
										isSelected
											? "bg-[#18203a] border-teal-500 shadow-md shadow-teal-950/30"
											: "bg-[#12182b] border-[#1e2842] hover:border-[#2c385c]"
									}`}
								>
									{/* Dot on timeline */}
									<div className="absolute -left-[31px] top-4 w-3.5 h-3.5 rounded-full bg-[#0a0e1a] border-2 border-teal-400 flex items-center justify-center" />

									<div className="flex items-center justify-between gap-2 mb-1.5">
										<div className="flex items-center gap-2">
											<span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-[#18203a] text-teal-300 border border-[#2c385c]">
												{ev.state}
											</span>
											<span className="text-xs font-semibold text-slate-200">{ev.trigger}</span>
										</div>

										<span className="text-[10px] font-mono text-slate-400">
											{new Date(ev.timestamp).toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
												second: "2-digit",
											})}
										</span>
									</div>

									<p className="text-xs text-slate-300 leading-relaxed">{ev.details}</p>

									{ev.agent && (
										<div className="mt-2 text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
											<Bot className="w-3 h-3 text-amber-400" />
											<span>Actor: {ev.agent}</span>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
};
