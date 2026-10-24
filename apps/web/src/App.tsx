import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Header } from "./components/layout/Header";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { GroupConversation } from "./components/chat/GroupConversation";
import { MessageComposer } from "./components/chat/MessageComposer";
import { ExecutionExplorer } from "./components/explorer/ExecutionExplorer";
import { TrustEvidenceView } from "./components/evidence/TrustEvidenceView";
import { AgentDetailDrawer } from "./components/modals/AgentDetailDrawer";
import { SettingsModal } from "./components/modals/SettingsModal";
import {
	fetchHealth,
	fetchScenarios,
	fetchConversations,
	saveConversation,
	renameConversation,
	deleteConversation,
	startRun,
	subscribeRunEvents,
} from "./services/api";
import { AGENT_REGISTRY, getAgentProfile } from "./services/agentRegistry";
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

export const App: React.FC = () => {
	const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
	const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
	const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
	const [settingsModalOpen, setSettingsModalOpen] = useState(false);
	const [selectedAgentForDrawer, setSelectedAgentForDrawer] = useState<AgentProfile | null>(null);

	const [health, setHealth] = useState<HealthStatus | null>(null);
	const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
	const [selectedScenario, setSelectedScenario] = useState<string>("01-governance-readiness.json");
	const [mode, setMode] = useState<"live" | "sample">("sample");

	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [activeAgentThinking, setActiveAgentThinking] = useState<string | null>(null);
	const [toastMsg, setToastMsg] = useState<string | null>(null);

	// Agent roster state
	const [agentRoster, setAgentRoster] = useState<AgentProfile[]>([
		getAgentProfile("FactChecker"),
		getAgentProfile("CloudArchitect"),
		getAgentProfile("Synthesizer"),
		getAgentProfile("RivalChallenger"),
		getAgentProfile("Thinker"),
	]);

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
				setConversations(convs);
				setActiveId(convs[0].id);
			} else {
				// Create initial default conversation
				const defaultConv: Conversation = {
					id: `conv_${Date.now()}`,
					title: "Zetaris Data Access Readiness",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					topic:
						"Which governance controls should a data team verify before exposing Zetaris federated data to an external agent, and what evidence supports the recommendation?",
					mode: "sample",
					scenarioId: "01-governance-readiness",
					messages: [],
					auditEvents: [],
					status: "idle",
					workflowEvents: [],
				};
				setConversations([defaultConv]);
				setActiveId(defaultConv.id);
			}
		} catch (e) {
			console.warn("Conversation load error:", e);
		}
	}, []);

	useEffect(() => {
		loadInitData();
	}, [loadInitData]);

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

	// Create New Conversation
	const handleNewConversation = () => {
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
		};

		const updated = [newConv, ...conversations];
		setConversations(updated);
		setActiveId(newConv.id);
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
			setActiveId(updated[0]?.id || null);
		}
	};

	// Update Agent Roster Status
	const updateAgentStatus = useCallback((seatId: string, status: AgentProfile["status"], confidence?: number | null) => {
		setAgentRoster((prev) =>
			prev.map((a) => {
				if (a.id === seatId) {
					return {
						...a,
						status,
						confidence: confidence !== undefined ? confidence : a.confidence,
						lastActiveTime: Date.now(),
					};
				}
				return a;
			}),
		);
	}, []);

	// Run Debate Submission
	const handleSendMessage = async (userTopic: string) => {
		if (isBusy || !activeConv) return;

		const topicToRun = userTopic || activeConv.topic || "Assess the Zetaris data available to this agent.";

		// Add user message to conversation
		const userMsg: ChatMessage = {
			id: `msg_user_${Date.now()}`,
			fromSeat: "user",
			type: "user",
			content: topicToRun,
			timestamp: Date.now(),
		};

		const updatedMessages = [...activeConv.messages, userMsg];

		const updatedConv: Conversation = {
			...activeConv,
			topic: topicToRun,
			title: activeConv.title.startsWith("AI Debate #") ? topicToRun.slice(0, 32) + "…" : activeConv.title,
			messages: updatedMessages,
			status: "running",
			updatedAt: Date.now(),
		};

		setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? updatedConv : c)));
		setIsBusy(true);

		try {
			const { runId } = await startRun({
				mode,
				scenario: selectedScenario,
				topic: topicToRun,
				conversationId: activeConv.id,
			});

			// Subscribe to SSE event stream
			subscribeRunEvents(
				runId,
				(ev: any) => {
					// Handle SSE event dispatch
					handleStreamEvent(ev);
				},
				(err) => {
					console.error("SSE stream error:", err);
					setIsBusy(false);
					setActiveAgentThinking(null);
				},
				() => {
					setIsBusy(false);
					setActiveAgentThinking(null);
				},
			);
		} catch (err: any) {
			showToast(`Run failed: ${err.message}`);
			setIsBusy(false);
		}
	};

	// Handle SSE Stream Events
	const handleStreamEvent = useCallback(
		(ev: any) => {
			if (!activeId) return;

			setConversations((prev) => {
				const curr = prev.find((c) => c.id === activeId);
				if (!curr) return prev;

				let updated = { ...curr };

				if (ev.type === "run_start") {
					// Add orchestrator announcement
					const orchMsg: ChatMessage = {
						id: `msg_orch_${Date.now()}`,
						fromSeat: "Orchestrator",
						type: "orchestrator",
						content: `Inquiry initiated in ${ev.mode.toUpperCase()} mode. Initializing multi-seat deliberation across FactChecker, CloudArchitect, and Synthesizer.`,
						timestamp: Date.now(),
					};
					updated.messages = [...updated.messages, orchMsg];
					updated.status = "running";
				} else if (ev.type === "zetaris") {
					updated.zetarisData = {
						query: ev.query,
						columns: ev.columns,
						rows: ev.rows,
						total: ev.total || ev.rows?.length || 0,
					};
				} else if (ev.type === "inquiry_score") {
					updated.inquiryScore = ev.score;
				} else if (ev.type === "seat_thinking") {
					setActiveAgentThinking(ev.seatId);
					updateAgentStatus(ev.seatId, "analyzing");
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
					};

					updated.messages = [...updated.messages, newMsg];

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
				} else if (ev.type === "thinker_question") {
					updateAgentStatus("Thinker", "analyzing");
				} else if (ev.type === "audit") {
					if (ev.event) {
						updated.auditEvents = [...updated.auditEvents, ev.event];
					}
				} else if (ev.type === "complete") {
					setActiveAgentThinking(null);
					setIsBusy(false);
					updated.status = "completed";
					if (ev.result) {
						updated.finalConfidence = ev.result.finalConfidence;
					}
					if (ev.auditEvents) {
						updated.auditEvents = ev.auditEvents;
					}
					showToast("AI Deliberation complete · Cryptographic audit verified");
				}

				saveConversation(updated);
				return prev.map((c) => (c.id === activeId ? updated : c));
			});
		},
		[activeId, updateAgentStatus, showToast],
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
			/>

			{/* Main Workspace 3-Pane Layout */}
			<div className="flex-1 flex overflow-hidden">
				{/* Left Persistent Navigation Sidebar */}
				<LeftSidebar
					conversations={conversations}
					activeConversationId={activeId}
					onSelectConversation={(id) => setActiveId(id)}
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
				/>

				{/* Center: Selected View */}
				<main className="flex-1 flex flex-col min-w-0 bg-[#0a0e1a] overflow-hidden relative">
					{activeConv ? (
						<>
							{activeTab === "chat" && (
								<>
									<GroupConversation
										messages={activeConv.messages}
										activeAgentThinking={activeAgentThinking}
										inquiryScore={activeConv.inquiryScore}
										finalConfidence={activeConv.finalConfidence}
										rounds={2}
										auditVerified={true}
										onSelectAgent={handleSelectAgentFromChat}
										onStartPrompt={(prompt) => handleSendMessage(prompt)}
										activeScenario={activeScenarioItem}
										allScenarios={scenarios}
										onSelectScenario={handleSelectScenario}
									/>
									<MessageComposer
										onSendMessage={handleSendMessage}
										isBusy={isBusy}
										disabled={!activeConv}
										defaultTopic={activeScenarioItem?.topic}
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
				agent={selectedAgentForDrawer}
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
					setActiveId(null);
					setSettingsModalOpen(false);
					showToast("Active session cleared");
				}}
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
