import React, { useState, useEffect } from "react";
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
	Volume2,
	VolumeX,
	Play,
	Sparkles,
} from "lucide-react";
import type { Conversation, HealthStatus } from "../../types";
import { ttsService, type AgentVoiceRegistryEntry } from "../../services/ttsService";
import { AgentAvatar } from "../common/AgentAvatar";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	health: HealthStatus | null;
	activeConversation: Conversation | null;
	onClearAll: () => void;
	onReplayTour?: () => void;
	onOpenCredentials?: () => void;
}

type TabType = "general" | "audio" | "models" | "data" | "about";

export const SettingsModal: React.FC<SettingsModalProps> = ({
	isOpen,
	onClose,
	health,
	activeConversation,
	onClearAll,
	onReplayTour,
	onOpenCredentials,
}) => {
	const [activeTab, setActiveTab] = useState<TabType>("general");
	const [defaultMode, setDefaultMode] = useState<"live" | "sample">("sample");
	const [autoScroll, setAutoScroll] = useState(true);

	// TTS state
	const [ttsEnabled, setTtsEnabled] = useState(ttsService.isMasterEnabled());
	const [ttsMuted, setTtsMuted] = useState(ttsService.isMuted());
	const [voiceRegistry, setVoiceRegistry] = useState<AgentVoiceRegistryEntry[]>([]);
	const [speakingSeat, setSpeakingSeat] = useState<string | null>(null);

	useEffect(() => {
		if (isOpen) {
			setVoiceRegistry(ttsService.getVoiceRegistry());
			setTtsEnabled(ttsService.isMasterEnabled());
			setTtsMuted(ttsService.isMuted());
		}
	}, [isOpen]);

	useEffect(() => {
		const unsub = ttsService.subscribe((isSpeaking, seatId) => {
			setSpeakingSeat(isSpeaking ? seatId || null : null);
		});
		return unsub;
	}, []);

	if (!isOpen) return null;

	const handleToggleMasterTts = (val: boolean) => {
		setTtsEnabled(val);
		ttsService.setTtsEnabled(val);
	};

	const handleToggleMute = (val: boolean) => {
		setTtsMuted(val);
		ttsService.setMuted(val);
	};

	const handlePreviewVoice = (seatId: string) => {
		ttsService.previewVoice(seatId);
	};

	const handleToggleAgentVoice = (seatId: string, currentVal: boolean) => {
		ttsService.updateVoiceRegistryEntry(seatId, { enabled: !currentVal });
		setVoiceRegistry(ttsService.getVoiceRegistry());
	};

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
							{ id: "audio", label: "Voice & Audio", icon: Volume2 },
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
										<div className="font-semibold text-slate-200">Interactive Product Tour</div>
										<div className="text-[11px] text-slate-400">
											Walk through GovernMindz multi-agent chat, live agent roster, and audit verification.
										</div>
									</div>
									{onReplayTour && (
										<button
											type="button"
											onClick={() => {
												onClose();
												onReplayTour();
											}}
											className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs border border-amber-500/40 transition-colors"
										>
											Replay UI Tour
										</button>
									)}
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

						{/* Voice & Audio Section */}
						{activeTab === "audio" && (
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<h4 className="font-bold text-sm text-slate-100">Voice & Audio Settings</h4>
									<span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-950/60 border border-teal-800 text-teal-300">
										Multi-Agent TTS Registry
									</span>
								</div>

								{/* Master Audio Controls */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div className="p-3.5 rounded-xl bg-[#12182b] border border-[#1e2842] flex items-center justify-between">
										<div>
											<div className="font-semibold text-slate-200 flex items-center gap-1.5">
												<Volume2 className="w-4 h-4 text-amber-400" />
												<span>Voice Playback</span>
											</div>
											<div className="text-[11px] text-slate-400">
												Enable text-to-speech for agents
											</div>
										</div>
										<input
											type="checkbox"
											checked={ttsEnabled}
											onChange={(e) => handleToggleMasterTts(e.target.checked)}
											className="w-4 h-4 accent-teal-500 rounded"
										/>
									</div>

									<div className="p-3.5 rounded-xl bg-[#12182b] border border-[#1e2842] flex items-center justify-between">
										<div>
											<div className="font-semibold text-slate-200 flex items-center gap-1.5">
												<VolumeX className="w-4 h-4 text-rose-400" />
												<span>Mute All Audio</span>
											</div>
											<div className="text-[11px] text-slate-400">
												Silences ongoing speech
											</div>
										</div>
										<input
											type="checkbox"
											checked={ttsMuted}
											onChange={(e) => handleToggleMute(e.target.checked)}
											className="w-4 h-4 accent-rose-500 rounded"
										/>
									</div>
								</div>

								{/* Agent Voice Registry Showcase */}
								<div className="space-y-3 pt-2">
									<div className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
										<Sparkles className="w-3.5 h-3.5 text-amber-400" />
										<span>Agent Coworker Voice Profiles & Previews:</span>
									</div>

									<div className="space-y-2.5">
										{voiceRegistry.map((agent) => {
											const isSpeaking = speakingSeat === agent.seatId;
											return (
												<div
													key={agent.seatId}
													className={`p-3 rounded-xl bg-[#12182b] border transition-all flex items-center justify-between gap-3 ${
														isSpeaking
															? "border-amber-400/80 ring-1 ring-amber-400/40 bg-[#18203a]"
															: "border-[#1e2842] hover:border-[#2c385c]"
													}`}
												>
													<div className="flex items-center gap-3 min-w-0">
														<AgentAvatar
															seatId={agent.seatId}
															avatarId={agent.avatarId}
															humanName={agent.displayName}
															size="sm"
															showStatusPip={true}
															status={isSpeaking ? "analyzing" : "completed"}
														/>
														<div className="min-w-0 truncate">
															<div className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
																<span>{agent.displayName}</span>
																<span className="text-[11px] text-slate-400 font-normal">
																	· {agent.role}
																</span>
															</div>
															<div className="text-[10.5px] text-slate-400 truncate font-sans">
																{agent.personality}
															</div>
															<div className="flex flex-wrap items-center gap-2.5 mt-2 text-[10px] text-slate-300">
																<label className="flex items-center gap-1.5 bg-[#18203a] px-2 py-0.5 rounded border border-[#263254]">
																	<span className="text-slate-400 font-mono text-[9px]">Pitch:</span>
																	<input
																		type="range"
																		min="0.5"
																		max="1.5"
																		step="0.05"
																		value={agent.pitch}
																		onChange={(e) => {
																			ttsService.updateVoiceRegistryEntry(agent.seatId, { pitch: parseFloat(e.target.value) });
																			setVoiceRegistry(ttsService.getVoiceRegistry());
																		}}
																		className="w-14 h-1 accent-teal-400 bg-slate-700 rounded cursor-pointer"
																	/>
																	<span className="font-mono text-teal-300 w-7 text-right text-[9px]">{agent.pitch.toFixed(2)}x</span>
																</label>
																<label className="flex items-center gap-1.5 bg-[#18203a] px-2 py-0.5 rounded border border-[#263254]">
																	<span className="text-slate-400 font-mono text-[9px]">Speed:</span>
																	<input
																		type="range"
																		min="0.75"
																		max="1.35"
																		step="0.05"
																		value={agent.rate}
																		onChange={(e) => {
																			ttsService.updateVoiceRegistryEntry(agent.seatId, { rate: parseFloat(e.target.value) });
																			setVoiceRegistry(ttsService.getVoiceRegistry());
																		}}
																		className="w-14 h-1 accent-amber-400 bg-slate-700 rounded cursor-pointer"
																	/>
																	<span className="font-mono text-amber-300 w-7 text-right text-[9px]">{agent.rate.toFixed(2)}x</span>
																</label>
																<span className="bg-[#18203a] px-1.5 py-0.5 rounded border border-[#263254] font-mono text-[9px] text-slate-400">
																	{agent.lang}
																</span>
															</div>
														</div>
													</div>

													<div className="flex items-center gap-2 shrink-0">
														<button
															type="button"
															onClick={() => handlePreviewVoice(agent.seatId)}
															className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-semibold text-xs border border-teal-500/40 transition-colors"
															title={`Preview voice of ${agent.displayName}`}
														>
															<Play className="w-3 h-3 fill-current" />
															<span>Preview</span>
														</button>
														<input
															type="checkbox"
															checked={agent.enabled}
															onChange={() => handleToggleAgentVoice(agent.seatId, agent.enabled)}
															className="w-4 h-4 accent-teal-500 rounded"
															title="Enable/disable voice for this agent"
														/>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							</div>
						)}

						{activeTab === "models" && (
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<h4 className="font-bold text-sm text-slate-100">Inference & Data Providers</h4>
									{onOpenCredentials && (
										<button
											type="button"
											onClick={() => {
												onClose();
												onOpenCredentials();
											}}
											className="px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-semibold text-xs border border-teal-500/40 transition-colors"
										>
											Configure Credentials
										</button>
									)}
								</div>

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
