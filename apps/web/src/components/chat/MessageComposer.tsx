import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, X, Loader2, Play, RotateCcw, ShieldCheck, HelpCircle, Layers, FileSearch, Scale } from "lucide-react";

export interface DemoScenarioOption {
	id: string;
	file: string;
	title: string;
	category: string;
	icon: "research" | "decision" | "claims";
	question: string;
	description: string;
}

export const DEMO_SCENARIOS: DemoScenarioOption[] = [
	{
		id: "02-federated-evidence",
		file: "02-federated-evidence.json",
		title: "Research & Evidence",
		category: "Investigate & Compare Evidence",
		icon: "research",
		question: "How should an agent combine fragmented Zetaris sources into an evidence-backed answer without inventing missing data?",
		description: "Investigates disparate tables (CRM, Billing, Support) across freshness windows to ensure cross-source provenance.",
	},
	{
		id: "01-governance-readiness",
		file: "01-governance-readiness.json",
		title: "Technical Decision",
		category: "Evaluate Approaches & Trade-offs",
		icon: "decision",
		question: "Which governance controls should a data team verify before exposing Zetaris federated data to an external agent?",
		description: "Evaluates least privilege, read-only SQL guards, statement byte limits, and role-based policy gates.",
	},
	{
		id: "03-audit-explainability",
		file: "03-audit-explainability.json",
		title: "Conflicting Claims",
		category: "Challenge Assumptions & Disagreements",
		icon: "claims",
		question: "What minimum audit evidence should accompany a multi-agent recommendation so a reviewer can reproduce it?",
		description: "Examines conflicting retention claims, challenges assumptions, and enforces verifiable tamper-evident signatures.",
	},
];

interface MessageComposerProps {
	mode: "live" | "demo" | "sample";
	onSendMessage: (topic: string) => void;
	onStartDemoScenario?: (scenarioFile: string, question: string) => void;
	onStartOver?: () => void;
	selectedScenarioFile?: string;
	onSelectScenarioFile?: (file: string) => void;
	isBusy: boolean;
	disabled?: boolean;
	defaultTopic?: string;
	hasCompletedMessages?: boolean;
}

const TEMPLATE_QUESTIONS = [
	"Which governance controls verify Zetaris federated access before exposing to external agents?",
	"How to enforce read-only SQL guards on confidential database tables in real-time?",
	"Evaluate least-privilege audit readiness and hash-chained ledger integrity.",
];

