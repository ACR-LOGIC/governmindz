/**
 * GovernMindz Demo Presentation Queue
 *
 * Implements a presentation-layer queue for Demo Mode so multi-agent
 * conversations flow in a natural, readable sequence rather than flashing
 * onto the screen too quickly.
 *
 * Architectural Guarantees:
 * 1. Independent of backend execution: backend SSE continues at full speed.
 * 2. Live mode bypass: Live conversations reveal immediately with 0 delay.
 * 3. Audio-aware pacing: coordinates with TTS playback when audio is enabled,
 *    but never freezes text if audio is slow, failed, or muted.
 * 4. Play, Pause, Resume, Reset controls with clean queue disposal.
 * 5. Active-thinking visibility: reveals `seat_thinking` and operational cues
 *    during the speaker transition window so users see which agent is working
 *    before their message lands.
 */

import { ttsService } from "./ttsService";

export interface DemoDisplayItem {
	id: string;
	type: "message" | "seat_thinking" | "crew" | "pre_cue" | "complete" | "error";
	payload: any;
	textLength?: number;
	fromSeat?: string;
}

export interface DemoTimingConfig {
	transitionDelayMs: number; // Speaker transition (400 - 700 ms)
	minReadingTimeMs: number;  // Minimum message display time (1000 - 2000 ms)
	maxReadingTimeMs: number;  // Max reading time cap
	wordsPerMinute: number;    // Estimated reading speed
	audioTimeoutMs: number;    // Safety timeout so slow audio never blocks text
}

export const DEFAULT_DEMO_TIMING: DemoTimingConfig = {
	transitionDelayMs: 450,
	minReadingTimeMs: 1100,
	maxReadingTimeMs: 2800,
	wordsPerMinute: 240,
	audioTimeoutMs: 6000,
};

export type DemoQueueState = "idle" | "playing" | "paused" | "completed";

export class DemoPresentationQueue {
	private queue: DemoDisplayItem[] = [];
	private state: DemoQueueState = "idle";
	private timing: DemoTimingConfig;
	private onReveal: (item: DemoDisplayItem) => void;
	private onStateChange: (state: DemoQueueState) => void;
	private currentTimer: any = null;
	private currentItem: DemoDisplayItem | null = null;
	private isAudioSpeakingCurrent = false;
	private audioUnsub: (() => void) | null = null;
	private isLiveMode = false;
	private remainingDuration = 0;
	private itemStartTime = 0;
	private targetDuration = 0;

	constructor(
		onReveal: (item: DemoDisplayItem) => void,
		onStateChange?: (state: DemoQueueState) => void,
		timing: Partial<DemoTimingConfig> = {},
	) {
		this.onReveal = onReveal;
		this.onStateChange = onStateChange || (() => {});
		this.timing = { ...DEFAULT_DEMO_TIMING, ...timing };

		// Track active audio speaker to coordinate speaker transitions
		this.audioUnsub = ttsService.subscribe((isSpeaking, _seat, msgId) => {
			if (this.currentItem && this.currentItem.payload?.message?.id === msgId) {
				this.isAudioSpeakingCurrent = isSpeaking;
			} else if (!isSpeaking) {
				this.isAudioSpeakingCurrent = false;
			}
		});
	}

	public setLiveMode(isLive: boolean) {
		this.isLiveMode = isLive;
		if (isLive) {
			this.reset();
		}
	}

	public getTiming(): DemoTimingConfig {
		return { ...this.timing };
	}

	public updateTiming(updates: Partial<DemoTimingConfig>) {
		this.timing = { ...this.timing, ...updates };
	}

	public getState(): DemoQueueState {
		return this.state;
	}

	/**
	 * Enqueues an incoming display event.
	 * If live mode is enabled, immediately reveals the event without queueing.
	 */
	public enqueue(item: DemoDisplayItem) {
		if (this.isLiveMode) {
			this.onReveal(item);
			return;
		}

		this.queue.push(item);

		if (this.state === "idle" || this.state === "completed") {
			this.setState("playing");
		}
		if (this.state === "playing" && !this.currentTimer && !this.currentItem) {
			this.processNext();
		}
	}

	public play() {
		if (this.state === "paused") {
			this.resume();
			return;
		}
		this.setState("playing");
		if (!this.currentTimer && !this.currentItem) {
			this.processNext();
		}
	}

