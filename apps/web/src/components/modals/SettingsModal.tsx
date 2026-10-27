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
	ExternalLink,
	Copy,
	Check,
	RefreshCw,
} from "lucide-react";
import type { Conversation, HealthStatus } from "../../types";
import { detectMeterless } from "../../services/api";
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
	onRefreshHealth?: () => void;
}

type TabType = "general" | "audio" | "models" | "data" | "about";

const CONFIG_PROMPTS = [
	{
		id: "zetaris",
		title: "1. Configure Zetaris Lightning",
		description: "Connect a read-only Zetaris endpoint and verify the exact governance query.",
		prompt: `You are configuring Zetaris Lightning for the GovernMindz local app.

Official references:
- https://www.zetaris.com/
- https://kbase.zetaris.com/knowledge/zetaris-overview
- https://kbase.zetaris.com/knowledge/data-security-in-zetaris
- https://cloud.enterprise.zetaris.com/register

Goal: a working, read-only Zetaris connection for GovernMindz live mode.

1. Determine whether Zetaris Lightning is already reachable at ZETARIS_REST_URL (expected http://localhost:8888/api/v1.0). Do not guess credentials.
2. Help me collect ZETARIS_REST_URL, ZETARIS_ORG_ID, ZETARIS_API_KEY, ZETARIS_API_AUTH, ZETARIS_PORT, and ZETARIS_DATABASE.
3. Create or identify a read-only account/role. It must be able to SELECT and SHOW metadata only. Do not use an admin account.
4. Verify with read-only SQL: SHOW LIGHTNING DATABASES, then SHOW TABLES FROM SEC_DATA.
5. Write the final values into .env.local (never commit it) and run:
   curl -s http://127.0.0.1:8787/api/health
   Confirm zetaris.ok=true and missingCapabilities does not list ZETARIS_*.
6. If any step fails, show the exact HTTP status and error, check host/port/TLS, org id, API key, and whether the Zetaris service is running. Never fabricate data or claim a connection succeeded without a successful query.`,
	},
	{
		id: "meterless",
		title: "2. Configure Meterless Nightshift",
		description: "Start the local AI hotspot, add cloud provider keys in Nightshift, and connect GovernMindz.",
		prompt: `You are configuring Meterless Nightshift as the AI provider for GovernMindz.

Official references:
- https://meterless.ai/
- https://meterless.ai/how-it-works.html
- https://meterless.ai/cli.html
- https://meterless.ai/nightshift-getting-started.md

Important: Nightshift exposes one OpenAI-compatible endpoint (normally http://127.0.0.1:8088/v1) and a local bearer token. Cloud provider keys (OpenAI, Anthropic, Google, NVIDIA, OpenRouter) are entered by the human inside the Nightshift app. Client apps must not receive those provider keys. GovernMindz stores only the Nightshift URL and Nightshift token.

1. Install and start Nightshift for my OS. Wait until the endpoint answers.
2. Locate the runtime token without printing it:
   - Windows: %LOCALAPPDATA%\\ai.meterless.runtime\\proxy-token
   - DGX: /var/lib/meterless/ (token file 0600)
   - macOS M5+: ~/Library/Application Support/ai.meterless.runtime/
3. In the Nightshift cockpit, add any cloud provider keys I want. Confirm the models I want are enabled.
4. Set in .env.local:
   METERLESS_BASE_URL=http://127.0.0.1:8088/v1
   METERLESS_API_KEY=<Nightshift runtime token>
   METERLESS_MODEL=meterless/auto
   METERLESS_SEAT_MODEL=meterless/fast
5. Run:
   curl -s http://127.0.0.1:8787/api/models
   curl -s http://127.0.0.1:8787/api/health
   Confirm meterless.state=online, configured=true, and the cloud models I enabled appear in /api/models.
6. Send one real completion through GovernMindz or POST /v1/chat/completions. If unauthorized, refresh the token. Never print the token and never claim success without an online status and a real completion.`,
	},
	{
		id: "governmindz",
		title: "3. Verify GovernMindz end-to-end",
		description: "Run the full local setup and prove live mode uses real Zetaris and Nightshift data.",
		prompt: `You are the setup operator for the GovernMindz repository on this machine.

Goal: a working live-mode install with no demo or synthetic fallback.

1. Copy .env.example to .env.local if missing. Generate AUDIT_TRAIL_SECRET with 32 random bytes in hex.
2. Confirm Zetaris and Meterless values are present and valid using the two provider prompts.
3. Run:
   npm install
   npm run typecheck
   npm test
   npm run build
   npm start
4. Open http://127.0.0.1:8787. Switch to Live Mode only when /api/health reports:
   meterless.state=online
   zetaris.ok=true
   missingCapabilities=[]
5. Run one live query and verify:
   - the Zetaris result is real (isSynthetic=false, evidenceSource=live_zetaris),
   - the Supervisor message contains a /evidence/<conversationId> link,
   - the evidence page shows the exact SQL and rows and its SHA-256 matches the canonical JSON,
   - the audit chain verifies.
6. If any credential is missing or wrong, stop and report the exact failing check. Never substitute demo data in live mode, never fabricate a successful connection, and never report success without a real Zetaris query and a real Meterless completion.`,
	},
];

