import React, { useState } from "react";
import {
	X,
	Settings as SettingsIcon,
	Cpu,
	Database,
	ShieldCheck,
	Info,
	Download,
	Trash2,
	Sliders,
} from "lucide-react";
import type { Conversation, HealthStatus } from "../../types";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	health: HealthStatus | null;
	activeConversation: Conversation | null;
	onClearAll: () => void;
}

type TabType = "general" | "models" | "data" | "about";

export const SettingsModal: React.FC<SettingsModalProps> = ({
	isOpen,
	onClose,
	health,
	activeConversation,
	onClearAll,
}) => {
	const [activeTab, setActiveTab] = useState<TabType>("general");
	const [defaultMode, setDefaultMode] = useState<"live" | "sample">("sample");
	const [autoScroll, setAutoScroll] = useState(true);

	if (!isOpen) return null;

	const handleExportJson = () => {
		if (!activeConversation) return;
		const blob = new Blob([JSON.stringify(activeConversation, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `governmindz-debate-${activeConversation.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
			<div className="w-full max-w-2xl bg-[#0c101e] border border-[#1e2842] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
				{/* Header */}
				<div className="px-6 py-4 border-b border-[#1e2842] flex items-center justify-between bg-[#0f1424]">
					<div className="flex items-center gap-2.5">
						<SettingsIcon className="w-5 h-5 text-teal-400" />
						<h3 className="font-display font-bold text-lg text-slate-100">
							GovernMindz System Settings
						</h3>
					</div>
					<button
						type="button"
						aria-label="Close settings"
						onClick={onClose}
						className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#18203a] transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Body: Tabs sidebar + Content */}
				<div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
					{/* Tab Navigation */}
					<div className="w-full sm:w-48 bg-[#0a0e1a] border-r border-[#1e2842] p-3 space-y-1 shrink-0">
						{[
							{ id: "general", label: "General", icon: Sliders },
							{ id: "models", label: "Models & Providers", icon: Cpu },
							{ id: "data", label: "Privacy & Data", icon: ShieldCheck },
							{ id: "about", label: "About & Architecture", icon: Info },
						].map((tab) => {
							const Icon = tab.icon;
							const isActive = activeTab === tab.id;
							return (
								<button
									type="button"
									key={tab.id}
									onClick={() => setActiveTab(tab.id as TabType)}
									className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
										isActive
											? "bg-[#18203a] text-teal-300 border border-[#2c385c]"
											: "text-slate-400 hover:text-slate-200 hover:bg-[#12182b]"
									}`}
								>
									<Icon className="w-4 h-4" />
									<span>{tab.label}</span>
								</button>
							);
						})}
					</div>

					{/* Tab Content */}
					<div className="flex-1 p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
						{activeTab === "general" && (
							<div className="space-y-4">
								<h4 className="font-bold text-sm text-slate-100 mb-2">General Preferences</h4>

								<div className="flex items-center justify-between p-3 rounded-xl bg-[#12182b] border border-[#1e2842]">
									<div>
										<div className="font-semibold text-slate-200">Default Execution Mode</div>
										<div className="text-[11px] text-slate-400">
											Choose between deterministic offline sample mode or live Zetaris federated SQL.
										</div>
									</div>
									<select
										value={defaultMode}
										onChange={(e) => setDefaultMode(e.target.value as any)}
										className="bg-[#0a0e1a] border border-[#1e2842] rounded-lg px-2.5 py-1 text-xs text-slate-200"
									>
										<option value="sample">Sample (Deterministic)</option>
										<option value="live">Live (Zetaris + Meterless)</option>
									</select>
								</div>

								<div className="flex items-center justify-between p-3 rounded-xl bg-[#12182b] border border-[#1e2842]">
									<div>
										<div className="font-semibold text-slate-200">Automatic Smooth Scroll</div>
										<div className="text-[11px] text-slate-400">
											Keep conversation pinned to latest message while agents are actively debating.
										</div>
									</div>
									<input
										type="checkbox"
										checked={autoScroll}
										onChange={(e) => setAutoScroll(e.target.checked)}
										className="w-4 h-4 accent-teal-500 rounded"
									/>
								</div>
							</div>
						)}

						{activeTab === "models" && (
							<div className="space-y-4">
								<h4 className="font-bold text-sm text-slate-100 mb-2">Inference & Data Providers</h4>

								{/* Meterless status */}
								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 font-semibold text-slate-200">
											<Cpu className="w-4 h-4 text-sky-400" />
											<span>Meterless Model Runtime</span>
										</div>
										<span
											className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
												health?.meterless?.state === "online"
													? "bg-emerald-950 text-emerald-300 border border-emerald-800"
													: "bg-rose-950 text-rose-300 border border-rose-800"
											}`}
										>
											{health?.meterless?.state || "offline"}
										</span>
									</div>
									<p className="text-[11px] text-slate-400">
										OpenAI-compatible inference runtime using NVIDIA Nemotron
										(`nvidia/nemotron-3.5-lightning-30b-a3b`).
									</p>
								</div>

								{/* Zetaris status */}
								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 font-semibold text-slate-200">
											<Database className="w-4 h-4 text-emerald-400" />
											<span>Zetaris Lightning Federated Data</span>
										</div>
										<span
											className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
												health?.zetaris?.ok
													? "bg-emerald-950 text-emerald-300 border border-emerald-800"
													: "bg-rose-950 text-rose-300 border border-rose-800"
											}`}
										>
											{health?.zetaris?.ok ? "connected" : "disconnected"}
										</span>
									</div>
									<p className="text-[11px] text-slate-400">
										Semantic federated database integration guarded by read-only SQL assertions and
										policy gating.
									</p>
								</div>
							</div>
						)}

						{activeTab === "data" && (
							<div className="space-y-4">
								<h4 className="font-bold text-sm text-slate-100 mb-2">Storage & Cryptographic Integrity</h4>

								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3">
									<div className="font-semibold text-slate-200">Durable Server Persistence</div>
									<p className="text-[11px] text-slate-400 leading-relaxed">
										Conversation history, messages, and cryptographic audit records are durably saved
										server-side via SQLite (`audit.db` & `data/conversations.db`).
									</p>

									{activeConversation && (
										<button
											type="button"
											onClick={handleExportJson}
											className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#18203a] hover:bg-[#252e4d] text-teal-300 font-semibold text-xs border border-[#2c385c] transition-colors"
										>
											<Download className="w-3.5 h-3.5" />
											<span>Export Active Debate to JSON</span>
										</button>
									)}
								</div>

								<div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/30 space-y-2">
									<div className="font-semibold text-rose-300">Reset Local State</div>
									<p className="text-[11px] text-slate-400">
										Clear cached active runs and start fresh.
									</p>
									<button
										type="button"
										onClick={onClearAll}
										className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-700 text-xs font-semibold transition-colors"
									>
										<Trash2 className="w-3.5 h-3.5" />
										<span>Clear Active Session</span>
									</button>
								</div>
							</div>
						)}

						{activeTab === "about" && (
							<div className="space-y-4 leading-relaxed">
								<h4 className="font-bold text-sm text-slate-100 mb-2">GovernMindz Mission Control</h4>

								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2">
									<div className="font-semibold text-amber-300">Open Agent Hackathon 2026</div>
									<div className="text-[11px] text-slate-400">
										Track 02: <b>The Agent That Can Explain Why</b>
									</div>
									<p className="text-xs text-slate-300">
										GovernMindz combines role-separated multi-agent deliberation with Zetaris
										Lightning federated query verification, Meterless local runtime inference, and
										genesis-anchored HMAC-SHA256 audit chaining.
									</p>
								</div>

								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2 font-mono text-[11px]">
									<div className="text-slate-400">Architecture Components:</div>
									<ul className="list-disc list-inside space-y-1 text-slate-300">
										<li>12-State Deterministic WorkflowStateMachine</li>
										<li>InquiryScorer & ContextAgent Complexity Analysis</li>
										<li>FactChecker & CloudArchitect Deliberative Seating</li>
										<li>RivalChallenger & ThinkerAgent Autonomous Interventions</li>
										<li>Synthesizer Consensus Arbiter</li>
										<li>Tamper-Evident SHA-256 Hash Chain Ledger</li>
									</ul>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
