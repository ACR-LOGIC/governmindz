import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Sparkles, ArrowRight, ArrowLeft, Check, X, Compass } from "lucide-react";

export interface TourStep {
	id: string;
	title: string;
	description: string;
	selector?: string;
	badge?: string;
}

interface TourGuideProps {
	isOpen: boolean;
	onClose: () => void;
	onFinish: () => void;
}

const TOUR_STEPS: TourStep[] = [
	{
		id: "chat",
		title: "AI Multi-Agent Group Chat",
		description:
			"Deliberations unfold here as specialized agents debate federated data governance. Review synthesized consensus conclusions, evidence citations, and rate agent responses.",
		selector: "#tour-chat",
		badge: "Step 1 of 5",
	},
	{
		id: "roster",
		title: "Active Agent Council & Live Reasoning",
		description:
			"Observe specialized agents with rotating human names and domain tasks. Click any agent avatar to inspect their live reasoning scratchpad and evidence matrix.",
		selector: "#tour-roster",
		badge: "Step 2 of 5",
	},
	{
		id: "history",
		title: "Conversation & Debate History",
		description:
			"Access and manage your persistent multi-agent debate history, create new debates, and switch between past governance sessions.",
		selector: "#tour-history",
		badge: "Step 3 of 5",
	},
	{
		id: "mode",
		title: "Demo & Live Mode Governance",
		description:
			"Switch between deterministic Demo mode with guided prompt scenarios and Live mode connected to real Zetaris Lightning and Meterless AI engines.",
		selector: "#tour-mode",
		badge: "Step 4 of 5",
	},
	{
		id: "explorer",
		title: "Execution Explorer & Tamper-Evident Audit",
		description:
			"Verify the full 12-state orchestration lifecycle, inspect Zetaris federated SQL queries, and validate the SHA-256 cryptographic audit trail ledger.",
		selector: "#tour-explorer",
		badge: "Step 5 of 5",
	},
];

