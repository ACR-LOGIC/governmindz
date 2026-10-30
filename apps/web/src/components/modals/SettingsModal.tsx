import React, { useState, useEffect } from "react";
import {
	X,
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
	Bell,
	Webhook,
	Palette,
	Plus,
	Send,
	Loader2,
	Mic,
	GitBranch,
} from "lucide-react";
import type { Conversation, HealthStatus } from "../../types";
import { detectMeterless } from "../../services/api";
import { ttsService, type AgentVoiceRegistryEntry } from "../../services/ttsService";
import { notificationService } from "../../services/notificationService";
import type { NotificationPrefs } from "../../services/notificationService";
import { webhookService } from "../../services/webhookService";
import type { WebhookConfig, WebhookDelivery, WebhookEvent } from "../../types";
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

type TabType =
	| "general"
	| "notifications"
	| "webhooks"
	| "audio"
	| "models"
	| "data"
	| "appearance"
	| "github"
	| "about";

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

	const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
	const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
	const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
	const [whName, setWhName] = useState("");
	const [whUrl, setWhUrl] = useState("");
	const [whSecret, setWhSecret] = useState("");
	const [whEvents, setWhEvents] = useState<WebhookEvent[]>(["run.completed"]);

	const [ttsEnabled, setTtsEnabled] = useState(ttsService.isMasterEnabled());
	const [ttsMuted, setTtsMuted] = useState(ttsService.isMuted());
	const [voiceRegistry, setVoiceRegistry] = useState<AgentVoiceRegistryEntry[]>([]);
	const [speakingSeat, setSpeakingSeat] = useState<string | null>(null);
	const [voiceCatalog, setVoiceCatalog] = useState<Array<{ voiceId: string; name: string; category?: string }>>([]);
	const [voiceProvider, setVoiceProvider] = useState<"ready" | "unavailable">("unavailable");
	const [elevenLabsConnected, setElevenLabsConnected] = useState(false);
	const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState("");
	const [elevenLabsConnecting, setElevenLabsConnecting] = useState(false);

	const [githubConfigured, setGithubConfigured] = useState(false);
	const [githubInstalled, setGithubInstalled] = useState(false);
	const [githubAccount, setGithubAccount] = useState<{ login: string; type: string } | null>(null);
	const [githubRepos, setGithubRepos] = useState<Array<{ id: number; name: string; fullName: string; description?: string; private: boolean; htmlUrl: string }>>([]);
	const [githubReposLoading, setGithubReposLoading] = useState(false);
	const [githubSelectedIds, setGithubSelectedIds] = useState<Set<number>>(new Set());
	const [githubSaving, setGithubSaving] = useState(false);
	const [githubSyncing, setGithubSyncing] = useState(false);
	const [githubConfigOpen, setGithubConfigOpen] = useState(false);
	const [githubAppId, setGithubAppId] = useState("");
	const [githubClientId, setGithubClientId] = useState("");
	const [githubSlug, setGithubSlug] = useState("");
	const [githubPrivateKey, setGithubPrivateKey] = useState("");
	const [githubWebhookSecret, setGithubWebhookSecret] = useState("");
	const [githubInstalling, setGithubInstalling] = useState(false);

	const [localProjectPath, setLocalProjectPath] = useState("");
	const [localProjects, setLocalProjects] = useState<Array<{
		id: string;
		name: string;
		fullName: string;
		description?: string;
		status: string;
		branch?: string;
		ahead?: number;
		behind?: number;
		workingTreeClean?: boolean;
		remoteUrl?: string;
		canonicalPath?: string;
		lastSyncedAt?: number;
		updatedAt?: number;
	}>>([]);
	const [localProjectsLoading, setLocalProjectsLoading] = useState(false);
	const [localConnecting, setLocalConnecting] = useState(false);

	/* ----------------------------------------------------------------
	   AI Provider Registry state
	----------------------------------------------------------------- */
	const [providers, setProviders] = useState<Array<{
		id: string;
		name: string;
		type: string;
		endpoint?: string;
		model?: string;
		status: string;
		createdAt?: number;
		updatedAt?: number;
	}>>([]);
	const [providersLoading, setProvidersLoading] = useState(false);
	const [newProviderType, setNewProviderType] = useState("openai");
	const [newProviderName, setNewProviderName] = useState("");
	const [newProviderEndpoint, setNewProviderEndpoint] = useState("");
	const [newProviderApiKey, setNewProviderApiKey] = useState("");
	const [newProviderModel, setNewProviderModel] = useState("");
	const [creatingProvider, setCreatingProvider] = useState(false);

	/* ----------------------------------------------------------------
	   External Client Registry state
	----------------------------------------------------------------- */
	const [clients, setClients] = useState<Array<{
		id: string;
		name: string;
		clientType: string;
		userId: string;
		status: string;
		approvedAt?: number;
		revokedAt?: number;
		createdAt?: number;
		updatedAt?: number;
	}>>([]);
	const [clientsLoading, setClientsLoading] = useState(false);
	const [newClientName, setNewClientName] = useState("");
	const [newClientType, setNewClientType] = useState("mcp");
	const [newClientUserId, setNewClientUserId] = useState("");
	const [creatingClient, setCreatingClient] = useState(false);

	/* ----------------------------------------------------------------
	   Client Permissions state
	----------------------------------------------------------------- */
	const [permissions, setPermissions] = useState<Array<{
		id: string;
		clientId: string;
		projectId?: string;
		permissionLevel: string;
		grantedTools: string[];
		createdAt?: number;
		updatedAt?: number;
	}>>([]);
	const [permissionsLoading, setPermissionsLoading] = useState(false);
	const [permClientId, setPermClientId] = useState("");
	const [permProjectId, setPermProjectId] = useState("");
	const [permLevel, setPermLevel] = useState("OBSERVE");
	const [grantingPermission, setGrantingPermission] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setVoiceRegistry(ttsService.getVoiceRegistry());
			setTtsEnabled(ttsService.isMasterEnabled());
			setTtsMuted(ttsService.isMuted());
			ttsService
				.getElevenLabsStatus()
				.then((ready) => {
					setVoiceProvider(ready ? "ready" : "unavailable");
					setElevenLabsConnected(ready);
					if (!ready) return;
					ttsService
						.listElevenVoices()
						.then(setVoiceCatalog)
						.catch(() => setVoiceCatalog([]));
				})
				.catch(() => {
					setVoiceProvider("unavailable");
					setElevenLabsConnected(false);
				});

			// GitHub integration status + catalog
			void fetchGithubStatus();
			void fetchCatalog();
			void fetchLocalProjects();
			void fetchProviders();
			void fetchClients();
			void fetchPermissions();
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const unsub = ttsService.subscribe((isSpeaking, seatId) => {
			setSpeakingSeat(isSpeaking ? seatId || null : null);
		});
		return unsub;
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const unsubWebhooks = webhookService.subscribe((list) => {
			setWebhooks(list);
			setSelectedWebhookId((prev) => (prev && list.some((w) => w.id === prev) ? prev : (list[0]?.id ?? null)));
		});
		const unsubDeliveries = webhookService.subscribeDeliveries((list) => {
			setDeliveries(list);
		});
		return () => {
			unsubWebhooks();
			unsubDeliveries();
		};
	}, [isOpen]);

	const handleSaveWebhook = () => {
		if (!whUrl.trim()) return;
		const existing = selectedWebhookId ? webhookService.get(selectedWebhookId) : undefined;
		if (existing) {
			webhookService.update(existing.id, {
				name: whName.trim() || existing.name,
				url: whUrl.trim(),
				secret: whSecret || existing.secret,
				events: whEvents,
				active: existing.active,
			});
		} else {
			webhookService.add({
				name: whName.trim() || "GovernMindz Webhook",
				url: whUrl.trim(),
				secret: whSecret,
				events: whEvents,
				active: true,
			});
		}
		setWhName("");
		setWhUrl("");
		setWhSecret("");
		setWhEvents(["run.completed"]);
		setSelectedWebhookId(null);
	};

	const fetchGithubStatus = async () => {
		try {
			const resp = await fetch("/api/github/app-config");
			const data = await resp.json();
			setGithubConfigured(!!data.configured);
			setGithubInstalled(!!data.installed);
			setGithubAccount(data.account ?? null);
		} catch {
			setGithubConfigured(false);
			setGithubInstalled(false);
		}
	};

	const fetchGithubRepos = async () => {
		setGithubReposLoading(true);
		try {
			const resp = await fetch("/api/github/repositories");
			const data = await resp.json();
			if (data.repositories) {
				setGithubRepos(
					data.repositories.map((r: any) => ({
						id: r.id,
						name: r.name,
						fullName: r.fullName,
						description: r.description,
						private: !!r.private,
						htmlUrl: r.htmlUrl,
					})),
				);
			}
		} catch (err) {
			console.error("Failed to fetch GitHub repos:", err);
		} finally {
			setGithubReposLoading(false);
		}
	};

	const fetchCatalog = async () => {
		try {
			const resp = await fetch("/api/catalog");
			const data = await resp.json();
			const ids = new Set<number>();
			for (const row of data.sources ?? []) {
				if (row.provider === "github" && row.selected) {
					ids.add(Number(row.source_id));
				}
			}
			setGithubSelectedIds(ids);
		} catch {
			// catalog not available yet
		}
	};

	const handleConnectGitHub = async () => {
		if (!githubSlug || !githubPrivateKey || !(githubAppId || githubClientId)) return;
		setGithubSaving(true);
		try {
			const resp = await fetch("/api/github/app-config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					appId: githubAppId || undefined,
					clientId: githubClientId || undefined,
					slug: githubSlug,
					privateKey: githubPrivateKey,
					webhookSecret: githubWebhookSecret || undefined,
				}),
			});
			const data = await resp.json();
			if (resp.ok && data.configured) {
				setGithubConfigured(true);
				setGithubConfigOpen(false);
				setGithubAppId("");
				setGithubClientId("");
				setGithubSlug("");
				setGithubPrivateKey("");
				setGithubWebhookSecret("");
				notificationService.add({
					type: "info",
					title: "GitHub App configured",
					body: "Save the app credentials. Next, install the app using the button below.",
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Configuration failed",
					body: data.error ?? "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Configuration failed",
				body: "Network error",
			});
		} finally {
			setGithubSaving(false);
		}
	};

	const handleInstallGitHubApp = async () => {
		setGithubInstalling(true);
		try {
			const resp = await fetch("/api/github/install-url");
			const data = await resp.json();
			if (resp.ok && data.authorizationUrl) {
				const win = window.open(data.authorizationUrl, "_blank");
				if (!win) {
					notificationService.add({
						type: "error",
						title: "Install blocked",
						body: "Pop-ups must be allowed to open the GitHub App installation page.",
					});
					return;
				}
				const poll = setInterval(async () => {
					try {
						const st = await (await fetch("/api/github/app-config")).json();
						if (st.installed) {
							clearInterval(poll);
							setGithubInstalled(true);
							setGithubAccount(st.account ?? null);
							setGithubInstalling(false);
							void fetchGithubRepos();
							notificationService.add({
								type: "info",
								title: "GitHub App installed",
								body: "Select repositories to sync into the project catalog.",
							});
						}
					} catch {
						// keep polling
					}
				}, 3000);
				setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
			} else {
				notificationService.add({
					type: "error",
					title: "Install failed",
					body: data.error ?? "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Install failed",
				body: "Network error",
			});
		} finally {
			setGithubInstalling(false);
		}
	};

	const handleSaveSelection = async () => {
		setGithubSaving(true);
		try {
			const resp = await fetch("/api/github/select-repositories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repositoryIds: Array.from(githubSelectedIds) }),
			});
			if (resp.ok) {
				notificationService.add({
					type: "info",
					title: "Selection saved",
					body: `${githubSelectedIds.size} repository(ies) synced to the project catalog.`,
				});
			} else {
				const data = await resp.json().catch(() => ({}));
				notificationService.add({
					type: "error",
					title: "Save failed",
					body: data.error ?? "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Save failed",
				body: "Network error",
			});
		} finally {
			setGithubSaving(false);
		}
	};

	const handleDisconnectGitHub = async () => {
		try {
			const resp = await fetch("/api/github/disconnect", { method: "POST" });
			if (resp.ok) {
				setGithubInstalled(false);
				setGithubAccount(null);
				setGithubRepos([]);
				setGithubSelectedIds(new Set());
				notificationService.add({
					type: "info",
					title: "GitHub disconnected",
					body: "GitHub integration has been disconnected.",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Disconnect failed",
				body: "Network error",
			});
		}
	};

	const fetchLocalProjects = async () => {
		setLocalProjectsLoading(true);
		try {
			const resp = await fetch("/api/github/local-projects");
			const data = await resp.json();
			if (data.projects) {
				setLocalProjects(data.projects);
			}
		} catch {
			// local projects endpoint may not be available yet
		} finally {
			setLocalProjectsLoading(false);
		}
	};

	const handleConnectLocalProject = async () => {
		const p = localProjectPath.trim();
		if (!p) return;
		setLocalConnecting(true);
		try {
			const resp = await fetch("/api/github/connect-local-project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ localPath: p }),
			});
			const data = await resp.json();
			if (resp.ok && data.success) {
				setLocalProjectPath("");
				void fetchLocalProjects();
				notificationService.add({
					type: "info",
					title: "Local project connected",
					body: `Connected to ${data.name} (${data.status}).`,
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Connect failed",
					body: data.error ?? "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Connect failed",
				body: "Network error",
			});
		} finally {
			setLocalConnecting(false);
		}
	};

	const handleDisconnectLocalProject = async (id: string) => {
		try {
			const resp = await fetch(`/api/github/local-projects/${id}`, {
				method: "DELETE",
			});
			if (resp.ok) {
				void fetchLocalProjects();
				notificationService.add({
					type: "info",
					title: "Local project disconnected",
					body: "Local project connection removed.",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Disconnect failed",
				body: "Network error",
			});
		}
	};

	/* ----------------------------------------------------------------
	   AI Provider Registry handlers
	----------------------------------------------------------------- */

	const fetchProviders = async () => {
		setProvidersLoading(true);
		try {
			const resp = await fetch("/api/ai-providers");
			const data = await resp.json();
			if (data.providers) {
				setProviders(data.providers);
			}
		} catch {
			// provider endpoint may not be available yet
		} finally {
			setProvidersLoading(false);
		}
	};

	const handleCreateProvider = async () => {
		setCreatingProvider(true);
		try {
			const resp = await fetch("/api/ai-providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: newProviderName,
					type: newProviderType,
					endpoint: newProviderEndpoint || undefined,
					apiKey: newProviderApiKey,
					model: newProviderModel || undefined,
					status: "enabled",
				}),
			});
			const data = await resp.json();
			if (resp.ok && data.provider) {
				setNewProviderName("");
				setNewProviderEndpoint("");
				setNewProviderApiKey("");
				setNewProviderModel("");
				void fetchProviders();
				notificationService.add({
					type: "info",
					title: "AI provider added",
					body: `${data.provider.name} (${data.provider.type})`,
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Add provider failed",
					body: data.error ?? "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Add provider failed",
				body: "Network error",
			});
		} finally {
			setCreatingProvider(false);
		}
	};

	const handleUpdateProvider = async (id: string, updates: {
		name?: string;
		endpoint?: string;
		model?: string;
		status?: string;
	}) => {
		try {
			const resp = await fetch(`/api/ai-providers/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updates),
			});
			if (resp.ok) {
				void fetchProviders();
			} else {
				notificationService.add({
					type: "error",
					title: "Update provider failed",
					body: "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Update provider failed",
				body: "Network error",
			});
		}
	};

	const handleDeleteProvider = async (id: string) => {
		try {
			const resp = await fetch(`/api/ai-providers/${id}`, {
				method: "DELETE",
			});
			if (resp.ok) {
				void fetchProviders();
				notificationService.add({
					type: "info",
					title: "Provider removed",
					body: "AI provider connection removed.",
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Delete provider failed",
					body: "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Delete provider failed",
				body: "Network error",
			});
		}
	};

	/* ----------------------------------------------------------------
	   External Client Registry handlers
	----------------------------------------------------------------- */

	const fetchClients = async () => {
		setClientsLoading(true);
		try {
			const resp = await fetch("/api/external-clients");
			const data = await resp.json();
			if (data.clients) {
				setClients(data.clients);
			}
		} catch {
			// client endpoint may not be available yet
		} finally {
			setClientsLoading(false);
		}
	};

	const handleCreateClient = async () => {
		setCreatingClient(true);
		try {
			const resp = await fetch("/api/external-clients", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: newClientName,
					clientType: newClientType,
					userId: newClientUserId,
				}),
			});
			const data = await resp.json();
			if (resp.ok && data.client) {
				setNewClientName("");
				setNewClientUserId("");
				void fetchClients();
				notificationService.add({
					type: "info",
					title: "External client added",
					body: `${data.client.name} — pending your approval`,
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Add client failed",
					body: data.error ?? "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Add client failed",
				body: "Network error",
			});
		} finally {
			setCreatingClient(false);
		}
	};

	const handleApproveClient = async (id: string) => {
		try {
			const resp = await fetch(`/api/external-clients/${id}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId: "founder" }),
			});
			if (resp.ok) {
				void fetchClients();
				notificationService.add({
					type: "info",
					title: "Client approved",
					body: "External client access granted.",
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Approve client failed",
					body: "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Approve client failed",
				body: "Network error",
			});
		}
	};

	const handleRevokeClient = async (id: string) => {
		try {
			const resp = await fetch(`/api/external-clients/${id}/revoke`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId: "founder" }),
			});
			if (resp.ok) {
				void fetchClients();
				notificationService.add({
					type: "info",
					title: "Client revoked",
					body: "External client access removed.",
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Revoke client failed",
					body: "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Revoke client failed",
				body: "Network error",
			});
		}
	};

	/* ----------------------------------------------------------------
	   Client Permissions handlers
	----------------------------------------------------------------- */

	const fetchPermissions = async () => {
		setPermissionsLoading(true);
		try {
			const resp = await fetch("/api/client-permissions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ clientId: permClientId }),
			});
			const data = await resp.json();
			if (data.permissions) {
				setPermissions(data.permissions);
			}
		} catch {
			// permissions endpoint may not be available yet
		} finally {
			setPermissionsLoading(false);
		}
	};

	const handleGrantPermission = async () => {
		setGrantingPermission(true);
		try {
			const resp = await fetch("/api/client-permissions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					clientId: permClientId,
					projectId: permProjectId || undefined,
					permissionLevel: permLevel,
					grantedTools: [],
				}),
			});
			if (resp.ok) {
				setPermProjectId("");
				setPermLevel("OBSERVE");
				void fetchPermissions();
				notificationService.add({
					type: "info",
					title: "Permission granted",
					body: `Permission level ${permLevel} granted.`,
				});
			} else {
				notificationService.add({
					type: "error",
					title: "Grant permission failed",
					body: "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Grant permission failed",
				body: "Network error",
			});
		} finally {
			setGrantingPermission(false);
		}
	};

	const handleConnectElevenLabs = async () => {
		setElevenLabsConnecting(true);
		try {
			const resp = await fetch("/api/voice/configure", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ apiKey: elevenLabsKeyInput }),
			});
			const data = await resp.json();
			if (resp.ok && data.success) {
				setElevenLabsConnected(true);
				setElevenLabsKeyInput("");
				ttsService
					.listElevenVoices()
					.then(setVoiceCatalog)
					.catch(() => setVoiceCatalog([]));
				setVoiceProvider("ready");
			} else {
				notificationService.add({
					type: "error",
					title: "Connection failed",
					body: data.error ?? "Unknown error",
				});
			}
		} catch {
			notificationService.add({
				type: "error",
				title: "Connection failed",
				body: "Network error",
			});
		} finally {
			setElevenLabsConnecting(false);
		}
	};

	const handleDeleteWebhook = (id: string) => {
		webhookService.remove(id);
		if (selectedWebhookId === id) setSelectedWebhookId(null);
	};

	const handleSendTestWebhook = (id: string) => {
		const wh = webhookService.get(id);
		if (!wh) return;
		const event: WebhookEvent = wh.events[0] || "run.completed";
		const delivery = webhookService.deliverNow(id, event);
		if (delivery.status === "failed") {
			notificationService.add({
				type: "webhook_delivery",
				title: "Webhook delivery failed",
				body: `${wh.name} failed for ${event}`,
				source: id,
			});
		}
	};

	const handleToggleMasterNotifications = (val: boolean) => {
		notificationService.updatePrefs({ enabled: val });
	};

	const handleToggleNotificationPref = (key: keyof NotificationPrefs, val: boolean) => {
		const prefs = notificationService.getPrefs();
		notificationService.updatePrefs({ ...prefs, [key]: val });
	};

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

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-[24px] flex items-center justify-center p-4 animate-fadeIn">
			<div className="w-full max-w-2xl bg-[#0c101e]/90 border border-[#1e2842]/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] glass-panel">
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
							{ id: "notifications", label: "Notifications", icon: Bell },
							{ id: "webhooks", label: "Webhooks", icon: Webhook },
							{ id: "audio", label: "Voice & Audio", icon: Volume2 },
							{ id: "models", label: "Models & Providers", icon: Cpu },
{ id: "data", label: "Privacy & Data", icon: ShieldCheck },
						{ id: "github", label: "GitHub", icon: GitBranch },
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

						{activeTab === "notifications" && (
							<div className="space-y-4">
								<h4 className="font-bold text-sm text-slate-100">Notifications &amp; Alerts</h4>
								<div className="p-3 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3">
									<label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#12182b] border border-[#1e2842]">
										<div>
											<div className="font-semibold text-slate-200">Master notifications</div>
											<div className="text-[11px] text-slate-400">Enable or disable all GovernMindz alerts.</div>
										</div>
										<input
											type="checkbox"
											checked={notificationService.getPrefs().enabled}
											onChange={(e) => handleToggleMasterNotifications(e.target.checked)}
											className="w-4 h-4 accent-teal-500 rounded"
										/>
									</label>
									<label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#12182b] border border-[#1e2842]">
										<div>
											<div className="font-semibold text-slate-200">Run completed</div>
											<div className="text-[11px] text-slate-400">Notify when a deliberation run finishes and the audit gate verifies.</div>
										</div>
										<input
											type="checkbox"
											checked={notificationService.getPrefs().runComplete}
											onChange={(e) => handleToggleNotificationPref("runComplete", e.target.checked)}
											className="w-4 h-4 accent-teal-500 rounded"
										/>
									</label>
									<label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#12182b] border border-[#1e2842]">
										<div>
											<div className="font-semibold text-slate-200">Run failed</div>
											<div className="text-[11px] text-slate-400">Notify when a deliberation run errors.</div>
										</div>
										<input
											type="checkbox"
											checked={notificationService.getPrefs().runError}
											onChange={(e) => handleToggleNotificationPref("runError", e.target.checked)}
											className="w-4 h-4 accent-rose-500 rounded"
										/>
									</label>
									<label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#12182b] border border-[#1e2842]">
										<div>
											<div className="font-semibold text-slate-200">Webhook delivery</div>
											<div className="text-[11px] text-slate-400">Notify when a webhook delivery fails.</div>
										</div>
										<input
											type="checkbox"
											checked={notificationService.getPrefs().webhookDelivery}
											onChange={(e) => handleToggleNotificationPref("webhookDelivery", e.target.checked)}
											className="w-4 h-4 accent-purple-500 rounded"
										/>
									</label>
									<label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#12182b] border border-[#1e2842]">
										<div>
											<div className="font-semibold text-slate-200">System events</div>
											<div className="text-[11px] text-slate-400">Notify about app-level system events.</div>
										</div>
										<input
											type="checkbox"
											checked={notificationService.getPrefs().system}
											onChange={(e) => handleToggleNotificationPref("system", e.target.checked)}
											className="w-4 h-4 accent-sky-500 rounded"
										/>
									</label>
								</div>
							</div>
						)}

						{activeTab === "webhooks" && (
							<div className="space-y-4">
								<div className="flex items-center justify-between gap-2">
									<h4 className="font-bold text-sm text-slate-100">Webhooks &amp; Integrations</h4>
									<span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300">
										{webhookService.getStats().totalDeliveries} deliveries
									</span>
								</div>

								<div className="p-3 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3">
									<div className="font-semibold text-slate-100 text-xs">Create or update a webhook</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
										<input
											value={whName}
											onChange={(e) => setWhName(e.target.value)}
											placeholder="Webhook name"
											className="bg-[#0a0e1a] border border-[#1e2842] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
										/>
										<input
											value={whUrl}
											onChange={(e) => setWhUrl(e.target.value)}
											placeholder="https://example.com/hook"
											className="bg-[#0a0e1a] border border-[#1e2842] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
										/>
										<input
											value={whSecret}
											onChange={(e) => setWhSecret(e.target.value)}
											placeholder="Signing secret (optional)"
											className="bg-[#0a0e1a] border border-[#1e2842] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 sm:col-span-2"
										/>
									</div>
									<div className="flex flex-wrap gap-2">
{( 
											[
												"run.started",
												"run.completed",
												"run.failed",
												"message.created",
												"audit.verified",
												"webhook.delivery_failed",
											] as WebhookEvent[]
).map((ev) => ( 
 
											<button
												key={ev}
												type="button"
												onClick={() => setWhEvents((prev) => (prev.includes(ev) ? prev.filter((p) => p !== ev) : [...prev, ev]))}
												className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors ${
													whEvents.includes(ev)
														? "bg-amber-500/10 border-amber-500/50 text-amber-300"
														: "bg-[#0a0e1a] border-[#1e2842] text-slate-400"
												}`}
											>
												{ev}
											</button>
										))}
									</div>
									<button
										type="button"
										onClick={handleSaveWebhook}
										className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs border border-amber-500/40 transition-colors"
									>
										<Plus className="w-3.5 h-3.5" />
										Save webhook
									</button>
								</div>

								{webhooks.length > 0 && (
									<div className="space-y-2">
										{webhooks.map((w) => {
											const stats = webhookService.getStats(w.id);
											return (
												<div key={w.id} className="p-3 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-2">
													<div className="flex items-center justify-between gap-2">
														<div className="min-w-0">
															<div className="font-semibold text-slate-100 text-xs truncate">{w.name}</div>
															<div className="text-[10.5px] text-slate-400 truncate">{w.url}</div>
														</div>
														<div className="flex items-center gap-1.5 shrink-0">
											<button
												type="button"
												onClick={() => handleSendTestWebhook(w.id)}
												className="px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-semibold text-[10px] border border-teal-500/40 transition-colors"
											>
												<Send className="w-3 h-3" />
												Test
											</button>
											<button
												type="button"
												onClick={() => webhookService.update(w.id, { active: !w.active })}
												className="px-2.5 py-1 rounded-lg bg-[#18203a] hover:bg-[#252e4d] text-slate-200 font-semibold text-[10px] border border-[#2c385c] transition-colors"
											>
												{w.active ? "Disable" : "Enable"}
											</button>
											<button
												type="button"
												onClick={() => handleDeleteWebhook(w.id)}
												className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-950 text-rose-200 font-semibold text-[10px] border border-rose-800 transition-colors"
											>
												Delete
											</button>
										</div>
									</div>
								</div>
								);
							})}
						</div>
					)}
							</div>
						)}

					{activeTab === "appearance" && (
						<div className="space-y-4">
							<h4 className="font-bold text-sm text-slate-100">Appearance</h4>
							<div className="p-3 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3">
								<div className="font-semibold text-slate-100 text-xs">Accent color</div>
								<div className="flex flex-wrap gap-2">
{( 
										[
											{ id: "gold", label: "Gold" },
											{ id: "teal", label: "Teal" },
											{ id: "emerald", label: "Emerald" },
											{ id: "sky", label: "Sky" },
										]
).map((c) => ( 
 
										<button
											key={c.id}
											type="button"
											onClick={() => {
												const root = document.documentElement;
												root.style.setProperty("--accent-gold", "#f4b942");
												root.style.setProperty("--accent-teal", "#5eead4");
												root.style.setProperty("--accent-emerald", "#34d399");
												root.style.setProperty("--accent-sky", "#0ea5e9");
												root.setAttribute("data-accent", c.id);
											}}
											className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
												document.documentElement.getAttribute("data-accent") === c.id
													? "bg-amber-500/15 border-amber-500/60 text-amber-300"
													: "bg-[#0a0e1a] border-[#1e2842] text-slate-400 hover:text-slate-200"
											}`}
										>
											{c.label}
										</button>
									))}
								</div>
								<p className="text-[11px] text-slate-400">Accent choices apply instantly and persist for this browser.</p>
							</div>
						</div>
					)}

					{/* Voice & Audio Section */}
					{activeTab === "audio" && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h4 className="font-bold text-sm text-slate-100">Voice &amp; Audio Settings</h4>
								<span
									className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
										voiceProvider === "ready"
											? "bg-teal-950/60 border-teal-800 text-teal-300"
											: "bg-slate-950/60 border-slate-700 text-slate-400"
									}`}
								>
									{voiceProvider === "ready" ? "ElevenLabs Studio Voices" : "Device Voices"}
								</span>
							</div>
							<div className="mb-4">
								{elevenLabsConnected ? (
									<span className="text-[11px] font-mono px-2 py-0.5 rounded bg-green-950/60 border border-green-800 text-green-300">
										ElevenLabs API connected
									</span>
								) : (
									<div className="flex items-center gap-2">
										<input
											type="password"
											value={elevenLabsKeyInput}
											onChange={(e) => setElevenLabsKeyInput(e.target.value)}
											placeholder="ELEVENLABS_API_KEY"
											className="bg-[#18203a] border border-[#263254] rounded-lg px-2 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-400/60 w-full max-w-xs"
											disabled={elevenLabsConnecting}
											aria-label="ElevenLabs API key"
										/>
										<button
											type="button"
											onClick={handleConnectElevenLabs}
											disabled={elevenLabsConnecting}
											className={`p-2 rounded-full transition-all ${
												elevenLabsConnecting
													? "bg-teal-500/20 border border-teal-500/50 text-teal-200 shadow-[0_0_10px_rgba(20,184,166,0.35)]"
													: "text-slate-400 hover:text-slate-200 hover:bg-[#1a233c]"
											}`}
											title="Connect ElevenLabs API"
										>
											{elevenLabsConnecting ? (
												<Loader2 className="w-4 h-4 animate-spin" />
											) : (
												<Mic className="w-4 h-4" />
											)}
										</button>
									</div>
								)}
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<div className="p-3.5 rounded-xl bg-[#12182b] border border-[#1e2842] flex items-center justify-between">
									<div>
										<div className="font-semibold text-slate-200 flex items-center gap-1.5">
											<Volume2 className="w-4 h-4 text-amber-400" />
											<span>Voice Playback</span>
										</div>
										<div className="text-[11px] text-slate-400">Enable text-to-speech for agents</div>
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
										<div className="text-[11px] text-slate-400">Silences ongoing speech</div>
									</div>
									<input
										type="checkbox"
										checked={ttsMuted}
										onChange={(e) => handleToggleMute(e.target.checked)}
										className="w-4 h-4 accent-rose-500 rounded"
									/>
								</div>
							</div>
							<div className="space-y-3 pt-2">
								<div className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
									<Sparkles className="w-3.5 h-3.5 text-amber-400" />
									<span>Agent Coworker Voice Profiles &amp; Previews:</span>
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
															<span className="text-[11px] text-slate-400 font-normal">· {agent.role}</span>
														</div>
														<div className="text-[10.5px] text-slate-400 truncate font-sans">{agent.personality}</div>
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
													<div className="flex items-center gap-2 shrink-0">
														{voiceProvider === "ready" && voiceCatalog.length > 0 && (
															<select
																value={ttsService.getElevenVoice(agent.seatId)}
																onChange={(e) => {
																	ttsService.setElevenVoice(agent.seatId, e.target.value || undefined);
																	setVoiceRegistry(ttsService.getVoiceRegistry());
																}}
																className="max-w-[130px] bg-[#18203a] border border-[#263254] rounded-lg px-2 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-400/60 truncate"
																title={`ElevenLabs studio voice for ${agent.displayName}`}
															>
																<option value="">Studio default</option>
																{voiceCatalog.map((v) => (
																	<option key={v.voiceId} value={v.voiceId}>
																		{v.name}
																		{v.category ? ` · ${v.category}` : ""}
																	</option>
																))}
															</select>
														)}
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
									<h4 className="font-bold text-sm text-slate-100">Inference &amp; Data Providers</h4>
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
										<div className="font-semibold text-slate-100 text-xs">Setup prompts for your local AI agent</div>
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
								<h4 className="font-bold text-sm text-slate-100 mb-2">Storage &amp; Cryptographic Integrity</h4>
								<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-3">
									<div className="font-semibold text-slate-200">Durable Server Persistence</div>
									<p className="text-[11px] text-slate-400 leading-relaxed">
										Conversation history, messages, and cryptographic audit records are durably saved
										server-side via SQLite (`audit.db` &amp; `data/conversations.db`).
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
									<p className="text-[11px] text-slate-400">Clear cached active runs and start fresh.</p>
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

						{activeTab === "github" && (
							<div className="space-y-4">
								<h4 className="font-bold text-sm text-slate-100 mb-2">
									GitHub Integration
								</h4>

								{!githubConfigured && (
									<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-4">
										<div className="font-semibold text-slate-200">
											Configure GitHub App
										</div>
										<p className="text-[11px] text-slate-400 leading-relaxed">
											Register a GitHub App at github.com/settings/apps and paste its
											credentials here. GovernMindz stores only the app id, slug,
											client id, and private key in .env.local (gitignored).
										</p>
										<div className="space-y-3">
											<div>
												<label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
													App ID (or Client ID)
												</label>
												<input
													type="text"
													value={githubAppId}
													onChange={(e) => setGithubAppId(e.target.value)}
													placeholder="123456"
													className="w-full rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
												/>
											</div>
											<div>
												<label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
													Client ID
												</label>
												<input
													type="text"
													value={githubClientId}
													onChange={(e) => setGithubClientId(e.target.value)}
													placeholder="Iv1...."
													className="w-full rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
												/>
											</div>
											<div>
												<label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
													App slug
												</label>
												<input
													type="text"
													value={githubSlug}
													onChange={(e) => setGithubSlug(e.target.value)}
													placeholder="governmindz-app"
													className="w-full rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
												/>
											</div>
											<div>
												<label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
													Private key (PEM)
												</label>
												<textarea
													value={githubPrivateKey}
													onChange={(e) => setGithubPrivateKey(e.target.value)}
													rows={4}
													placeholder="-----BEGIN RSA PRIVATE KEY-----..."
													className="w-full rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500/50"
												/>
											</div>
											<div>
												<label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
													Webhook secret (optional)
												</label>
												<input
													type="text"
													value={githubWebhookSecret}
													onChange={(e) => setGithubWebhookSecret(e.target.value)}
													placeholder="whsec_...."
													className="w-full rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
												/>
											</div>
											<button
												type="button"
												disabled={
													githubSaving ||
													!githubSlug ||
													!githubPrivateKey ||
													!(githubAppId || githubClientId)
												}
												onClick={handleConnectGitHub}
												className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
											>
												{githubSaving ? (
													<span>
														<Loader2 className="w-3.5 h-3.5 animate-spin" />
														<span>Saving...</span>
													</span>
												) : (
													<span>Save App Credentials</span>
												)}
											</button>
										</div>
									</div>
								)}

								{githubConfigured && !githubInstalled && (
									<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-4">
										<div className="font-semibold text-slate-200">
											Install GitHub App
										</div>
										<p className="text-[11px] text-slate-400 leading-relaxed">
											The GitHub App is configured but not yet installed. Click below to
											install it on your account/organization. GitHub will redirect back
											to GovernMindz automatically.
										</p>
										<button
											type="button"
											disabled={githubInstalling}
											onClick={handleInstallGitHubApp}
											className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
										>
											{githubInstalling ? (
												<span>
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
													<span>Installing...</span>
												</span>
											) : (
												<span>Install GitHub App</span>
											)}
										</button>
										<p className="text-[10px] text-slate-500">
											Set the app's setup URL to{" "}
											<code className="font-mono">
												http://127.0.0.1:8787/api/github/callback
											</code>{" "}
											in your GitHub App settings.
										</p>
									</div>
								)}

								{githubInstalled && (
									<div className="space-y-4">
										<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] flex items-center justify-between">
											<div className="flex items-center gap-3">
												<div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
													<GitBranch className="w-5 h-5 text-slate-200" />
												</div>
												<div>
													<div className="font-semibold text-slate-100">
														{githubAccount?.login}
													</div>
													<div className="text-[10px] text-teal-400 flex items-center gap-1">
														<div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
														Connected
													</div>
												</div>
											</div>
											<button
												type="button"
												onClick={handleDisconnectGitHub}
												className="px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 text-[10px] font-semibold transition-colors"
											>
												Disconnect
											</button>
										</div>

										<div className="space-y-2">
											<div className="flex items-center justify-between px-1">
												<h5 className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
													Accessible Repositories
												</h5>
												<button
													onClick={fetchGithubRepos}
													disabled={githubReposLoading}
													className="text-[10px] text-teal-400 hover:text-teal-300 disabled:opacity-50"
												>
													<RefreshCw className={`w-3 h-3 ${githubReposLoading ? "animate-spin" : ""}`} />
												</button>
											</div>

											<div className="max-h-72 overflow-y-auto rounded-xl border border-[#1e2842] bg-[#0a0e1a]/50 divide-y divide-[#1e2842]">
												{githubReposLoading && githubRepos.length === 0 ? (
													<div className="p-8 text-center">
														<Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-500 mb-2" />
														<div className="text-[11px] text-slate-500">
															Loading repositories...
														</div>
													</div>
												) : githubRepos.length === 0 ? (
													<div className="p-8 text-center text-[11px] text-slate-500">
														No repositories found.
													</div>
												) : (
													githubRepos.map((repo) => {
														const selected =
															githubSelectedIds.has(repo.id);
														return (
															<div
																key={repo.id}
																className="p-3 flex items-center justify-between hover:bg-[#12182b] transition-colors group"
															>
																<div className="flex items-center gap-3 min-w-0">
																	<input
																		type="checkbox"
																		checked={selected}
																		onChange={() =>
																			setGithubSelectedIds((prev) => {
																				const next = new Set(prev);
																				if (selected) next.delete(repo.id);
																				else next.add(repo.id);
																				return next;
																			})
																		}
																		className="w-3.5 h-3.5 accent-teal-500 rounded border-[#263254] bg-[#0a0e1a]"
																	/>
																	<div className="min-w-0">
																		<div className="flex items-center gap-2">
																			<span className="font-semibold text-slate-200 truncate">
																				{repo.name}
																			</span>
																			{repo.private && (
																				<span className="px-1.5 py-0.5 rounded-md bg-amber-950/30 border border-amber-800/30 text-[9px] text-amber-400 font-mono">
																					Private
																				</span>
																			)}
																		</div>
																		{repo.description && (
																			<div className="text-[10px] text-slate-500 truncate mt-0.5">
																				{repo.description}
																			</div>
																		)}
																	</div>
																</div>
																<div className="flex items-center gap-3 shrink-0 ml-4">
																	<div className="text-[10px] text-slate-500 font-mono hidden sm:block">
																		{repo.fullName.split("/")[0]}
																	</div>
																	<a
																		href={repo.htmlUrl}
																		target="_blank"
																		rel="noreferrer"
																		className="p-1.5 rounded-lg bg-[#18203a] border border-[#2c385c] text-slate-400 hover:text-teal-300 hover:border-teal-500/50 transition-all opacity-0 group-hover:opacity-100"
																	>
																		<ExternalLink className="w-3 h-3" />
																	</a>
																</div>
															</div>
														);
													})
												)}
											</div>
											{githubRepos.length > 0 && (
												<div className="space-y-2">
													<button
														type="button"
														disabled={githubSaving || githubSelectedIds.size === 0}
														onClick={handleSaveSelection}
														className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
													>
														{githubSaving ? (
															<span>
																<Loader2 className="w-3.5 h-3.5 animate-spin" />
																<span>Saving...</span>
															</span>
														) : (
															<span>
																Save Selection ({githubSelectedIds.size})
															</span>
														)}
													</button>
													<p className="text-[10px] text-slate-500">
														Selected repositories are synced into the project catalog so
														agents can reference them.
													</p>
												</div>
											)}
										</div>
									</div>
								)}
							</div>
						)}

						{/* Connect Local Project (read-only git metadata) */}
						<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-4">
							<div className="font-semibold text-slate-200">
								Connect Local Project
							</div>
							<p className="text-[11px] text-slate-400 leading-relaxed">
								Point GovernMindz at a local git repository on this machine.
								Read-only: GovernMindz reads git status, branch, and remote
								metadata only — it never clones, pulls, pushes, or writes to
								your local filesystem.
							</p>
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<input
										type="text"
										value={localProjectPath}
										onChange={(e) => setLocalProjectPath(e.target.value)}
										placeholder="/absolute/path/to/local/repo"
										className="flex-1 rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<button
										type="button"
										disabled={localConnecting || !localProjectPath.trim()}
										onClick={handleConnectLocalProject}
										className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition-colors"
									>
										{localConnecting ? (
											<span>
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
												Connecting...
											</span>
										) : (
											<span>Connect</span>
										)}
									</button>
								</div>
								<p className="text-[10px] text-slate-500">
									Enter an absolute path. Path must be inside this machine's
									GovernMindz directory and be a git repository.
								</p>
							</div>

							{localProjects.length > 0 && (
								<div className="space-y-2">
									<div className="flex items-center justify-between px-1">
										<h5 className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
											Connected Local Projects
										</h5>
										<button
											onClick={fetchLocalProjects}
											disabled={localProjectsLoading}
											className="text-[10px] text-teal-400 hover:text-teal-300 disabled:opacity-50"
										>
											<RefreshCw className={`w-3 h-3 ${localProjectsLoading ? "animate-spin" : ""}`} />
										</button>
									</div>
									<div className="max-h-64 overflow-y-auto rounded-xl border border-[#1e2842] bg-[#0a0e1a]/50 divide-y divide-[#1e2842]">
										{localProjectsLoading && localProjects.length === 0 ? (
											<div className="p-8 text-center">
												<Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-500 mb-2" />
												<div className="text-[11px] text-slate-500">
													Loading local projects...
												</div>
											</div>
										) : (
											localProjects.map((proj) => (
												<div
													key={proj.id}
													className="p-3 flex items-center justify-between hover:bg-[#12182b] transition-colors group"
												>
													<div className="flex items-center gap-3 min-w-0">
														<div className="min-w-0">
															<div className="flex items-center gap-2">
																<span className="font-semibold text-slate-200 truncate">
																	{proj.name}
																</span>
																{proj.workingTreeClean ? (
																	<span className="px-1.5 py-0.5 rounded-md bg-emerald-950/30 border border-emerald-800/30 text-[9px] text-emerald-400 font-mono">
																	Working tree: clean
																	</span>
																) : (
																	<span className="px-1.5 py-0.5 rounded-md bg-rose-950/30 border border-rose-800/30 text-[9px] text-rose-400 font-mono">
																	Working tree: dirty
																	</span>
																)}
															</div>
															<div className="text-[10px] text-slate-500 truncate mt-0.5">
																{proj.branch ? `Branch: ${proj.branch}` : ""}{" "}
																{proj.remoteUrl ? `· Remote: ${proj.remoteUrl}` : ""}
															</div>
															{(proj.ahead !== undefined || proj.behind !== undefined) && (
																<div className="text-[10px] text-slate-400 font-mono mt-0.5">
																	{proj.ahead !== undefined && proj.ahead > 0 ? `↑${proj.ahead}` : ""}{" "}
																	{proj.behind !== undefined && proj.behind > 0 ? `↓${proj.behind}` : ""}{" "}
																	{proj.ahead === 0 && proj.behind === 0 ? "Up to date" : ""}
																</div>
															)}
														</div>
													</div>
													<div className="flex items-center gap-2 shrink-0">
														<button
															type="button"
															onClick={() => handleDisconnectLocalProject(proj.id)}
															className="px-2.5 py-1 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 text-[10px] font-semibold transition-colors"
														>
															Disconnect
														</button>
													</div>
												</div>
											))
										)}
									</div>
									<p className="text-[10px] text-slate-500">
										Local project metadata is stored in the project catalog so
										agents can reference it during debates. Refresh re-reads
										git status on each open.
									</p>
								</div>
							)}
						</div>

						{/* AI Provider Registry */}
						<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-4">
							<div className="flex items-center justify-between">
								<div className="font-semibold text-slate-200">
									AI Providers
								</div>
								<span
									className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
										providers.length > 0
											? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
											: "bg-slate-950/60 border-slate-700 text-slate-400"
									}`}
								>
									{providers.length} configured
								</span>
							</div>
							<p className="text-[11px] text-slate-400 leading-relaxed">
								Configure AI inference providers (OpenAI, Anthropic, Google,
								OpenRouter, Meterless, custom). Configuring a provider stores
								credentials securely — it does NOT connect any external app.
							</p>
							<div className="space-y-3">
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
									<input
										type="text"
										value={newProviderName}
										onChange={(e) => setNewProviderName(e.target.value)}
										placeholder="Provider name"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<select
										value={newProviderType}
										onChange={(e) => setNewProviderType(e.target.value)}
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									>
										<option value="openai">OpenAI</option>
										<option value="anthropic">Anthropic</option>
										<option value="google">Google</option>
										<option value="openrouter">OpenRouter</option>
										<option value="meterless">Meterless</option>
										<option value="custom">Custom</option>
									</select>
									<input
										type="password"
										value={newProviderApiKey}
										onChange={(e) => setNewProviderApiKey(e.target.value)}
										placeholder="API key"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
									<input
										type="text"
										value={newProviderEndpoint}
										onChange={(e) => setNewProviderEndpoint(e.target.value)}
										placeholder="Endpoint (optional)"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<input
										type="text"
										value={newProviderModel}
										onChange={(e) => setNewProviderModel(e.target.value)}
										placeholder="Model (optional)"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<button
										type="button"
										disabled={
											creatingProvider ||
											!newProviderName ||
											!newProviderApiKey
										}
										onClick={handleCreateProvider}
										className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition-colors"
									>
										{creatingProvider ? (
											<span>
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
												Adding...
											</span>
										) : (
											<span>Add provider</span>
										)}
									</button>
								</div>
								{providers.length > 0 && (
									<div className="space-y-2">
										{providers.map((p) => (
											<div
												key={p.id}
												className="p-3 flex items-center justify-between hover:bg-[#12182b] transition-colors group"
											>
												<div className="flex items-center gap-3 min-w-0">
													<div className="min-w-0">
														<div className="flex items-center gap-2">
															<span className="font-semibold text-slate-200 truncate">
																{p.name}
															</span>
															<span
																className={`px-1.5 py-0.5 rounded-md ${
																	p.status === "enabled"
																		? "bg-emerald-950/30 border border-emerald-800/30 text-emerald-400"
																		: "bg-rose-950/30 border border-rose-800/30 text-rose-400"
																} text-[9px] font-mono`}
															>
																{p.status}
															</span>
															{p.type && (
																<span className="text-[10px] text-slate-500 font-mono">
																	· {p.type}
																</span>
															)}
														</div>
														{p.endpoint && (
															<div className="text-[10px] text-slate-500 truncate mt-0.5">
																{p.endpoint}
															</div>
														)}
														{p.model && (
															<div className="text-[10px] text-slate-500 truncate mt-0.5">
																Model: {p.model}
															</div>
														)}
													</div>
												</div>
												<div className="flex items-center gap-2 shrink-0">
													<button
														type="button"
														onClick={() =>
															handleUpdateProvider(p.id, {
																status:
																	p.status === "enabled"
																		? "disabled"
																		: "enabled",
															})
														}
														className="px-2.5 py-1 rounded-lg bg-[#18203a] hover:bg-[#252e4d] text-slate-200 font-semibold text-[10px] border border-[#2c385c] transition-colors"
													>
														{p.status === "enabled"
															? "Disable"
															: "Enable"}
													</button>
													<button
														type="button"
														onClick={() => handleDeleteProvider(p.id)}
														className="px-2.5 py-1 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 text-[10px] font-semibold transition-colors"
													>
														Delete
													</button>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</div>

						{/* External Client Registry */}
						<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-4">
							<div className="flex items-center justify-between">
								<div className="font-semibold text-slate-200">
									External AI Clients
								</div>
								<span
									className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
										clients.length > 0
											? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
											: "bg-slate-950/60 border-slate-700 text-slate-400"
									}`}
								>
									{clients.length} connected
								</span>
							</div>
							<p className="text-[11px] text-slate-400 leading-relaxed">
								External AI applications (Claude Desktop, Cursor, VS Code)
								connect via MCP. Each client must be approved before it can
								access project data.
							</p>
							<div className="space-y-3">
								<div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
									<input
										type="text"
										value={newClientName}
										onChange={(e) => setNewClientName(e.target.value)}
										placeholder="Client name"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<select
										value={newClientType}
										onChange={(e) => setNewClientType(e.target.value)}
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									>
										<option value="mcp">MCP Client</option>
										<option value="custom_api">Custom API</option>
										<option value="oauth">OAuth Client</option>
									</select>
									<input
										type="text"
										value={newClientUserId}
										onChange={(e) => setNewClientUserId(e.target.value)}
										placeholder="Your user ID"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<button
										type="button"
										disabled={
											creatingClient ||
											!newClientName ||
											!newClientUserId
										}
										onClick={handleCreateClient}
										className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition-colors"
									>
										{creatingClient ? (
											<span>
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
												Adding...
											</span>
										) : (
											<span>Add client</span>
										)}
									</button>
								</div>
								{clients.length > 0 && (
									<div className="space-y-2">
										{clients.map((c) => (
											<div
												key={c.id}
												className="p-3 flex items-center justify-between hover:bg-[#12182b] transition-colors group"
											>
												<div className="flex items-center gap-3 min-w-0">
													<div className="min-w-0">
														<div className="flex items-center gap-2">
															<span className="font-semibold text-slate-200 truncate">
																{c.name}
															</span>
															<span
																className={`px-1.5 py-0.5 rounded-md ${
																	c.status === "approved"
																		? "bg-emerald-950/30 border border-emerald-800/30 text-emerald-400"
																		: c.status === "pending"
																		? "bg-amber-950/30 border border-amber-800/30 text-amber-400"
																		: "bg-rose-950/30 border border-rose-800/30 text-rose-400"
																} text-[9px] font-mono`}
															>
																{c.status}
															</span>
														</div>
														<div className="text-[10px] text-slate-500 truncate mt-0.5">
															{c.clientType} · {c.userId}
														</div>
													</div>
												</div>
												<div className="flex items-center gap-2 shrink-0">
													{c.status === "pending" ? (
														<button
															type="button"
															onClick={() =>
																handleApproveClient(c.id)
															}
															className="px-2.5 py-1 rounded-lg bg-emerald-950/30 hover:bg-emerald-800/50 text-emerald-300 border border-emerald-800/40 text-[10px] font-semibold transition-colors"
														>
															Approve
														</button>
													) : (
														<button
															type="button"
															onClick={() =>
																handleRevokeClient(c.id)
															}
															className="px-2.5 py-1 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 text-[10px] font-semibold transition-colors"
														>
															Revoke
														</button>
													)}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</div>

						{/* Client Permissions */}
						<div className="p-4 rounded-xl bg-[#12182b] border border-[#1e2842] space-y-4">
							<div className="font-semibold text-slate-200">
								Client Permissions
							</div>
							<p className="text-[11px] text-slate-400 leading-relaxed">
								Grant project access to approved clients. Permission levels:
								OBSERVE (read-only), PROPOSE (ideas/plans), PREPARE (draft
								changes), EXECUTE (apply approved changes).
							</p>
							<div className="space-y-3">
								<div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
									<input
										type="text"
										value={permClientId}
										onChange={(e) => setPermClientId(e.target.value)}
										placeholder="Client ID"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<select
										value={permLevel}
										onChange={(e) => setPermLevel(e.target.value)}
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									>
										<option value="OBSERVE">OBSERVE</option>
										<option value="PROPOSE">PROPOSE</option>
										<option value="PREPARE">PREPARE</option>
										<option value="EXECUTE">EXECUTE</option>
									</select>
									<input
										type="text"
										value={permProjectId}
										onChange={(e) => setPermProjectId(e.target.value)}
										placeholder="Project ID (optional)"
										className="rounded-lg bg-[#0a0e1a] border border-[#263254] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
									/>
									<button
										type="button"
										disabled={
											grantingPermission ||
											!permClientId ||
											!permLevel
										}
										onClick={handleGrantPermission}
										className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition-colors"
									>
										{grantingPermission ? (
											<span>
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
												Granting...
											</span>
										) : (
											<span>Grant</span>
										)}
									</button>
								</div>
								{permissions.length > 0 && (
									<div className="space-y-2">
										{permissions.map((p) => (
											<div
												key={p.id}
												className="p-3 flex items-center justify-between hover:bg-[#12182b] transition-colors group"
											>
												<div className="min-w-0">
													<div className="flex items-center gap-2">
														<span className="font-semibold text-slate-200 truncate text-xs">
															Client: {p.clientId.slice(0, 12)}...
														</span>
														<span
															className={`px-1.5 py-0.5 rounded-md bg-[#18203a] border border-[#2c385c] text-[9px] text-slate-400 font-mono`}
														>
															{p.permissionLevel}
														</span>
													</div>
													{p.projectId && (
														<div className="text-[10px] text-slate-500 truncate mt-0.5">
															Project: {p.projectId}
														</div>
													)}
													{p.grantedTools &&
														p.grantedTools.length > 0 && (
															<div className="text-[10px] text-slate-500 truncate mt-0.5">
																Tools: {p.grantedTools.join(
																	", "
																)}
															</div>
														)}
												</div>
												<button
													type="button"
													onClick={() => {}}
													className="px-2.5 py-1 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 text-[10px] font-semibold transition-colors"
												>
													Revoke
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						</div>

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
