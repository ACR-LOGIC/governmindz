import React, { useState, useRef, useEffect, useCallback } from "react";
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
	RefreshCw,
} from "lucide-react";
import { AVAILABLE_MODELS, type ModelOption } from "../../services/models";
import { fetchModels } from "../../services/api";
import { ttsService } from "../../services/ttsService";

export interface DemoScenarioOption {
	id: string;
	file: string;
	title: string;
	category: string;
	promptLabel?: string;
	icon: "research" | "decision" | "claims";
	question: string;
	description: string;
}

export const DEMO_SCENARIOS: DemoScenarioOption[] = [
	{
		id: "fragmented-intelligence",
		file: "01-fragmented-intelligence.json",
		title: "1. Solving Fragmented Intelligence",
		category: "Track 01 · Cross-Silo Data Reconciliation",
		promptLabel: "Track 01 · Fragmented Data",
		icon: "research",
		question: "Reconcile conflicting supplier delivery dates and inventory records across fragmented ERP export (Postgres), Logistics Ticket API, and Risk Feed without fabricating missing data.",
		description: "Discovers and reconciles conflicting records across ERP, Logistics API, and Risk feeds with explicit provenance attribution.",
	},
	{
		id: "explain-why",
		file: "02-explain-why.json",
		title: "2. The Agent That Can Explain Why",
		category: "Track 02 · Evidence-Backed Reasoning",
		promptLabel: "Track 02 · Explain Why",
		icon: "claims",
		question: "Why did SMB churn rise in Q3 across enterprise accounts, and what evidence-backed recommendations explain the underlying driver?",
		description: "Evaluates competing hypotheses, critiques unsupported assertions, cites telemetry evidence, and discloses limitations.",
	},
	{
		id: "reasoning-architecture",
		file: "03-reasoning-architecture.json",
		title: "3. Reasoning Architecture",
		category: "Track 03 · Policy Gates & Auditable Memory",
		promptLabel: "Track 03 · Reasoning Architecture",
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
	selectedScenarioFile = "01-fragmented-intelligence.json",
	onSelectScenarioFile,
	isBusy,
	disabled,
	hasCompletedMessages = false,
}) => {
	const isDemoMode = mode === "demo" || mode === "sample";
	const [text, setText] = useState("");
	const [activeDemoScenario, setActiveDemoScenario] = useState<string>(selectedScenarioFile);
	const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0].id);
	const [models, setModels] = useState<ModelOption[]>(AVAILABLE_MODELS);
	const [modelsRefreshing, setModelsRefreshing] = useState(false);

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
	const modelRequestRef = useRef(0);

	// Sync local scenario with parent
	useEffect(() => {
		if (selectedScenarioFile) {
			setActiveDemoScenario(selectedScenarioFile);
		}
	}, [selectedScenarioFile]);

	// Load the live Nightshift model catalog. Cloud models configured inside
	// Nightshift appear here automatically.
	const loadModels = useCallback(async () => {
		const requestId = ++modelRequestRef.current;
		setModelsRefreshing(true);
		try {
			const items = await fetchModels();
			if (requestId !== modelRequestRef.current) return;
			if (items.length === 0) return;
			const mapped: ModelOption[] = items.map((m) => ({
				id: m.id,
				name: m.name || m.id,
				shortName:
					(m.name || m.id).length > 22
						? `${(m.name || m.id).slice(0, 20)}…`
						: m.name || m.id,
				provider: m.provider,
				recommended: m.isDefault,
			}));
			setModels(mapped);
			setSelectedModel((current) =>
				mapped.some((m) => m.id === current)
					? current
					: mapped.find((m) => m.recommended)?.id || mapped[0].id,
			);

		} catch {
			// Keep the current catalog when Nightshift discovery is unavailable.
		} finally {
			if (requestId === modelRequestRef.current) {
				setModelsRefreshing(false);
			}
		}
	}, []);

	useEffect(() => {
		void loadModels();
	}, [loadModels]);

	// Refresh when the picker opens, when credentials/health are refreshed,
	// and on a low-frequency visibility-aware poll. Nightshift has no model
	// change event stream, so this is the reliable discovery path.
	useEffect(() => {
		if (modelMenuOpen) {
			void loadModels();
		}
	}, [modelMenuOpen, loadModels]);

	useEffect(() => {
		const refresh = () => {
			if (document.visibilityState === "visible") void loadModels();
		};
		const interval = setInterval(refresh, 60000);
		const onModelsRefresh = () => void loadModels();
		document.addEventListener("visibilitychange", refresh);
		window.addEventListener("governmindz:models-refresh", onModelsRefresh);
		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", refresh);
			window.removeEventListener("governmindz:models-refresh", onModelsRefresh);
		};
	}, [loadModels]);

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

	const currentModel = models.find((m) => m.id === selectedModel) || models[0] || AVAILABLE_MODELS[0];
	const activeScenario = DEMO_SCENARIOS.find((s) => s.file === activeDemoScenario) || DEMO_SCENARIOS[0];

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
									— Deterministic sample data. Local-only history, one entry per example.
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
											{sc.promptLabel && (
												<div className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 mb-1">
													{sc.promptLabel}
												</div>
											)}
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
					{isDemoMode ? (
						<div className="px-2 py-1 min-h-8 text-xs sm:text-sm text-slate-200 leading-relaxed">
							<span className="text-[10px] font-mono uppercase tracking-wider text-teal-400 block mb-1">
								Selected prompt
							</span>
							{text.trim() || activeScenario.question}
						</div>
					) : (
						<textarea
							ref={textareaRef}
							rows={1}
							value={text}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Ask anything."
							disabled={isBusy || disabled}
							className="w-full bg-transparent border-0 resize-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none px-2 py-1 max-h-36 overflow-y-auto leading-relaxed"
						/>
					)}

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
									<div className="absolute right-0 bottom-full mb-2 w-64 bg-[#0d1222] border border-[#232f50] rounded-2xl shadow-2xl p-2 z-50 animate-scaleUp text-xs">
										<div className="flex items-center justify-between px-2 py-1 border-b border-[#1b2542]">
											<span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
												Deliberation Model · {models.length}
											</span>
											<button
												type="button"
												onClick={() => void loadModels()}
												disabled={modelsRefreshing}
												className="p-1 rounded text-slate-400 hover:text-teal-300 hover:bg-[#18203a] transition-colors disabled:opacity-60"
												title="Refresh models from Nightshift"
												aria-label="Refresh Nightshift models"
											>
												<RefreshCw className={`w-3 h-3 ${modelsRefreshing ? "animate-spin" : ""}`} />
											</button>
										</div>
										<div className="max-h-72 overflow-y-auto space-y-1 pt-1">
										{models.map((mod) => (
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
							{isDemoMode ? (
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
