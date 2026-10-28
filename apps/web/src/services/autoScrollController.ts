import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

export interface AutoScrollMetrics {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
}

export interface AutoScrollState {
	isFollowing: boolean;
	unreadCount: number;
	hasNewActivity: boolean;
	distanceFromBottom: number;
}

export interface AutoScrollDecision {
	shouldScroll: boolean;
	behavior: ScrollBehavior;
	state: AutoScrollState;
}

export interface AutoScrollConfig {
	nearBottomThresholdPx?: number;
	programmaticGuardMs?: number;
}

export const DEFAULT_NEAR_BOTTOM_THRESHOLD_PX = 120;
export const DEFAULT_PROGRAMMATIC_GUARD_MS = 160;

/**
 * Pure, framework-agnostic auto-scroll state machine shared between
 * Demo Mode and Live Mode conversations.
 *
 * Tracks user scrolling separately from programmatic scrolling, suspends
 * auto-follow when the user scrolls upward to inspect earlier messages,
 * counts unread messages arriving outside the viewport, and resumes
 * auto-follow when the user returns near the bottom or triggers Jump to Latest.
 */
export class AutoScrollController {
	private readonly nearBottomThresholdPx: number;
	private readonly programmaticGuardMs: number;
	private state: AutoScrollState = {
		isFollowing: true,
		unreadCount: 0,
		hasNewActivity: false,
		distanceFromBottom: 0,
	};
	private programmaticUntil = 0;
	private lastScrollTop = 0;
	private seenMessageIds: Set<string> = new Set();

	constructor(config: AutoScrollConfig = {}) {
		this.nearBottomThresholdPx =
			config.nearBottomThresholdPx ?? DEFAULT_NEAR_BOTTOM_THRESHOLD_PX;
		this.programmaticGuardMs =
			config.programmaticGuardMs ?? DEFAULT_PROGRAMMATIC_GUARD_MS;
	}

	public getState(): AutoScrollState {
		return { ...this.state };
	}

	public isNearBottom(metrics: AutoScrollMetrics): boolean {
		const distance = Math.max(
			0,
			metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight,
		);
		return distance <= this.nearBottomThresholdPx;
	}

	public markProgrammaticScroll(now: number = Date.now()): void {
		this.programmaticUntil = now + this.programmaticGuardMs;
	}

	public isProgrammaticScrollActive(now: number = Date.now()): boolean {
		return now < this.programmaticUntil;
	}

	/**
	 * Handle a DOM scroll event from the scroll container.
	 */
	public handleScroll(
		metrics: AutoScrollMetrics,
		now: number = Date.now(),
	): AutoScrollState {
		const distanceFromBottom = Math.max(
			0,
			metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight,
		);
		const nearBottom = distanceFromBottom <= this.nearBottomThresholdPx;
		const scrolledUp = metrics.scrollTop < this.lastScrollTop - 4;
		this.lastScrollTop = Math.max(0, metrics.scrollTop);

		if (this.isProgrammaticScrollActive(now)) {
			// During programmatic scroll, update distance but never unfollow
			this.state = {
				...this.state,
				distanceFromBottom,
				...(nearBottom
					? {
							isFollowing: true,
							unreadCount: 0,
							hasNewActivity: false,
						}
					: {}),
			};
			return this.getState();
		}

		if (nearBottom) {
			this.state = {
				isFollowing: true,
				unreadCount: 0,
				hasNewActivity: false,
				distanceFromBottom,
			};
		} else if (scrolledUp || !this.state.isFollowing) {
			this.state = {
				...this.state,
				isFollowing: false,
				distanceFromBottom,
			};
		} else {
			// Content grew underneath while user didn't scroll up: only suspend if far from bottom
			this.state = {
				...this.state,
				isFollowing: distanceFromBottom <= this.nearBottomThresholdPx * 2,
				distanceFromBottom,
			};
		}

		return this.getState();
	}

	/**
	 * Evaluate a batch of conversation messages and decide whether to auto-scroll
	 * or increment the unread indicator.
	 */
	public syncMessages(messages: Pick<ChatMessage, "id" | "fromSeat" | "type">[]): AutoScrollDecision {
		let newMessagesCount = 0;
		let hasUserMessage = false;

		for (const msg of messages) {
			if (!this.seenMessageIds.has(msg.id)) {
				this.seenMessageIds.add(msg.id);
				newMessagesCount += 1;
				if (msg.fromSeat === "user" || msg.type === "user") {
					hasUserMessage = true;
				}
			}
		}

		if (newMessagesCount === 0) {
			return {
				shouldScroll: false,
				behavior: "auto",
				state: this.getState(),
			};
		}

		if (hasUserMessage) {
			this.state = {
				isFollowing: true,
				unreadCount: 0,
				hasNewActivity: false,
				distanceFromBottom: 0,
			};
			return {
				shouldScroll: true,
				behavior: "smooth",
				state: this.getState(),
			};
		}

		if (this.state.isFollowing) {
			this.state = {
				...this.state,
				unreadCount: 0,
				hasNewActivity: false,
			};
			return {
				shouldScroll: true,
				behavior: "smooth",
				state: this.getState(),
			};
		}

		this.state = {
			...this.state,
			unreadCount: this.state.unreadCount + newMessagesCount,
			hasNewActivity: true,
		};

		return {
			shouldScroll: false,
			behavior: "auto",
			state: this.getState(),
		};
	}

