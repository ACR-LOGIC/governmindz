import React, { useState } from "react";
import {
	Plus,
	Search,
	Trash2,
	Edit2,
	Check,
	X,
	Settings as SettingsIcon,
	FileText,
	Clock,
	Database,
	ShieldCheck,
} from "lucide-react";
import type { Conversation, ScenarioItem } from "../../types";

interface LeftSidebarProps {
	conversations: Conversation[];
	activeConversationId: string | null;
	onSelectConversation: (id: string) => void;
	onNewConversation: () => void;
	onRenameConversation: (id: string, title: string) => void;
	onDeleteConversation: (id: string) => void;
	mode: "live" | "sample";
	setMode: (mode: "live" | "sample") => void;
	scenarios: ScenarioItem[];
	selectedScenario: string;
	setSelectedScenario: (file: string) => void;
	openSettings: () => void;
	isOpen: boolean;
	onRequestLiveMode?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
	conversations,
	activeConversationId,
	onSelectConversation,
	onNewConversation,
	onRenameConversation,
	onDeleteConversation,
	mode,
	setMode,
	scenarios,
	selectedScenario,
	setSelectedScenario,
	openSettings,
	isOpen,
	onRequestLiveMode,
}) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	if (!isOpen) return null;

	const modeScoped = conversations
		.filter((c) => !c.id.startsWith("demo_draft_"))
		.filter((c) =>
			mode === "live" ? c.mode === "live" : c.mode === "sample" || c.mode === "demo",
		);

	const filtered = modeScoped.filter(
		(c) =>
			c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			c.topic.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	// Group conversations by date
	const now = Date.now();
	const oneDayMs = 24 * 60 * 60 * 1000;
	const today: Conversation[] = [];
	const yesterday: Conversation[] = [];
	const previous7Days: Conversation[] = [];
	const older: Conversation[] = [];

	for (const conv of filtered) {
		const diff = now - conv.updatedAt;
		if (diff < oneDayMs) {
			today.push(conv);
		} else if (diff < 2 * oneDayMs) {
			yesterday.push(conv);
		} else if (diff < 7 * oneDayMs) {
			previous7Days.push(conv);
		} else {
			older.push(conv);
		}
	}

	const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
		e.stopPropagation();
		setEditingId(conv.id);
		setEditTitle(conv.title);
	};

	const handleSaveRename = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		if (editTitle.trim()) {
			onRenameConversation(id, editTitle.trim());
		}
		setEditingId(null);
	};

	const handleDeleteClick = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setDeleteConfirmId(id);
	};

	const handleConfirmDelete = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		onDeleteConversation(id);
		setDeleteConfirmId(null);
	};

	const modeChip = (label: string, active: boolean, onClick: () => void, color: string) => (
		<button
			type="button"
			onClick={onClick}
			className={`flex-1 px-2 py-2 rounded-xl text-xs font-bold border transition-all text-center ${
				active
					? `bg-[color:var(--accent-${color})]/10 border-[color:var(--accent-${color})]/40 text-[color:var(--accent-${color})] shadow-sm shadow-[color:var(--accent-${color})]/20`
					: "bg-[#12182b] border-[#1e2842] text-slate-400 hover:bg-[#161f38] hover:border-[#2c385c] hover:text-slate-200"
			}`}
		>
			{label}
		</button>
	);

	return (
		<aside className="w-72 bg-[#0c101e] border-r border-[#1e2842] flex flex-col shrink-0 h-[calc(100vh-4rem)] select-none glass-panel">
			{/* Top Actions: New Debate button */}
			<div className="p-4 border-b border-[#1e2842]/60 bg-[#0f1424]/40 backdrop-blur-sm">
				<button
					type="button"
					onClick={onNewConversation}
					className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-950/40 transition-all active:scale-[0.98] hover-lift"
				>
					<Plus className="w-4 h-4" />
					<span>New AI Debate</span>
				</button>
			</div>

			{/* Search input */}
			<div className="px-4 pt-3 pb-2">
				<div className="relative">
					<Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search conversations…"
						className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#12182b] border border-[#1e2842] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all input-premium"
					/>
				</div>
			</div>

			{/* Environment & Preset Controls */}
			<div id="tour-sidebar-options" className="px-4 py-3 border-b border-[#1e2842]/60 bg-[#0f1424]/30 backdrop-blur-sm">
				<div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
					<span className="font-semibold uppercase tracking-wider text-[10px]">Execution Preset</span>
					<span className="font-mono text-[10px] text-teal-400">{mode.toUpperCase()}</span>
				</div>

				<div className="grid grid-cols-2 gap-1.5 mb-3">
					{modeChip("Demo Mode", mode === "sample", () => setMode("sample"), "amber")}
					{modeChip("Live Mode", mode === "live", () => {
						if (mode !== "live" && onRequestLiveMode) {
							onRequestLiveMode();
						} else {
							setMode("live");
						}
					}, "emerald")}
				</div>

				{/* Scenario Selector: Only visible in Demo Mode */}
				{mode === "sample" && scenarios.length > 0 && (
					<div className="space-y-1">
						<label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5">
							Governance Template
						</label>
						<select
							value={selectedScenario}
							onChange={(e) => setSelectedScenario(e.target.value)}
							className="w-full bg-[#12182b] border border-[#1e2842] rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all input-premium"
						>
							{scenarios.map((s) => (
								<option key={s.file} value={s.file}>
									{s.title || s.id || s.file.replace(".json", "")} ({s.rows || 3} rows)
								</option>
							))}
						</select>
					</div>
				)}
			</div>

			{/* Conversation History List */}
			<div id="tour-history" className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
				{[
					{ label: "Today", items: today },
					{ label: "Yesterday", items: yesterday },
					{ label: "Previous 7 Days", items: previous7Days },
					{ label: "Older", items: older },
				].map(
					(group) =>
						group.items.length > 0 && (
							<div key={group.label} className="space-y-0.5">
								<div className="px-3 text-[10px] font-mono tracking-widest uppercase text-slate-500 mb-1">
									{group.label}
								</div>
								{group.items.map((conv) => {
									const isActive = conv.id === activeConversationId;
									const isEditing = editingId === conv.id;
									const isDeleting = deleteConfirmId === conv.id;

									return (
										<div
											key={conv.id}
											onClick={() => onSelectConversation(conv.id)}
											className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all ${
												isActive
													? "bg-[#18203a] text-teal-300 font-semibold border border-teal-500/40 shadow-sm shadow-teal-950/20"
													: "text-slate-300 hover:bg-[#12182b] hover:text-white hover:border-transparent"
											}`}
										>
											{isEditing ? (
												<div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
													<input
														type="text"
														value={editTitle}
														onChange={(e) => setEditTitle(e.target.value)}
														className="flex-1 bg-[#0a0e1a] border border-teal-500 rounded-xl px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
														autoFocus
													/>
													<button
														type="button"
														onClick={(e) => handleSaveRename(conv.id, e)}
														className="text-emerald-400 p-1 rounded hover:bg-emerald-950/20 transition-colors"
													>
														<Check className="w-3.5 h-3.5" />
													</button>
													<button
														type="button"
														onClick={() => setEditingId(null)}
														className="text-slate-400 p-1 rounded hover:bg-[#252e4d] transition-colors"
													>
														<X className="w-3.5 h-3.5" />
													</button>
												</div>
											) : isDeleting ? (
												<div className="flex items-center justify-between w-full text-[11px] text-rose-400" onClick={(e) => e.stopPropagation()}>
													<span>Delete this debate?</span>
													<div className="flex gap-1.5">
														<button
															type="button"
															onClick={(e) => handleConfirmDelete(conv.id, e)}
															className="font-bold underline hover:text-rose-300"
														>
															Yes
														</button>
														<button
															type="button"
															onClick={() => setDeleteConfirmId(null)}
															className="text-slate-400 hover:text-white"
														>
															No
														</button>
													</div>
												</div>
											) : (
												<>
													<div className="flex-1 truncate pr-3">
														<div className="truncate font-medium">{conv.title}</div>
														<div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
															<Clock className="w-3 h-3 text-slate-500 shrink-0" />
															<span>{conv.messages.length} messages · {conv.mode}</span>
														</div>
													</div>

													<div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-200">
														<button
															type="button"
															onClick={(e) => handleStartRename(conv, e)}
															className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252e4d] transition-colors"
															title="Rename"
														>
															<Edit2 className="w-3 h-3" />
														</button>
														<button
															type="button"
															onClick={(e) => handleDeleteClick(conv.id, e)}
															className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#252e4d] transition-colors"
															title="Delete"
														>
															<Trash2 className="w-3 h-3" />
														</button>
													</div>
												</>
											)}
										</div>
									);
								})}
							</div>
						),
				)}

				{filtered.length === 0 && (
					<div className="p-6 text-center text-xs text-slate-400 space-y-3 animate-fadeIn">
						<div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#12182b]/50 border border-[#1e2842]/50 text-slate-500 mx-auto">
							<FileText className="w-6 h-6" />
						</div>
						<p className="font-medium text-slate-300">No debates found</p>
						<p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
							Start a new AI debate to begin multi-agent deliberation.
						</p>
						<button
							type="button"
							onClick={onNewConversation}
							className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-950/40 active:scale-95 transition-all"
						>
							<Plus className="w-3 h-3 fill-current" />
							<span>Create First Debate</span>
						</button>
					</div>
				)}
			</div>

			{/* Footer: Settings */}
			<div className="p-3 border-t border-[#1e2842]/60 flex items-center justify-between text-xs text-slate-400 bg-[#0f1424]/40 backdrop-blur-sm">
				<button
					type="button"
					onClick={openSettings}
					className="flex items-center gap-2 hover:text-slate-200 transition-colors"
				>
					<SettingsIcon className="w-4 h-4" />
					<span>System Settings</span>
				</button>
				<span className="font-mono text-[10px] text-slate-500">v0.1.0</span>
			</div>
		</aside>
	);
};
