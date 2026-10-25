// Local Text-to-Speech Architecture & Centralized Voice Registry
// Provider-neutral interface mapping each agent to distinct voices, pitch, rate, and timbre.

export interface AgentVoiceRegistryEntry {
	seatId: string;
	displayName: string;
	role: string;
	avatarId: string;
	provider: "web-speech" | "piper" | "custom";
	voiceName: string;
	piperModel: string;
	lang: string;
	pitch: number;
	rate: number;
	enabled: boolean;
	personality: string;
}

export const DEFAULT_VOICE_REGISTRY: Record<string, AgentVoiceRegistryEntry> = {
	FactChecker: {
		seatId: "FactChecker",
		displayName: "Priya",
		role: "Fact Checker",
		avatarId: "priya",
		provider: "web-speech",
		voiceName: "Natural Observant Female",
		piperModel: "en_US-lessac-high",
		lang: "en-US",
		pitch: 1.12,
		rate: 1.05,
		enabled: true,
		personality: "Observant, crisp cadence; catches data anomalies and catalog mismatches.",
	},
	CloudArchitect: {
		seatId: "CloudArchitect",
		displayName: "Marcus",
		role: "Cloud Architect",
		avatarId: "marcus",
		provider: "web-speech",
		voiceName: "Composed Baritone Male",
		piperModel: "en_US-ryan-medium",
		lang: "en-US",
		pitch: 0.88,
		rate: 0.96,
		enabled: true,
		personality: "Composed, thoughtful, deeper timbre; enforces security boundaries.",
	},
	Synthesizer: {
		seatId: "Synthesizer",
		displayName: "Val",
		role: "Synthesizer",
		avatarId: "val",
		provider: "web-speech",
		voiceName: "Warm Articulate British",
		piperModel: "en_GB-alan-medium",
		lang: "en-GB",
		pitch: 1.02,
		rate: 1.0,
		enabled: true,
		personality: "Warm, articulate mediator; connects perspectives into consensus.",
	},
	RivalChallenger: {
		seatId: "RivalChallenger",
		displayName: "Arturo",
		role: "Rival Challenger",
		avatarId: "arturo",
		provider: "web-speech",
		voiceName: "Direct Tenor Male",
		piperModel: "en_US-bryce-medium",
		lang: "en-US",
		pitch: 0.94,
		rate: 1.08,
		enabled: true,
		personality: "Confident, skeptical, direct; stress-tests claims with audit rigor.",
	},
	Thinker: {
		seatId: "Thinker",
		displayName: "Lucy",
		role: "Thinker Agent",
		avatarId: "lucy",
		provider: "web-speech",
		voiceName: "Deliberate Reflective Female",
		piperModel: "en_US-amy-medium",
		lang: "en-US",
		pitch: 0.96,
		rate: 0.90,
		enabled: true,
		personality: "Reflective, measured pace; explores edge cases and blind spots.",
	},
	CredibleSourcesResearchAgent: {
		seatId: "CredibleSourcesResearchAgent",
		displayName: "Arturo",
		role: "Credible Research",
		avatarId: "arturo",
		provider: "web-speech",
		voiceName: "Authoritative Fastidious",
		piperModel: "en_US-lessac-medium",
		lang: "en-US",
		pitch: 1.06,
		rate: 1.02,
		enabled: true,
		personality: "Fastidious researcher; validates technical citations and registries.",
	},
	ContextAgent: {
		seatId: "ContextAgent",
		displayName: "Tom",
		role: "Context Agent",
		avatarId: "tom",
		provider: "web-speech",
		voiceName: "Calm Historian Male",
		piperModel: "en_US-ryan-medium",
		lang: "en-US",
		pitch: 0.84,
		rate: 0.92,
		enabled: true,
		personality: "Grounded, calm historian; tracks memory and precedent.",
	},
	SocialCommunityResearchAgent: {
		seatId: "SocialCommunityResearchAgent",
		displayName: "Jovita",
		role: "Community Agent",
		avatarId: "jovita",
		provider: "web-speech",
		voiceName: "Engaging Clear Female",
		piperModel: "en_US-amy-medium",
		lang: "en-US",
		pitch: 1.04,
		rate: 1.0,
		enabled: true,
		personality: "Engaging, clear; tracks community sentiment and user impact.",
	},
	Orchestrator: {
		seatId: "Orchestrator",
		displayName: "Raul",
		role: "Orchestrator / Mission Director",
		avatarId: "raul",
		provider: "web-speech",
		voiceName: "Flight Director Male",
		piperModel: "en_US-norman-medium",
		lang: "en-US",
		pitch: 0.90,
		rate: 0.95,
		enabled: true,
		personality: "Calm, authoritative leader; directs council lifecycle and final decrees.",
	},
	user: {
		seatId: "user",
		displayName: "Operator",
		role: "Human Reviewer",
		avatarId: "operator",
		provider: "web-speech",
		voiceName: "Narrator Neutral",
		piperModel: "en_US-lessac-medium",
		lang: "en-US",
		pitch: 1.0,
		rate: 1.0,
		enabled: true,
		personality: "Friendly conversational coworker voice.",
	},

	// Specific persona ID mappings for character avatars
	priya: {
		seatId: "priya",
		displayName: "Priya",
		role: "Fact Checker",
		avatarId: "priya",
		provider: "web-speech",
		voiceName: "Observant Fact Checker",
		piperModel: "en_US-lessac-high",
		lang: "en-US",
		pitch: 1.12,
		rate: 1.05,
		enabled: true,
		personality: "Observant, crisp; catches subtle inconsistencies.",
	},
	marcus: {
		seatId: "marcus",
		displayName: "Marcus",
		role: "Cloud Architect",
		avatarId: "marcus",
		provider: "web-speech",
		voiceName: "Composed Architect",
		piperModel: "en_US-ryan-medium",
		lang: "en-US",
		pitch: 0.88,
		rate: 0.96,
		enabled: true,
		personality: "Composed, thoughtful baritone.",
	},
	sophia: {
		seatId: "sophia",
		displayName: "Sophia",
		role: "Cloud Architect",
		avatarId: "sophia",
		provider: "web-speech",
		voiceName: "Pragmatic Architect Female",
		piperModel: "en_US-lessac-medium",
		lang: "en-US",
		pitch: 1.04,
		rate: 1.0,
		enabled: true,
		personality: "Pragmatic, articulate system designer.",
	},
	kenji: {
		seatId: "kenji",
		displayName: "Kenji",
		role: "Thinker Agent",
		avatarId: "kenji",
		provider: "web-speech",
		voiceName: "Contemplative Thinker",
		piperModel: "en_US-norman-medium",
		lang: "en-US",
		pitch: 0.92,
		rate: 0.92,
		enabled: true,
		personality: "Contemplative, nuanced reasoning.",
	},
	val: {
		seatId: "val",
		displayName: "Val",
		role: "Synthesizer",
		avatarId: "val",
		provider: "web-speech",
		voiceName: "Warm Consensus Leader",
		piperModel: "en_GB-alan-medium",
		lang: "en-GB",
		pitch: 1.02,
		rate: 1.0,
		enabled: true,
		personality: "Approachable, perceptive, connecting viewpoints.",
	},
	arturo: {
		seatId: "arturo",
		displayName: "Arturo",
		role: "Rival Challenger",
		avatarId: "arturo",
		provider: "web-speech",
		voiceName: "Direct Challenger",
		piperModel: "en_US-bryce-medium",
		lang: "en-US",
		pitch: 0.94,
		rate: 1.08,
		enabled: true,
		personality: "Confident, skeptical, sharp.",
	},
	lucy: {
		seatId: "lucy",
		displayName: "Lucy",
		role: "Thinker Agent",
		avatarId: "lucy",
		provider: "web-speech",
		voiceName: "Deep Inquisitive Female",
		piperModel: "en_US-amy-medium",
		lang: "en-US",
		pitch: 0.96,
		rate: 0.90,
		enabled: true,
		personality: "Thoughtful, deliberate cadence.",
	},
	vicky: {
		seatId: "vicky",
		displayName: "Vicky",
		role: "Fact Checker",
		avatarId: "vicky",
		provider: "web-speech",
		voiceName: "Energetic Sleuth",
		piperModel: "en_US-lessac-high",
		lang: "en-US",
		pitch: 1.16,
		rate: 1.06,
		enabled: true,
		personality: "Energetic empirical verification.",
	},
	rj: {
		seatId: "rj",
		displayName: "RJ",
		role: "Verification Lead",
		avatarId: "rj",
		provider: "web-speech",
		voiceName: "Dynamic Tenor",
		piperModel: "en_US-bryce-medium",
		lang: "en-US",
		pitch: 1.14,
		rate: 1.10,
		enabled: true,
		personality: "Dynamic, fast verification.",
	},
	raul: {
		seatId: "raul",
		displayName: "Raul",
		role: "Orchestrator / Mission Director",
		avatarId: "raul",
		provider: "web-speech",
		voiceName: "Mission Director",
		piperModel: "en_US-norman-medium",
		lang: "en-US",
		pitch: 0.90,
		rate: 0.95,
		enabled: true,
		personality: "Leadership, clear broadcast cadence.",
	},
	tom: {
		seatId: "tom",
		displayName: "Tom",
		role: "Context Agent",
		avatarId: "tom",
		provider: "web-speech",
		voiceName: "Calm Historian Male",
		piperModel: "en_US-ryan-medium",
		lang: "en-US",
		pitch: 0.84,
		rate: 0.92,
		enabled: true,
		personality: "Grounded, calm historian; tracks memory and precedent.",
	},
	jovita: {
		seatId: "jovita",
		displayName: "Jovita",
		role: "Community Agent",
		avatarId: "jovita",
		provider: "web-speech",
		voiceName: "Engaging Clear Female",
		piperModel: "en_US-amy-medium",
		lang: "en-US",
		pitch: 1.04,
		rate: 1.0,
		enabled: true,
		personality: "Engaging, clear; tracks community sentiment.",
	},
	luis: {
		seatId: "luis",
		displayName: "Luis",
		role: "Cloud Architect",
		avatarId: "luis",
		provider: "web-speech",
		voiceName: "Pragmatic Engineer Male",
		piperModel: "en_US-bryce-medium",
		lang: "en-US",
		pitch: 1.06,
		rate: 1.04,
		enabled: true,
		personality: "Pragmatic cloud architect; enforces zero-trust.",
	},
	shaniqua: {
		seatId: "shaniqua",
		displayName: "Shaniqua",
		role: "Synthesizer",
		avatarId: "shaniqua",
		provider: "web-speech",
		voiceName: "Warm Articulate Mediator",
		piperModel: "en_GB-alan-medium",
		lang: "en-GB",
		pitch: 1.04,
		rate: 0.98,
		enabled: true,
		personality: "Perceptive team mediator connecting viewpoints.",
	},
	alex: {
		seatId: "alex",
		displayName: "Alex",
		role: "Security Analyst",
		avatarId: "alex",
		provider: "web-speech",
		voiceName: "Direct Specialist Male",
		piperModel: "en_US-bryce-medium",
		lang: "en-US",
		pitch: 1.08,
		rate: 1.05,
		enabled: true,
		personality: "Attentive security analyst.",
	},
	meche: {
		seatId: "meche",
		displayName: "Meche",
		role: "Data Governance Lead",
		avatarId: "meche",
		provider: "web-speech",
		voiceName: "Crisp Analyst Female",
		piperModel: "en_US-lessac-high",
		lang: "en-US",
		pitch: 1.12,
		rate: 1.04,
		enabled: true,
		personality: "Crisp data governance specialist.",
	},
	emely: {
		seatId: "emely",
		displayName: "Emely",
		role: "Compliance Specialist",
		avatarId: "emely",
		provider: "web-speech",
		voiceName: "Thoughtful Auditor Female",
		piperModel: "en_US-amy-medium",
		lang: "en-US",
		pitch: 1.16,
		rate: 1.08,
		enabled: true,
		personality: "Detailed compliance auditor.",
	},
	leah: {
		seatId: "leah",
		displayName: "Leah",
		role: "Audit Specialist",
		avatarId: "leah",
		provider: "web-speech",
		voiceName: "Clear Inquisitive Female",
		piperModel: "en_US-lessac-medium",
		lang: "en-US",
		pitch: 1.06,
		rate: 1.0,
		enabled: true,
		personality: "Inquisitive audit specialist.",
	},
	abby: {
		seatId: "abby",
		displayName: "Abby",
		role: "Data Scientist",
		avatarId: "abby",
		provider: "web-speech",
		voiceName: "Analytical Female",
		piperModel: "en_US-lessac-high",
		lang: "en-US",
		pitch: 1.15,
		rate: 1.06,
		enabled: true,
		personality: "Analytical data scientist and researcher.",
	},
	elvia: {
		seatId: "elvia",
		displayName: "Elvia",
		role: "Operations Lead",
		avatarId: "elvia",
		provider: "web-speech",
		voiceName: "Measured Operations Female",
		piperModel: "en_US-lessac-medium",
		lang: "en-US",
		pitch: 0.96,
		rate: 0.96,
		enabled: true,
		personality: "Steady operations and reliability lead.",
	},
	DebateSummary: {
		seatId: "DebateSummary",
		displayName: "Val",
		role: "Synthesizer / Transcript Summary",
		avatarId: "val",
		provider: "web-speech",
		voiceName: "Warm Consensus Leader",
		piperModel: "en_GB-alan-medium",
		lang: "en-GB",
		pitch: 1.02,
		rate: 1.0,
		enabled: true,
		personality: "Warm, articulate summary synthesizer.",
	},
};

