import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
	Sparkles,
	ArrowRight,
	ArrowLeft,
	Check,
	X,
	Play,
	KeyRound,
	Settings,
	Zap,
	RefreshCw,
	Eye,
	CheckCircle2,
} from "lucide-react";

import {
	TOUR_STEPS,
	type TourHighlightItem,
	type TourStep,
} from "./tourSteps";

export type { TourHighlightItem, TourStep };

interface TourGuideProps {
	isOpen: boolean;
	onClose: () => void;
	onFinish: () => void;
	onStepChange?: (stepId: string, stepIndex: number) => void;
	onStartDemo?: () => void;
	onInspectAgent?: () => void;
	onOpenSettings?: () => void;
	onOpenCredentials?: () => void;
	onRefreshHealth?: () => void;
	onSwitchToLiveMode?: () => void;
	isDemoBusy?: boolean;
	hasMessages?: boolean;
	zetarisOnline?: boolean;
	meterlessOnline?: boolean;
}

export const TourGuide: React.FC<TourGuideProps> = ({
	isOpen,
	onClose,
	onFinish,
	onStepChange,
	onStartDemo,
	onInspectAgent,
	onOpenSettings,
	onOpenCredentials,
	onRefreshHealth,
	onSwitchToLiveMode,
	isDemoBusy = false,
	hasMessages = false,
	zetarisOnline = false,
	meterlessOnline = false,
}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
	const [windowSize, setWindowSize] = useState({
		width: typeof window !== "undefined" ? window.innerWidth : 1280,
		height: typeof window !== "undefined" ? window.innerHeight : 800,
	});

	// Reset to step 0 whenever tour is newly opened
	useEffect(() => {
		if (isOpen) {
			setCurrentIndex(0);
		}
	}, [isOpen]);

	const currentStep = useMemo(() => TOUR_STEPS[currentIndex] || TOUR_STEPS[0], [currentIndex]);

	// Notify parent whenever step changes so App can drive tabs, demo run, menus, and modals
	useEffect(() => {
		if (!isOpen || !currentStep) return;
		onStepChange?.(currentStep.id, currentIndex);
	}, [isOpen, currentStep, currentIndex, onStepChange]);

	// Calculate target element position and handle smooth scroll
	const updateTargetPosition = useCallback(() => {
		if (typeof window === "undefined") return;
		setWindowSize({ width: window.innerWidth, height: window.innerHeight });

		if (!isOpen || !currentStep?.selector) {
			setHighlightRect(null);
			return;
		}
		const el = document.querySelector(currentStep.selector);
		if (el) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				setHighlightRect(rect);
				return;
			}
		}
		setHighlightRect(null);
	}, [isOpen, currentStep]);

	// Auto scroll element into view when step changes
	useEffect(() => {
		if (!isOpen || !currentStep?.selector) return;
		const runPositionUpdate = () => {
			const el = document.querySelector(currentStep.selector!);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}
			updateTargetPosition();
		};
		runPositionUpdate();
		const t1 = setTimeout(runPositionUpdate, 100);
		const t2 = setTimeout(runPositionUpdate, 350);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
		};
	}, [isOpen, currentStep, updateTargetPosition]);

	// Listen to resize and scroll
	useEffect(() => {
		if (!isOpen) return;
		window.addEventListener("resize", updateTargetPosition);
		window.addEventListener("scroll", updateTargetPosition, true);
		return () => {
			window.removeEventListener("resize", updateTargetPosition);
			window.removeEventListener("scroll", updateTargetPosition, true);
		};
	}, [isOpen, updateTargetPosition]);

	const handleNext = useCallback(() => {
		if (currentIndex < TOUR_STEPS.length - 1) {
			setCurrentIndex(currentIndex + 1);
		} else {
			onFinish();
		}
	}, [currentIndex, onFinish]);

	const handleBack = useCallback(() => {
		if (currentIndex > 0) {
			setCurrentIndex(currentIndex - 1);
		}
	}, [currentIndex]);

	const handleSkip = useCallback(() => {
		onClose();
	}, [onClose]);

	// Keyboard controls (ArrowRight, ArrowLeft, Escape)
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (e.key === "Escape") {
				handleSkip();
			} else if (e.key === "ArrowRight") {
				handleNext();
			} else if (e.key === "ArrowLeft") {
				handleBack();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, handleNext, handleBack, handleSkip]);

	if (!isOpen) return null;

	// Calculate popover positioning style so dialog never blocks the highlighted UI or open modals/menus
	const getPopoverStyle = (): React.CSSProperties => {
		const { width: winWidth, height: winHeight } = windowSize;
		const cardWidth = Math.min(520, winWidth - 32);

		if (winWidth < 768) {
			return {
				position: "fixed",
				bottom: "16px",
				left: "16px",
				right: "16px",
				maxWidth: `${cardWidth}px`,
				margin: "0 auto",
				zIndex: 110,
			};
		}

		// Step 4 (composer at bottom): place tour card near top-center so bottom composer + popovers are 100% visible
		if (currentStep.id === "composer") {
			return {
				position: "fixed",
				top: "72px",
				left: "50%",
				transform: "translateX(-50%)",
				width: `${cardWidth}px`,
				zIndex: 110,
			};
		}

		// Step 8 (outputs export menu on top-right): place tour card on bottom-left so open export menu is unobstructed
		if (currentStep.id === "outputs") {
			return {
				position: "fixed",
				bottom: "24px",
				left: "24px",
				width: `${cardWidth}px`,
				zIndex: 110,
			};
		}

		// Step 9 (credentials / settings modal in center): dock tour card to bottom-right so user can interact with the modal
		if (currentStep.id === "settings") {
			return {
				position: "fixed",
				bottom: "20px",
				right: "20px",
				width: `${Math.min(480, cardWidth)}px`,
				zIndex: 110,
			};
		}

		if (!highlightRect) {
			return {
				position: "fixed",
				bottom: "24px",
				left: "50%",
				transform: "translateX(-50%)",
				width: `${cardWidth}px`,
				zIndex: 110,
			};
		}

		// If element is in header (mode, explorer, evidence)
		if (highlightRect.top < 120 && highlightRect.bottom < winHeight * 0.35) {
			const idealLeft = highlightRect.left + highlightRect.width / 2 - cardWidth / 2;
			const clampedLeft = Math.max(16, Math.min(winWidth - cardWidth - 16, idealLeft));
			return {
				position: "fixed",
				top: `${Math.min(winHeight - 420, highlightRect.bottom + 18)}px`,
				left: `${clampedLeft}px`,
				width: `${cardWidth}px`,
				zIndex: 110,
			};
		}

		// If element is on the right side (roster)
		if (highlightRect.left > winWidth * 0.55) {
			const cardRight = Math.max(24, winWidth - highlightRect.left + 20);
			const idealTop = Math.max(68, Math.min(winHeight - 430, highlightRect.top + 16));
			return {
				position: "fixed",
				top: `${idealTop}px`,
				right: `${cardRight}px`,
				width: `${cardWidth}px`,
				zIndex: 110,
			};
		}

		// If element is on the left side (sidebar options / history)
		if (highlightRect.right < winWidth * 0.45) {
			const cardLeft = Math.min(winWidth - cardWidth - 20, highlightRect.right + 20);
			const idealTop = Math.max(68, Math.min(winHeight - 430, highlightRect.top));
			return {
				position: "fixed",
				top: `${idealTop}px`,
				left: `${cardLeft}px`,
				width: `${cardWidth}px`,
				zIndex: 110,
			};
		}

		// Large central element (chat): dock at bottom-right so chat bubbles and parallel crews are clearly visible
		return {
			position: "fixed",
			bottom: "24px",
			right: "24px",
			width: `${cardWidth}px`,
			zIndex: 110,
		};
	};

	// Pad cutout dimensions around target element
	const pad = 6;
	const cutoutX = highlightRect ? Math.max(0, highlightRect.left - pad) : 0;
	const cutoutY = highlightRect ? Math.max(0, highlightRect.top - pad) : 0;
	const cutoutW = highlightRect ? Math.max(0, highlightRect.width + pad * 2) : 0;
	const cutoutH = highlightRect ? Math.max(0, highlightRect.height + pad * 2) : 0;

	return (
		<div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
			{/* SVG Mask: Transparent cutout over highlighted element, softened backdrop everywhere else */}
			<svg
				className="fixed inset-0 w-full h-full pointer-events-none select-none"
				xmlns="http://www.w3.org/2000/svg"
				width="100%"
				height="100%"
			>
				<defs>
					<mask id="tour-spotlight-mask">
						<rect x="0" y="0" width="100%" height="100%" fill="white" />
						{highlightRect && (
							<rect
								x={cutoutX}
								y={cutoutY}
								width={cutoutW}
								height={cutoutH}
								rx="20"
								ry="20"
								fill="black"
							/>
						)}
					</mask>
				</defs>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					fill="#03050a"
					fillOpacity={currentStep.id === "settings" || currentStep.id === "outputs" ? "0.5" : "0.72"}
					mask="url(#tour-spotlight-mask)"
				/>
			</svg>

			{/* Spotlight luminous border around the cutout */}
			{highlightRect && (
				<div
					style={{
						top: `${cutoutY}px`,
						left: `${cutoutX}px`,
						width: `${cutoutW}px`,
						height: `${cutoutH}px`,
					}}
					className="fixed pointer-events-none z-[105] rounded-2xl border-2 border-amber-400/80 shadow-[0_0_40px_rgba(245,158,11,0.5)] ring-1 ring-amber-300/60 transition-all duration-400"
				>
					<div className="absolute -top-3 right-3 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-lg shadow-amber-950/50 flex items-center gap-1">
						<Sparkles className="w-2.5 h-2.5" />
						<span>Guided Spotlight</span>
					</div>
				</div>
			)}

			{/* Tour Dialog Popover */}
			<div style={getPopoverStyle()} className="pointer-events-auto animate-scaleUp">
				<div className="bg-[#0d1326]/90 border-2 border-amber-500/60 rounded-2xl shadow-2xl p-4 sm:p-5 text-slate-100 space-y-3.5 backdrop-blur-[24px] max-h-[82vh] flex flex-col glass-panel">
					{/* Header bar */}
					<div className="flex items-center justify-between border-b border-[#1b2542] pb-2.5 shrink-0">
						<div className="flex items-center gap-2.5">
							<img
								src="/governmindz-logo.png"
								alt="GovernMindz logo"
								className="h-8 w-8 rounded-full object-cover ring-1 ring-amber-500/40 shadow-sm shadow-amber-500/10"
							/>
							<div>
								<div className="flex items-center gap-2">
									<span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
										{currentStep.badge}
									</span>
									<span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30">
										Interactive Guided Tour
									</span>
								</div>
								<h3 className="text-sm font-bold text-white flex items-center gap-1.5 leading-snug mt-0.5">
									{currentStep.title}
								</h3>
							</div>
						</div>
						<button
							type="button"
							onClick={handleSkip}
							className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-[#1a233d] transition-colors"
							title="Close tour (Esc)"
							aria-label="Close tour"
						>
							<X className="w-4 h-4" />
						</button>
					</div>

					{/* Step description + detailed feature checklist */}
					<div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
						<p className="text-xs text-slate-200 leading-relaxed">{currentStep.description}</p>

						<div className="space-y-1.5">
							{currentStep.highlights.map((item, idx) => (
								<div
									key={idx}
									className="p-2 rounded-xl bg-[#121a33]/90 border border-[#1f2c52] text-[11px] leading-snug space-y-0.5"
								>
									<div className="font-bold text-amber-300 flex items-center gap-1.5">
										<CheckCircle2 className="w-3 h-3 text-teal-400 shrink-0" />
										<span>{item.label}</span>
									</div>
									<div className="text-slate-300 pl-4.5">{item.detail}</div>
								</div>
							))}
						</div>

						{/* Step-Specific Interactive Action Bar */}
						{(currentStep.id === "chat" ||
							currentStep.id === "roster" ||
							currentStep.id === "settings" ||
							currentStep.id === "ready-live") && (
							<div className="pt-1 flex flex-wrap items-center gap-2">
								{currentStep.id === "chat" && onStartDemo && (
									<button
										type="button"
										onClick={onStartDemo}
										disabled={isDemoBusy}
										className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 text-teal-200 text-xs font-semibold transition-all disabled:opacity-60"
									>
										<Play className="w-3.5 h-3.5 text-teal-300 fill-current" />
										<span>
											{isDemoBusy
												? "Demo Deliberation Running Live…"
												: hasMessages
													? "Replay Demo Deliberation"
													: "Start Demo Deliberation Now"}
										</span>
									</button>
								)}

								{currentStep.id === "roster" && onInspectAgent && (
									<button
										type="button"
										onClick={onInspectAgent}
										className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 text-teal-200 text-xs font-semibold transition-all"
									>
										<Eye className="w-3.5 h-3.5 text-teal-300" />
										<span>Inspect Agent Reasoning Scratchpad</span>
									</button>
								)}

								{currentStep.id === "settings" && (
									<>
										{onOpenCredentials && (
											<button
												type="button"
												onClick={onOpenCredentials}
												className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-xs font-semibold transition-all"
											>
												<KeyRound className="w-3.5 h-3.5 text-amber-300" />
												<span>Open API Keys &amp; Secrets Vault</span>
											</button>
										)}
										{onOpenSettings && (
											<button
												type="button"
												onClick={onOpenSettings}
												className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18223f] hover:bg-[#223056] border border-[#2d3e6e] text-slate-200 text-xs font-semibold transition-all"
											>
												<Settings className="w-3.5 h-3.5 text-teal-300" />
												<span>View System Settings</span>
											</button>
										)}
									</>
								)}

								{currentStep.id === "ready-live" && (
									<div className="w-full space-y-2">
										<div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0b1528] border border-[#1e3358] text-xs">
											<div className="flex items-center gap-3">
												<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
													<span
														className={`w-2 h-2 rounded-full ${
															meterlessOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
														}`}
													/>
													Meterless: {meterlessOnline ? "ONLINE" : "READY"}
												</span>
												<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
													<span
														className={`w-2 h-2 rounded-full ${
															zetarisOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
														}`}
													/>
													Zetaris: {zetarisOnline ? "CONNECTED" : "CONFIGURED"}
												</span>
											</div>
											{onRefreshHealth && (
												<button
													type="button"
													onClick={onRefreshHealth}
													className="inline-flex items-center gap-1 text-[11px] text-teal-300 hover:text-white font-semibold"
												>
													<RefreshCw className="w-3 h-3" />
													<span>Verify</span>
												</button>
											)}
										</div>
										{onSwitchToLiveMode && (
											<button
												type="button"
												onClick={onSwitchToLiveMode}
												className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold shadow-md transition-all"
											>
												<Zap className="w-3.5 h-3.5 fill-current" />
												<span>Switch to Live Mode Now &amp; Finish Tour</span>
											</button>
										)}
									</div>
								)}
							</div>
						)}
					</div>

					{/* Step Dots indicator */}
					<div className="flex items-center justify-center gap-1.5 py-0.5 shrink-0">
						{TOUR_STEPS.map((step, idx) => (
							<button
								key={step.id}
								type="button"
								onClick={() => setCurrentIndex(idx)}
								className={`h-1.5 rounded-full transition-all duration-300 ${
									idx === currentIndex
										? "w-6 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
										: idx < currentIndex
											? "w-2 bg-teal-400/70 hover:bg-teal-300"
											: "w-1.5 bg-slate-700 hover:bg-slate-500"
								}`}
								title={`${step.badge}: ${step.title}`}
								aria-label={`Go to ${step.badge}`}
							/>
						))}
					</div>

					{/* Navigation action buttons */}
					<div className="flex items-center justify-between pt-2 border-t border-[#1b2542] shrink-0">
						<button
							type="button"
							onClick={handleSkip}
							className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-[#161f36] transition-colors"
						>
							Skip Introduction
						</button>

						<div className="flex items-center gap-2">
							{currentIndex > 0 && (
								<button
									type="button"
									onClick={handleBack}
									className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-[#161f36] hover:bg-[#1d2948] border border-[#232f50] transition-colors"
								>
									<ArrowLeft className="w-3.5 h-3.5" />
									Back
								</button>
							)}

							<button
								type="button"
								onClick={handleNext}
								className="flex items-center gap-1.5 text-xs font-bold text-slate-950 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-md shadow-amber-950/40 active:scale-95 transition-all"
							>
								{currentIndex === TOUR_STEPS.length - 1 ? (
									<>
										<Check className="w-3.5 h-3.5" />
										Finish Tour
									</>
								) : (
									<>
										Next
										<ArrowRight className="w-3.5 h-3.5" />
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
