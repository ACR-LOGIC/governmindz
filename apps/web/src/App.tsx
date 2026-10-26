import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Header } from "./components/layout/Header";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { GroupConversation } from "./components/chat/GroupConversation";
import { MessageComposer, DEMO_SCENARIOS } from "./components/chat/MessageComposer";
import { ExecutionExplorer } from "./components/explorer/ExecutionExplorer";
import { TrustEvidenceView } from "./components/evidence/TrustEvidenceView";
import { AgentDetailDrawer } from "./components/modals/AgentDetailDrawer";
import { SettingsModal } from "./components/modals/SettingsModal";
import { TourGuide } from "./components/common/TourGuide";
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
import { CrewBarrierManager } from "./services/crewBarrier";
import { AgentArrivalManager } from "./services/agentArrivalManager";
import { SynchronizedExitCoordinator } from "./services/synchronizedExitCoordinator";
import { DemoPresentationQueue, type DemoQueueState } from "./services/demoPresentationQueue";
import type { CrewRound } from "./types/crew";
import type {
	ActiveTab,
	ChatMessage,
	Conversation,
	HealthStatus,
	ScenarioItem,
	AgentProfile,
	AuditEvent,
	ZetarisData,
	WorkflowTimelineEvent,
} from "./types";


function getParticipatingAgentProfiles(conv: Conversation | null): AgentProfile[] {
	if (!conv || !conv.messages || conv.messages.length === 0) return [];
	const participatingSeats = Array.from(
		new Set(
			conv.messages
				.map((m) => m.fromSeat)
				.filter((seat) => seat && seat !== "user" && seat !== "Orchestrator")
		)
	);
	return participatingSeats.map((seatId) =>
		getAgentProfile(seatId, conv.agentAssignments?.[seatId])
	);
}

