import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Header } from "./components/layout/Header";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { GroupConversation } from "./components/chat/GroupConversation";
import { MessageComposer } from "./components/chat/MessageComposer";
import { DEMO_SCENARIOS } from "./services/demoScenarios";
const ExecutionExplorer = React.lazy(() => import("./components/explorer/ExecutionExplorer"));
const TrustEvidenceView = React.lazy(() => import("./components/evidence/TrustEvidenceView"));
import { AgentDetailDrawer } from "./components/modals/AgentDetailDrawer";
import { SettingsModal } from "./components/modals/SettingsModal";
import { TourGuide } from "./components/common/TourGuide";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { LiveModeConfirmModal } from "./components/modals/LiveModeConfirmModal";
import { LiveConfigModal } from "./components/modals/LiveConfigModal";
import {
	fetchHealth,
	fetchScenarios,
	fetchConversations,
	saveConversation,
	renameConversation,
	deleteConversation,
	startRun,
	subscribeRunEvents,
	fetchPreferences,
	savePreferences,
	submitFeedback,
} from "./services/api";
import { getAgentProfile } from "./services/agentRegistry";
import { assignHumanCouncil, generateTaskDelegationAnnouncement } from "./services/nameRotation";
import { ttsService } from "./services/ttsService";
import { notificationService } from "./services/notificationService";
import type { Notification } from "./services/notificationService";
import { CrewBarrierManager } from "./services/crewBarrier";
import { evaluateWebConversation } from "./services/conversationEvaluation";
import { AgentArrivalManager } from "./services/agentArrivalManager";
import { SynchronizedExitCoordinator } from "./services/synchronizedExitCoordinator";
import { DemoPresentationQueue, type DemoQueueState } from "./services/demoPresentationQueue";
import {
	appendWorkflowTimelineEvent,
	buildParticipatingAgentRoster,
	extractParticipatingSeatIds,
	filterAssignmentsToParticipants,
	isRosterEligibleSeat,
	resolveActivityPhase,
	upsertConversationMessage,
	type ActiveAgentActivity,
} from "./services/conversationSync";
import type { CrewRound } from "./types/crew";
import type {
	ActiveTab,
	ChatMessage,
	Conversation,
	HealthStatus,
	ScenarioItem,
	AgentProfile,
} from "./types";

function getParticipatingAgentProfiles(conv: Conversation | null): AgentProfile[] {
	if (!conv || !conv.messages || conv.messages.length === 0) return [];
	return buildParticipatingAgentRoster(conv, conv.status === "completed");
}

const DEMO_HISTORY_KEY = "governmindz_demo_history_v1";