const PromptCard: React.FC<{ title: string; description: string; prompt: string; id: string }> = ({
	title,
	description,
	prompt,
	id,
}) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// clipboard permission denied: leave button unchanged
		}
	};

	return (
		<div className="p-4 rounded-xl bg-[#0a0e1a] border border-[#1e2842] space-y-2">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="font-semibold text-slate-100 text-xs">{title}</div>
					<div className="text-[11px] text-slate-400 mt-0.5">{description}</div>
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-semibold text-[11px] border border-teal-500/40 transition-colors"
					aria-label={`Copy prompt ${id}`}
				>
					{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
					{copied ? "Copied" : "Copy prompt"}
				</button>
			</div>
			<pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-[#070b14] border border-[#1e2842] p-2.5 text-[10.5px] leading-relaxed text-slate-300 font-mono">
				{prompt}
			</pre>
		</div>
	);
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
	isOpen,
	onClose,
	health,
	activeConversation,
	onClearAll,
	onReplayTour,
	onOpenCredentials,
	onRefreshHealth,
}) => {
	const [activeTab, setActiveTab] = useState<TabType>("general");
	const [defaultMode, setDefaultMode] = useState<"live" | "sample">("sample");
	const [autoScroll, setAutoScroll] = useState(true);
	const [detecting, setDetecting] = useState(false);
	const [detectMessage, setDetectMessage] = useState<string | null>(null);

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

	const handleDetectMeterless = async () => {
		setDetecting(true);
		setDetectMessage(null);
		try {
			const { ok, result } = await detectMeterless();
			if (result.state === "online") {
				setDetectMessage(
					`Nightshift found at ${result.baseUrl} · ${result.models ?? 0} models${result.persisted ? " · saved" : ""}`,
				);
				window.dispatchEvent(new Event("governmindz:models-refresh"));
				onRefreshHealth?.();
			} else if (result.state === "unauthorized") {
				setDetectMessage(
					`Nightshift found at ${result.baseUrl}, but the token was rejected. Open Configure Credentials and paste the current token.`,
				);
			} else if (!ok) {
				setDetectMessage(result.error || result.reason || "Nightshift auto-detection failed.");
			} else {
				setDetectMessage("Nightshift responded but no Meterless lane is available.");
			}
		} catch (err: any) {
			setDetectMessage(err?.message || "Nightshift auto-detection failed.");
		} finally {
			setDetecting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
			<div className="w-full max-w-2xl bg-[#0c101e] border border-[#1e2842] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
				{/* Header */}
				<div className="px-6 py-4 border-b border-[#1e2842] flex items-center justify-between bg-[#0f1424]">
					<div className="flex items-center gap-2.5">
						<img
							src="/governmindz-logo.png"
							alt="GovernMindz logo"
							className="h-8 w-8 rounded-full object-cover ring-1 ring-teal-400/40"
						/>
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
							{ id: "about", label: "About GovernMindz", icon: Info },
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
								<div className="flex items-center justify-between gap-2">
									<h4 className="font-bold text-sm text-slate-100">Inference & Data Providers</h4>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={handleDetectMeterless}
											disabled={detecting}
											className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18203a] hover:bg-[#252e4d] text-slate-200 font-semibold text-xs border border-[#2c385c] transition-colors disabled:opacity-60"
											title="Scan localhost for a running Nightshift endpoint"
										>
											<RefreshCw className={`w-3 h-3 ${detecting ? "animate-spin" : ""}`} />
											{detecting ? "Detecting…" : "Auto-detect Nightshift"}
										</button>
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
								</div>
								{detectMessage && (
									<div className="text-[11px] text-slate-300 rounded-lg border border-[#2c385c] bg-[#12182b] px-3 py-2">
										{detectMessage}
									</div>
								)}

								{/* Meterless status */}
								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 font-semibold text-slate-200">
											<Cpu className="w-4 h-4 text-sky-400" />
											<a
												href="https://meterless.ai/"
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 hover:text-sky-300 underline decoration-sky-500/40 underline-offset-2"
											>
												Meterless Model Runtime
												<ExternalLink className="w-3 h-3" />
											</a>
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
										OpenAI-compatible inference runtime. Nightshift is the single local gateway:
										cloud provider keys are entered inside Nightshift, and every model it exposes
										appears automatically in GovernMindz's model picker.
									</p>
									<p className="text-[10.5px] text-amber-300/90 leading-relaxed">
										Do not paste OpenAI, Anthropic, Google, or NVIDIA provider keys into GovernMindz.
										Add them in the Nightshift cockpit; GovernMindz only needs the Nightshift base URL
										and runtime token.
									</p>
								</div>

								{/* Zetaris status */}
								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 font-semibold text-slate-200">
											<Database className="w-4 h-4 text-emerald-400" />
											<a
												href="https://www.zetaris.com/"
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 hover:text-emerald-300 underline decoration-emerald-500/40 underline-offset-2"
											>
												Zetaris Lightning Federated Data
												<ExternalLink className="w-3 h-3" />
											</a>
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

								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3">
									<div>
										<div className="font-semibold text-slate-100 text-xs">
											Setup prompts for your local AI agent
										</div>
										<p className="text-[11px] text-slate-400 mt-1">
											Copy any prompt below into Claude Code, Cursor, Codex, or another local agent.
											Each prompt verifies real connectivity and refuses to invent credentials or data.
										</p>
									</div>
									{CONFIG_PROMPTS.map((item) => (
										<PromptCard
											key={item.id}
											id={item.id}
											title={item.title}
											description={item.description}
											prompt={item.prompt}
										/>
									))}
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
								<div className="flex items-center gap-3">
									<img
										src="/governmindz-logo.png"
										alt="GovernMindz logo"
										className="h-16 w-16 rounded-2xl object-cover ring-1 ring-amber-400/40 shadow-[0_0_24px_rgba(59,130,246,0.35)]"
									/>
									<div>
										<h4 className="font-display font-bold text-base text-slate-100">GovernMindz</h4>
										<p className="text-[11px] font-mono uppercase tracking-wider text-teal-300">
											Governed multi-agent deliberation
										</p>
									</div>
								</div>

								<p className="text-xs text-slate-300">
									GovernMindz is a local-first decision workspace for high-stakes data questions. Independent
									Data and Web research crews gather evidence in parallel, a role-separated council debates
									and challenges every claim, and a supervisor releases only deliverables that pass physical
									validation and a tamper-evident audit gate. Every Zetaris dataset used is captured as a
									verifiable evidence snapshot, so anyone can inspect the exact rows behind a decision.
								</p>

								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-1">
									<div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
										Creator
									</div>
									<div className="font-semibold text-slate-100">Andres Chavez Ramirez</div>
									<div className="text-[11px] text-slate-400">
										Solo creator — product vision, architecture, and engineering
									</div>
								</div>

								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3">
									<div className="text-[10px] font-mono uppercase tracking-wider text-teal-400 font-bold">
										Sponsors &amp; Technology Partners
									</div>
									<div className="grid gap-2 sm:grid-cols-3">
										<div className="rounded-lg bg-[#0a0e1a] border border-[#1e2842] px-3 py-2">
											<div className="font-semibold text-slate-100">Zetaris Lightning</div>
											<div className="text-[10px] text-slate-400">Federated evidence fabric</div>
										</div>
										<div className="rounded-lg bg-[#0a0e1a] border border-[#1e2842] px-3 py-2">
											<div className="font-semibold text-slate-100">Meterless</div>
											<div className="text-[10px] text-slate-400">Local inference runtime</div>
										</div>
										<div className="rounded-lg bg-[#0a0e1a] border border-[#1e2842] px-3 py-2">
											<div className="font-semibold text-slate-100">NVIDIA Nemotron</div>
											<div className="text-[10px] text-slate-400">Reasoning model</div>
										</div>
									</div>
								</div>

								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2 font-mono text-[11px]">
									<div className="text-slate-400">How a decision is produced:</div>
									<ul className="list-disc list-inside space-y-1 text-slate-300">
										<li>Parallel Data Crew + Web Crew evidence gathering</li>
										<li>Barrier-synchronized findings with provenance</li>
										<li>Adversarial debate: Hater, Fact Checker, Thinker, Synthesizer</li>
										<li>Validated PDF / PPTX / CSV / SVG deliverables</li>
										<li>HMAC-SHA256 audit ledger + verifiable Zetaris evidence snapshot</li>
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
