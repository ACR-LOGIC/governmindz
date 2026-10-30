import React, { useState, useEffect, useRef } from "react";
import {
	MessageSquare,
	Activity,
	ShieldCheck,
	PanelLeftClose,
	PanelLeftOpen,
	PanelRightClose,
	PanelRightOpen,
	Settings,
	RefreshCw,
	Volume2,
	VolumeX,
	ChevronDown,
	Download,
	FileJson,
	FileText,
	FileSpreadsheet,
	FileCode,
	Layers,
	Bell,
	Sparkles,
} from "lucide-react";
import type { ActiveTab, HealthStatus, Conversation } from "../../types";
import { ttsService } from "../../services/ttsService";
import { detectMeterless } from "../../services/api";
import {
	downloadConversationArchive,
	downloadConversationExport,
	type ConversationExportFormat,
} from "../../services/exportBundle";
import { evaluateWebConversation, formatConfidence } from "../../services/conversationEvaluation";
import { notificationService } from "../../services/notificationService";
import { NotificationCenter } from "../common/NotificationCenter";

type ExportPhase = "idle" | "working" | "success" | "error";

const NAV_ACTIVE_COLORS: Record<string, string> = {
	"teal-400": "text-teal-300",
	"amber-400": "text-amber-300",
	"emerald-400": "text-emerald-300",
	"violet-400": "text-violet-300",
};

interface ExportUiState {
	phase: ExportPhase;
	format?: ConversationExportFormat;
	message?: string;
	warnings: string[];
}

const EXPORT_LABELS: Record<ConversationExportFormat, string> = {
	pdf: "PDF report",
	docx: "Word document",
	xlsx: "Excel workbook",
	csv: "CSV dataset",
	json: "JSON export",
	markdown: "Markdown briefing",
	jsonl: "Audit JSONL",
	zip: "Download All archive",
};

