/**
 * Synchronized Crew Exit Coordinator
 *
 * Coordinates the exit of participating crew bubbles so they exit together
 * in one synchronized visual transition ONLY after:
 * 1. All required work reaches a terminal state (synthesis & review complete)
 * 2. Final crew findings are collected and displayed
 * 3. Applicable voice playback or presentation sequence finishes
 * 4. Failure, timeout, or cancellation are handled explicitly
 */

export interface ExitCoordinatorOptions {
	isVoicePlaying?: () => boolean;
	isPresentationPlaying?: () => boolean;
	transitionDurationMs?: number;
	onStartClosing?: () => void;
	onFinalizeExit?: () => void;
}

export class SynchronizedExitCoordinator {
	private exitPending = false;
	private isClosing = false;
	private transitionTimer: any = null;
	private checkInterval: any = null;
	private options: ExitCoordinatorOptions;

	constructor(options: ExitCoordinatorOptions = {}) {
		this.options = {
			transitionDurationMs: 350,
			...options,
		};
	}

	public isPending(): boolean {
		return this.exitPending;
	}

	public isTransitioning(): boolean {
		return this.isClosing;
	}

	/**
	 * Request synchronized exit when terminal workflow event (complete/error) arrives.
	 */
	public requestExit(overrideOptions?: Partial<ExitCoordinatorOptions>): void {
		if (overrideOptions) {
			this.options = { ...this.options, ...overrideOptions };
		}

		this.exitPending = true;
		this.evaluateReadiness();
	}

	/**
	 * Called when voice or presentation queue status changes.
	 */
	public notifyPlaybackStateChange(): void {
		if (!this.exitPending || this.isClosing) return;
		this.evaluateReadiness();
	}

	/**
	 * Evaluate if all playback and presentation dependencies have settled.
	 */
	private evaluateReadiness(): void {
		const voiceActive = this.options.isVoicePlaying ? this.options.isVoicePlaying() : false;
		const presentationActive = this.options.isPresentationPlaying ? this.options.isPresentationPlaying() : false;

		if (voiceActive || presentationActive) {
			// Still playing: start polling check if not already running
			if (!this.checkInterval) {
				this.checkInterval = setInterval(() => {
					this.evaluateReadiness();
				}, 150);
			}
			return;
		}

		// Playback is clear: clear watchdog interval and execute synchronized exit
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}

		this.executeSynchronizedExit();
	}

	private executeSynchronizedExit(): void {
		if (this.isClosing) return;
		this.isClosing = true;
		this.exitPending = false;

		// 1. Begin synchronized closing transition (fade/scale together)
		if (this.options.onStartClosing) {
			this.options.onStartClosing();
		}

		// 2. After synchronized visual duration, finalize exit (unmount together)
		this.transitionTimer = setTimeout(() => {
			this.isClosing = false;
			if (this.options.onFinalizeExit) {
				this.options.onFinalizeExit();
			}
		}, this.options.transitionDurationMs ?? 350);
	}

	/**
	 * Force immediate exit without waiting (e.g. user reset or new conversation).
	 */
	public forceExit(): void {
		this.cancel();
		if (this.options.onFinalizeExit) {
			this.options.onFinalizeExit();
		}
	}

	/**
	 * Cancel any pending exit or timer.
	 */
	public cancel(): void {
		this.exitPending = false;
		this.isClosing = false;
		if (this.transitionTimer) {
			clearTimeout(this.transitionTimer);
			this.transitionTimer = null;
		}
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}
	}

	public destroy(): void {
		this.cancel();
	}
}
