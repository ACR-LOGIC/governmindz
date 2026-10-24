import React from "react";
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
} from "lucide-react";
import type { ActiveTab, HealthStatus } from "../../types";

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
}) => {
	const meterlessOnline = health?.meterless?.state === "online";
	const zetarisOnline = health?.zetaris?.ok;

	return (
		<header className="h-14 border-b border-[#1e2842] bg-[#0c101e]/85 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
			{/* Left side: Sidebar toggle and Brand title */}
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#18203a] transition-colors"
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
			<div className="flex items-center bg-[#12182b] border border-[#1e2842] p-1 rounded-xl gap-1">
				<button
					type="button"
					onClick={() => setActiveTab("chat")}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
						activeTab === "chat"
							? "bg-[#18203a] text-[#5eead4] shadow-sm shadow-black/40"
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
							? "bg-[#18203a] text-[#f4b942] shadow-sm shadow-black/40"
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
							? "bg-[#18203a] text-[#34d399] shadow-sm shadow-black/40"
							: "text-slate-400 hover:text-slate-200"
					}`}
				>
					<ShieldCheck className="w-3.5 h-3.5" />
					<span>Trust & Evidence</span>
				</button>
			</div>

			{/* Right side: Infrastructure pills and Right sidebar toggle */}
			<div className="flex items-center gap-2">
				{/* Mode pill */}
				<span
					className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono uppercase font-semibold border ${
						mode === "live"
							? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300"
							: "bg-amber-950/40 border-amber-700/50 text-amber-300"
					}`}
				>
					<span
						className={`w-1.5 h-1.5 rounded-full ${
							mode === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
						}`}
					/>
					{mode} mode
				</span>

				{/* Meterless Runtime Status */}
				<div
					className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#12182b] border border-[#1e2842] text-[11px] font-mono"
					title={`Meterless Inference: ${health?.meterless?.state || "checking"}`}
				>
					<Cpu className="w-3.5 h-3.5 text-slate-400" />
					<span className="text-slate-300">Meterless</span>
					<span
						className={`w-2 h-2 rounded-full ${
							meterlessOnline ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-rose-500"
						}`}
					/>
				</div>

				{/* Zetaris Status */}
				<div
					className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#12182b] border border-[#1e2842] text-[11px] font-mono"
					title={`Zetaris Federated SQL: ${zetarisOnline ? "connected" : "offline"}`}
				>
					<Database className="w-3.5 h-3.5 text-slate-400" />
					<span className="text-slate-300">Zetaris</span>
					<span
						className={`w-2 h-2 rounded-full ${
							zetarisOnline ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-rose-500"
						}`}
					/>
				</div>

				{/* Refresh health button */}
				<button
					type="button"
					onClick={refreshHealth}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#18203a] transition-colors"
					title="Check Connectivity"
					aria-label="Check Connectivity"
				>
					<RefreshCw className={`w-4 h-4 ${isBusy ? "animate-spin text-teal-400" : ""}`} />
				</button>

				{/* Settings button */}
				<button
					type="button"
					onClick={openSettings}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#18203a] transition-colors"
					title="Settings"
					aria-label="Open settings"
				>
					<Settings className="w-4 h-4" />
				</button>

				{/* Toggle Right Panel */}
				<button
					type="button"
					onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
					className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#18203a] transition-colors"
					title={rightSidebarOpen ? "Collapse agent roster" : "Expand agent roster"}
					aria-label="Toggle agent roster"
				>
					{rightSidebarOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
				</button>
			</div>
		</header>
	);
};
