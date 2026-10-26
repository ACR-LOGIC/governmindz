import React, { useState, useRef, useEffect } from "react";
import {
	Send,
	Sparkles,
	X,
	Loader2,
	Play,
	RotateCcw,
	ShieldCheck,
	FileSearch,
	Scale,
	Plus,
	Search as SearchIcon,
	ChevronDown,
	Check,
	Upload,
	Image as ImageIcon,
	FileText,
	Cpu,
	Volume2,
	VolumeX,
	Database,
	Compass,
	BookOpen,
	Monitor,
} from "lucide-react";
import { AVAILABLE_MODELS, type ModelOption } from "../../services/models";
import { ttsService } from "../../services/ttsService";

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
		id: "01-regulatory-risk",
		file: "01-regulatory-risk.json",
		title: "1. Regulatory Risk Analysis",
		category: "Flagship · SEC + GLEIF + DNS Join",
		icon: "research",
		question: "Our organization received acquisition offers from 7 Fortune 500 companies (Apple, IBM, Oracle, Walmart, Target, Ford, Tesla). Before we accept any partnership, we need to assess regulatory compliance risk. Use Zetaris to cross-reference: (1) SEC financial data (revenue volatility, reporting consistency), (2) GLEIF legal entity status (LEI active/inactive), (3) COMPANY_DNS industry classification. Which company poses the HIGHEST compliance risk, and why? Rank all 7 companies by governance risk.",
		description: "Cross-references 7 Fortune 500 candidate partners joining SEC_DATA, GLEIF_REST, and COMPANY_DNS to isolate anomalies and unverified LEIs.",
	},
	{
		id: "02-pii-exposure",
		file: "02-pii-exposure.json",
		title: "2. PII Re-identification & Privacy",
		category: "Flagship · NY_TAXI Multi-Table Privacy Gate",
		icon: "claims",
		question: "We want to share NY_TAXI operational data with a research team to study transportation patterns. However, we have serious concerns about PII exposure. Zetaris, cross-reference taxi_trips with drivers table to calculate: (1) how many trips does each driver have? (2) which zones do they work? (3) what's their estimated earnings? Create a 'PII exposure score' for each driver (how easily can they be re-identified?) and recommend which drivers' data is safe to share, and which requires de-identification or blocking. What governance policy should we implement?",
		description: "Calculates driver re-identification risks across trip frequencies and trajectory clusters to enforce k-anonymity and quarantine gates.",
	},
	{
		id: "03-clinical-safety",
		file: "03-clinical-safety.json",
		title: "3. Clinical Trials & Drug Safety",
		category: "Flagship · FDA + ClinicalTrials Federation",
		icon: "decision",
		question: "We're evaluating whether to partner with pharmaceutical companies conducting clinical trials. Before we grant them access to our data, we need to ensure trial integrity. Zetaris, join CLINICALTRIALS_REST (ibuprofen studies) with OPENFDA_REST (FDA drug approval + adverse reactions). Analysis: (1) What ibuprofen trials are currently active? (2) Do they match FDA labeling for indications and warnings? (3) Are there known adverse reactions in FDA data that trials aren't monitoring? (4) What governance risk does data inconsistency create? Which trials can we trust, and which need additional review?",
		description: "Cross-checks active clinical study endpoints against FDA blackbox adverse reaction registries to enforce medical safety covenants.",
	},
	{
		id: "01-fragmented-intelligence",
		file: "01-fragmented-intelligence.json",
		title: "4. Cross-Silo Supply Chain Intelligence",
		category: "Track 1 · Cross-Silo Data Reconciliation",
		icon: "research",
		question: "Reconcile conflicting supplier delivery dates and inventory records across fragmented ERP export (Postgres), Logistics Ticket API, and Risk Feed without fabricating missing data.",
		description: "Discovers and reconciles conflicting records across ERP, Logistics API, and Risk feeds with explicit provenance attribution.",
	},
	{
		id: "02-explain-why",
		file: "02-explain-why.json",
		title: "5. The Agent That Can Explain Why",
		category: "Track 2 · Hypothesis Testing & Evidence",
		icon: "claims",
		question: "Why did SMB churn rise in Q3 across enterprise accounts, and what evidence-backed recommendations explain the underlying driver?",
		description: "Evaluates competing hypotheses, critiques unsupported assertions, cites telemetry evidence, and discloses limitations.",
	},
	{
		id: "03-reasoning-architecture",
		file: "03-reasoning-architecture.json",
		title: "6. Reasoning Architecture & Policy Gates",
		category: "Track 3 · Policy Gates & Auditable Memory",
		icon: "decision",
		question: "Process high-priority clinic scheduling and resource allocation requests by evaluating operational policies, historical H-MEM precedents, and cryptographic audit constraints.",
		description: "Demonstrates 12-state reasoning, operational policy gates, persistent memory retrieval, and tamper-proof audit trails.",
	},
];