type SpeakCallback = (isSpeaking: boolean, seatId?: string | null, messageId?: string | null) => void;
type SequentialCallback = (isPlaying: boolean, currentIndex: number, total: number) => void;

interface QueuedUtterance {
	text: string;
	seatId: string;
	messageId?: string;
}

class TTSService {
	private enabled = true;
	private muted = false;
	private paused = false;
	private currentSpeakingSeat: string | null = null;
	private currentSpeakingMessageId: string | null = null;
	private listeners: Set<SpeakCallback> = new Set();
	private sequentialListeners: Set<SequentialCallback> = new Set();
	private piperEndpoint = "http://127.0.0.1:5000/api/tts";
	private queue: QueuedUtterance[] = [];
	private isProcessingQueue = false;
	private voiceRegistry: Map<string, AgentVoiceRegistryEntry> = new Map();

	// Sequential debate playback state
	private isSequentialActive = false;
	private sequentialMessages: Array<{ id: string; fromSeat: string; content: string; structured?: any }> = [];
	private sequentialIndex = 0;

	constructor() {
		if (typeof window !== "undefined") {
			const savedEnabled = localStorage.getItem("governmindz_tts_enabled");
			this.enabled = savedEnabled !== null ? savedEnabled === "true" : true;
			this.muted = localStorage.getItem("governmindz_tts_muted") === "true";
		}

		// Initialize registry from defaults
		for (const [key, val] of Object.entries(DEFAULT_VOICE_REGISTRY)) {
			this.voiceRegistry.set(key, { ...val });
		}
	}

