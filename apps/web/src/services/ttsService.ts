// Local Text-to-Speech (Piper architecture with browser Web Speech Synthesis fallback)
// Assigns unique voice profiles, pitches, and cadences to each specialized agent on the roster.

export interface AgentVoiceProfile {
	seatId: string;
	piperModel: string;
	preferredVoiceName?: string;
	lang: string;
	pitch: number;
	rate: number;
}

export const AGENT_VOICE_PROFILES: Record<string, AgentVoiceProfile> = {
	FactChecker: {
		seatId: "FactChecker",
		piperModel: "en_US-lessac-high",
		lang: "en-US",
		pitch: 1.1,
		rate: 1.05,
	},
	CloudArchitect: {
		seatId: "CloudArchitect",
		piperModel: "en_US-ryan-medium",
		lang: "en-US",
		pitch: 0.85,
		rate: 0.95,
	},
	Synthesizer: {
		seatId: "Synthesizer",
		piperModel: "en_GB-alan-medium",
		lang: "en-GB",
		pitch: 1.0,
		rate: 1.0,
	},
	RivalChallenger: {
		seatId: "RivalChallenger",
		piperModel: "en_US-bryce-medium",
		lang: "en-US",
		pitch: 1.2,
		rate: 1.15,
	},
	Thinker: {
		seatId: "Thinker",
		piperModel: "en_US-amy-medium",
		lang: "en-US",
		pitch: 0.95,
		rate: 0.88,
	},
	CredibleSourcesResearchAgent: {
		seatId: "CredibleSourcesResearchAgent",
		piperModel: "en_US-lessac-medium",
		lang: "en-US",
		pitch: 1.08,
		rate: 1.02,
	},
	Orchestrator: {
		seatId: "Orchestrator",
		piperModel: "en_US-norman-medium",
		lang: "en-US",
		pitch: 1.05,
		rate: 1.02,
	},
	user: {
		seatId: "user",
		piperModel: "en_US-lessac-medium",
		lang: "en-US",
		pitch: 1.0,
		rate: 1.0,
	},
	// Cartoon character mappings
	vicky: { seatId: "vicky", piperModel: "en_US-amy-medium", lang: "en-US", pitch: 1.18, rate: 1.08 },
	arturo: { seatId: "arturo", piperModel: "en_US-ryan-medium", lang: "en-US", pitch: 0.9, rate: 1.0 },
	luis: { seatId: "luis", piperModel: "en_US-bryce-medium", lang: "en-US", pitch: 1.06, rate: 1.1 },
	shaniqua: { seatId: "shaniqua", piperModel: "en_GB-alan-medium", lang: "en-GB", pitch: 1.04, rate: 0.98 },
	rj: { seatId: "rj", piperModel: "en_US-norman-medium", lang: "en-US", pitch: 1.22, rate: 1.14 },
	lucy: { seatId: "lucy", piperModel: "en_US-lessac-high", lang: "en-US", pitch: 1.14, rate: 1.02 },
	tom: { seatId: "tom", piperModel: "en_US-ryan-medium", lang: "en-US", pitch: 0.82, rate: 0.92 },
	jovita: { seatId: "jovita", piperModel: "en_US-amy-medium", lang: "en-US", pitch: 1.02, rate: 1.0 },
	elvia: { seatId: "elvia", piperModel: "en_US-lessac-medium", lang: "en-US", pitch: 0.96, rate: 0.96 },
	raul: { seatId: "raul", piperModel: "en_US-norman-medium", lang: "en-US", pitch: 0.88, rate: 0.94 },
	alex: { seatId: "alex", piperModel: "en_US-bryce-medium", lang: "en-US", pitch: 1.08, rate: 1.08 },
	meche: { seatId: "meche", piperModel: "en_US-lessac-high", lang: "en-US", pitch: 1.12, rate: 1.04 },
	emely: { seatId: "emely", piperModel: "en_US-amy-medium", lang: "en-US", pitch: 1.16, rate: 1.12 },
	val: { seatId: "val", piperModel: "en_GB-alan-medium", lang: "en-GB", pitch: 0.94, rate: 0.95 },
	leah: { seatId: "leah", piperModel: "en_US-lessac-medium", lang: "en-US", pitch: 1.06, rate: 1.0 },
	abby: { seatId: "abby", piperModel: "en_US-lessac-high", lang: "en-US", pitch: 1.15, rate: 1.06 },
};