export const TourGuide: React.FC<TourGuideProps> = ({ isOpen, onClose, onFinish }) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
	const [windowSize, setWindowSize] = useState({
		width: typeof window !== "undefined" ? window.innerWidth : 1280,
		height: typeof window !== "undefined" ? window.innerHeight : 800,
	});

	const currentStep = useMemo(() => TOUR_STEPS[currentIndex], [currentIndex]);

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
			setHighlightRect(rect);
		} else {
			setHighlightRect(null);
		}
	}, [isOpen, currentStep]);

	// Auto scroll element into view when step changes
	useEffect(() => {
		if (!isOpen || !currentStep?.selector) return;
		const el = document.querySelector(currentStep.selector);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
		updateTargetPosition();
		const t1 = setTimeout(updateTargetPosition, 80);
		const t2 = setTimeout(updateTargetPosition, 320);
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
			if (e.key === "Escape") {
				handleSkip();
			} else if (e.key === "ArrowRight" || e.key === "Enter") {
				handleNext();
			} else if (e.key === "ArrowLeft") {
				handleBack();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, handleNext, handleBack, handleSkip]);

	if (!isOpen) return null;

	// Calculate popover positioning style so dialog doesn't block the highlighted element
	const getPopoverStyle = (): React.CSSProperties => {
		const { width: winWidth, height: winHeight } = windowSize;
		const cardWidth = Math.min(480, winWidth - 32);

		if (!highlightRect || winWidth < 768) {
			return {
				position: "fixed",
				bottom: "24px",
				left: "16px",
				right: "16px",
				maxWidth: `${cardWidth}px`,
				margin: "0 auto",
				zIndex: 60,
			};
		}

		// If element is in header (mode, explorer)
		if (highlightRect.top < 120 && highlightRect.bottom < winHeight * 0.35) {
			const idealLeft = highlightRect.left + highlightRect.width / 2 - cardWidth / 2;
			const clampedLeft = Math.max(16, Math.min(winWidth - cardWidth - 16, idealLeft));
			return {
				position: "fixed",
				top: `${Math.min(winHeight - 260, highlightRect.bottom + 16)}px`,
				left: `${clampedLeft}px`,
				width: `${cardWidth}px`,
				zIndex: 60,
			};
		}

		// If element is on the right side (roster)
		if (highlightRect.left > winWidth * 0.55) {
			const cardRight = winWidth - highlightRect.left + 24;
			const idealTop = Math.max(24, Math.min(winHeight - 280, highlightRect.top + 32));
			return {
				position: "fixed",
				top: `${idealTop}px`,
				right: `${cardRight}px`,
				width: `${cardWidth}px`,
				zIndex: 60,
			};
		}

		// If element is on the left side (history)
		if (highlightRect.right < winWidth * 0.45) {
			const cardLeft = highlightRect.right + 24;
			const idealTop = Math.max(24, Math.min(winHeight - 280, highlightRect.top + 32));
			return {
				position: "fixed",
				top: `${idealTop}px`,
				left: `${cardLeft}px`,
				width: `${cardWidth}px`,
				zIndex: 60,
			};
		}

		// Large central element (chat)
		return {
			position: "fixed",
			bottom: "32px",
			left: "50%",
			transform: "translateX(-50%)",
			width: `${cardWidth}px`,
			zIndex: 60,
		};
	};

	// Pad cutout dimensions around target element
	const pad = 6;
	const cutoutX = highlightRect ? Math.max(0, highlightRect.left - pad) : 0;
	const cutoutY = highlightRect ? Math.max(0, highlightRect.top - pad) : 0;
	const cutoutW = highlightRect ? Math.max(0, highlightRect.width + pad * 2) : 0;
	const cutoutH = highlightRect ? Math.max(0, highlightRect.height + pad * 2) : 0;

	return (
		<div className="fixed inset-0 z-50 pointer-events-auto overflow-hidden">
			{/* SVG Mask: Transparent cutout over highlighted element, darkened everywhere else */}
			<svg
				className="fixed inset-0 w-full h-full pointer-events-none select-none"
				xmlns="http://www.w3.org/2000/svg"
				width="100%"
				height="100%"
			>
				<defs>
					<mask id="tour-spotlight-mask">
						{/* Base mask: white reveals dark overlay */}
						<rect x="0" y="0" width="100%" height="100%" fill="white" />
						{/* Cutout hole: black conceals dark overlay so target element shines through at 100% brightness */}
						{highlightRect && (
							<rect
								x={cutoutX}
								y={cutoutY}
								width={cutoutW}
								height={cutoutH}
								rx="16"
								ry="16"
								fill="black"
							/>
						)}
					</mask>
				</defs>
				{/* Darkened backdrop with cutout hole */}
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					fill="#050811"
					fillOpacity="0.78"
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
					className="fixed pointer-events-none z-50 rounded-2xl border-2 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.45)] ring-1 ring-amber-300/40 transition-all duration-300"
				>
					{/* Spotlight indicator badge */}
					<div className="absolute -top-3.5 right-4 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-md shadow-amber-950/40 flex items-center gap-1">
						<Sparkles className="w-2.5 h-2.5" />
						<span>Spotlight</span>
					</div>
				</div>
			)}

			{/* Tour Dialog Popover */}
			<div style={getPopoverStyle()} className="animate-scaleUp">
				<div className="bg-[#0d1326] border border-[#232f50] rounded-2xl shadow-2xl p-5 sm:p-6 text-slate-100 space-y-4 backdrop-blur-md">
					{/* Header bar */}
					<div className="flex items-center justify-between border-b border-[#1b2542] pb-3">
						<div className="flex items-center gap-2.5">
							<img
								src="/governmindz-logo.png"
								alt="GovernMindz logo"
								className="h-9 w-9 rounded-full object-cover ring-1 ring-amber-500/40 shadow-sm shadow-amber-500/10"
							/>
							<div>
								<span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
									{currentStep.badge}
								</span>
								<h3 className="text-sm font-bold text-white flex items-center gap-1.5 leading-snug">
									{currentStep.title}
								</h3>
							</div>
						</div>
						<button
							onClick={handleSkip}
							className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-[#1a233d] transition-colors"
							title="Close tour (Esc)"
						>
							<X className="w-4 h-4" />
						</button>
					</div>

					{/* Step description */}
					<div className="text-xs sm:text-sm text-slate-300 leading-relaxed min-h-[44px]">
						{currentStep.description}
					</div>

					{/* Step Dots indicator */}
					<div className="flex items-center justify-center gap-1.5 py-0.5">
						{TOUR_STEPS.map((step, idx) => (
							<button
								key={step.id}
								onClick={() => setCurrentIndex(idx)}
								className={`h-1.5 rounded-full transition-all duration-300 ${
									idx === currentIndex
										? "w-6 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
										: "w-1.5 bg-slate-700 hover:bg-slate-500"
								}`}
								title={step.title}
							/>
						))}
					</div>

					{/* Navigation action buttons */}
					<div className="flex items-center justify-between pt-2.5 border-t border-[#1b2542]">
						<button
							onClick={handleSkip}
							className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-[#161f36] transition-colors"
						>
							Skip Introduction
						</button>

						<div className="flex items-center gap-2">
							{currentIndex > 0 && (
								<button
									onClick={handleBack}
									className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-[#161f36] hover:bg-[#1d2948] border border-[#232f50] transition-colors"
								>
									<ArrowLeft className="w-3.5 h-3.5" />
									Back
								</button>
							)}

							<button
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