	public isTtsEnabled(): boolean {
		return this.enabled && !this.muted;
	}

	public isMasterEnabled(): boolean {
		return this.enabled;
	}

	public isMuted(): boolean {
		return this.muted;
	}

	public setTtsEnabled(val: boolean) {
		this.enabled = val;
		if (typeof window !== "undefined") {
			localStorage.setItem("governmindz_tts_enabled", val ? "true" : "false");
		}
		if (!val) {
			this.stop();
		}
		this.notify();
	}

	public setMuted(val: boolean) {
		this.muted = val;
		if (typeof window !== "undefined") {
			localStorage.setItem("governmindz_tts_muted", val ? "true" : "false");
		}
		if (val) {
			this.stop();
		}
		this.notify();
	}

	public toggleMute(): boolean {
		this.setMuted(!this.muted);
		return this.muted;
	}

	public isPaused(): boolean {
		return this.paused;
	}

	public pause() {
		this.paused = true;
		if (typeof window !== "undefined" && "speechSynthesis" in window) {
			window.speechSynthesis.pause();
		}
	}

	public resume() {
		this.paused = false;
		if (typeof window !== "undefined" && "speechSynthesis" in window) {
			window.speechSynthesis.resume();
		}
	}

	public getCurrentSpeaker() {
		return {
			seatId: this.currentSpeakingSeat,
			messageId: this.currentSpeakingMessageId,
		};
	}