	public pause() {
		if (this.state !== "playing") return;
		this.setState("paused");
		if (this.currentTimer) {
			clearTimeout(this.currentTimer);
			this.currentTimer = null;
		}
		const elapsed = Date.now() - this.itemStartTime;
		this.remainingDuration = Math.max(0, this.targetDuration - elapsed);
		ttsService.pause();
	}

	public resume() {
		if (this.state !== "paused") return;
		this.setState("playing");
		ttsService.resume();
		if (this.currentItem) {
			this.scheduleNextTransition(this.currentItem, this.remainingDuration);
		} else {
			this.processNext();
		}
	}

	public reset() {
		if (this.currentTimer) {
			clearTimeout(this.currentTimer);
			this.currentTimer = null;
		}
		this.queue = [];
		this.currentItem = null;
		this.isAudioSpeakingCurrent = false;
		this.remainingDuration = 0;
		this.targetDuration = 0;
		ttsService.stop();
		this.setState("idle");
	}

	public destroy() {
		this.reset();
		if (this.audioUnsub) {
			this.audioUnsub();
			this.audioUnsub = null;
		}
	}

	private setState(next: DemoQueueState) {
		if (this.state !== next) {
			this.state = next;
			this.onStateChange(next);
		}
	}

	/**
	 * Drains non-message operational items at the head of the queue so that
	 * `seat_thinking`, `crew`, and `pre_cue` states become visible during
	 * the speaker transition window before the next message is revealed.
	 */
	private drainLeadingOperationalItems(): boolean {
		let drainedAny = false;
		while (this.queue.length > 0 && this.queue[0].type !== "message") {
			const opItem = this.queue.shift()!;
			this.currentItem = opItem;
			this.onReveal(opItem);
			drainedAny = true;
		}
		return drainedAny;
	}

	private processNext() {
		if (this.state !== "playing") return;

		while (this.queue.length > 0) {
			const nextItem = this.queue.shift()!;
			this.currentItem = nextItem;
			this.onReveal(nextItem);

			if (nextItem.type === "message") {
				this.scheduleNextTransition(nextItem);
				return;
			}

			// If a seat_thinking event precedes a message at the start of the run,
			// hold briefly for transitionDelayMs so the thinking indicator is visible.
			if (
				nextItem.type === "seat_thinking" &&
				this.queue.length > 0 &&
				this.queue[0].type === "message" &&
				this.timing.transitionDelayMs > 0
			) {
				const leadInMs = Math.min(this.timing.transitionDelayMs, 240);
				this.targetDuration = leadInMs;
				this.itemStartTime = Date.now();
				this.currentTimer = setTimeout(() => {
					this.currentTimer = null;
					this.processNext();
				}, leadInMs);
				return;
			}
		}

		this.currentItem = null;
		this.setState("completed");
	}

	private scheduleNextTransition(item: DemoDisplayItem | null, customDuration?: number) {
		if (!item || this.state !== "playing") return;

		let displayDuration: number;
		if (typeof customDuration === "number") {
			displayDuration = customDuration;
		} else {
			const wordCount = item.textLength ? Math.max(1, Math.round(item.textLength / 5)) : 20;
			const calculatedReadingTime = Math.round((wordCount / this.timing.wordsPerMinute) * 60000);
			displayDuration = Math.max(
				this.timing.minReadingTimeMs,
				Math.min(this.timing.maxReadingTimeMs, calculatedReadingTime),
			);
		}

		this.targetDuration = displayDuration;
		this.itemStartTime = Date.now();

		const checkAdvance = () => {
			if (this.state !== "playing") return;

			const elapsed = Date.now() - this.itemStartTime;
			const audioStillPlaying = this.isAudioSpeakingCurrent && elapsed < this.timing.audioTimeoutMs;

			// If reading time has elapsed AND audio has completed (or timed out/muted), proceed to transition
			if (elapsed >= displayDuration && !audioStillPlaying) {
				// Reveal any pending operational/thinking cues at the start of the transition window
				// so the user sees the next speaker's active status before their message lands.
				this.drainLeadingOperationalItems();

				this.currentTimer = setTimeout(() => {
					this.currentTimer = null;
					this.processNext();
				}, this.timing.transitionDelayMs);
			} else {
				// Check again in short remaining slice
				const remaining = Math.max(10, Math.min(50, displayDuration - elapsed));
				this.currentTimer = setTimeout(checkAdvance, remaining);
			}
		};

		this.currentTimer = setTimeout(checkAdvance, Math.max(10, displayDuration));
	}
}