type SpeakCallback = (isSpeaking: boolean, seatId?: string | null, messageId?: string | null) => void;

interface QueuedUtterance {
	text: string;
	seatId: string;
	messageId?: string;
}

class TTSService {
	private enabled = false;
	private currentSpeakingSeat: string | null = null;
	private currentSpeakingMessageId: string | null = null;
	private listeners: Set<SpeakCallback> = new Set();
	private piperEndpoint = "http://127.0.0.1:5000/api/tts";
	private queue: QueuedUtterance[] = [];
	private isProcessingQueue = false;

	constructor() {
		if (typeof window !== "undefined") {
			this.enabled = localStorage.getItem("governmindz_tts_enabled") === "true";
		}
	}

	public isTtsEnabled(): boolean {
		return this.enabled;
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

	public getCurrentSpeaker() {
		return {
			seatId: this.currentSpeakingSeat,
			messageId: this.currentSpeakingMessageId,
		};
	}

	public subscribe(cb: SpeakCallback) {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
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

	public stop() {
		this.queue = [];
		this.isProcessingQueue = false;
		if (typeof window !== "undefined" && "speechSynthesis" in window) {
			window.speechSynthesis.cancel();
		}
		this.currentSpeakingSeat = null;
		this.currentSpeakingMessageId = null;
		this.notify();
	}

	/**
	 * Queues an utterance to be spoken in order so agents sound like a conversation
	 */
	public queueSpeak(text: string, seatId = "Synthesizer", messageId?: string) {
		if (!this.enabled || !text) return;
		this.queue.push({ text, seatId, messageId });
		if (!this.isProcessingQueue) {
			this.processQueue();
		}
	}

	private async processQueue() {
		if (!this.enabled || this.queue.length === 0) {
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

	public async speak(
		text: string,
		seatId = "Synthesizer",
		messageId?: string,
		onComplete?: () => void,
	) {
		if (!this.enabled || !text) {
			onComplete?.();
			return;
		}

		// Clean markdown and citations for speech
		const cleanText = text
			.replace(/```[\s\S]*?```/g, "Code block omitted.")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/https?:\/\/\S+/g, "external reference")
			.replace(/[*_#~]/g, "")
			.replace(/\([^)]+\)/g, "")
			.trim();

		if (!cleanText) {
			onComplete?.();
			return;
		}

		this.currentSpeakingSeat = seatId;
		this.currentSpeakingMessageId = messageId || null;
		this.notify();

		const lookupKey = seatId.toLowerCase();
		const profile =
			AGENT_VOICE_PROFILES[seatId] ||
			AGENT_VOICE_PROFILES[lookupKey] ||
			AGENT_VOICE_PROFILES.Synthesizer;

		// 1. Attempt local Piper HTTP API daemon if available
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 1200);

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
			// Piper daemon fallback
		}

		// 2. High-performance Browser Speech Synthesis fallback
		this.fallbackSpeechSynthesis(cleanText, profile, onComplete);
	}

	private fallbackSpeechSynthesis(
		cleanText: string,
		profile: AgentVoiceProfile,
		onComplete?: () => void,
	) {
		if (typeof window === "undefined" || !("speechSynthesis" in window)) {
			this.currentSpeakingSeat = null;
			this.currentSpeakingMessageId = null;
			this.notify();
			onComplete?.();
			return;
		}

		// Cancel any hanging utterance
		window.speechSynthesis.cancel();

		const utter = new SpeechSynthesisUtterance(cleanText);
		utter.pitch = profile.pitch;
		utter.rate = profile.rate;
		utter.lang = profile.lang;

		const voices = window.speechSynthesis.getVoices();
		if (voices.length > 0) {
			const matching = voices.find((v) => v.lang.startsWith(profile.lang.slice(0, 2)));
			if (matching) {
				utter.voice = matching;
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