export interface AttachedItem {
	id: string;
	name: string;
	size: number;
	type: "file" | "image";
	dataUrl?: string;
}

export interface SearchOption {
	id: string;
	label: string;
	badge?: string;
	description: string;
	icon: React.ElementType;
}

export const SEARCH_OPTIONS: SearchOption[] = [
	{
		id: "web",
		label: "Search",
		description: "Live web search & authoritative regulatory citations",
		icon: SearchIcon,
	},
	{
		id: "zetaris",
		label: "Zetaris AI",
		badge: "Core",
		description: "Query Zetaris federated data lakehouse & live SQL catalog",
		icon: Database,
	},
	{
		id: "deep_research",
		label: "Deep Research",
		description: "Meterless multi-step recursive reasoning and synthesis",
		icon: Compass,
	},
	{
		id: "model_council",
		label: "Model Council",
		badge: "Max",
		description: "Cross-agent debate & consensus cross-examination",
		icon: Scale,
	},
	{
		id: "learn_steps",
		label: "Learn Step by Step",
		description: "Structured policy and governance rule decomposition",
		icon: BookOpen,
	},
];

interface MessageComposerProps {
	mode: "live" | "demo" | "sample";
	onSendMessage: (topic: string, options?: { searchModes: string[]; model: string; attachments: AttachedItem[] }) => void;
	onStartDemoScenario?: (scenarioFile: string, question: string) => void;
	onStartOver?: () => void;
	selectedScenarioFile?: string;
	onSelectScenarioFile?: (file: string) => void;
	isBusy: boolean;
	disabled?: boolean;
	defaultTopic?: string;
	hasCompletedMessages?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
	mode,
	onSendMessage,
	onStartDemoScenario,
	onStartOver,
	selectedScenarioFile = "01-regulatory-risk.json",
	onSelectScenarioFile,
	isBusy,
	disabled,
	hasCompletedMessages = false,
}) => {
	const isDemoMode = mode === "demo" || mode === "sample";
	const [text, setText] = useState("");
	const [activeDemoScenario, setActiveDemoScenario] = useState<string>(selectedScenarioFile);
	const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0].id);
	const [selectedSearchModes, setSelectedSearchModes] = useState<string[]>(["web", "zetaris"]);
	const [attachedFiles, setAttachedFiles] = useState<AttachedItem[]>([]);
	const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);
	const [computerEnabled, setComputerEnabled] = useState<boolean>(true);

	// Menus open state
	const [plusMenuOpen, setPlusMenuOpen] = useState(false);
	const [searchMenuOpen, setSearchMenuOpen] = useState(false);
	const [modelMenuOpen, setModelMenuOpen] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const searchMenuRef = useRef<HTMLDivElement>(null);
	const modelMenuRef = useRef<HTMLDivElement>(null);

	// Sync local scenario with parent
	useEffect(() => {
		if (selectedScenarioFile) {
			setActiveDemoScenario(selectedScenarioFile);
		}
	}, [selectedScenarioFile]);

	// Sync voice preference
	useEffect(() => {
		setVoiceEnabled(ttsService.isTtsEnabled());
		const unsub = ttsService.subscribe(() => {
			setVoiceEnabled(ttsService.isTtsEnabled());
		});
		return unsub;
	}, []);

	// Close popovers on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
				setPlusMenuOpen(false);
			}
			if (searchMenuRef.current && !searchMenuRef.current.contains(e.target as Node)) {
				setSearchMenuOpen(false);
			}
			if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
				setModelMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleSubmit = () => {
		if (isBusy || disabled) return;
		const trimmed = text.trim();
		if (!trimmed && attachedFiles.length === 0) return;

		onSendMessage(trimmed, {
			searchModes: selectedSearchModes,
			model: selectedModel,
			attachments: attachedFiles,
		});
		setText("");
		setAttachedFiles([]);
	};

	const handleSelectDemoBubble = (scenario: DemoScenarioOption) => {
		setActiveDemoScenario(scenario.file);
		setText(scenario.question);
		if (onSelectScenarioFile) {
			onSelectScenarioFile(scenario.file);
		}
	};

	const handleExecuteDemo = () => {
		const chosen = DEMO_SCENARIOS.find((s) => s.file === activeDemoScenario) || DEMO_SCENARIOS[0];
		if (onStartDemoScenario) {
			onStartDemoScenario(chosen.file, chosen.question);
		} else {
			onSendMessage(chosen.question, {
				searchModes: selectedSearchModes,
				model: selectedModel,
				attachments: attachedFiles,
			});
		}
	};

	// File & Image uploads
	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isImage = false) => {
		const files = e.target.files;
		if (!files || files.length === 0) return;

		Array.from(files).forEach((file) => {
			const reader = new FileReader();
			reader.onload = (event) => {
				const newItem: AttachedItem = {
					id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
					name: file.name,
					size: file.size,
					type: isImage ? "image" : "file",
					dataUrl: event.target?.result as string,
				};
				setAttachedFiles((prev) => [...prev, newItem]);
			};
			if (isImage) {
				reader.readAsDataURL(file);
			} else {
				reader.readAsText(file);
			}
		});
		e.target.value = "";
		setPlusMenuOpen(false);
	};

	const removeAttachment = (id: string) => {
		setAttachedFiles((prev) => prev.filter((a) => a.id !== id));
	};

	const toggleSearchMode = (modeId: string) => {
		setSelectedSearchModes((prev) => {
			if (prev.includes(modeId)) {
				return prev.filter((m) => m !== modeId);
			} else {
				return [...prev, modeId];
			}
		});
	};

	const toggleVoice = () => {
		const next = !voiceEnabled;
		setVoiceEnabled(next);
		ttsService.setTtsEnabled(next);
	};

	// Auto adjust textarea height
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
		}
	}, [text]);

	const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0];

	// Search button label text
	const getSearchButtonLabel = () => {
		if (selectedSearchModes.length === 0) return "Search";
		if (selectedSearchModes.length === 1) {
			const found = SEARCH_OPTIONS.find((s) => s.id === selectedSearchModes[0]);
			return found ? found.label : "Search";
		}
		return `Search (${selectedSearchModes.length})`;
	};

	return (
		<div className="border-t border-[#1e2842] bg-[#0c101e]/95 backdrop-blur-md px-4 py-3 shrink-0">
			{/* Hidden file inputs */}
			<input
				ref={fileInputRef}
				type="file"
				multiple
				accept=".pdf,.doc,.docx,.txt,.csv,.json,.sql,.md"
				onChange={(e) => handleFileUpload(e, false)}
				className="hidden"
			/>
			<input
				ref={imageInputRef}
				type="file"
				multiple
				accept="image/*"
				onChange={(e) => handleFileUpload(e, true)}
				className="hidden"
			/>

			<div className="max-w-4xl mx-auto space-y-3">
				{/* ============================================================ */}
				{/* DEMO MODE SCENARIO CARDS (Only displayed when in demo/sample mode) */}
				{/* ============================================================ */}
				{isDemoMode && (
					<div className="space-y-2 pb-1 border-b border-[#1b2542]">
						<div className="flex items-center justify-between text-xs">
							<div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-400">
								<Sparkles className="w-3.5 h-3.5" />
								<span className="font-bold uppercase tracking-wider">Demo Mode Scenarios</span>
								<span className="text-slate-400 font-sans hidden sm:inline">
									— Select a pre-configured challenge or type your own below:
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-[10px] text-slate-400 bg-[#161f36] px-2 py-0.5 rounded-full border border-[#232f50]">
									Paced Multi-Agent Deliberation
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

						{/* 3 Selectable Prompt Bubbles */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
							{DEMO_SCENARIOS.map((sc) => {
								const isSelected = activeDemoScenario === sc.file;
								return (
									<button
										key={sc.id}
										type="button"
										onClick={() => handleSelectDemoBubble(sc)}
										disabled={isBusy}
										className={`text-left p-2.5 rounded-xl border transition-all relative flex flex-col justify-between ${
											isSelected
												? "bg-gradient-to-b from-amber-950/40 to-[#121930] border-amber-500/70 shadow-md shadow-amber-950/30 ring-1 ring-amber-400/50"
												: "bg-[#11172a] hover:bg-[#161f38] border-[#1e2842] text-slate-300 hover:border-[#2d3a60]"
										}`}
									>
										<div>
											<div className="flex items-center justify-between gap-1 mb-1">
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
									</button>
								);
							})}
						</div>
					</div>
				)}

				{/* ============================================================ */}
				{/* MODERN CHAT INPUT CONTAINER (Matches Perplexity / ChatGPT Layout) */}
				{/* ============================================================ */}
				<div className="bg-[#121626] border border-[#232b45] focus-within:border-teal-500/80 rounded-3xl p-3 shadow-2xl transition-all relative">
					{/* Attached files preview chips */}
					{attachedFiles.length > 0 && (
						<div className="flex items-center gap-2 overflow-x-auto pb-2 mb-1.5 pt-0.5 border-b border-[#1c243a]">
							{attachedFiles.map((file) => (
								<div
									key={file.id}
									className="flex items-center gap-2 bg-[#182038] border border-[#2b3860] px-2.5 py-1 rounded-xl text-xs text-slate-200 shrink-0 group shadow-sm"
								>
									{file.type === "image" ? (
										file.dataUrl ? (
											<img src={file.dataUrl} alt={file.name} className="w-5 h-5 rounded object-cover" />
										) : (
											<ImageIcon className="w-4 h-4 text-sky-400" />
										)
									) : (
										<FileText className="w-4 h-4 text-amber-400" />
									)}
									<span className="truncate max-w-[130px] font-medium text-[11px]">{file.name}</span>
									<button
										type="button"
										onClick={() => removeAttachment(file.id)}
										className="p-0.5 text-slate-400 hover:text-rose-400 rounded transition-colors"
										title="Remove attachment"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								</div>
							))}
						</div>
					)}

					{/* Prompt Textarea */}
					<textarea
						ref={textareaRef}
						rows={1}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={isDemoMode ? "Ask or modify deliberation topic, or click Start Demo below…" : "Ask anything…"}
						disabled={isBusy || disabled}
						className="w-full bg-transparent border-0 resize-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none px-2 py-1 max-h-36 overflow-y-auto leading-relaxed"
					/>

					{/* Bottom Actions Row */}
					<div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-[#1a2136]">
						{/* Left Toolbar Cluster */}
						<div className="flex items-center gap-1.5 flex-wrap">
							{/* [+] Plus Button with Popover */}
							<div className="relative" ref={plusMenuRef}>
								<button
									type="button"
									onClick={() => setPlusMenuOpen(!plusMenuOpen)}
									disabled={isBusy || disabled}
									className="p-1.5 rounded-full hover:bg-[#1d2642] text-slate-400 hover:text-white transition-colors"
									title="Attach files or images"
								>
									<Plus className="w-4 h-4" />
								</button>

								{plusMenuOpen && (
									<div className="absolute left-0 bottom-full mb-2 w-48 bg-[#0f1424] border border-[#232f50] rounded-2xl shadow-2xl p-1.5 z-50 animate-scaleUp space-y-1 text-xs text-slate-200">
										<button
											type="button"
											onClick={() => fileInputRef.current?.click()}
											className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#182038] hover:text-white transition-colors text-left"
										>
											<Upload className="w-4 h-4 text-amber-400" />
											<span>Upload files</span>
										</button>
										<button
											type="button"
											onClick={() => imageInputRef.current?.click()}
											className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#182038] hover:text-white transition-colors text-left"
										>
											<ImageIcon className="w-4 h-4 text-sky-400" />
											<span>Upload images</span>
										</button>
									</div>
								)}
							</div>

							{/* [🔍 Search ⌵] Multi-Select Dropdown Button */}
							<div className="relative" ref={searchMenuRef}>
								<button
									type="button"
									onClick={() => setSearchMenuOpen(!searchMenuOpen)}
									disabled={isBusy || disabled}
									className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
										selectedSearchModes.length > 0
											? "bg-[#182038] text-teal-300 border border-teal-500/40 shadow-sm"
											: "bg-[#141a2c] text-slate-400 hover:text-slate-200 border border-[#232f50]"
									}`}
									title="Configure search sources and research modalities"
								>
									<SearchIcon className="w-3.5 h-3.5 text-teal-400" />
									<span>{getSearchButtonLabel()}</span>
									<ChevronDown className="w-3 h-3 text-slate-400" />
								</button>

								{/* Multi-Select Menu matching Image 2 */}
								{searchMenuOpen && (
									<div className="absolute left-0 bottom-full mb-2 w-64 bg-[#0d1222] border border-[#232f50] rounded-2xl shadow-2xl p-2 z-50 animate-scaleUp space-y-1 text-xs">
										<div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-[#1b2542] flex items-center justify-between">
											<span>Search & Sources</span>
											<span className="text-[9px] text-teal-400">Multi-select enabled</span>
										</div>

										{SEARCH_OPTIONS.map((opt) => {
											const isSelected = selectedSearchModes.includes(opt.id);
											const IconComp = opt.icon;
											return (
												<button
													key={opt.id}
													type="button"
													onClick={() => toggleSearchMode(opt.id)}
													className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors ${
														isSelected
															? "bg-[#18223c] text-white"
															: "hover:bg-[#141a2c] text-slate-300"
													}`}
												>
													<div className="flex items-center gap-2.5">
														<IconComp className={`w-4 h-4 ${isSelected ? "text-teal-400" : "text-slate-400"}`} />
														<div>
															<div className="font-semibold text-xs flex items-center gap-1.5">
																<span>{opt.label}</span>
																{opt.badge && (
																	<span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
																		{opt.badge}
																	</span>
																)}
															</div>
															<div className="text-[10px] text-slate-400 leading-tight">
																{opt.description}
															</div>
														</div>
													</div>

													<div className="shrink-0 ml-2">
														{isSelected ? (
															<Check className="w-4 h-4 text-teal-400" />
														) : (
															<div className="w-4 h-4 rounded border border-slate-600" />
														)}
													</div>
												</button>
											);
										})}
									</div>
								)}
							</div>

							{/* [🖥️ Computer / Tools] Toggle */}
							<button
								type="button"
								onClick={() => setComputerEnabled(!computerEnabled)}
								className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
									computerEnabled
										? "bg-[#182038] text-slate-200 border border-[#2b3860]"
										: "bg-transparent text-slate-400 hover:text-slate-200 border border-transparent"
								}`}
								title="Toggle Computer / SQL Execution tools"
							>
								<Monitor className="w-3.5 h-3.5 text-slate-400" />
								<span>Computer</span>
							</button>
						</div>

						{/* Right Toolbar Cluster: Model Selector, Voice Toggle, Submit Button */}
						<div className="flex items-center gap-2">
							{/* [Model ⌵] Selector Dropdown (Moved to this row from Header) */}
							<div className="relative" ref={modelMenuRef}>
								<button
									type="button"
									onClick={() => setModelMenuOpen(!modelMenuOpen)}
									disabled={isBusy || disabled}
									className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#141a2c] hover:bg-[#1a233c] border border-[#232f50] text-xs font-mono text-slate-300 hover:text-white transition-colors"
									title="Select deliberation model architecture"
								>
									<Cpu className="w-3.5 h-3.5 text-amber-400" />
									<span className="truncate max-w-[110px] sm:max-w-[140px] font-medium">
										{currentModel.shortName}
									</span>
									<ChevronDown className="w-3 h-3 text-slate-400" />
								</button>

								{modelMenuOpen && (
									<div className="absolute right-0 bottom-full mb-2 w-64 bg-[#0d1222] border border-[#232f50] rounded-2xl shadow-2xl p-2 z-50 animate-scaleUp space-y-1 text-xs">
										<div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-[#1b2542]">
											Deliberation Model
										</div>

										{AVAILABLE_MODELS.map((mod) => (
											<button
												key={mod.id}
												type="button"
												onClick={() => {
													setSelectedModel(mod.id);
													setModelMenuOpen(false);
												}}
												className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors ${
													selectedModel === mod.id
														? "bg-[#18223c] text-amber-300 font-semibold"
														: "hover:bg-[#141a2c] text-slate-300"
												}`}
											>
												<div>
													<div className="font-semibold text-xs flex items-center gap-1.5">
														<span>{mod.name}</span>
														{mod.recommended && (
															<span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono">
																DEFAULT
															</span>
														)}
													</div>
													<div className="text-[10px] text-slate-400 font-mono">{mod.provider}</div>
												</div>
												{selectedModel === mod.id && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
											</button>
										))}
									</div>
								)}
							</div>

							{/* [🎙️ / 🔊 Voice] Toggle Button */}
							<button
								type="button"
								onClick={toggleVoice}
								className={`p-2 rounded-full transition-all ${
									voiceEnabled
										? "bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)] animate-pulse"
										: "text-slate-400 hover:text-slate-200 hover:bg-[#1a233c]"
								}`}
								title={
									voiceEnabled
										? "Voice is ON (AI responses read aloud) — Click to turn OFF"
										: "Voice is OFF — Click to turn ON so agents talk to each other"
								}
								aria-label="Toggle voice responses"
							>
								{voiceEnabled ? <Volume2 className="w-4 h-4 text-amber-300" /> : <VolumeX className="w-4 h-4" />}
							</button>

							{/* Demo quick run or Submit Button */}
							{isDemoMode && !text.trim() && attachedFiles.length === 0 ? (
								<button
									type="button"
									onClick={handleExecuteDemo}
									disabled={isBusy || disabled}
									className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold shadow-md transition-all active:scale-95 ${
										isBusy
											? "bg-[#18203a] text-slate-400 cursor-not-allowed"
											: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-950/40"
									}`}
								>
									{isBusy ? (
										<>
											<Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
											<span>Deliberating…</span>
										</>
									) : (
										<>
											<Play className="w-3.5 h-3.5 fill-current" />
											<span>Start Demo</span>
										</>
									)}
								</button>
							) : (
								<button
									type="button"
									onClick={handleSubmit}
									disabled={isBusy || disabled || (!text.trim() && attachedFiles.length === 0)}
									className={`p-2.5 rounded-full font-bold transition-all shadow-md active:scale-95 ${
										isBusy || (!text.trim() && attachedFiles.length === 0)
											? "bg-[#182038] text-slate-500 cursor-not-allowed"
											: "bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-300 hover:to-teal-400 text-slate-950 shadow-teal-950/40"
									}`}
									title="Submit inquiry"
								>
									{isBusy ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Send className="w-4 h-4" />}
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
