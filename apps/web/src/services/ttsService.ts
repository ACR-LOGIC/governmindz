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
		pitch: 1.15,
		rate: 1.15,
	},
	Thinker: {
		seatId: "Thinker",
		piperModel: "en_US-amy-medium",
		lang: "en-US",
		pitch: 0.95,
		rate: 0.88,
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
};

type SpeakCallback = (isSpeaking: boolean, seatId?: string | null, messageId?: string | null) => void;

class TTSService {
	private enabled = false;
	private currentSpeakingSeat: string | null = null;
	private currentSpeakingMessageId: string | null = null;
	private listeners: Set<SpeakCallback> = new Set();
	private piperEndpoint = "http://127.0.0.1:5000/api/tts"; // local piper daemon if present

	constructor() {
		// Read persisted preference
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
		if (typeof window !== "undefined" && "speechSynthesis" in window) {
			window.speechSynthesis.cancel();
		}
		this.currentSpeakingSeat = null;
		this.currentSpeakingMessageId = null;
		this.notify();
	}

	public async speak(text: string, seatId = "Synthesizer", messageId?: string) {
		if (!this.enabled || !text) return;

		// Clean markdown and citations for speech
		const cleanText = text
			.replace(/```[\s\S]*?```/g, "Code block omitted.")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/https?:\/\/\S+/g, "link")
			.replace(/[*_#~]/g, "")
			.replace(/\([^)]+\)/g, "")
			.trim();

		if (!cleanText) return;

		this.stop();
		this.currentSpeakingSeat = seatId;
		this.currentSpeakingMessageId = messageId || null;
		this.notify();

		const profile = AGENT_VOICE_PROFILES[seatId] || AGENT_VOICE_PROFILES.Synthesizer;

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
				};
				audio.onerror = () => {
					this.fallbackSpeechSynthesis(cleanText, profile);
				};
				await audio.play();
				return;
			}
		} catch {
			// Piper daemon not running locally — fall back seamlessly to local browser synthesis
		}

		// 2. High-performance Browser Speech Synthesis fallback with custom voice parameters
		this.fallbackSpeechSynthesis(cleanText, profile);
	}

	private fallbackSpeechSynthesis(cleanText: string, profile: AgentVoiceProfile) {
		if (typeof window === "undefined" || !("speechSynthesis" in window)) {
			this.currentSpeakingSeat = null;
			this.currentSpeakingMessageId = null;
			this.notify();
			return;
		}

		const utter = new SpeechSynthesisUtterance(cleanText);
		utter.pitch = profile.pitch;
		utter.rate = profile.rate;
		utter.lang = profile.lang;

		// Try to select a fitting voice
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
		};

		utter.onerror = () => {
			this.currentSpeakingSeat = null;
			this.currentSpeakingMessageId = null;
			this.notify();
		};

		window.speechSynthesis.speak(utter);
	}
}

export const ttsService = new TTSService();