export const MessageComposer: React.FC<MessageComposerProps> = ({
	mode,
	onSendMessage,
	onStartDemoScenario,
	onStartOver,
	selectedScenarioFile = "01-governance-readiness.json",
	onSelectScenarioFile,
	isBusy,
	disabled,
	defaultTopic,
	hasCompletedMessages = false,
}) => {
	const isDemoMode = mode === "demo" || mode === "sample";
	const [text, setText] = useState("");
	const [activeDemoScenario, setActiveDemoScenario] = useState<string>(selectedScenarioFile);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Keep local active scenario synchronized with parent
	useEffect(() => {
		if (selectedScenarioFile) {
			setActiveDemoScenario(selectedScenarioFile);
		}
	}, [selectedScenarioFile]);

	const questions = defaultTopic ? [defaultTopic, ...TEMPLATE_QUESTIONS.filter((q) => q !== defaultTopic)] : TEMPLATE_QUESTIONS;

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleSubmit = () => {
		if (isBusy || disabled) return;
		onSendMessage(text.trim());
		setText("");
	};

	const handleSelectTemplate = (template: string) => {
		setText(template);
		if (textareaRef.current) {
			textareaRef.current.focus();
		}
	};

	const handleSelectDemoBubble = (scenario: DemoScenarioOption) => {
		setActiveDemoScenario(scenario.file);
		if (onSelectScenarioFile) {
			onSelectScenarioFile(scenario.file);
		}
	};

	const handleExecuteDemo = () => {
		const chosen = DEMO_SCENARIOS.find((s) => s.file === activeDemoScenario) || DEMO_SCENARIOS[1];
		if (onStartDemoScenario) {
			onStartDemoScenario(chosen.file, chosen.question);
		} else {
			onSendMessage(chosen.question);
		}
	};

	// Auto adjust textarea height
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
		}
	}, [text]);

	// ============================================================
	// DEMO MODE UI: 3 Selectable Prompt Bubbles + Start Demo / Start Over
	// ============================================================
	if (isDemoMode) {
		const currentSelected = DEMO_SCENARIOS.find((s) => s.file === activeDemoScenario) || DEMO_SCENARIOS[1];

		return (
			<div className="border-t border-[#1e2842] bg-[#0c101e]/95 backdrop-blur-md px-4 py-3 shrink-0">
				<div className="max-w-4xl mx-auto space-y-3">
					{/* Demo Header Label & Mode Notice */}
					<div className="flex items-center justify-between text-xs pb-1 border-b border-[#1b2542]">
						<div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-400">
							<Sparkles className="w-3.5 h-3.5" />
							<span className="font-bold uppercase tracking-wider">Demo Mode Scenarios</span>
							<span className="text-slate-400 font-sans hidden sm:inline">
								— Select a pre-configured governance challenge:
							</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-[10px] text-slate-400 bg-[#161f36] px-2 py-0.5 rounded-full border border-[#232f50]">
								Deterministic Offline Simulation
							</span>
							{hasCompletedMessages && onStartOver && (
								<button
									onClick={onStartOver}
									disabled={isBusy}
									className="flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-white bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/50 px-2.5 py-0.5 rounded-lg transition-colors shadow-sm"
								>
									<RotateCcw className="w-3 h-3" />
									Start Over
								</button>
							)}
						</div>
					</div>

					{/* 3 Distinct Selectable Prompt Bubbles */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
						{DEMO_SCENARIOS.map((sc) => {
							const isSelected = activeDemoScenario === sc.file;
							return (
								<button
									key={sc.id}
									type="button"
									onClick={() => handleSelectDemoBubble(sc)}
									disabled={isBusy}
									className={`text-left p-3 rounded-xl border transition-all relative flex flex-col justify-between ${
										isSelected
											? "bg-gradient-to-b from-amber-950/40 to-[#121930] border-amber-500/70 shadow-lg shadow-amber-950/30 ring-1 ring-amber-400/50"
											: "bg-[#11172a] hover:bg-[#161f38] border-[#1e2842] text-slate-300 hover:border-[#2d3a60]"
									}`}
								>
									<div>
										<div className="flex items-center justify-between gap-1 mb-1.5">
											<div className="flex items-center gap-1.5">
												{sc.icon === "research" && <FileSearch className="w-3.5 h-3.5 text-teal-400" />}
												{sc.icon === "decision" && <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />}
												{sc.icon === "claims" && <Scale className="w-3.5 h-3.5 text-indigo-400" />}
												<span className="text-xs font-bold text-white">{sc.title}</span>
											</div>
											{isSelected && (
												<span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.2 rounded">
													Selected
												</span>
											)}
										</div>
										<p className="text-[11px] font-medium text-slate-200 line-clamp-2 leading-snug">
											"{sc.question}"
										</p>
									</div>
									<div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
										<span className="truncate pr-1">{sc.category}</span>
										<span className="font-mono text-[9px] text-slate-400 shrink-0">Demo #{sc.id.slice(0, 2)}</span>
									</div>
								</button>
							);
						})}
					</div>

					{/* Demo Action Bar */}
					<div className="flex items-center justify-between gap-3 pt-1">
						<div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
							<span className="text-slate-400">Selected:</span>
							<span className="text-slate-200 font-semibold truncate max-w-sm sm:max-w-md">
								{currentSelected.title} — {currentSelected.question}
							</span>
						</div>

						<div className="flex items-center gap-2 shrink-0">
							{hasCompletedMessages && onStartOver && (
								<button
									type="button"
									onClick={onStartOver}
									disabled={isBusy}
									className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#161f38] hover:bg-[#1d294a] border border-[#28365a] rounded-xl transition-colors"
								>
									<RotateCcw className="w-3.5 h-3.5" />
									<span>Change Scenario</span>
								</button>
							)}

							<button
								type="button"
								onClick={handleExecuteDemo}
								disabled={isBusy || disabled}
								className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all ${
									isBusy
										? "bg-[#18203a] text-slate-400 cursor-not-allowed"
										: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-950/40"
								}`}
							>
								{isBusy ? (
									<>
										<Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
										<span>Agents Deliberating…</span>
									</>
								) : (
									<>
										<Play className="w-3.5 h-3.5 fill-current" />
										<span>Start Demo</span>
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// ============================================================
	// LIVE MODE UI: Free-Text Input + Templates + Send Action
	// ============================================================
	return (
		<div className="border-t border-[#1e2842] bg-[#0c101e]/90 backdrop-blur-md px-4 py-3 shrink-0">
			<div className="max-w-4xl mx-auto space-y-2">
				{/* Template suggestion chips */}
				<div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
					<span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1">
						<Sparkles className="w-3 h-3 text-teal-400" />
						Templates:
					</span>
					{questions.map((q, i) => (
						<button
							key={i}
							type="button"
							onClick={() => handleSelectTemplate(q)}
							disabled={isBusy}
							className={`px-2.5 py-1 rounded-full border text-[11px] truncate shrink-0 max-w-xs transition-colors ${
								i === 0 && defaultTopic
									? "bg-teal-950/60 border-teal-500/50 text-teal-300 hover:text-white"
									: "bg-[#12182b] hover:bg-[#18203a] border-[#1e2842] hover:border-[#2c385c] text-slate-300 hover:text-white"
							}`}
							title={q}
						>
							{i === 0 && defaultTopic ? `★ ${q}` : q}
						</button>
					))}
				</div>

				{/* Input box */}
				<div className="flex items-end gap-2 bg-[#12182b] border border-[#1e2842] focus-within:border-teal-500 rounded-2xl p-2 transition-colors shadow-lg">
					<textarea
						ref={textareaRef}
						rows={1}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask a live governance, access control, or federated data compliance question…"
						disabled={isBusy || disabled}
						className="flex-1 bg-transparent border-0 resize-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none p-1.5 max-h-36 overflow-y-auto leading-relaxed"
					/>

					{text && (
						<button
							type="button"
							onClick={() => setText("")}
							className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
							title="Clear input"
						>
							<X className="w-4 h-4" />
						</button>
					)}

					<button
						type="button"
						onClick={handleSubmit}
						disabled={isBusy || disabled}
						className={`flex items-center justify-center p-2.5 rounded-xl font-bold transition-all shadow-md active:scale-95 ${
							isBusy
								? "bg-[#18203a] text-slate-400 cursor-not-allowed"
								: "bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-300 hover:to-teal-400 text-slate-950 shadow-teal-950/40"
						}`}
						title="Submit Live Inquiry"
					>
						{isBusy ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Send className="w-4 h-4" />}
					</button>
				</div>
			</div>
		</div>
	);
};