interface HeaderProps {
	activeTab: ActiveTab;
	setActiveTab: (tab: ActiveTab) => void;
	leftSidebarOpen: boolean;
	setLeftSidebarOpen: (open: boolean) => void;
	rightSidebarOpen: boolean;
	setRightSidebarOpen: (open: boolean) => void;
	health: HealthStatus | null;
	refreshHealth: () => void;
	openSettings: () => void;
	mode: "live" | "sample";
	isBusy: boolean;
	activeConversation?: Conversation | null;
	onToggleMode?: () => void;
	onOpenCredentials?: () => void;
	onOpenTour?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
	activeTab,
	setActiveTab,
	leftSidebarOpen,
	setLeftSidebarOpen,
	rightSidebarOpen,
	setRightSidebarOpen,
	health,
	refreshHealth,
	openSettings,
	mode,
	isBusy,
	activeConversation,
	onToggleMode,
	onOpenCredentials,
	onOpenTour,
}) => {
	const meterlessOnline = health?.meterless?.state === "online";
	const zetarisOnline = health?.zetaris?.ok;

	const [ttsEnabled, setTtsEnabled] = useState(false);
	const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
	const [unreadCount, setUnreadCount] = useState(0);
	const [exportMenuOpen, setExportMenuOpen] = useState(false);
	const [meterlessConnecting, setMeterlessConnecting] = useState(false);
	const [exportState, setExportState] = useState<ExportUiState>({
		phase: "idle",
		warnings: [],
	});
	const exportRef = useRef<HTMLDivElement>(null);
	const exportAbortRef = useRef<AbortController | null>(null);
	const notificationRef = useRef<HTMLButtonElement>(null);
	const evaluation = activeConversation ? evaluateWebConversation(activeConversation) : null;
	const archiveEnabled = evaluation?.status === "EVALUATED";
	const exportBusy = exportState.phase === "working";

	useEffect(() => {
		setTtsEnabled(ttsService.isTtsEnabled());
	}, []);

	useEffect(() => {
		const unsub = notificationService.subscribe((list) => {
			setUnreadCount(list.filter((n) => !n.read).length);
		});
		return unsub;
	}, []);

	useEffect(() => {
		return () => exportAbortRef.current?.abort();
	}, []);

	const runExport = async (format: ConversationExportFormat) => {
		if (!activeConversation || exportBusy) return;
		if (format === "zip" && !archiveEnabled) return;

		exportAbortRef.current?.abort();
		const controller = new AbortController();
		exportAbortRef.current = controller;
		setExportState({ phase: "working", format, warnings: [] });

		try {
			const result =
				format === "zip"
					? await downloadConversationArchive(activeConversation, controller.signal)
					: await downloadConversationExport(activeConversation, format, controller.signal);
			setExportState({
				phase: "success",
				format,
				message: `${result.filename} downloaded.`,
				warnings: result.warnings,
			});
		} catch (error) {
			if (controller.signal.aborted) {
				setExportState({ phase: "idle", warnings: [] });
				return;
			}
			const message =
				error instanceof Error
					? error.message
					: `Could not generate the ${EXPORT_LABELS[format]}.`;
			setExportState({ phase: "error", format, message, warnings: [] });
		} finally {
			if (exportAbortRef.current === controller) {
				exportAbortRef.current = null;
			}
		}
	};

	const cancelExport = () => {
		exportAbortRef.current?.abort();
		exportAbortRef.current = null;
		setExportState({ phase: "idle", warnings: [] });
	};

	const exportActions: Array<{
		format: ConversationExportFormat;
		label: string;
		description: string;
		icon: React.ReactNode;
	}> = [
		{
			format: "pdf",
			label: "Executive Report (.PDF)",
			description: "Real browser-rendered PDF with evaluation and audit status",
			icon: <FileText className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />,
		},
		{
			format: "docx",
			label: "Word Document (.DOCX)",
			description: "Editable Office document with structured sections",
			icon: <FileText className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />,
		},
		{
			format: "xlsx",
			label: "Excel Workbook (.XLSX)",
			description: "Formatted workbook with separate data sheets",
			icon: <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
		},
		{
			format: "csv",
			label: "Spreadsheet Dataset (.CSV)",
			description: "Portable tabular messages, evidence, and audit records",
			icon: <FileSpreadsheet className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />,
		},
		{
			format: "json",
			label: "Granular Outputs (.JSON)",
			description: "Complete structured conversation and audit data",
			icon: <FileJson className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
		},
		{
			format: "markdown",
			label: "Executive Briefing (.MD)",
			description: "Readable briefing with explicit evaluation labels",
			icon: <FileCode className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
		},
		{
			format: "jsonl",
			label: "Audit Ledger Stream (.JSONL)",
			description: "Recorded audit events for SIEM and archive workflows",
			icon: <Layers className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />,
		},
	];

	// Close menus when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
				setExportMenuOpen(false);
			}
		};
		const handleTourExportMenu = (e: Event) => {
			const open = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
			setExportMenuOpen(open);
		};
		document.addEventListener("mousedown", handleClickOutside);
		window.addEventListener("governmindz:tour-export-menu", handleTourExportMenu);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			window.removeEventListener("governmindz:tour-export-menu", handleTourExportMenu);
		};
	}, []);

	useEffect(() => {
		const handleNotificationOutside = (e: MouseEvent) => {
			if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
				setNotificationPanelOpen(false);
			}
		};
		document.addEventListener("mousedown", handleNotificationOutside);
		return () => document.removeEventListener("mousedown", handleNotificationOutside);
	}, []);

	const handleToggleTts = () => {
		const next = !ttsEnabled;
		ttsService.setTtsEnabled(next);
		setTtsEnabled(next);
	};

	const handleMeterlessClick = async () => {
		if (meterlessConnecting) return;
		if (meterlessOnline) {
			onOpenCredentials?.();
			return;
		}
		setMeterlessConnecting(true);
		try {
			await detectMeterless();
			refreshHealth();
		} catch (error) {
			console.warn("Meterless auto-detection failed:", error);
			refreshHealth();
		} finally {
			setMeterlessConnecting(false);
		}
	};

	const navItem = (
		icon: React.ReactNode,
		label: string,
		tab: ActiveTab,
		activeColor: string,
	) => {
		const active = activeTab === tab;
		return (
			<button
				type="button"
				onClick={() => setActiveTab(tab)}
				className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
					active
						? `bg-[#262632] ${NAV_ACTIVE_COLORS[activeColor] ?? "text-teal-300"} shadow-sm shadow-black/40`
						: "text-slate-400 hover:text-slate-200 hover:bg-[#1e1e26]"
				}`}
			>
				{icon}
				<span>{label}</span>
			</button>
		);
	};

	return (
		<header className="h-16 border-b border-[#1e2842] bg-[#0a0e1a]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 z-30">
			{/* Left side: Sidebar toggle and Brand title */}
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
					className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface transition-colors transition-smooth"
					title={leftSidebarOpen ? "Collapse navigation" : "Expand navigation"}
					aria-label="Toggle navigation sidebar"
				>
					{leftSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
				</button>

				<div className="flex items-center gap-2.5">
					<img
						src="/governmindz-logo.png"
						alt="GovernMindz logo"
						className="h-8 w-8 rounded-xl object-cover ring-1 ring-amber-400/50 shadow-lg shadow-amber-950/30"
					/>
					<div className="flex items-baseline gap-2">
						<span className="font-display font-bold text-xl tracking-tight text-[#f4b942]">
							GovernMindz
						</span>
						<span className="hidden sm:inline-block text-[10px] font-mono tracking-widest uppercase text-slate-400">
							Mission Control
						</span>
					</div>
				</div>
			</div>

			{/* Center: Integrated Views Navigation */}
			<div id="tour-explorer" className="flex items-center bg-[#111114]/80 border border-[#262630] p-1.5 rounded-xl gap-1.5 backdrop-blur-sm shadow-lg">
				{navItem(<MessageSquare className="w-3.5 h-3.5" />, "Conversation", "chat", "teal-400")}
				{navItem(<Activity className="w-3.5 h-3.5" />, "Execution", "explorer", "amber-400")}
				{navItem(
					<ShieldCheck className="w-3.5 h-3.5" />,
					"Trust & Evidence",
					"evidence",
					"emerald-400",
				)}
				{navItem(
					<Sparkles className="w-3.5 h-3.5" />,
					"Founder",
					"founder",
					"violet-400",
				)}
			</div>

			{/* Right side: Audio Toggle and Infrastructure indicators */}
			<div className="flex items-center gap-2">
				{/* Speaker Icon Toggle */}
				<button
					type="button"
					onClick={handleToggleTts}
					className={`p-1.5 rounded-xl transition-all ${
						ttsEnabled
							? "bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
							: "text-slate-400 hover:text-white hover:bg-surface hover:border-[#2a2a38] border-transparent"
					}`}
					title={ttsEnabled ? "Voice Synthesis ACTIVE — Click to mute" : "Voice Synthesis MUTED — Click to activate speech"}
					aria-label="Toggle voice synthesis"
				>
					{ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
				</button>

				{/* Independent Infrastructure Connection Indicators */}
				<div id="tour-connectivity" className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono">
					{/* Meterless Indicator */}
					<button
						type="button"
						onClick={handleMeterlessClick}
						disabled={meterlessConnecting}
						className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl border transition-all ${
							meterlessOnline
								? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/60"
								: mode === "live"
								? "bg-rose-950/40 border-rose-800/60 text-rose-300 hover:bg-rose-950/60 cursor-pointer"
								: "bg-[#12182b] border-[#262630] text-slate-400 hover:bg-[#161f3c] hover:border-[#2c385c]"
						}`}
						title={
							meterlessConnecting
								? "Attempting to connect Meterless Nightshift..."
								: meterlessOnline
								? "Meterless Runtime: Online at 127.0.0.1:8088"
								: mode === "live"
								? "Meterless: Offline or Unreachable (Click to try auto-connect)"
								: "Meterless: Demo Simulation Active"
						}
					>
						<span
							className={`w-1.5 h-1.5 rounded-full ${
								meterlessOnline
									? "bg-emerald-400 animate-pulse-dot"
									: mode === "live"
									? "bg-rose-400"
									: "bg-slate-500"
							}`}
						/>
						<span>{meterlessConnecting ? "Connecting…" : "Meterless"}</span>
					</button>

					{/* Zetaris Indicator */}
					<button
						type="button"
						onClick={onOpenCredentials}
						className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl border transition-all ${
							zetarisOnline
								? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/60"
								: mode === "live"
								? "bg-rose-950/40 border-rose-800/60 text-rose-300 hover:bg-rose-950/60 cursor-pointer"
								: "bg-[#12182b] border-[#262630] text-slate-400 hover:bg-[#161f3c] hover:border-[#2c385c]"
						}`}
						title={
							zetarisOnline
								? "Zetaris Lightning: Connected & Queryable"
								: mode === "live"
								? "Zetaris: Connection Failed (Click to configure)"
								: "Zetaris: Demo Simulation Active"
						}
					>
						<span
							className={`w-1.5 h-1.5 rounded-full ${
								zetarisOnline
									? "bg-emerald-400 animate-pulse-dot"
									: mode === "live"
									? "bg-rose-400"
									: "bg-slate-500"
							}`}
						/>
						<span>Zetaris</span>
					</button>
				</div>

				{/* Mode pill & Mode Switcher */}
				<button
					id="tour-mode"
					type="button"
					onClick={onToggleMode}
					className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono uppercase font-bold border transition-all cursor-pointer ${
						mode === "live"
							? "bg-emerald-950/50 border-emerald-600/60 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-950/80"
							: "bg-amber-950/50 border-amber-600/60 text-amber-300 hover:border-amber-400 hover:bg-amber-950/80"
					}`}
					title={`Current mode: ${mode.toUpperCase()} (Click to change mode)`}
				>
					<span
						className={`w-1.5 h-1.5 rounded-full ${
							mode === "live" ? "bg-emerald-400 animate-pulse-dot" : "bg-amber-400"
						}`}
					/>
					<span>{mode === "live" ? "Live Mode" : "Demo Mode"}</span>
				</button>

				{/* Notification Bell */}
				<button
					id="tour-notifications"
					ref={notificationRef}
					type="button"
					onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
					className={`p-1.5 rounded-xl transition-all relative ${
						unreadCount > 0
							? "text-amber-400 bg-amber-950/20 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
							: "text-slate-400 hover:text-white hover:bg-surface hover:border-transparent border-transparent"
					}`}
					title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
					aria-label="Notifications"
					aria-expanded={notificationPanelOpen}
					aria-haspopup="true"
				>
					<Bell className="w-4 h-4" />
					{unreadCount > 0 && (
						<span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-[#0a0e1a]" />
					)}
				</button>

				{/* Refresh health button */}
				<button
					type="button"
					onClick={refreshHealth}
					className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface transition-colors transition-smooth"
					title="Check Connectivity"
					aria-label="Check Connectivity"
				>
					<RefreshCw className={`w-4 h-4 ${isBusy ? "animate-spin text-teal-400" : ""}`} />
				</button>

				{/* Platform-Wide Export Menu */}
				<div id="tour-export" className="relative" ref={exportRef}>
					<button
						type="button"
						onClick={() => setExportMenuOpen(!exportMenuOpen)}
						disabled={!activeConversation}
						className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
							exportMenuOpen
								? "bg-[#1f1f28] border-amber-500/50 text-amber-300"
								: "border-[#2e2e38] bg-[#111114] text-slate-300 hover:text-white hover:border-[#3e3e4c]"
						} ${!activeConversation ? "opacity-60 cursor-not-allowed" : ""}`}
						title="Export conversation history and granular outputs"
						aria-label="Export debate outputs"
					>
						<Download className="w-3.5 h-3.5 text-amber-400" />
						<span className="hidden sm:inline">Export</span>
						<ChevronDown className="w-3 h-3 text-slate-400" />
					</button>

					{exportMenuOpen && activeConversation && (
						<div className="absolute right-0 mt-3 w-96 glass-panel rounded-xl shadow-2xl p-2 z-50 animate-scaleIn space-y-1">
							<div className="flex items-center justify-between px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-[#22222c]">
								<span>Export conversation</span>
								<button
									type="button"
									onClick={() => setExportMenuOpen(false)}
									className="text-slate-400 hover:text-white hover:bg-[#22222c] rounded p-1 transition-colors"
									aria-label="Close export menu"
								>
									✕
								</button>
							</div>

							{evaluation ? (
								<div className="px-3 py-2 text-[10px] font-mono border-b border-[#22222c] pb-2">
									{evaluation.status === "EVALUATED"
										? `Evaluated · Confidence: ${formatConfidence(evaluation.confidence)} · Download All: enabled`
										: `Not evaluated · Confidence: ${formatConfidence(evaluation.confidence)} · Download All: disabled until evaluation completes`}
								</div>
							) : null}

							<div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-[#22222c] pb-1">
								Single formats
							</div>
							{exportActions.map((action) => (
								<button
									key={action.format}
									type="button"
									disabled={exportBusy}
									onClick={() => runExport(action.format)}
									className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-all ${
										exportBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-surface hover:text-slate-200 hover:border-transparent"
									}`}
								>
									{action.icon}
									<div>
										<div className="text-xs font-semibold">{action.label}</div>
										<div className="text-[10px] text-slate-400 leading-tight">{action.description}</div>
									</div>
								</button>
							))}

							<div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 border-t border-[#22222c] pt-1">
								Conversation archive
							</div>
							<button
								type="button"
								id="tour-download-all"
								disabled={exportBusy || !archiveEnabled}
								onClick={() => runExport("zip")}
								aria-disabled={!archiveEnabled}
								className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
									!archiveEnabled
										? "border-[#4c566a] bg-[#1a1a24] text-slate-500 opacity-80 cursor-not-allowed"
										: exportBusy
										? "border-amber-500/60 bg-[#2a1b0a] text-amber-200 opacity-60 cursor-not-allowed"
										: "border-amber-500/50 bg-[#111114] text-amber-300 hover:bg-surface hover:border-amber-400"
								} mb-1`}
							>
								<Download className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
								<div>
									<div className="text-xs font-semibold">
										{archiveEnabled ? "Download All (.ZIP)" : "Download All (.ZIP)"}
									</div>
									<div className="text-[10px] text-slate-400 leading-tight">
										{archiveEnabled
											? "Complete evaluable export including all referenced artifacts"
											: "Complete evaluation required before archive download"}
									</div>
								</div>
							</button>

							{exportState.phase === "working" && (
								<div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[#22222c] pt-2">
									<div className="flex items-center gap-2">
										<RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
										<span className="text-xs font-semibold text-amber-300">
											Generating {EXPORT_LABELS[exportState.format || "zip"]}...
										</span>
									</div>
									<button
										type="button"
										onClick={cancelExport}
										className="w-full p-1.5 rounded-lg bg-[#2a1b0a]/50 border border-amber-900/50 text-amber-300 text-[10px] hover:bg-[#2a1b0a]/80 transition-colors"
									>
										Cancel export
									</button>
								</div>
							)}

							{exportState.phase === "success" && (
								<div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[#22222c] pt-2 bg-[#0b2117]/40">
									<div className="flex items-center gap-2">
										<span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse-dot" />
										<span className="text-xs font-semibold text-emerald-300">{exportState.message || "Downloaded"}</span>
									</div>
									{exportState.warnings.length > 0 && (
										<div className="text-[10px] text-amber-300 leading-tight">{exportState.warnings.join(" ")}</div>
									)}
									{exportState.format && (
										<button
											type="button"
											onClick={() => runExport(exportState.format ?? "pdf")}
											className="w-full p-1.5 rounded-lg bg-emerald-900/30 border border-emerald-600/40 text-emerald-200 text-[10px] hover:bg-emerald-900/50 transition-colors"
										>
											Download again
										</button>
									)}
								</div>
							)}

							{exportState.phase === "error" && (
								<div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[#22222c] pt-2 bg-[#2e1616]/40">
									<div className="text-[10px] text-rose-300 leading-tight break-words">{exportState.message || "Export failed"}</div>
									{exportState.format && (
										<button
											type="button"
											onClick={() => runExport(exportState.format ?? "pdf")}
											className="w-full p-1.5 rounded-lg bg-[#7f1d1d]/50 border border-rose-700 text-rose-200 text-[10px] hover:bg-[#7f1d1d]/80 transition-colors"
										>
											Retry
										</button>
									)}
								</div>
							)}
						</div>
					)}
				</div>

				{/* Guided Tour button */}
				{onOpenTour && (
					<button
						id="tour-trigger-btn"
						type="button"
						onClick={onOpenTour}
						className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-xl border border-teal-500/40 bg-teal-950/30 text-teal-300 hover:text-white hover:bg-teal-900/40 text-xs font-semibold transition-all"
						title="Start Interactive Guided Product Tour"
						aria-label="Start Interactive Guided Product Tour"
					>
						<span>Guided Tour</span>
					</button>
				)}

				{/* Settings button */}
				<button
					id="tour-settings-btn"
					type="button"
					onClick={openSettings}
					className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface transition-colors transition-smooth"
					title="Settings"
					aria-label="Open settings"
				>
					<Settings className="w-4 h-4" />
				</button>

				{/* Toggle Right Panel */}
				<button
					type="button"
					onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
					className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface transition-colors transition-smooth"
					title={rightSidebarOpen ? "Collapse agent roster" : "Expand agent roster"}
					aria-label="Toggle agent roster"
				>
					{rightSidebarOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
				</button>
			</div>

			{/* Notification Center Panel */}
			{notificationPanelOpen && (
				<NotificationCenter isOpen={notificationPanelOpen} onClose={() => setNotificationPanelOpen(false)} />
			)}
		</header>
	);
};
