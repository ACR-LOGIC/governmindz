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
	Database,
	Cpu,
	Volume2,
	VolumeX,
	ChevronDown,
	Check,
	Sparkles,
	Sliders,
	Download,
	FileJson,
	FileText,
	Layers,
} from "lucide-react";
import type { ActiveTab, HealthStatus, Conversation } from "../../types";
import { ttsService } from "../../services/ttsService";
import {
	exportConversationAsJson,
	exportConversationAsMarkdown,
	exportAuditLogAsJsonl,
} from "../../services/exportService";

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
}) => {
	const meterlessOnline = health?.meterless?.state === "online";
	const zetarisOnline = health?.zetaris?.ok;

	const [ttsEnabled, setTtsEnabled] = useState(false);
	const [exportMenuOpen, setExportMenuOpen] = useState(false);
	const exportRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setTtsEnabled(ttsService.isTtsEnabled());
	}, []);

	// Close menus when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
				setExportMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleToggleTts = () => {
		const next = !ttsEnabled;
		ttsService.setTtsEnabled(next);
		setTtsEnabled(next);
	};

	return (
		<header className="h-14 border-b border-[#22222a] bg-[#111114]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
			{/* Left side: Sidebar toggle and Brand title */}
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e1e26] transition-colors"
					title={leftSidebarOpen ? "Collapse navigation" : "Expand navigation"}
					aria-label="Toggle navigation sidebar"
				>
					{leftSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
				</button>

				<div className="flex items-baseline gap-2">
					<span className="font-display font-bold text-lg tracking-tight text-[#f4b942]">
						GovernMindz
					</span>
					<span className="hidden sm:inline-block text-[10px] font-mono tracking-widest uppercase text-slate-400">
						Mission Control
					</span>
				</div>
			</div>

			{/* Center: 3 Integrated Views Navigation */}
			<div id="tour-explorer" className="flex items-center bg-[#16161c] border border-[#262630] p-1 rounded-xl gap-1">
				<button
					type="button"
					onClick={() => setActiveTab("chat")}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
						activeTab === "chat"
							? "bg-[#262632] text-[#5eead4] shadow-sm shadow-black/40"
							: "text-slate-400 hover:text-slate-200"
					}`}
				>
					<MessageSquare className="w-3.5 h-3.5" />
					<span>Conversation</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab("explorer")}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
						activeTab === "explorer"
							? "bg-[#262632] text-[#f4b942] shadow-sm shadow-black/40"
							: "text-slate-400 hover:text-slate-200"
					}`}
				>
					<Activity className="w-3.5 h-3.5" />
					<span>Execution</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab("evidence")}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
						activeTab === "evidence"
							? "bg-[#262632] text-[#34d399] shadow-sm shadow-black/40"
							: "text-slate-400 hover:text-slate-200"
					}`}
				>
					<ShieldCheck className="w-3.5 h-3.5" />
					<span>Trust & Evidence</span>
				</button>
			</div>

			{/* Right side: Audio Toggle and Infrastructure indicators */}
			<div className="flex items-center gap-2">
				{/* Speaker Icon Toggle: Local Text-to-Speech (Piper / Web Speech) */}
				<button
					type="button"
					onClick={handleToggleTts}
					className={`p-1.5 rounded-lg transition-all ${
						ttsEnabled
							? "bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
							: "text-slate-400 hover:text-white hover:bg-[#1e1e26]"
					}`}
					title={
						ttsEnabled
							? "Voice Synthesis ACTIVE — Click to mute"
							: "Voice Synthesis MUTED — Click to activate speech"
					}
					aria-label="Toggle voice synthesis"
				>
					{ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
				</button>

				{/* Independent Infrastructure Connection Indicators */}
				<div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono">
					{/* Meterless Indicator */}
					<button
						type="button"
						onClick={onOpenCredentials}
						className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-colors ${
							meterlessOnline
								? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
								: mode === "live"
								? "bg-rose-950/40 border-rose-800 text-rose-300 cursor-pointer"
								: "bg-[#181822] border-[#2a2a38] text-slate-400"
						}`}
						title={
							meterlessOnline
								? "Meterless Runtime: Online at 127.0.0.1:8088"
								: mode === "live"
								? "Meterless: Offline or Unreachable (Click to configure)"
								: "Meterless: Demo Simulation Active"
						}
					>
						<span
							className={`w-1.5 h-1.5 rounded-full ${
								meterlessOnline
									? "bg-emerald-400 animate-pulse"
									: mode === "live"
									? "bg-rose-400"
									: "bg-slate-500"
							}`}
						/>
						<span>Meterless</span>
					</button>

					{/* Zetaris Indicator */}
					<button
						type="button"
						onClick={onOpenCredentials}
						className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-colors ${
							zetarisOnline
								? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
								: mode === "live"
								? "bg-rose-950/40 border-rose-800 text-rose-300 cursor-pointer"
								: "bg-[#181822] border-[#2a2a38] text-slate-400"
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
									? "bg-emerald-400 animate-pulse"
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
					className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono uppercase font-semibold border transition-all cursor-pointer ${
						mode === "live"
							? "bg-emerald-950/50 border-emerald-600/60 text-emerald-300 hover:border-emerald-400"
							: "bg-amber-950/50 border-amber-600/60 text-amber-300 hover:border-amber-400"
					}`}
					title={`Current mode: ${mode.toUpperCase()} (Click to change mode)`}
				>
					<span
						className={`w-1.5 h-1.5 rounded-full ${
							mode === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
						}`}
					/>
					<span>{mode === "live" ? "Live Mode" : "Demo Mode"}</span>
				</button>

				{/* Refresh health button */}
				<button
					type="button"
					onClick={refreshHealth}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e1e26] transition-colors"
					title="Check Connectivity"
					aria-label="Check Connectivity"
				>
					<RefreshCw className={`w-4 h-4 ${isBusy ? "animate-spin text-teal-400" : ""}`} />
				</button>

				{/* Platform-Wide Export Menu */}
				<div className="relative" ref={exportRef}>
					<button
						type="button"
						onClick={() => setExportMenuOpen(!exportMenuOpen)}
						disabled={!activeConversation}
						className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
							exportMenuOpen
								? "bg-[#1f1f28] border-amber-500/50 text-amber-300"
								: "border-[#2e2e38] bg-[#16161a] text-slate-300 hover:text-white hover:border-[#3e3e4c]"
						} ${!activeConversation ? "opacity-50 cursor-not-allowed" : ""}`}
						title="Export conversation history and granular outputs"
						aria-label="Export debate outputs"
					>
						<Download className="w-3.5 h-3.5 text-amber-400" />
						<span className="hidden sm:inline">Export</span>
						<ChevronDown className="w-3 h-3 text-slate-400" />
					</button>

					{exportMenuOpen && activeConversation && (
						<div className="absolute right-0 mt-2 w-64 bg-[#141418] border border-[#2a2a36] rounded-xl shadow-2xl p-2 z-50 animate-fadeIn space-y-1">
							<div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-[#22222c]">
								Platform Export Options
							</div>

							<button
								type="button"
								onClick={() => {
									exportConversationAsJson(activeConversation);
									setExportMenuOpen(false);
								}}
								className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left hover:bg-[#1f1f28] text-slate-200 transition-colors group"
							>
								<FileJson className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
								<div>
									<div className="text-xs font-semibold group-hover:text-amber-300">
										Granular Outputs (.JSON)
									</div>
									<div className="text-[10px] text-slate-400 leading-tight">
										Full audit ledger, citations, telemetry & messages
									</div>
								</div>
							</button>

							<button
								type="button"
								onClick={() => {
									exportConversationAsMarkdown(activeConversation);
									setExportMenuOpen(false);
								}}
								className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left hover:bg-[#1f1f28] text-slate-200 transition-colors group"
							>
								<FileText className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
								<div>
									<div className="text-xs font-semibold group-hover:text-emerald-300">
										Executive Briefing (.MD)
									</div>
									<div className="text-[10px] text-slate-400 leading-tight">
										Formatted synthesis, verified positions & citations
									</div>
								</div>
							</button>

							<button
								type="button"
								onClick={() => {
									exportAuditLogAsJsonl(activeConversation);
									setExportMenuOpen(false);
								}}
								className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left hover:bg-[#1f1f28] text-slate-200 transition-colors group"
							>
								<Layers className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
								<div>
									<div className="text-xs font-semibold group-hover:text-purple-300">
										Audit Ledger Stream (.JSONL)
									</div>
									<div className="text-[10px] text-slate-400 leading-tight">
										Cryptographic chain events for SIEM compliance
									</div>
								</div>
							</button>
						</div>
					)}
				</div>

				{/* Settings button */}
				<button
					type="button"
					onClick={openSettings}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e1e26] transition-colors"
					title="Settings"
					aria-label="Open settings"
				>
					<Settings className="w-4 h-4" />
				</button>

				{/* Toggle Right Panel */}
				<button
					type="button"
					onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e1e26] transition-colors"
					title={rightSidebarOpen ? "Collapse agent roster" : "Expand agent roster"}
					aria-label="Toggle agent roster"
				>
					{rightSidebarOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
				</button>
			</div>
		</header>
	);
};
