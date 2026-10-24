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

	const currentStep = useMemo(() => TOUR_STEPS[currentIndex], [currentIndex]);

	// Calculate target element position
	const updateTargetPosition = useCallback(() => {
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

	useEffect(() => {
		updateTargetPosition();
		window.addEventListener("resize", updateTargetPosition);
		window.addEventListener("scroll", updateTargetPosition, true);
		return () => {
			window.removeEventListener("resize", updateTargetPosition);
			window.removeEventListener("scroll", updateTargetPosition, true);
		};
	}, [updateTargetPosition]);

	if (!isOpen) return null;

	const handleNext = () => {
		if (currentIndex < TOUR_STEPS.length - 1) {
			setCurrentIndex(currentIndex + 1);
		} else {
			onFinish();
		}
	};

	const handleBack = () => {
		if (currentIndex > 0) {
			setCurrentIndex(currentIndex - 1);
		}
	};

	const handleSkip = () => {
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto">
			{/* Dark spotlight overlay */}
			<div className="absolute inset-0 bg-[#050811]/75 backdrop-blur-[2px] transition-opacity duration-300" />

			{/* Spotlight cutout border if target element exists */}
			{highlightRect && (
				<div
					style={{
						top: `${Math.max(8, highlightRect.top - 6)}px`,
						left: `${Math.max(8, highlightRect.left - 6)}px`,
						width: `${highlightRect.width + 12}px`,
						height: `${highlightRect.height + 12}px`,
					}}
					className="absolute pointer-events-none rounded-2xl border-2 border-amber-400/90 shadow-[0_0_35px_rgba(245,158,11,0.35)] transition-all duration-300 animate-pulse"
				/>
			)}

			{/* Tour Dialog Popover */}
			<div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
				<div className="pointer-events-auto max-w-lg w-full bg-[#0d1326] border border-[#232f50] rounded-2xl shadow-2xl p-6 text-slate-100 relative space-y-4 animate-scaleUp">
					{/* Header bar */}
					<div className="flex items-center justify-between border-b border-[#1b2542] pb-3">
						<div className="flex items-center gap-2">
							<div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
								<Compass className="w-4 h-4" />
							</div>
							<div>
								<span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
									{currentStep.badge}
								</span>
								<h3 className="text-sm font-bold text-white flex items-center gap-1.5">
									{currentStep.title}
								</h3>
							</div>
						</div>
						<button
							onClick={handleSkip}
							className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-[#1a233d] transition-colors"
							title="Close tour"
						>
							<X className="w-4 h-4" />
						</button>
					</div>

					{/* Step description */}
					<div className="text-xs sm:text-sm text-slate-300 leading-relaxed min-h-[48px]">
						{currentStep.description}
					</div>

					{/* Step Dots indicator */}
					<div className="flex items-center justify-center gap-1.5 py-1">
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
					<div className="flex items-center justify-between pt-2 border-t border-[#1b2542]">
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