export const App: React.FC = () => {
	const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
	const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
	const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
	const [settingsModalOpen, setSettingsModalOpen] = useState(false);
	const [selectedAgentForDrawer, setSelectedAgentForDrawer] = useState<AgentProfile | null>(null);

	const [health, setHealth] = useState<HealthStatus | null>(null);
	const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
	const [selectedScenario, setSelectedScenario] = useState<string>("01-regulatory-risk.json");
	const [mode, setMode] = useState<"live" | "sample">("sample");
	const [tourOpen, setTourOpen] = useState(false);
	const [liveConfirmModalOpen, setLiveConfirmModalOpen] = useState(false);
	const [liveConfigModalOpen, setLiveConfigModalOpen] = useState(false);

	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const activeIdRef = useRef<string | null>(null);
	const setActiveConversationId = useCallback((id: string | null) => {
		activeIdRef.current = id;
		setActiveId(id);
	}, []);
	const [isBusy, setIsBusy] = useState(false);
	const [activeAgentThinking, setActiveAgentThinking] = useState<string | null>(null);
	const [activeCrewRound, setActiveCrewRound] = useState<CrewRound | null>(null);
	const [isCrewClosing, setIsCrewClosing] = useState(false);
	const [toastMsg, setToastMsg] = useState<string | null>(null);

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
	const acknowledgedAgentsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		return () => {
			arrivalManager.clearTimers();
			exitCoordinator.destroy();
		};
	}, [arrivalManager, exitCoordinator]);

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
					id: `msg_crew_summary_${Date.now()}`,
					fromSeat: "Supervisor",
					type: "summary",
					content: summaryResult.summaryText,
					timestamp: Date.now(),
				};

				setConversations((prev) => {
					const curr = prev.find((c) => c.id === conversationId);
					if (!curr) return prev;
					if (
						curr.messages.some(
							(m) =>
								m.id === summaryMsg.id ||
								(m.type === "summary" &&
									m.fromSeat === "Supervisor" &&
									m.content === summaryResult.summaryText),
						)
					) {
						return prev;
					}
					const updated = {
						...curr,
						messages: [...curr.messages, summaryMsg],
						updatedAt: Date.now(),
					};
					saveConversation(updated);
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
		[showToast],
	);

	// Active conversation lookup
	const activeConv = useMemo(() => {
		return conversations.find((c) => c.id === activeId) || null;
	}, [conversations, activeId]);

	// Load initial health and scenarios
	const loadInitData = useCallback(async () => {
		try {
			const h = await fetchHealth();
			setHealth(h);
		} catch (e) {
			console.warn("Health check error:", e);
		}

		try {
			const sc = await fetchScenarios();
			setScenarios(sc);
			if (sc.length > 0) {
				setSelectedScenario(sc[0].file);
			}
		} catch (e) {
			console.warn("Scenario load error:", e);
		}

		try {
			const convs = await fetchConversations();
			if (convs && convs.length > 0) {
				setConversations((prev) => {
					// If a new conversation was created before fetch resolved, keep it at top
					if (prev.length > 0 && prev[0].messages.length === 0 && !convs.find((c) => c.id === prev[0].id)) {
						return [prev[0], ...convs];
					}
					return convs;
				});
				setActiveConversationId(activeIdRef.current || convs[0].id);
			} else {
				// Create initial default conversation with rotated human council
				const defaultAssigns = assignHumanCouncil();
				const defaultConv: Conversation = {
					id: `conv_${Date.now()}`,
					title: "Regulatory Compliance & Risk Ranking",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					topic:
						"Our organization received acquisition offers from 7 Fortune 500 companies (Apple, IBM, Oracle, Walmart, Target, Ford, Tesla). Before we accept any partnership, we need to assess regulatory compliance risk. Use Zetaris to cross-reference: (1) SEC financial data (revenue volatility, reporting consistency), (2) GLEIF legal entity status (LEI active/inactive), (3) COMPANY_DNS industry classification. Which company poses the HIGHEST compliance risk, and why? Rank all 7 companies by governance risk.",
					mode: "sample",
					scenarioId: "01-regulatory-risk",
					messages: [],
					auditEvents: [],
					status: "idle",
					workflowEvents: [],
					agentAssignments: defaultAssigns,
				};
				setConversations([defaultConv]);
				setActiveConversationId(defaultConv.id);
			}
		} catch (e) {
			console.warn("Conversation load error:", e);
		}

		try {
			const prefs = await fetchPreferences();
			const localPref = localStorage.getItem("governmindz_launch_preference");
			const savedPref = localPref || prefs.futureLaunchPreference || "demo";
			if (savedPref === "live") {
				setMode("live");
			} else {
				setMode("sample");
			}

			const localTour = localStorage.getItem("governmindz_tour_completed");
			const tourDone = localTour !== null ? localTour === "true" : prefs.tourCompleted;
			if (!tourDone) {
				setTourOpen(true);
			}
		} catch (e) {
			console.warn("Preferences load error:", e);
		}
	}, []);

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
			showToast(`Meterless: ${h.meterless?.state || "offline"} · Zetaris: ${h.zetaris?.ok ? "connected" : "disconnected"}`);
		} catch {
			showToast("Connectivity check failed");
		} finally {
			setIsBusy(false);
		}
	};

	// Toggle execution mode
	const handleToggleMode = () => {
		if (mode === "live") {
			setMode("sample");
			showToast("Switched to Demo Mode (Keyless Simulation)");
			savePreferences({ launchMode: "demo" });
			localStorage.setItem("governmindz_mode_preference", "demo");
		} else {
			setLiveConfirmModalOpen(true);
		}
	};

	// Confirm Live Mode transition
	const handleConfirmLiveMode = (futureLaunchPref: "demo" | "live") => {
		setMode("live");
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

	// Start Demo scenario directly
	const handleStartDemoScenario = async (scenarioFile: string, question: string) => {
		setSelectedScenario(scenarioFile);

		// If active conversation doesn't exist or already has completed messages, start a fresh conversation for this demo scenario!
		if (!activeConv || activeConv.messages.length > 0) {
			const councilAssignments = assignHumanCouncil();
			const matchedScenario = DEMO_SCENARIOS.find((s) => s.file === scenarioFile);
			const title = matchedScenario ? matchedScenario.title : `Demo: ${scenarioFile.replace(".json", "")}`;
			const newConv: Conversation = {
				id: `conv_${Date.now()}`,
				title,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				topic: question,
				mode: "sample",
				scenarioId: scenarioFile.replace(".json", ""),
				messages: [],
				auditEvents: [],
				status: "idle",
				workflowEvents: [],
				agentAssignments: councilAssignments,
			};
			setConversations((prev) => [newConv, ...prev]);
			setActiveConversationId(newConv.id);
			saveConversation(newConv);
			await handleSendMessageWithConv(newConv, question, scenarioFile);
			return;
		}

		await handleSendMessageWithConv(activeConv, question, scenarioFile);
	};

	// Start Over in Demo mode
	const handleStartOver = () => {
		exitCoordinator.forceExit();
		demoQueueRef.current?.reset();
		if (holdingTimerRef.current) {
			clearTimeout(holdingTimerRef.current);
			holdingTimerRef.current = null;
		}
		setHoldingMessage(null);
		handleNewConversation();
		showToast("Demo restarted. Choose a scenario to begin.");
	};

	// Finish Tour
	const handleFinishTour = () => {
		setTourOpen(false);
		localStorage.setItem("governmindz_tour_completed", "true");
		savePreferences({ tourCompleted: true });
		showToast("Tour completed! Enjoy exploring GovernMindz.");
	};

	// Create New Conversation
	const handleNewConversation = () => {
		exitCoordinator.forceExit();
		const councilAssignments = assignHumanCouncil();

		const newConv: Conversation = {
			id: `conv_${Date.now()}`,
			title: `AI Debate #${conversations.length + 1}`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			topic: "",
			mode,
			scenarioId: selectedScenario.replace(".json", ""),
			messages: [],
			auditEvents: [],
			status: "idle",
			workflowEvents: [],
			agentAssignments: councilAssignments,
		};

		const updated = [newConv, ...conversations];
		setConversations(updated);
		setActiveConversationId(newConv.id);
		saveConversation(newConv);
		setChartData({ FactChecker: [], CloudArchitect: [], Synthesizer: [] });
		setActiveTab("chat");
	};

	// Rename Conversation
	const handleRenameConversation = (id: string, title: string) => {
		const updated = conversations.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c));
		setConversations(updated);
		renameConversation(id, title);
	};

	// Delete Conversation
	const handleDeleteConversation = (id: string) => {
		const updated = conversations.filter((c) => c.id !== id);
		setConversations(updated);
		deleteConversation(id);
		if (activeId === id) {
			setActiveConversationId(updated[0]?.id || null);
		}
	};

	// Update Agent Roster Status
	const updateAgentStatus = useCallback(
		(seatId: string, status: AgentProfile["status"], confidence?: number | null) => {
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

			const updatedMessages = curr.messages.map((m) =>
				m.id === messageId ? { ...m, userRating: rating } : m,
			);
			const updated = { ...curr, messages: updatedMessages, updatedAt: Date.now() };
			saveConversation(updated);
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
			saveConversation(convToUse);
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

		const scenarioToUse = scenarioOverride || selectedScenario;
		const topicToRun = userTopic || targetConv.topic || "Assess the Zetaris data available to this agent.";

		// Assign / rotate friendly human names & job tasks for this deliberation
		const councilAssignments = targetConv.agentAssignments || assignHumanCouncil();

		if (arrivalConversationRef.current !== targetConv.id) {
			arrivalConversationRef.current = targetConv.id;
			arrivalManager.setConversation(targetConv.id, getParticipatingAgentProfiles(targetConv));
		}

		// Format user message content if files or sources are attached
		let formattedContent = topicToRun;
		if (options?.attachments && options.attachments.length > 0) {
			const names = options.attachments.map((a: any) => a.name).join(", ");
			formattedContent += `\n\n📎 Attached Files: ${names}`;
		}
		if (options?.searchModes && options.searchModes.length > 0) {
			const modesStr = options.searchModes.map((m) => (m === "zetaris" ? "Zetaris AI" : m === "web" ? "Web Search" : m)).join(" + ");
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
			demoQueueRef.current?.play();
		}

		try {
			const { runId } = await startRun({
				mode,
				scenario: scenarioToUse,
				topic: topicToRun,
				conversationId: targetConv.id,
				searchModes: options?.searchModes,
				model: options?.model,
				attachments: options?.attachments,
			});

			// Subscribe to SSE event stream
			subscribeRunEvents(
				runId,
				(ev: any) => {
					// Handle SSE event dispatch
					handleStreamEvent(ev);
				},
				(err) => {
					console.warn("SSE stream closed/completed:", err);
					if (holdingTimerRef.current) {
						clearTimeout(holdingTimerRef.current);
						holdingTimerRef.current = null;
					}
					setHoldingMessage(null);
					setIsBusy(false);
					setActiveAgentThinking(null);
				},
				() => {
					if (holdingTimerRef.current) {
						clearTimeout(holdingTimerRef.current);
						holdingTimerRef.current = null;
					}
					setHoldingMessage(null);
					setIsBusy(false);
					setActiveAgentThinking(null);
				},
			);
		} catch (err: any) {
			if (holdingTimerRef.current) {
				clearTimeout(holdingTimerRef.current);
				holdingTimerRef.current = null;
			}
			setHoldingMessage(null);
			showToast(`Run failed: ${err.message}`);
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

				let updated = { ...curr };

				if (ev.type === "run_start") {
					// Announce the active agent roster with friendly human names and assigned job tasks
					const assignments = updated.agentAssignments || assignHumanCouncil();
					for (const [seatId, assignment] of Object.entries(assignments)) {
						if (seatId === "user" || seatId === "Orchestrator") continue;
						arrivalManager.activateAgent(seatId, assignment, assignment.jobTask, updated.id);
					}
					const rosterAnnouncement = generateTaskDelegationAnnouncement(assignments, ev.mode);

					const orchMsg: ChatMessage = {
						id: `msg_orch_${Date.now()}`,
						fromSeat: "Orchestrator",
						type: "orchestrator",
						content: rosterAnnouncement,
						timestamp: Date.now(),
					};
					updated.messages = [...updated.messages, orchMsg];
					updated.status = "running";
				} else if (ev.type === "agent_pre_cue") {
					// Pre-cue: lightweight scheduling signal informing downstream agents
					appendAgentReasoning(
						ev.targetAgent,
						`[Internal Pre-Cue: ${ev.taskType}] ${ev.hint || "Preparing background analysis for upcoming debate turn..."}`,
					);
				} else if (ev.type === "web_search") {
					updated.webSearchData = {
						query: ev.query,
						total: ev.total || ev.results?.length || 0,
						source: ev.source,
						results: ev.results || [],
					};
					appendAgentReasoning(
						"CredibleSourcesResearchAgent",
						`Dispatched online web search query: "${ev.query}". Retrieved ${ev.results?.length || 0} authoritative external standards and citations.`,
					);
				} else if (ev.type === "zetaris") {
					updated.zetarisData = {
						query: ev.query,
						columns: ev.columns,
						rows: ev.rows,
						total: ev.total || ev.rows?.length || 0,
					};
					appendAgentReasoning(
						"FactChecker",
						`Connected to Zetaris virtual fabric. Executed query: "${ev.query}" (${ev.rows?.length || 0} rows retrieved).`,
					);
				} else if (ev.type === "inquiry_score") {
					updated.inquiryScore = ev.score;
				} else if (ev.type === "seat_thinking") {
					setActiveAgentThinking(ev.seatId);
					updateAgentStatus(ev.seatId, "analyzing");
					const note = ev.step || `Formulating epistemic position and examining schema provenance...`;
					appendAgentReasoning(ev.seatId, note);
				} else if (ev.type === "message") {
					setActiveAgentThinking(null);
					const rawMsg = ev.message;
					const newMsg: ChatMessage = {
						id: rawMsg.id || `msg_${Date.now()}`,
						fromSeat: rawMsg.fromSeat,
						toSeat: rawMsg.toSeat,
						type: rawMsg.type || "proposal",
						content: rawMsg.content || rawMsg.structured?.position || "",
						structured: rawMsg.structured,
						round: rawMsg.round,
						confidence: rawMsg.confidence ?? rawMsg.structured?.confidence_self,
						timestamp: rawMsg.timestamp || Date.now(),
						latency_ms: rawMsg.latency_ms,
						replyToExcerpt: rawMsg.replyToExcerpt,
						envelope: rawMsg.envelope || (rawMsg.structured ? {
							schemaVersion: "1.0",
							message: {
								type: rawMsg.type || "proposal",
								text: rawMsg.structured?.position || rawMsg.content || "",
								replyTo: rawMsg.toSeat && rawMsg.toSeat !== "all" ? rawMsg.toSeat : undefined,
							},
							result: {
								conclusion: rawMsg.structured?.position || rawMsg.content || "",
								confidence: rawMsg.confidence ?? rawMsg.structured?.confidence_self ?? 1.0,
								evidenceIds: (rawMsg.structured?.evidence || []).map((_: any, idx: number) => `ev-${idx + 1}`),
								unresolvedQuestions: rawMsg.structured?.caveats || [],
							},
							execution: {
								taskId: rawMsg.id || `task-${Date.now()}`,
								status: "completed",
								round: rawMsg.round,
								latency_ms: rawMsg.latency_ms,
								auditRef: rawMsg.id,
							},
						} : undefined),
					};

					updated.messages = [...updated.messages, newMsg];

					// Live text-to-speech reading if voice enabled (associated with main group)
					if (ttsService.isTtsEnabled("main")) {
						const speakerName = updated.agentAssignments?.[rawMsg.fromSeat]?.humanName || rawMsg.fromSeat;
						const speechText = newMsg.content || "";
						if (speechText) {
							ttsService.queueSpeak(speechText, speakerName, newMsg.id, "main");
						}
					}

					// Record contribution step in live scratchpad
					appendAgentReasoning(
						rawMsg.fromSeat,
						`Deliberation Round ${rawMsg.round || 1}: Committed position [Confidence: ${((newMsg.confidence || 0.8) * 100).toFixed(0)}%].`,
					);

					// Update confidence chart
					const s = rawMsg.fromSeat;
					const conf = newMsg.confidence || 0;
					if (s === "FactChecker" || s === "CloudArchitect" || s === "Synthesizer") {
						setChartData((cd) => ({
							...cd,
							[s]: [...(cd[s] || []), { round: rawMsg.round || 0, conf }],
						}));
					}

					updateAgentStatus(s, "completed", conf);
				} else if (ev.type === "rival_trigger") {
					updateAgentStatus("RivalChallenger", "challenging");
					appendAgentReasoning(
						"RivalChallenger",
						"Detected unverified consensus assumption. Probing boundary cases and raising formal challenge.",
					);
				} else if (ev.type === "thinker_question") {
					updateAgentStatus("Thinker", "analyzing");
					appendAgentReasoning(
						"Thinker",
						"Exploring hidden governance angles and long-term retention policies.",
					);
				} else if (ev.type === "audit") {
					if (ev.event) {
						updated.auditEvents = [...updated.auditEvents, ev.event];
					}
				} else if (ev.type === "deliverable_contract") {
					updated.contract = ev.contract;
				} else if (ev.type === "crew_start") {
					appendAgentReasoning("Supervisor", `Launched parallel ${ev.crew} with ${ev.agentCount} independent agents.`);
				} else if (ev.type === "agent_task_assigned") {
					arrivalManager.activateAgent(
						ev.agentId,
						updated.agentAssignments?.[ev.agentId],
						ev.task,
						updated.id,
					);
					updateAgentStatus(ev.agentId, "analyzing");
					appendAgentReasoning(ev.agentId, `[Task] ${ev.task}`);
				} else if (ev.type === "research_finding") {
					updateAgentStatus(ev.agentId, "completed");
					appendAgentReasoning(ev.agentId, `[Finding: ${ev.finding?.title || "Evidence"}] ${ev.finding?.claim || ""}`);
				} else if (ev.type === "crew_complete") {
					appendAgentReasoning(
						"Supervisor",
						`[${ev.crew} ${ev.failed ? "Failed" : "Completed"}] ${ev.summary || (ev.failed ? "Did not complete" : "Findings verified")}`,
					);
				} else if (ev.type === "crew_failed") {
					appendAgentReasoning(
						"Supervisor",
						`[${ev.crew} Failed] ${ev.error || "Did not complete. Evidence excluded."}`,
					);
				} else if (ev.type === "hater_crew_challenge") {
					updateAgentStatus("RivalChallenger", "challenging");
					appendAgentReasoning("RivalChallenger", `[Independent Challenge to ${ev.targetAgent}] ${ev.challenge}`);
				} else if (ev.type === "crew_challenge_response") {
					appendAgentReasoning("Synthesizer", `[${ev.crew} Defense] ${ev.defenseStatement}`);
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
					showToast("AI Deliberation complete · Cryptographic audit verified");
				} else if (ev.type === "error") {
					setActiveAgentThinking(null);
					setIsBusy(false);
					updated.status = "error";
					showToast(`Run failed: ${ev.message || "Deliberation error"}`);
				}

				if (ev.type === "complete" || ev.type === "done" || ev.type === "error") {
					exitCoordinator.requestExit();
				}

				saveConversation(updated);
				return prev.map((c) => (c.id === conversationId ? updated : c));
			});
		},
		[arrivalManager, updateAgentStatus, appendAgentReasoning, showToast, triggerBarrierRelease],
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

			if (mode === "live" || !demoQueueRef.current || ev.type === "run_start") {
				applyStreamEvent(ev);
			} else {
				const textLength =
					ev.type === "message"
						? (ev.message?.content || ev.message?.structured?.position || "").length
						: 20;

				demoQueueRef.current.enqueue({
					id: `demo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
					type: ev.type,
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
				saveConversation(updated);
			}
		}
	};

	return (
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
			/>

			{/* Main Workspace 3-Pane Layout */}
			<div className="flex-1 flex overflow-hidden">
				{/* Left Persistent Navigation Sidebar */}
				<LeftSidebar
					conversations={conversations}
					activeConversationId={activeId}
					onSelectConversation={(id) => setActiveConversationId(id)}
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
										inquiryScore={activeConv.inquiryScore}
										finalConfidence={activeConv.finalConfidence}
										rounds={2}
										auditVerified={true}
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

							{activeTab === "explorer" && <ExecutionExplorer conversation={activeConv} />}

							{activeTab === "evidence" && <TrustEvidenceView conversation={activeConv} />}
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
					onSelectAgent={handleSelectAgent}
					chartData={chartData}
					finalConfidence={activeConv?.finalConfidence}
					consensusReached={activeConv?.status === "completed"}
					consensusMethod="synthesizer"
					auditVerified={true}
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
					showToast("Active session cleared");
				}}
				onReplayTour={() => setTourOpen(true)}
				onOpenCredentials={() => setLiveConfigModalOpen(true)}
			/>

			{/* Guided Onboarding UI Tour */}
			<TourGuide
				isOpen={tourOpen}
				onClose={() => setTourOpen(false)}
				onFinish={handleFinishTour}
			/>

			{/* Live Mode Confirmation Dialog */}
			<LiveModeConfirmModal
				isOpen={liveConfirmModalOpen}
				onConfirm={handleConfirmLiveMode}
				onCancel={() => setLiveConfirmModalOpen(false)}
				onOpenConfig={() => setLiveConfigModalOpen(true)}
				meterlessConfigured={Boolean(health?.meterless?.configured || health?.meterless?.state === "online")}
				zetarisConfigured={Boolean(health?.zetaris?.configured || health?.zetaris?.ok)}
			/>

			{/* Live Mode Secure Credential Configuration */}
			<LiveConfigModal
				isOpen={liveConfigModalOpen}
				onClose={() => setLiveConfigModalOpen(false)}
				onConfigSaved={handleRefreshHealth}
			/>

			{/* Toast Notification */}
			{toastMsg && (
				<div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#18203a] text-teal-300 border border-[#2c385c] shadow-2xl text-xs font-semibold animate-fadeIn">
					{toastMsg}
				</div>
			)}
		</div>
	);
};