	public getVoiceRegistry(): AgentVoiceRegistryEntry[] {
		// Return primary roster seats first
		const primaryKeys = [
			"FactChecker",
			"CloudArchitect",
			"Synthesizer",
			"RivalChallenger",
			"Thinker",
			"CredibleSourcesResearchAgent",
			"ContextAgent",
			"SocialCommunityResearchAgent",
			"Orchestrator",
			"user",
		];
		const results: AgentVoiceRegistryEntry[] = [];
		for (const k of primaryKeys) {
			const entry = this.voiceRegistry.get(k);
			if (entry) results.push(entry);
		}
		return results;
	}

	public getVoiceProfile(seatIdOrName: string): AgentVoiceRegistryEntry {
		if (!seatIdOrName) {
			return this.voiceRegistry.get("Synthesizer") || DEFAULT_VOICE_REGISTRY.Synthesizer;
		}

		const direct = this.voiceRegistry.get(seatIdOrName);
		if (direct) return direct;

		const lower = seatIdOrName.toLowerCase();
		const lowerMatch = this.voiceRegistry.get(lower);
		if (lowerMatch) return lowerMatch;

		// Match by displayName, avatarId, or seatId
		for (const entry of this.voiceRegistry.values()) {
			if (
				entry.displayName.toLowerCase() === lower ||
				entry.avatarId.toLowerCase() === lower ||
				entry.seatId.toLowerCase() === lower
			) {
				return entry;
			}
		}

		// Fallback to Synthesizer
		return this.voiceRegistry.get("Synthesizer") || DEFAULT_VOICE_REGISTRY.Synthesizer;
	}

