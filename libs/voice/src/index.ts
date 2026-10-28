import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";

export interface VoiceSummary {
	voiceId: string;
	name: string;
	category?: string;
	labels?: Record<string, string>;
	previewUrl?: string;
}

export interface SynthesisRequest {
	text: string;
	voiceId: string;
	modelId?: string;
	outputFormat?: string;
}

export const DEFAULT_BROADCAST_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export const DEFAULT_PERSONA_VOICE_IDS: Record<string, string> = {
	FactChecker: "EXAVITQu4vr4xnSDxMaL",
	CloudArchitect: "JBFqnCBsd6RMkjVDRZzb",
	Synthesizer: "XB0fDUnXU5powFXDhCwa",
	RivalChallenger: "onwK4e9ZLuTAKqWW03F9",
	Thinker: "XB0fDUnXU5powFXDhCwa",
	Orchestrator: "onwK4e9ZLuTAKqWW03F9",
	priya: "EXAVITQu4vr4xnSDxMaL",
	marcus: "JBFqnCBsd6RMkjVDRZzb",
	val: "XB0fDUnXU5powFXDhCwa",
	lucy: "XB0fDUnXU5powFXDhCwa",
	arturo: "onwK4e9ZLuTAKqWW03F9",
	raul: "onwK4e9ZLuTAKqWW03F9",
	DebateSummary: "XB0fDUnXU5powFXDhCwa",
};

export const CHAT_TTS_MODEL_ID = "eleven_flash_v2_5";
export const HIGH_FIDELITY_TTS_MODEL_ID = "eleven_v4";
export const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
export const MAX_SYNTHESIS_TEXT_CHARS = 6000;

export class VoiceService {
	private client: ElevenLabsClient | null = null;

	public isConfigured(): boolean {
		return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
	}

	private getClient(): ElevenLabsClient {
		const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
		if (!apiKey) {
			throw new Error(
				"ElevenLabs is not configured: ELEVENLABS_API_KEY is missing from the server environment.",
			);
		}
		if (!this.client) {
			this.client = new ElevenLabsClient({ apiKey });
		}
		return this.client;
	}

	public async synthesizeStream(request: SynthesisRequest): Promise<ReadableStream<Uint8Array>> {
		const text = (request.text || "").trim();
		if (!text) {
			throw new Error("Cannot synthesize empty speech text.");
		}
		if (text.length > MAX_SYNTHESIS_TEXT_CHARS) {
			throw new Error(
				`Speech text exceeds the ${MAX_SYNTHESIS_TEXT_CHARS} character limit (got ${text.length}).`,
			);
		}
		if (!request.voiceId?.trim()) {
			throw new Error("A voice ID is required to synthesize speech.");
		}
		const client = this.getClient();
		return client.textToSpeech.convert(request.voiceId.trim(), {
			text,
			modelId: request.modelId?.trim() || CHAT_TTS_MODEL_ID,
			outputFormat: (request.outputFormat ?? DEFAULT_OUTPUT_FORMAT) as
				ElevenLabs.TextToSpeechConvertRequestOutputFormat,
		});
	}

	public async listVoices(): Promise<VoiceSummary[]> {
		const response = await this.getClient().voices.getAll();
		const voices = Array.isArray(response?.voices) ? response.voices : [];
		return voices.map((voice) => ({
			voiceId: voice.voiceId,
			name: voice.name || voice.voiceId,
			category: voice.category,
			labels: voice.labels,
			previewUrl: voice.previewUrl,
		}));
	}

	public async createScribeSingleUseToken(): Promise<string> {
		const response = await this.getClient().tokens.singleUse.create("realtime_scribe");
		if (!response?.token) {
			throw new Error("ElevenLabs did not return a single-use scribe token.");
		}
		return response.token;
	}
}

export const voiceService = new VoiceService();