	/**
	 * Handle non-message activity (e.g. agent thinking indicator, streaming content growth,
	 * final answer card appearing, or layout resize).
	 */
	public onActivityUpdate(isSignificantActivity: boolean = true): AutoScrollDecision {
		if (this.state.isFollowing) {
			return {
				shouldScroll: true,
				behavior: "auto",
				state: this.getState(),
			};
		}

		if (isSignificantActivity) {
			this.state = {
				...this.state,
				hasNewActivity: true,
			};
		}

		return {
			shouldScroll: false,
			behavior: "auto",
			state: this.getState(),
		};
	}

	/**
	 * Explicitly resume following and clear unread activity counters.
	 */
	public jumpToLatest(): AutoScrollDecision {
		this.state = {
			isFollowing: true,
			unreadCount: 0,
			hasNewActivity: false,
			distanceFromBottom: 0,
		};
		return {
			shouldScroll: true,
			behavior: "smooth",
			state: this.getState(),
		};
	}

	/**
	 * Reset controller state when switching or resetting conversations.
	 */
	public reset(initialMessages: Pick<ChatMessage, "id">[] = []): AutoScrollState {
		this.seenMessageIds.clear();
		for (const msg of initialMessages) {
			this.seenMessageIds.add(msg.id);
		}
		this.programmaticUntil = 0;
		this.lastScrollTop = 0;
		this.state = {
			isFollowing: true,
			unreadCount: 0,
			hasNewActivity: false,
			distanceFromBottom: 0,
		};
		return this.getState();
	}
}

export interface UseConversationAutoScrollOptions {
	conversationId: string;
	messages: ChatMessage[];
	activityKey?: string | null;
	nearBottomThresholdPx?: number;
}

export function useConversationAutoScroll({
	conversationId,
	messages,
	activityKey,
	nearBottomThresholdPx = DEFAULT_NEAR_BOTTOM_THRESHOLD_PX,
}: UseConversationAutoScrollOptions) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
	const controllerRef = useRef<AutoScrollController>(
		new AutoScrollController({ nearBottomThresholdPx }),
	);
	const rafIdRef = useRef<number | null>(null);
	const lastConversationIdRef = useRef<string>(conversationId);

	const [scrollState, setScrollState] = useState<AutoScrollState>(() =>
		controllerRef.current.getState(),
	);

	const executeScrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		const container = containerRef.current;
		if (!container) return;

		if (rafIdRef.current !== null) {
			cancelAnimationFrame(rafIdRef.current);
		}

		rafIdRef.current = requestAnimationFrame(() => {
			rafIdRef.current = null;
			const el = containerRef.current;
			if (!el) return;

			controllerRef.current.markProgrammaticScroll();
			try {
				el.scrollTo({
					top: el.scrollHeight,
					behavior,
				});
			} catch {
				el.scrollTop = el.scrollHeight;
			}
			setScrollState(controllerRef.current.getState());
		});
	}, []);

	// Reset on conversation switch or when conversation messages are cleared
	useEffect(() => {
		if (lastConversationIdRef.current !== conversationId) {
			lastConversationIdRef.current = conversationId;
			const nextState = controllerRef.current.reset(messages);
			setScrollState(nextState);
			executeScrollToBottom("auto");
			return;
		}
		if (messages.length === 0) {
			const nextState = controllerRef.current.reset([]);
			setScrollState(nextState);
		}
	}, [conversationId, messages, executeScrollToBottom]);

	// Follow new messages when in follow mode; otherwise increment unread count
	useEffect(() => {
		const decision = controllerRef.current.syncMessages(messages);
		setScrollState(decision.state);
		if (decision.shouldScroll) {
			executeScrollToBottom(decision.behavior);
		}
	}, [messages, executeScrollToBottom]);

	// Follow active agent activity changes (e.g. seat_thinking, final answer card, crew status)
	useEffect(() => {
		if (!activityKey) return;
		const decision = controllerRef.current.onActivityUpdate(true);
		setScrollState(decision.state);
		if (decision.shouldScroll) {
			executeScrollToBottom("auto");
		}
	}, [activityKey, executeScrollToBottom]);

	// Observe dynamic height changes (streaming text, expanded evidence, tables) without jitter
	useEffect(() => {
		const contentEl = contentRef.current;
		if (!contentEl || typeof ResizeObserver === "undefined") return;

		let previousHeight = contentEl.getBoundingClientRect().height;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const nextHeight = entry.contentRect.height;
			if (Math.abs(nextHeight - previousHeight) < 4) return;
			const grew = nextHeight > previousHeight;
			previousHeight = nextHeight;

			if (grew && controllerRef.current.getState().isFollowing) {
				executeScrollToBottom("auto");
			}
		});

		observer.observe(contentEl);
		return () => {
			observer.disconnect();
		};
	}, [executeScrollToBottom]);

	// Cleanup pending animation frame on unmount
	useEffect(() => {
		return () => {
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
			}
		};
	}, []);

	const handleContainerScroll = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		const next = controllerRef.current.handleScroll({
			scrollTop: el.scrollTop,
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight,
		});
		setScrollState((prev) => {
			if (
				prev.isFollowing === next.isFollowing &&
				prev.unreadCount === next.unreadCount &&
				prev.hasNewActivity === next.hasNewActivity
			) {
				return prev;
			}
			return next;
		});
	}, []);

	const jumpToLatest = useCallback(() => {
		const decision = controllerRef.current.jumpToLatest();
		setScrollState(decision.state);
		executeScrollToBottom("smooth");
	}, [executeScrollToBottom]);

	return {
		containerRef,
		contentRef,
		bottomAnchorRef,
		scrollState,
		handleContainerScroll,
		jumpToLatest,
	};
}