	public updateVoiceRegistryEntry(seatId: string, updates: Partial<AgentVoiceRegistryEntry>) {
		const existing = this.getVoiceProfile(seatId);
		this.voiceRegistry.set(seatId, { ...existing, ...updates });
	}

	public subscribe(cb: SpeakCallback) {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	public subscribeSequential(cb: SequentialCallback) {
		this.sequentialListeners.add(cb);
		return () => {
			this.sequentialListeners.delete(cb);
		};
	}

	private notify() {
		for (const cb of this.listeners) {
			try {
				cb(this.currentSpeakingSeat !== null, this.currentSpeakingSeat, this.currentSpeakingMessageId);
			} catch {
				// ignore
			}
		}
	}

	private notifySequential() {
		for (const cb of this.sequentialListeners) {
			try {
				cb(this.isSequentialActive, this.sequentialIndex, this.sequentialMessages.length);
			} catch {
				// ignore
			}
		}
	}

	public stop() {
		this.queue = [];
		this.isProcessingQueue = false;
		this.isSequentialActive = false;
		this.sequentialMessages = [];
		this.sequentialIndex = 0;
		this.paused = false;

		if (typeof window !== "undefined" && "speechSynthesis" in window) {
			window.speechSynthesis.cancel();
		}
		this.currentSpeakingSeat = null;
		this.currentSpeakingMessageId = null;
		this.notify();
		this.notifySequential();
	}

	/**
	 * Queues an utterance to be spoken in order so agents sound like a natural meeting
	 */
	public queueSpeak(text: string, seatIdOrName = "Synthesizer", messageId?: string) {
		if (!this.isTtsEnabled() || !text) return;
		this.queue.push({ text, seatId: seatIdOrName, messageId });
		if (!this.isProcessingQueue) {
			this.processQueue();
		}
	}

	private async processQueue() {
		if (!this.isTtsEnabled() || this.queue.length === 0) {
			this.isProcessingQueue = false;
			this.currentSpeakingSeat = null;
			this.currentSpeakingMessageId = null;
			this.notify();
			return;
		}

		this.isProcessingQueue = true;
		const next = this.queue.shift();
		if (!next) {
			this.isProcessingQueue = false;
			return;
		}

		await this.speak(next.text, next.seatId, next.messageId, () => {
			setTimeout(() => {
				this.processQueue();
			}, 300);
		});
	}

	/**
	 * Cleans rendered message text for speech — never speaks metadata, task IDs, round numbers, or code blocks
	 */
	public cleanTextForSpeech(text: string): string {
		if (!text) return "";

		// If input is a JSON string contract envelope, extract clean speech text
		if (text.trim().startsWith("{") && text.trim().endsWith("}")) {
			try {
				const parsed = JSON.parse(text);
				if (parsed.message?.text) {
					return this.cleanTextForSpeech(parsed.message.text);
				}
				if (parsed.position) {
					return this.cleanTextForSpeech(parsed.position);
				}
			} catch {
				// not json
			}
		}

		return text
			.replace(/```[\s\S]*?```/g, "Code block omitted.")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/<[^>]+>/g, " ")
			.replace(/https?:\/\/\S+/g, "reference link")
			.replace(/@\w+/g, (match) => match.replace("@", ""))
			.replace(/#+\s+/g, "")
			.replace(/[*_~]/g, "")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/Task:\s*[^.\n]+[.\n]/gi, "")
			.replace(/Round\s*\d+[:.]?/gi, "")
			.replace(/\{[\s\S]*?\}/g, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	/**
	 * Play through conversation messages sequentially so agents speak like real coworkers in meeting
	 */
	public playSequential(
		messages: Array<{ id: string; fromSeat: string; content: string; structured?: any }>,
	) {
		if (!this.isTtsEnabled() || messages.length === 0) return;

		this.stop();
		this.isSequentialActive = true;
		this.sequentialMessages = messages.filter((m) => {
			const text = m.structured?.position || m.content;
			return Boolean(this.cleanTextForSpeech(text));
		});
		this.sequentialIndex = 0;
		this.notifySequential();

		this.playNextSequentialMessage();
	}

	private playNextSequentialMessage() {
		if (!this.isSequentialActive || this.sequentialIndex >= this.sequentialMessages.length) {
			this.isSequentialActive = false;
			this.notifySequential();
			this.stop();
			return;
		}

		const current = this.sequentialMessages[this.sequentialIndex];
		const text = current.structured?.position || current.content;

		this.notifySequential();

		this.speak(text, current.fromSeat, current.id, () => {
			if (!this.isSequentialActive) return;
			this.sequentialIndex += 1;
			setTimeout(() => {
				this.playNextSequentialMessage();
			}, 350);
		});
	}

	public isSequentialPlaying(): boolean {
		return this.isSequentialActive;
	}

	/**
	 * Speaks a test phrase in the specified agent's voice for settings preview
	 */
	public async previewVoice(seatId: string, customPhrase?: string): Promise<void> {
		const profile = this.getVoiceProfile(seatId);
		const phrase =
			customPhrase ||
			`Hello! I'm ${profile.displayName}, serving as ${profile.role} on the GovernMindz council.`;
		await this.speak(phrase, seatId, `preview-${seatId}`);
	}

	/**
	 * Speaks an utterance in the agent's assigned personality voice
	 */
	public async speak(
		text: string,
		seatId = "Synthesizer",
		messageId?: string,
		onComplete?: () => void,
	) {
		if (!this.isTtsEnabled() || !text) {
			onComplete?.();
			return;
		}

		const cleanText = this.cleanTextForSpeech(text);
		if (!cleanText) {
			onComplete?.();
			return;
		}

		const profile = this.getVoiceProfile(seatId);
		if (!profile.enabled) {
			onComplete?.();
			return;
		}

		this.currentSpeakingSeat = seatId;
		this.currentSpeakingMessageId = messageId || null;
		this.notify();

		// 1. Try local Piper daemon if available
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 1000);

			const resp = await fetch(this.piperEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text: cleanText,
					model: profile.piperModel,
				}),
				signal: controller.signal,
			});
			clearTimeout(timeout);

			if (resp.ok) {
				const blob = await resp.blob();
				const audio = new Audio(URL.createObjectURL(blob));
				audio.onended = () => {
					this.currentSpeakingSeat = null;
					this.currentSpeakingMessageId = null;
					this.notify();
					onComplete?.();
				};
				audio.onerror = () => {
					this.fallbackSpeechSynthesis(cleanText, profile, onComplete);
				};
				await audio.play();
				return;
			}
		} catch {
			// fallback
		}

		// 2. High-performance Browser Speech Synthesis fallback with custom pitch and rate
		this.fallbackSpeechSynthesis(cleanText, profile, onComplete);
	}

	private fallbackSpeechSynthesis(
		cleanText: string,
		profile: AgentVoiceRegistryEntry,
		onComplete?: () => void,
	) {
		if (typeof window === "undefined" || !("speechSynthesis" in window)) {
			this.currentSpeakingSeat = null;
			this.currentSpeakingMessageId = null;
			this.notify();
			onComplete?.();
			return;
		}

		window.speechSynthesis.cancel();

		const utter = new SpeechSynthesisUtterance(cleanText);
		utter.pitch = profile.pitch;
		utter.rate = profile.rate;
		utter.lang = profile.lang;

		const voices = window.speechSynthesis.getVoices();
		if (voices.length > 0) {
			// Find appropriate voice by gender/lang hints
			const isFemale =
				profile.displayName === "Priya" ||
				profile.displayName === "Lucy" ||
				profile.displayName === "Sophia" ||
				profile.displayName === "Vicky" ||
				profile.displayName === "Jovita";

			const matchingLangVoices = voices.filter((v) =>
				v.lang.toLowerCase().startsWith(profile.lang.slice(0, 2).toLowerCase()),
			);

			if (matchingLangVoices.length > 0) {
				const matched =
					matchingLangVoices.find((v) =>
						isFemale
							? /female|woman|zira|samantha|karen|victoria|moira|fiona/i.test(v.name)
							: /male|man|david|daniel|george|alex|fred/i.test(v.name),
					) || matchingLangVoices[0];
				utter.voice = matched;
			}
		}

		utter.onend = () => {
			this.currentSpeakingSeat = null;
			this.currentSpeakingMessageId = null;
			this.notify();
			onComplete?.();
		};

		utter.onerror = () => {
			this.currentSpeakingSeat = null;
			this.currentSpeakingMessageId = null;
			this.notify();
			onComplete?.();
		};

		window.speechSynthesis.speak(utter);
	}
}

export const ttsService = new TTSService();