function demoConversationId(scenarioFile: string): string {
	const scenarioId = scenarioFile.replace(/\.json$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
	return `demo_${scenarioId}`;
}

function sanitizeHistoricalConversation(entry: Conversation): Conversation {
	const participatingIds = extractParticipatingSeatIds(entry);
	return {
		...entry,
		agentAssignments:
			participatingIds.length > 0
				? filterAssignmentsToParticipants(entry.agentAssignments, participatingIds)
				: entry.agentAssignments,
	};
}

function loadDemoHistory(): Conversation[] {
	try {
		const raw = localStorage.getItem(DEMO_HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const byScenario = new Map<string, Conversation>();
		for (const entry of parsed as Conversation[]) {
			if (!entry || typeof entry !== "object" || entry.mode === "live") continue;
			if (!entry.id?.startsWith("demo_") || entry.id.startsWith("demo_draft_")) continue;
			const key = entry.scenarioId || entry.id;
			const existing = byScenario.get(key);
			if (!existing || (entry.updatedAt || 0) > (existing.updatedAt || 0)) {
				byScenario.set(key, sanitizeHistoricalConversation({ ...entry, mode: "sample" }));
			}
		}
		return Array.from(byScenario.values()).sort((a, b) => b.updatedAt - a.updatedAt);
	} catch {
		return [];
	}
}

function writeDemoHistory(list: Conversation[]): void {
	try {
		const byScenario = new Map<string, Conversation>();
		for (const entry of list) {
			if (!entry || entry.mode === "live") continue;
			if (!entry.id?.startsWith("demo_") || entry.id.startsWith("demo_draft_")) continue;
			const key = entry.scenarioId || entry.id;
			const existing = byScenario.get(key);
			if (!existing || (entry.updatedAt || 0) > (existing.updatedAt || 0)) {
				byScenario.set(key, sanitizeHistoricalConversation(entry));
			}
		}
		const deduped = Array.from(byScenario.values()).sort((a, b) => b.updatedAt - a.updatedAt);
		localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(deduped));
	} catch {
		// localStorage unavailable: demo history stays in memory only
	}
}

function upsertDemoHistory(conv: Conversation): void {
	if (!conv.scenarioId || conv.mode === "live" || conv.id.startsWith("demo_draft_")) return;
	const list = loadDemoHistory().filter((c) => (c.scenarioId || c.id) !== conv.scenarioId);
	writeDemoHistory([conv, ...list]);
}

function removeDemoHistory(conv: Conversation): void {
	const list = loadDemoHistory().filter((c) => (c.scenarioId || c.id) !== (conv.scenarioId || conv.id));
	writeDemoHistory(list);
}

function createDraftConversation(mode: "live" | "sample"): Conversation {
	const councilAssignments = assignHumanCouncil();
	return {
		id: mode === "live" ? `conv_${Date.now()}` : `demo_draft_${Date.now()}`,
		title: mode === "live" ? `AI Debate #${Date.now().toString().slice(-4)}` : "Choose a demo scenario",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		topic: "",
		mode,
		scenarioId: "",
		messages: [],
		auditEvents: [],
		status: "idle",
		workflowEvents: [],
		agentAssignments: councilAssignments,
	};
}

export const App: React.FC = () => {
	const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
	const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
	const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
	const [settingsModalOpen, setSettingsModalOpen] = useState(false);
	const [selectedAgentForDrawer, setSelectedAgentForDrawer] = useState<AgentProfile | null>(null);

	const [health, setHealth] = useState<HealthStatus | null>(null);
	const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
	const [selectedScenario, setSelectedScenario] = useState<string>("01-fragmented-intelligence.json");
	const [mode, setMode] = useState<"live" | "sample">("sample");
	const [tourOpen, setTourOpen] = useState(false);
	const [liveConfirmModalOpen, setLiveConfirmModalOpen] = useState(false);
	const [liveConfigModalOpen, setLiveConfigModalOpen] = useState(false);

	const initialDraftRef = useRef<Conversation>(createDraftConversation("sample"));
	const [conversations, setConversations] = useState<Conversation[]>(() => [initialDraftRef.current]);
	const [activeId, setActiveId] = useState<string | null>(() => initialDraftRef.current.id);
	const activeIdRef = useRef<string | null>(initialDraftRef.current.id);
	const setActiveConversationId = useCallback((id: string | null) => {
		activeIdRef.current = id;
		setActiveId(id);
	}, []);
	const [isBusy, setIsBusy] = useState(false);
	const [activeAgentThinking, setActiveAgentThinking] = useState<string | null>(null);
	const [activeAgentActivity, setActiveAgentActivity] = useState<ActiveAgentActivity | null>(null);
	const [activeCrewRound, setActiveCrewRound] = useState<CrewRound | null>(null);
	const [isCrewClosing, setIsCrewClosing] = useState(false);
	const [toastMsg, setToastMsg] = useState<string | null>(null);

	// Track active SSE subscription so session reset/switch cleanly aborts stale streams
	const activeStreamUnsubRef = useRef<(() => void) | null>(null);
	const activeStreamConversationIdRef = useRef<string | null>(null);

	// Non-blocking holding message state & timer
	const [holdingMessage, setHoldingMessage] = useState<string | null>(null);
	const holdingTimerRef = useRef<any>(null);

	// Demo presentation queue state & controller
	const demoQueueRef = useRef<DemoPresentationQueue | null>(null);
	const [demoQueueState, setDemoQueueState] = useState<DemoQueueState>("idle");

	// Parallel crew lifecycle timers
	const barrierReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [exitCoordinator] = useState(
		() =>
			new SynchronizedExitCoordinator({
				isVoicePlaying: () => ttsService.isPlaying(),
				isPresentationPlaying: () => demoQueueRef.current?.getState() === "playing",
				onStartClosing: () => setIsCrewClosing(true),
				onFinalizeExit: () => {
					if (barrierReleaseTimerRef.current) {
						clearTimeout(barrierReleaseTimerRef.current);
						barrierReleaseTimerRef.current = null;
					}
					setIsCrewClosing(false);
					setActiveCrewRound(null);
				},
			}),
	);

	// Agent roster state
	const [agentRoster, setAgentRoster] = useState<AgentProfile[]>([]);
	const [arrivalManager] = useState(() => new AgentArrivalManager({}, (roster) => setAgentRoster(roster)));
	const arrivalConversationRef = useRef<string | null>(null);

	const cleanupActiveStream = useCallback(() => {
		if (activeStreamUnsubRef.current) {
			activeStreamUnsubRef.current();
			activeStreamUnsubRef.current = null;
		}
		activeStreamConversationIdRef.current = null;
		if (holdingTimerRef.current) {
			clearTimeout(holdingTimerRef.current);
			holdingTimerRef.current = null;
		}
		setHoldingMessage(null);
		setActiveAgentThinking(null);
		setActiveAgentActivity(null);
	}, []);

	useEffect(() => {
		return () => {
			cleanupActiveStream();
			arrivalManager.clearTimers();
			exitCoordinator.destroy();
		};
	}, [arrivalManager, exitCoordinator, cleanupActiveStream]);

	// Confidence chart points
	const [chartData, setChartData] = useState<Record<string, Array<{ round: number; conf: number }>>>({
		FactChecker: [],
		CloudArchitect: [],
		Synthesizer: [],
	});

	const showToast = useCallback((msg: string) => {
		setToastMsg(msg);
		setTimeout(() => setToastMsg(null), 3500);
	}, []);

	const pushNotification = useCallback((n: Omit<Notification, "id" | "timestamp" | "read">) => {
		if (!notificationService.shouldNotify(n.type)) return;
		notificationService.add(n);
	}, []);

	// Live conversations persist on the server. Demo conversations are local-only
	// and keep exactly one canonical history entry per demo example.
	const persistConversation = useCallback((conv: Conversation) => {
		if (conv.mode === "live") {
			void saveConversation(conv);
			return;
		}
		upsertDemoHistory(conv);
	}, []);

	// Soft deadline periodic check for active research crews
	useEffect(() => {
		if (!activeCrewRound || activeCrewRound.barrierReleased) return;
		const timer = setInterval(() => {
			setActiveCrewRound((prev) => {
				if (!prev || prev.barrierReleased) return prev;
				return CrewBarrierManager.checkSoftDeadlines(prev);
			});
		}, 1000);
		return () => clearInterval(timer);
	}, [activeCrewRound]);

	// Barrier Release & Combined Summary Posting
	const triggerBarrierRelease = useCallback(
		(round: CrewRound) => {
			const conversationId = activeIdRef.current;
			if (!conversationId || round.barrierReleased) return;

			try {
				const summaryResult = CrewBarrierManager.generateCombinedSummary(round);
				const summaryMsg: ChatMessage = {
					id: `msg_crew_summary_${round.roundId}`,
					fromSeat: "Supervisor",
					type: "summary",
					content: summaryResult.summaryText,
					timestamp: Date.now(),
				};

				setConversations((prev) => {
					const curr = prev.find((c) => c.id === conversationId);
					if (!curr) return prev;
					const { messages: nextMessages, isDuplicate } = upsertConversationMessage(
						curr.messages,
						summaryMsg,
					);
					if (isDuplicate) return prev;

					// Supervisor joined the conversation by posting the combined crew summary
					arrivalManager.activateAgent(
						"Supervisor",
						curr.agentAssignments?.Supervisor,
						"Coordinate parallel research crews and validate deliverable readiness.",
						curr.id,
					);
					arrivalManager.updateWorkflowStatus("Supervisor", "analyzing", undefined, undefined, curr.id);

					const updated = {
						...curr,
						messages: nextMessages,
						updatedAt: Date.now(),
					};
					persistConversation(updated);
					return prev.map((c) => (c.id === conversationId ? updated : c));
				});

				setActiveCrewRound((curr) => {
					if (!curr) return null;
					return CrewBarrierManager.markSummaryPosted(curr, summaryResult.summaryText);
				});
			} catch (err: any) {
				console.error("Barrier summary posting error:", err);
				setActiveCrewRound((curr) => {
					if (!curr) return null;
					return CrewBarrierManager.markSummaryFailed(
						curr,
						err?.message || "Failed to post crew summary",
					);
				});
				showToast("Failed to post combined crew summary. Crew state preserved for retry.");
			}
		},
		[arrivalManager, showToast, persistConversation],
	);

	// Active conversation lookup
	const activeConv = useMemo(() => {
		return conversations.find((c) => c.id === activeId) || null;
	}, [conversations, activeId]);
	const activeEvaluation = activeConv ? evaluateWebConversation(activeConv) : null;

	// Load initial health and scenarios
	const loadInitData = useCallback(async () => {
		// Fetch health asynchronously so slow external health checks never block UI initialization
		void fetchHealth()
			.then((h) => setHealth(h))
			.catch((e) => console.warn("Health check error:", e));

		try {
			const sc = await fetchScenarios();
			setScenarios(sc);
			if (sc.length > 0) {
				setSelectedScenario(sc[0].file);
			}
		} catch (e) {
			console.warn("Scenario load error:", e);
		}

		let preferredMode: "live" | "sample" = "sample";
		try {
			const prefs = await fetchPreferences();
			const localPref = localStorage.getItem("governmindz_launch_preference");
			const savedPref = localPref || prefs.futureLaunchPreference || "demo";
			preferredMode = savedPref === "live" ? "live" : "sample";
			setMode(preferredMode);

			const localTour = localStorage.getItem("governmindz_tour_completed");
			const tourDone = localTour !== null ? localTour === "true" : prefs.tourCompleted;
			if (!tourDone) {
				setTourOpen(true);
			}
		} catch (e) {
			console.warn("Preferences load error:", e);
			preferredMode =
				localStorage.getItem("governmindz_launch_preference") === "live" ||
				localStorage.getItem("governmindz_mode_preference") === "live"
					? "live"
					: "sample";
			setMode(preferredMode);
		}

		try {
			const serverConvs = ((await fetchConversations()) || [])
				.filter((c) => c.mode === "live")
				.map(sanitizeHistoricalConversation);
			const demoConvs = loadDemoHistory();
			let combined: Conversation[] = [...serverConvs, ...demoConvs].sort(
				(a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
			);

			let active: Conversation | null = null;
			if (preferredMode === "live") {
				active = combined.find((c) => c.mode === "live") || null;
				if (!active) {
					const draft = createDraftConversation("live");
					combined = [draft, ...combined];
					active = draft;
					saveConversation(draft);
				}
			} else {
				active =
					combined.find((c) => c.mode !== "live" && !c.id.startsWith("demo_draft_")) || null;
				if (!active) {
					const draft = createDraftConversation("sample");
					combined = [draft, ...combined];
					active = draft;
				}
			}

			setConversations(combined);
			setActiveConversationId(active.id);
		} catch (e) {
			console.warn("Conversation load error:", e);
			const draft = createDraftConversation(preferredMode);
			setConversations([draft]);
			setActiveConversationId(draft.id);
		}
	}, [setActiveConversationId]);

	useEffect(() => {
		loadInitData();
	}, [loadInitData]);

	// Synchronize the visible roster with the active conversation's existing participants.
	useEffect(() => {
		const conversationId = activeConv?.id ?? null;
		if (arrivalConversationRef.current === conversationId) return;
		arrivalConversationRef.current = conversationId;
		arrivalManager.setConversation(conversationId, getParticipatingAgentProfiles(activeConv));
	}, [activeConv, arrivalManager]);

	// Refresh Health
	const handleRefreshHealth = async () => {
		try {
			setIsBusy(true);
			const h = await fetchHealth();
			setHealth(h);
			window.dispatchEvent(new Event("governmindz:models-refresh"));
			showToast(`Meterless: ${h.meterless?.state || "offline"} · Zetaris: ${h.zetaris?.ok ? "connected" : "disconnected"}`);
		} catch {
			showToast("Connectivity check failed");
		} finally {
			setIsBusy(false);
		}
	};

	// Switch the active conversation when the execution mode changes so demo
	// and live histories never share the same chat pane.
	const activateModeConversation = (nextMode: "live" | "sample") => {
		const current = conversations.find((c) => c.id === activeIdRef.current);
		if (current && (nextMode === "live") === (current.mode === "live")) return;
		const candidate = conversations.find((c) =>
			nextMode === "live"
				? c.mode === "live"
				: c.mode !== "live" && !c.id.startsWith("demo_draft_"),
		);
		if (candidate) {
			setActiveConversationId(candidate.id);
			return;
		}
		const draft = createDraftConversation(nextMode);
		setConversations((prev) => [draft, ...prev]);
		setActiveConversationId(draft.id);
		if (nextMode === "live") saveConversation(draft);
	};

	// Toggle execution mode
	const handleToggleMode = () => {
		if (isBusy) {
			showToast("Wait for the current run to finish before switching modes.");
			return;
		}
		cleanupActiveStream();
		demoQueueRef.current?.reset();
		exitCoordinator.forceExit();
		if (mode === "live") {
			setMode("sample");
			activateModeConversation("sample");
			showToast("Switched to Demo Mode (Keyless Simulation)");
			savePreferences({ launchMode: "demo" });
			localStorage.setItem("governmindz_mode_preference", "demo");
		} else {
			setLiveConfirmModalOpen(true);
		}
	};

	// Confirm Live Mode transition
	const handleConfirmLiveMode = (futureLaunchPref: "demo" | "live") => {
		if (isBusy) {
			showToast("Wait for the current run to finish before switching modes.");
			setLiveConfirmModalOpen(false);
			return;
		}
		cleanupActiveStream();
		demoQueueRef.current?.reset();
		setMode("live");
		activateModeConversation("live");
		setLiveConfirmModalOpen(false);
		localStorage.setItem("governmindz_mode_preference", "live");
		localStorage.setItem("governmindz_launch_preference", futureLaunchPref);
		savePreferences({ launchMode: "live", futureLaunchPreference: futureLaunchPref });

		const isZetarisConfigured = Boolean(health?.zetaris?.configured || health?.zetaris?.ok);
		const isMeterlessConfigured = Boolean(health?.meterless?.configured || health?.meterless?.state === "online");
		if (!isZetarisConfigured || !isMeterlessConfigured) {
			showToast("Live mode enabled. Real credentials required for queries.");
			setLiveConfigModalOpen(true);
		} else {
			showToast("Switched to Live Mode");
		}
	};

	// Start Demo scenario directly. Each demo example owns exactly one history
	// entry; replaying it clears the previous chat and starts a fresh run.
	const handleStartDemoScenario = async (scenarioFile: string, question: string) => {
		if (isBusy) {
			showToast("A demo is already running. Wait for it to finish or press Start Over.");
			return;
		}

		cleanupActiveStream();
		exitCoordinator.forceExit();
		demoQueueRef.current?.reset();
		setSelectedScenario(scenarioFile);

		const scenarioId = scenarioFile.replace(/\.json$/, "");
		const matchedScenario = DEMO_SCENARIOS.find((s) => s.file === scenarioFile);
		const demoId = demoConversationId(scenarioFile);
		const demoConv: Conversation = {
			id: demoId,
			title: matchedScenario ? matchedScenario.title : `Demo: ${scenarioId}`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			topic: question,
			mode: "sample",
			scenarioId,
			messages: [],
			auditEvents: [],
			status: "idle",
			workflowEvents: [],
			agentAssignments: assignHumanCouncil(),
		};

		setConversations((prev) => [
			demoConv,
			...prev.filter((c) => c.id !== demoId && !c.id.startsWith("demo_draft_")),
		]);
		setActiveConversationId(demoId);
		arrivalConversationRef.current = demoId;
		arrivalManager.setConversation(demoId, []);
		upsertDemoHistory(demoConv);
		setChartData({ FactChecker: [], CloudArchitect: [], Synthesizer: [] });
		setActiveCrewRound(null);
		setIsCrewClosing(false);
		setActiveTab("chat");

		await handleSendMessageWithConv(demoConv, question, scenarioFile);
	};

	// Start Over in Demo mode: begin a blank local draft; history entries stay intact.
	const handleStartOver = () => {
		cleanupActiveStream();
		exitCoordinator.forceExit();
		demoQueueRef.current?.reset();
		setIsBusy(false);
		const draft = createDraftConversation("sample");
		setConversations((prev) => [draft, ...prev.filter((c) => !c.id.startsWith("demo_draft_"))]);
		setActiveConversationId(draft.id);
		arrivalConversationRef.current = draft.id;
		arrivalManager.setConversation(draft.id, []);
		setChartData({ FactChecker: [], CloudArchitect: [], Synthesizer: [] });
		setActiveCrewRound(null);
		setIsCrewClosing(false);
		showToast("Demo restarted. Choose a scenario to begin.");
	};

	// Jump from a completed answer to the interactive Zetaris evidence explorer.
	const handleExploreZetaris = useCallback(() => {
		setActiveTab("evidence");
		setTimeout(() => {
			document.getElementById("tour-zetaris")?.scrollIntoView({ behavior: "smooth", block: "start" });
		}, 80);
	}, []);

	// Finish Tour
	const tourAutoStartedRef = useRef(false);
	const handleFinishTour = useCallback(() => {
		setTourOpen(false);
		tourAutoStartedRef.current = false;
		setSettingsModalOpen(false);
		setLiveConfigModalOpen(false);
		setSelectedAgentForDrawer(null);
		setActiveTab("chat");
		window.dispatchEvent(new CustomEvent("governmindz:tour-export-menu", { detail: { open: false } }));
		window.dispatchEvent(
			new CustomEvent("governmindz:tour-composer-state", {
				detail: { expand: null, openPlus: false, openSearch: false, openModel: false },
			}),
		);
		localStorage.setItem("governmindz_tour_completed", "true");
		savePreferences({ tourCompleted: true });
		showToast("Tour completed! Enjoy exploring GovernMindz.");
	}, [showToast]);

	// Orchestrate interactive platform state across the 10-step Guided Product Tour
	const handleTourStepChange = useCallback(
		(stepId: string) => {
			window.dispatchEvent(new CustomEvent("governmindz:tour-export-menu", { detail: { open: false } }));
			window.dispatchEvent(
				new CustomEvent("governmindz:tour-composer-state", {
					detail: { expand: null, openPlus: false, openSearch: false, openModel: false },
				}),
			);

			if (stepId === "chat") {
				setActiveTab("chat");
				setLeftSidebarOpen(true);
				setRightSidebarOpen(true);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setSelectedAgentForDrawer(null);
				if (!tourAutoStartedRef.current && !isBusy && (!activeConv || activeConv.messages.length === 0)) {
					tourAutoStartedRef.current = true;
					const defaultDemo = DEMO_SCENARIOS[0];
					setTimeout(() => {
						void handleStartDemoScenario(defaultDemo.file, defaultDemo.question);
					}, 180);
				}
			} else if (stepId === "chatboxes") {
				setActiveTab("chat");
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setSelectedAgentForDrawer(null);
			} else if (stepId === "options") {
				setActiveTab("chat");
				setLeftSidebarOpen(true);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setSelectedAgentForDrawer(null);
			} else if (stepId === "composer") {
				setActiveTab("chat");
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setSelectedAgentForDrawer(null);
				setTimeout(() => {
					window.dispatchEvent(
						new CustomEvent("governmindz:tour-composer-state", {
							detail: { expand: true, openPlus: true },
						}),
					);
				}, 60);
			} else if (stepId === "roster") {
				setActiveTab("chat");
				setRightSidebarOpen(true);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
			} else if (stepId === "explorer") {
				setSelectedAgentForDrawer(null);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setActiveTab("explorer");
			} else if (stepId === "zetaris") {
				setSelectedAgentForDrawer(null);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setActiveTab("evidence");
			} else if (stepId === "outputs") {
				setSelectedAgentForDrawer(null);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setActiveTab("chat");
				setTimeout(() => {
					window.dispatchEvent(new CustomEvent("governmindz:tour-export-menu", { detail: { open: true } }));
				}, 80);
			} else if (stepId === "settings") {
				setSelectedAgentForDrawer(null);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(true);
			} else if (stepId === "ready-live") {
				setSelectedAgentForDrawer(null);
				setSettingsModalOpen(false);
				setLiveConfigModalOpen(false);
				setActiveTab("chat");
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[isBusy, activeConv],
	);

	const handleSelectConversation = (id: string) => {
		if (isBusy) {
			showToast("Wait for the current run to finish before switching conversations.");
			return;
		}
		if (id !== activeIdRef.current) {
			cleanupActiveStream();
			demoQueueRef.current?.reset();
			exitCoordinator.forceExit();
		}
		setActiveConversationId(id);
	};

	// Create New Conversation
	const handleNewConversation = () => {
		if (isBusy) {
			showToast("Wait for the current run to finish before starting a new conversation.");
			return;
		}
		cleanupActiveStream();
		exitCoordinator.forceExit();
		demoQueueRef.current?.reset();
		if (mode !== "live") {
			const draft = createDraftConversation("sample");
			setConversations((prev) => [draft, ...prev.filter((c) => !c.id.startsWith("demo_draft_"))]);
			setActiveConversationId(draft.id);
			arrivalConversationRef.current = draft.id;
			arrivalManager.setConversation(draft.id, []);
			setChartData({ FactChecker: [], CloudArchitect: [], Synthesizer: [] });
			setActiveTab("chat");
			return;
		}

		const newConv = createDraftConversation("live");
		const updated = [newConv, ...conversations];
		setConversations(updated);
		setActiveConversationId(newConv.id);
		arrivalConversationRef.current = newConv.id;
		arrivalManager.setConversation(newConv.id, []);
		saveConversation(newConv);
		setChartData({ FactChecker: [], CloudArchitect: [], Synthesizer: [] });
		setActiveTab("chat");
	};

	// Rename Conversation
	const handleRenameConversation = (id: string, title: string) => {
		const target = conversations.find((c) => c.id === id);
		const updated = conversations.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c));
		setConversations(updated);
		if (target && target.mode === "live") {
			renameConversation(id, title);
		} else if (target) {
			persistConversation(updated.find((c) => c.id === id)!);
		}
	};

	// Delete Conversation
	const handleDeleteConversation = (id: string) => {
		if (isBusy) {
			showToast("Wait for the current run to finish before deleting a conversation.");
			return;
		}
		const target = conversations.find((c) => c.id === id);
		const updated = conversations.filter((c) => c.id !== id);
		setConversations(updated);
		if (target && target.mode === "live") {
			deleteConversation(id);
		} else if (target) {
			removeDemoHistory(target);
		}
		if (activeId === id) {
			const next =
				updated.find((c) =>
					mode === "live"
						? c.mode === "live"
						: c.mode !== "live" && !c.id.startsWith("demo_draft_"),
				) || null;
			setActiveConversationId(next?.id || null);
		}
	};

	// Update Agent Roster Status
	const updateAgentStatus = useCallback(
		(seatId: string, status: AgentProfile["status"], confidence?: number | null) => {
			if (!isRosterEligibleSeat(seatId)) return;
			arrivalManager.updateWorkflowStatus(
				seatId,
				status,
				confidence,
				undefined,
				activeIdRef.current ?? undefined,
			);
		},
		[arrivalManager],
	);

	// Append Live Reasoning & Hypothesis Scratchpad steps
	const appendAgentReasoning = useCallback(
		(seatId: string, reasoningChunk: string) => {
			if (!isRosterEligibleSeat(seatId)) return;
			arrivalManager.appendReasoning(seatId, reasoningChunk, activeIdRef.current ?? undefined);
		},
		[arrivalManager],
	);

	// Handle thumbs up / down message ratings
	const handleRateMessage = (messageId: string, rating: "up" | "down" | null, seatId?: string) => {
		if (!activeId) return;
		setConversations((prev) => {
			const curr = prev.find((c) => c.id === activeId);
			if (!curr) return prev;
			const targetMsg = curr.messages.find((m) => m.id === messageId);
			const resolvedSeat = seatId || targetMsg?.fromSeat || "unknown";

			if (rating) {
				if (curr.mode === "live") {
					submitFeedback({
						conversationId: activeId,
						messageId,
						seatId: resolvedSeat,
						rating,
						round: targetMsg?.round,
					}).catch((err) => {
						console.warn("Failed to submit message feedback to backend:", err);
					});
				}
			}

			const updatedMessages = curr.messages.map((m) =>
				m.id === messageId ? { ...m, userRating: rating } : m,
			);
			const updated = { ...curr, messages: updatedMessages, updatedAt: Date.now() };
			persistConversation(updated);
			return prev.map((c) => (c.id === activeId ? updated : c));
		});
		if (rating) {
			showToast(`Feedback recorded: ${rating === "up" ? "Thumbs Up 👍" : "Thumbs Down 👎"}`);
		}
	};

	// Run Debate Submission
	const handleSendMessage = async (
		userTopic: string,
		optionsOrOverride?: string | { searchModes?: string[]; model?: string; attachments?: any[] },
	) => {
		if (isBusy) return;

		const scenarioOverride = typeof optionsOrOverride === "string" ? optionsOrOverride : undefined;
		const options = typeof optionsOrOverride === "object" ? optionsOrOverride : undefined;

		let convToUse = activeConv;
		if (!convToUse) {
			const councilAssignments = assignHumanCouncil();
			convToUse = {
				id: `conv_${Date.now()}`,
				title: `AI Debate #${conversations.length + 1}`,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				topic: userTopic,
				mode,
				scenarioId: (scenarioOverride || selectedScenario).replace(".json", ""),
				messages: [],
				auditEvents: [],
				status: "idle",
				workflowEvents: [],
				agentAssignments: councilAssignments,
			};
			setConversations((prev) => [convToUse!, ...prev]);
			setActiveConversationId(convToUse.id);
			persistConversation(convToUse);
		}

		await handleSendMessageWithConv(convToUse, userTopic, scenarioOverride, options);
	};

	const handleSendMessageWithConv = async (
		targetConv: Conversation,
		userTopic: string,
		scenarioOverride?: string,
		options?: { searchModes?: string[]; model?: string; attachments?: any[] },
	) => {
		if (isBusy) return;

		cleanupActiveStream();
		const scenarioToUse = scenarioOverride || selectedScenario;
		const topicToRun = userTopic || targetConv.topic || "Assess the Zetaris data available to this agent.";

		// Assign / rotate friendly human names & job tasks for this deliberation
		const councilAssignments = targetConv.agentAssignments || assignHumanCouncil();

		arrivalConversationRef.current = targetConv.id;
		arrivalManager.setConversation(targetConv.id, getParticipatingAgentProfiles(targetConv));
		for (const [seatId, assignment] of Object.entries(councilAssignments)) {
			if (isRosterEligibleSeat(seatId)) {
				arrivalManager.recordTaskAssignment(seatId, assignment, assignment.jobTask, targetConv.id);
			}
		}

		// Format user message content if files or sources are attached
		let formattedContent = topicToRun;
		if (options?.attachments && options.attachments.length > 0) {
			const names = options.attachments.map((a: any) => a.name).join(", ");
			formattedContent += `\n\n📎 Attached Files: ${names}`;
		}
		if (options?.searchModes && options.searchModes.length > 0) {
			const modesStr = options.searchModes
				.map((m) => (m === "zetaris" ? "Zetaris AI" : m === "web" ? "Web Search" : m))
				.join(" + ");
			formattedContent += `\n🔍 Sources Consulted: ${modesStr}`;
		}

		// Add user message to conversation
		const userMsg: ChatMessage = {
			id: `msg_user_${Date.now()}`,
			fromSeat: "user",
			type: "user",
			content: formattedContent,
			timestamp: Date.now(),
			envelope: {
				schemaVersion: "1.0",
				message: {
					type: "user",
					text: formattedContent,
				},
				result: {
					conclusion: formattedContent,
					confidence: 1.0,
					evidenceIds: [],
					unresolvedQuestions: [],
				},
				execution: {
					taskId: `task_user_${Date.now()}`,
					status: "completed",
				},
			},
		};

		const updatedMessages = [...targetConv.messages, userMsg];

		const updatedConv: Conversation = {
			...targetConv,
			topic: topicToRun,
			scenarioId: scenarioToUse.replace(".json", ""),
			title: targetConv.title.startsWith("AI Debate #") ? topicToRun.slice(0, 32) + "…" : targetConv.title,
			messages: updatedMessages,
			status: "running",
			agentAssignments: councilAssignments,
			updatedAt: Date.now(),
		};

		setConversations((prev) => prev.map((c) => (c.id === targetConv.id ? updatedConv : c)));
		setIsBusy(true);
		setActiveCrewRound(null);
		setIsCrewClosing(false);
		exitCoordinator.cancel();

		// Non-blocking holding message timer: triggers after meaningful 2.6s processing pause
		if (holdingTimerRef.current) clearTimeout(holdingTimerRef.current);
		setHoldingMessage(null);
		holdingTimerRef.current = setTimeout(() => {
			setHoldingMessage("I’m still checking the evidence across federated databases and external sources.");
		}, 2600);

		if (mode !== "live") {
			demoQueueRef.current?.reset();
		}

		const targetId = targetConv.id;
		activeStreamConversationIdRef.current = targetId;

		try {
			const { runId } = await startRun({
				mode,
				scenario: scenarioToUse,
				topic: topicToRun,
				conversationId: mode === "live" ? targetId : undefined,
				searchModes: options?.searchModes,
				model: options?.model,
				attachments: options?.attachments,
			});

			// Guard if user reset or switched conversation while startRun was awaiting
			if (activeIdRef.current !== targetId) {
				return;
			}

			// Subscribe to SSE event stream
			const unsub = subscribeRunEvents(
				runId,
				(ev: any) => {
					if (activeIdRef.current !== targetId) return;
					handleStreamEvent(ev);
				},
				(err) => {
					console.warn("SSE stream closed/completed:", err);
					if (holdingTimerRef.current) {
						clearTimeout(holdingTimerRef.current);
						holdingTimerRef.current = null;
					}
					setHoldingMessage(null);
					if (mode === "live") {
						setIsBusy(false);
						setActiveAgentThinking(null);
						setActiveAgentActivity(null);
					}
				},
				() => {
					if (holdingTimerRef.current) {
						clearTimeout(holdingTimerRef.current);
						holdingTimerRef.current = null;
					}
					setHoldingMessage(null);
					if (mode === "live") {
						setIsBusy(false);
						setActiveAgentThinking(null);
						setActiveAgentActivity(null);
					}
				},
			);
			activeStreamUnsubRef.current = unsub;
		} catch (err: any) {
			cleanupActiveStream();
			setConversations((prev) => {
				const updated = prev.map((c) =>
					c.id === targetId
						? { ...c, status: "error" as const, updatedAt: Date.now() }
						: c,
				);
				const current = updated.find((c) => c.id === targetId);
				if (current) persistConversation(current);
				return updated;
			});
			pushNotification({
				type: "run_error",
				title: "Deliberation run failed",
				body: err?.message || "The deliberation stream terminated unexpectedly.",
			});
			showToast(`Run failed: ${err.message}`);
			if (mode === "live") {
				setLiveConfigModalOpen(true);
			}
			setIsBusy(false);
		}
	};

	// Apply individual SSE stream event to React conversation state
	const applyStreamEvent = useCallback(
		(ev: any) => {
			const conversationId = activeIdRef.current;
			if (!conversationId) return;

			// Handle Parallel Crew & Barrier State Synchronization
			if (
				ev.type === "crew_start" ||
				ev.type === "agent_task_assigned" ||
				ev.type === "research_finding" ||
				ev.type === "crew_complete" ||
				ev.type === "crew_failed" ||
				(typeof ev.type === "string" && ev.type.startsWith("crew:"))
			) {
				setActiveCrewRound((prev) => {
					const round =
						prev ||
						CrewBarrierManager.createRound(
							String(ev.roundId || `round_${Date.now()}`),
							["data-crew", "web-crew"],
							conversationId,
							{ softDeadlineMs: 25000 },
						);

					const updatedRound = CrewBarrierManager.processEvent(round, ev);

					if (CrewBarrierManager.canRelease(updatedRound) && !barrierReleaseTimerRef.current) {
						barrierReleaseTimerRef.current = setTimeout(() => {
							barrierReleaseTimerRef.current = null;
							triggerBarrierRelease(updatedRound);
						}, 300);
					}

					return updatedRound;
				});
			}

			setConversations((prev) => {
				const curr = prev.find((c) => c.id === conversationId);
				if (!curr) return prev;

				let updated: Conversation = {
					...curr,
					workflowEvents: appendWorkflowTimelineEvent(curr.workflowEvents, ev),
				};

				if (ev.type === "run_start") {
					// Record council assignments without activating seats on the roster prematurely.
					// Agents will join the visible roster chronologically as they enter the conversation.
					const assignments = updated.agentAssignments || assignHumanCouncil();
					for (const [seatId, assignment] of Object.entries(assignments)) {
						if (!isRosterEligibleSeat(seatId)) continue;
						arrivalManager.recordTaskAssignment(seatId, assignment, assignment.jobTask, updated.id);
					}
					const rosterAnnouncement = generateTaskDelegationAnnouncement(assignments, ev.mode);

					const orchMsg: ChatMessage = {
						id: `msg_orch_start_${updated.id}`,
						fromSeat: "Orchestrator",
						type: "orchestrator",
						content: rosterAnnouncement,
						timestamp: Date.now(),
					};
					const { messages: nextMessages } = upsertConversationMessage(updated.messages, orchMsg);
					updated.messages = nextMessages;
					updated.status = "running";
				} else if (ev.type === "agent_pre_cue") {
					// Pre-cue is an internal scheduling signal; only append if the agent has already joined
					if (arrivalManager.getRoster().some((a) => a.id === ev.targetAgent)) {
						appendAgentReasoning(
							ev.targetAgent,
							`[Internal Pre-Cue: ${ev.taskType}] ${ev.hint || "Preparing analysis for upcoming debate turn..."}`,
						);
					}
				} else if (ev.type === "web_search") {
					updated.webSearchData = {
						query: ev.query,
						total: ev.total || ev.results?.length || 0,
						source: ev.source,
						results: ev.results || [],
					};
				} else if (ev.type === "zetaris") {
					updated.zetarisData = {
						query: ev.query,
						columns: ev.columns,
						rows: ev.rows,
						total: ev.total || ev.rows?.length || 0,
						isSynthetic: ev.isSynthetic,
						evidenceSource: ev.evidenceSource,
					};
				} else if (ev.type === "inquiry_score") {
					updated.inquiryScore = ev.score;
				} else if (ev.type === "seat_thinking") {
					const seatId = ev.seatId;
					const phase = resolveActivityPhase(seatId, ev.step, ev.round);
					setActiveAgentThinking(seatId);
					setActiveAgentActivity({
						seatId,
						phase,
						round: ev.round,
						detail: ev.step,
						startedAt: Date.now(),
					});
					if (isRosterEligibleSeat(seatId, updated.agentAssignments)) {
						arrivalManager.activateAgent(
							seatId,
							updated.agentAssignments?.[seatId],
							undefined,
							updated.id,
						);
						updateAgentStatus(
							seatId,
							phase === "challenging"
								? "challenging"
								: phase === "synthesizing"
									? "synthesizing"
									: phase === "researching"
										? "researching"
										: "analyzing",
						);
						const note =
							ev.step || `Round ${ev.round ?? 0}: Formulating position and verifying evidence constraints...`;
						appendAgentReasoning(seatId, note);
					}
				} else if (ev.type === "message") {
					setActiveAgentThinking(null);
					setActiveAgentActivity(null);
					const rawMsg = ev.message;
					if (rawMsg) {
						const enrichedRaw = {
							...rawMsg,
							content: rawMsg.content || rawMsg.structured?.position || "",
							envelope:
								rawMsg.envelope ||
								(rawMsg.structured
									? {
											schemaVersion: "1.0" as const,
											message: {
												type: rawMsg.type || "proposal",
												text: rawMsg.structured?.position || rawMsg.content || "",
												replyTo:
													rawMsg.inReplyTo ||
													(rawMsg.toSeat && rawMsg.toSeat !== "all" ? rawMsg.toSeat : undefined),
											},
											result: {
												conclusion: rawMsg.structured?.position || rawMsg.content || "",
												confidence:
													rawMsg.confidence ?? rawMsg.structured?.confidence_self ?? 1.0,
												evidenceIds: (rawMsg.structured?.evidence || []).map(
													(_: any, idx: number) => `ev-${idx + 1}`,
												),
												unresolvedQuestions: rawMsg.structured?.caveats || [],
											},
											execution: {
												taskId: rawMsg.id || `task-${Date.now()}`,
												status: "completed",
												round: rawMsg.round,
												latency_ms: rawMsg.latency_ms,
												auditRef: rawMsg.id,
											},
										}
									: undefined),
						};

						const { messages: nextMessages, message: newMsg, isDuplicate } =
							upsertConversationMessage(updated.messages, enrichedRaw);
						updated.messages = nextMessages;

						const s = newMsg.fromSeat;
						const conf = newMsg.confidence || 0;

						if (!isDuplicate && isRosterEligibleSeat(s, updated.agentAssignments)) {
							// Agent has joined the conversation by contributing a message
							arrivalManager.activateAgent(
								s,
								updated.agentAssignments?.[s],
								undefined,
								updated.id,
							);
							appendAgentReasoning(
								s,
								`Deliberation Round ${newMsg.round ?? 0}: Committed ${newMsg.type} [Confidence: ${((newMsg.confidence || 0.8) * 100).toFixed(0)}%].`,
							);
							updateAgentStatus(s, "completed", conf);
						}

						if (!isDuplicate && ttsService.isTtsEnabled("main")) {
							const speakerName =
								updated.agentAssignments?.[s]?.humanName || s;
							const speechText = newMsg.content || "";
							if (speechText) {
								ttsService.queueSpeak(speechText, speakerName, newMsg.id, "main");
							}
						}

						if (!isDuplicate && (s === "FactChecker" || s === "CloudArchitect" || s === "Synthesizer")) {
							setChartData((cd) => ({
								...cd,
								[s]: [...(cd[s] || []), { round: newMsg.round || 0, conf }],
							}));
						}
					}
				} else if (ev.type === "rival_trigger") {
					setActiveAgentThinking("RivalChallenger");
					setActiveAgentActivity({
						seatId: "RivalChallenger",
						phase: "challenging",
						round: ev.round,
						targetSeat: ev.seatId,
						detail: `Challenging ${ev.seatId || "council claim"} (${ev.reason || "epistemic verification"})…`,
						startedAt: Date.now(),
					});
				} else if (ev.type === "thinker_question") {
					if (arrivalManager.getRoster().some((a) => a.id === "Thinker")) {
						updateAgentStatus("Thinker", "completed");
						appendAgentReasoning(
							"Thinker",
							`Probed operational edge case: "${ev.question || "contingency check"}"`,
						);
					}
				} else if (ev.type === "audit") {
					if (ev.event) {
						updated.auditEvents = [...updated.auditEvents, ev.event];
					}
				} else if (ev.type === "deliverable_contract") {
					updated.contract = ev.contract;
				} else if (ev.type === "agent_task_assigned") {
					// Record the task assignment so when the agent joins the conversation, its task is shown.
					// Never add non-participating agents or sub-crew workers directly to the main Agent Roster.
					if (isRosterEligibleSeat(ev.agentId)) {
						arrivalManager.recordTaskAssignment(
							ev.agentId,
							updated.agentAssignments?.[ev.agentId],
							ev.task,
							updated.id,
						);
					}
				} else if (ev.type === "artifact_created" || ev.type === "artifact_ready") {
					if (ev.contract) updated.contract = ev.contract;
					if (ev.primaryArtifact) updated.primaryArtifact = ev.primaryArtifact;
					if (ev.additionalArtifacts) updated.additionalArtifacts = ev.additionalArtifacts;
					if (ev.evidenceExport) updated.evidenceExport = ev.evidenceExport;
				} else if (ev.type === "delivery_approved") {
					updated.supervisorResponse = ev.supervisorResponse;
					updated.supervisorDecision = "APPROVED";
				} else if (ev.type === "delivery_rejected") {
					updated.supervisorDecision = "REJECTED";
				} else if (ev.type === "complete" || ev.type === "done") {
					setActiveAgentThinking(null);
					setActiveAgentActivity(null);
					setIsBusy(false);
					updated.status = "completed";
					if (ev.result) {
						updated.finalConfidence = ev.result.finalConfidence;
					}
					if (ev.auditEvents) {
						updated.auditEvents = ev.auditEvents;
					}
					if (ev.contract) updated.contract = ev.contract;
					if (ev.primaryArtifact) updated.primaryArtifact = ev.primaryArtifact;
					if (ev.additionalArtifacts) updated.additionalArtifacts = ev.additionalArtifacts;
					if (ev.evidenceExport) updated.evidenceExport = ev.evidenceExport;
					if (ev.supervisorResponse) updated.supervisorResponse = ev.supervisorResponse;
					if (ev.supervisorDecision) updated.supervisorDecision = ev.supervisorDecision;
					if (ev.dataCrewReport) updated.dataCrewReport = ev.dataCrewReport;
					if (ev.webCrewReport) updated.webCrewReport = ev.webCrewReport;

					// Strictly prune the roster and conversation history so ONLY agents that
					// actually joined the conversation remain on the roster or in saved history.
					const participatingIds = extractParticipatingSeatIds(updated);
					arrivalManager.pruneToParticipants(participatingIds, updated.id);
					for (const seatId of participatingIds) {
						arrivalManager.updateWorkflowStatus(seatId, "completed", undefined, undefined, updated.id);
					}
					updated.agentAssignments = filterAssignmentsToParticipants(
						updated.agentAssignments,
						participatingIds,
					);
					pushNotification({
						type: "run_complete",
						title: "AI Deliberation complete",
						body:
							updated.finalConfidence != null
								? `Final confidence ${updated.finalConfidence}`
								: "Cryptographic audit verified",
						source: updated.id,
					});

					showToast("AI Deliberation complete · Cryptographic audit verified");
				} else if (ev.type === "error") {
					setActiveAgentThinking(null);
					setActiveAgentActivity(null);
					setIsBusy(false);
					updated.status = "error";
					pushNotification({
						type: "run_error",
						title: "Deliberation run failed",
						body: ev.message || "Deliberation error",
					});
					showToast(`Run failed: ${ev.message || "Deliberation error"}`);
				}

				if (ev.type === "complete" || ev.type === "done" || ev.type === "error") {
					exitCoordinator.requestExit();
				}

				persistConversation(updated);
				return prev.map((c) => (c.id === conversationId ? updated : c));
			});
		},
		[arrivalManager, updateAgentStatus, appendAgentReasoning, showToast, triggerBarrierRelease, persistConversation, exitCoordinator],
	);

	// Initialize Demo presentation queue
	useEffect(() => {
		const queue = new DemoPresentationQueue(
			(item) => {
				applyStreamEvent(item.payload);
			},
			(queueState) => {
				setDemoQueueState(queueState);
			},
		);
		queue.setLiveMode(mode === "live");
		demoQueueRef.current = queue;

		return () => {
			queue.destroy();
		};
	}, [applyStreamEvent, mode]);

	// Route incoming SSE stream events through the Demo Presentation Queue in Demo Mode, or instantly in Live Mode
	const handleStreamEvent = useCallback(
		(ev: any) => {
			// Non-blocking holding message clears immediately upon substantive content, completion, or error
			if (ev.type === "message" || ev.type === "complete" || ev.type === "done" || ev.type === "error") {
				if (holdingTimerRef.current) {
					clearTimeout(holdingTimerRef.current);
					holdingTimerRef.current = null;
				}
				setHoldingMessage(null);
			}

			if (mode === "live" || !demoQueueRef.current) {
				applyStreamEvent(ev);
			} else {
				const textLength =
					ev.type === "message"
						? (ev.message?.content || ev.message?.structured?.position || "").length
						: 20;

				demoQueueRef.current.enqueue({
					id: `demo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
					type: ev.type === "seat_thinking" ? "seat_thinking" : ev.type === "message" ? "message" : "crew",
					payload: ev,
					textLength,
					fromSeat: ev.message?.fromSeat || ev.seatId,
				});
			}
		},
		[mode, applyStreamEvent],
	);

	// Select Agent in Roster
	const handleSelectAgent = (agent: AgentProfile) => {
		setSelectedAgentForDrawer(agent);
	};

	// Select Agent from Seat ID (e.g. clicked in chat bubble)
	const handleSelectAgentFromChat = (seatId: string) => {
		const profile = agentRoster.find((a) => a.id === seatId) || getAgentProfile(seatId);
		setSelectedAgentForDrawer(profile);
	};

	// Active scenario metadata
	const activeScenarioItem =
		scenarios.find((s) => s.file === selectedScenario) || (scenarios.length > 0 ? scenarios[0] : null);

	// Dynamically track selected agent from roster to reflect live reasoning scratchpad updates
	const currentSelectedAgent = useMemo(() => {
		if (!selectedAgentForDrawer) return null;
		return agentRoster.find((a) => a.id === selectedAgentForDrawer.id) || selectedAgentForDrawer;
	}, [selectedAgentForDrawer, agentRoster]);

	// Select Scenario Template handler
	const handleSelectScenario = (file: string) => {
		setSelectedScenario(file);
		const found = scenarios.find((s) => s.file === file);
		if (found) {
			showToast(`Governance Template loaded: ${found.id || found.file}`);
			if (activeConv && activeConv.messages.length === 0) {
				const updated: Conversation = {
					...activeConv,
					scenarioId: found.id || found.file.replace(".json", ""),
					topic: found.topic,
					title: found.id || found.file.replace(".json", ""),
					updatedAt: Date.now(),
				};
				setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? updated : c)));
				persistConversation(updated);
			}
		}
	};

	const computedRounds = useMemo(() => {
		if (!activeConv?.messages || activeConv.messages.length === 0) return 0;
		const maxRound = activeConv.messages.reduce(
			(max, m) => (typeof m.round === "number" ? Math.max(max, m.round + 1) : max),
			1,
		);
		return maxRound;
	}, [activeConv?.messages]);

	const isAuditVerified = Boolean(
		activeConv &&
			activeConv.status === "completed" &&
			activeConv.auditEvents &&
			activeConv.auditEvents.length > 0,
	);

	return (
		<ErrorBoundary>
			<div className="h-screen w-screen flex flex-col bg-[#0a0e1a] text-[#e8ecf7] overflow-hidden select-none">
				{/* Top Bar Header */}
				<Header
					activeTab={activeTab}
					setActiveTab={setActiveTab}
					leftSidebarOpen={leftSidebarOpen}
					setLeftSidebarOpen={setLeftSidebarOpen}
					rightSidebarOpen={rightSidebarOpen}
					setRightSidebarOpen={setRightSidebarOpen}
					health={health}
					refreshHealth={handleRefreshHealth}
					openSettings={() => setSettingsModalOpen(true)}
					mode={mode}
					isBusy={isBusy}
					activeConversation={activeConv}
					onToggleMode={handleToggleMode}
					onOpenCredentials={() => setLiveConfigModalOpen(true)}
					onOpenTour={() => {
						tourAutoStartedRef.current = false;
						setTourOpen(true);
					}}
				/>

				{/* Main Workspace 3-Pane Layout */}
				<div className="flex-1 flex overflow-hidden">
					{/* Left Persistent Navigation Sidebar */}
					<LeftSidebar
						conversations={conversations}
						activeConversationId={activeId}
						onSelectConversation={handleSelectConversation}
						onNewConversation={handleNewConversation}
						onRenameConversation={handleRenameConversation}
						onDeleteConversation={handleDeleteConversation}
						mode={mode}
						setMode={setMode}
						scenarios={scenarios}
						selectedScenario={selectedScenario}
						setSelectedScenario={handleSelectScenario}
						openSettings={() => setSettingsModalOpen(true)}
						isOpen={leftSidebarOpen}
						onRequestLiveMode={() => setLiveConfirmModalOpen(true)}
					/>

					{/* Center: Selected View */}
					<main className="flex-1 flex flex-col min-w-0 bg-[#0a0e1a] overflow-hidden relative">
						{activeConv ? (
							<>
								{activeTab === "chat" && (
									<>
										<GroupConversation
											conversation={activeConv}
											mode={mode}
											messages={activeConv.messages}
											agentRoster={agentRoster}
											activeAgentThinking={activeAgentThinking}
											activeAgentActivity={activeAgentActivity}
											inquiryScore={activeConv.inquiryScore}
											finalConfidence={activeConv.finalConfidence}
											rounds={computedRounds || 1}
											auditVerified={isAuditVerified}
											onSelectAgent={handleSelectAgentFromChat}
											onStartPrompt={(prompt) => handleSendMessage(prompt, activeScenarioItem?.file)}
											onRateMessage={handleRateMessage}
											activeScenario={activeScenarioItem}
											allScenarios={scenarios}
											onSelectScenario={handleSelectScenario}
											activeCrewRound={activeCrewRound}
											isCrewClosing={isCrewClosing}
											holdingMessage={holdingMessage}
											demoQueueState={demoQueueState}
											onPauseDemo={() => demoQueueRef.current?.pause()}
											onResumeDemo={() => demoQueueRef.current?.resume()}
											onResetDemo={() => {
												demoQueueRef.current?.reset();
												handleStartOver();
											}}
											onExploreZetaris={handleExploreZetaris}
										/>
										<MessageComposer
											mode={mode}
											onSendMessage={handleSendMessage}
											onStartDemoScenario={handleStartDemoScenario}
											onStartOver={handleStartOver}
											selectedScenarioFile={selectedScenario}
											onSelectScenarioFile={handleSelectScenario}
											isBusy={isBusy}
											disabled={false}
											defaultTopic={activeScenarioItem?.topic}
											hasCompletedMessages={Boolean(activeConv?.messages && activeConv.messages.length > 0)}
										/>
									</>
								)}

								{activeTab === "explorer" && (
									<React.Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
										<ExecutionExplorer conversation={activeConv} />
									</React.Suspense>
								)}

								{activeTab === "evidence" && (
									<React.Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
										<TrustEvidenceView conversation={activeConv} />
									</React.Suspense>
								)}
							</>
						) : (
							<div className="flex-1 flex items-center justify-center text-xs text-slate-400">
								Select or create a debate to begin.
							</div>
						)}
					</main>

					{/* Right Agent Activity & Metrics Sidebar */}
					<RightSidebar
						agents={agentRoster}
						activeAgentId={activeAgentActivity?.seatId || activeAgentThinking}
						onSelectAgent={handleSelectAgent}
						chartData={chartData}
						finalConfidence={activeEvaluation?.evaluated ? activeConv?.finalConfidence : undefined}
						consensusReached={Boolean(activeEvaluation?.evaluated && activeConv?.status === "completed")}
						consensusMethod="synthesizer"
						auditVerified={isAuditVerified}
						auditCount={activeConv?.auditEvents?.length || 0}
						inquiryScore={activeConv?.inquiryScore}
						currentRound={(activeConv?.messages?.filter((m) => m.round === 1).length ?? 0) > 0 ? 1 : 0}
						isOpen={rightSidebarOpen}
					/>
				</div>

				{/* Slide-over Agent Detail Drawer */}
				<AgentDetailDrawer
					agent={currentSelectedAgent}
					messages={activeConv?.messages || []}
					onClose={() => setSelectedAgentForDrawer(null)}
				/>

				{/* Settings Modal */}
				<SettingsModal
					isOpen={settingsModalOpen}
					onClose={() => setSettingsModalOpen(false)}
					health={health}
					activeConversation={activeConv}
					onClearAll={() => {
						setConversations([]);
						setActiveConversationId(null);
						setSettingsModalOpen(false);
						showToast("Cleared all conversation history");
					}}
					onReplayTour={() => {
						setSettingsModalOpen(false);
						setTourOpen(true);
					}}
					onOpenCredentials={() => {
						setSettingsModalOpen(false);
						setLiveConfigModalOpen(true);
					}}
					onRefreshHealth={handleRefreshHealth}
				/>

				{/* Live Mode Confirmation Modal */}
				<LiveModeConfirmModal
					isOpen={liveConfirmModalOpen}
					onCancel={() => setLiveConfirmModalOpen(false)}
					onConfirm={handleConfirmLiveMode}
				/>

				{/* Live Mode Credentials Configuration Modal */}
				<LiveConfigModal
					isOpen={liveConfigModalOpen}
					onClose={() => setLiveConfigModalOpen(false)}
					onConfigSaved={async () => {
						await handleRefreshHealth();
					}}
				/>

				{/* Guided Product Tour Overlay */}
				<TourGuide
					isOpen={tourOpen}
					onClose={handleFinishTour}
					onFinish={handleFinishTour}
					onStepChange={handleTourStepChange}
					onStartDemo={() => {
						const chosen = DEMO_SCENARIOS.find((s) => s.file === selectedScenario) || DEMO_SCENARIOS[0];
						void handleStartDemoScenario(chosen.file, chosen.question);
					}}
					onInspectAgent={() => {
						const candidate =
							agentRoster[0] ||
							getAgentProfile("FactChecker", activeConv?.agentAssignments?.FactChecker);
						setSelectedAgentForDrawer(candidate);
					}}
					onOpenSettings={() => {
						setLiveConfigModalOpen(false);
						setSettingsModalOpen(true);
					}}
					onOpenCredentials={() => {
						setSettingsModalOpen(false);
						setLiveConfigModalOpen(true);
					}}
					onRefreshHealth={handleRefreshHealth}
					onSwitchToLiveMode={() => {
						handleFinishTour();
						if (mode !== "live") {
							setLiveConfirmModalOpen(true);
						}
					}}
					isDemoBusy={isBusy}
					hasMessages={Boolean(activeConv?.messages && activeConv.messages.length > 0)}
					zetarisOnline={Boolean(health?.zetaris?.ok)}
					meterlessOnline={health?.meterless?.state === "online"}
				/>

				{/* Toast Notification */}
				{toastMsg && (
					<div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#18203a] border border-amber-500/40 text-xs font-medium text-amber-300 shadow-2xl animate-fadeIn">
						{toastMsg}
					</div>
				)}
			</div>
		</ErrorBoundary>
	);
};
export default App;
