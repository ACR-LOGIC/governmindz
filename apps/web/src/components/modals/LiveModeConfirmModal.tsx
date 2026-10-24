import React, { useState } from "react";
import { ShieldAlert, Zap, ArrowRight, X, Sparkles, KeyRound } from "lucide-react";

interface LiveModeConfirmModalProps {
	isOpen: boolean;
	onConfirm: (futureLaunchPreference: "demo" | "live") => void;
	onCancel: () => void;
	onOpenConfig?: () => void;
	meterlessConfigured?: boolean;
	zetarisConfigured?: boolean;
}

export const LiveModeConfirmModal: React.FC<LiveModeConfirmModalProps> = ({
	isOpen,
	onConfirm,
	onCancel,
	onOpenConfig,
	meterlessConfigured,
	zetarisConfigured,
}) => {
	const [futurePreference, setFuturePreference] = useState<"demo" | "live">("live");

	if (!isOpen) return null;

	const missingCredentials = !meterlessConfigured || !zetarisConfigured;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
			<div className="max-w-lg w-full bg-[#0d1326] border border-[#232f50] rounded-2xl shadow-2xl p-6 text-slate-100 relative space-y-5 animate-scaleUp">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-[#1b2542] pb-3">
					<div className="flex items-center gap-2.5">
						<div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
							<Zap className="w-5 h-5" />
						</div>
						<div>
							<h3 className="text-base font-bold text-white flex items-center gap-1.5">
								Switch to Live Execution Mode
							</h3>
							<p className="text-xs text-slate-400">
								Run live multi-agent governance queries against connected engines
							</p>
						</div>
					</div>
					<button
						onClick={onCancel}
						className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a233d] transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Notice box */}
				<div className="text-xs text-slate-300 bg-[#121a33] border border-[#1e2a4a] rounded-xl p-3.5 space-y-2">
					<div className="flex items-start gap-2 text-amber-300 font-semibold">
						<ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
						<span>Live Service Notice</span>
					</div>
					<p className="text-slate-300 leading-relaxed">
						Live mode executes inquiries against your configured <strong>Zetaris Lightning</strong> federated data cluster and <strong>Meterless AI</strong> inference runtime. Real query plans, read-only guards, and live audit signatures will be generated.
					</p>

					{missingCredentials && (
						<div className="mt-2 pt-2 border-t border-[#1e2a4a] flex items-center justify-between text-xs">
							<span className="text-amber-400 flex items-center gap-1">
								<KeyRound className="w-3.5 h-3.5" />
								Credentials not fully configured yet
							</span>
							{onOpenConfig && (
								<button
									onClick={() => {
										onCancel();
										onOpenConfig();
									}}
									className="text-teal-400 hover:text-teal-300 font-bold underline"
								>
									Configure Now
								</button>
							)}
						</div>
					)}
				</div>

				{/* Future launch preference selector */}
				<div className="space-y-2.5">
					<label className="text-xs font-semibold text-slate-200">
						Future Launch Preference:
					</label>
					<div className="space-y-2 text-xs">
						<label
							className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
								futurePreference === "demo"
									? "bg-amber-950/30 border-amber-500/60 text-amber-200"
									: "bg-[#11172b] border-[#1e2842] text-slate-300 hover:bg-[#161f38]"
							}`}
						>
							<input
								type="radio"
								name="futurePref"
								value="demo"
								checked={futurePreference === "demo"}
								onChange={() => setFuturePreference("demo")}
								className="mt-0.5 accent-amber-400"
							/>
							<div>
								<span className="font-bold block text-white">Yes — Show Demo Again</span>
								<span className="text-[11px] text-slate-400">
									Next time GovernMindz launches, return to the guided Demo experience with selectable prompt bubbles.
								</span>
							</div>
						</label>

						<label
							className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
								futurePreference === "live"
									? "bg-teal-950/30 border-teal-500/60 text-teal-200"
									: "bg-[#11172b] border-[#1e2842] text-slate-300 hover:bg-[#161f38]"
							}`}
						>
							<input
								type="radio"
								name="futurePref"
								value="live"
								checked={futurePreference === "live"}
								onChange={() => setFuturePreference("live")}
								className="mt-0.5 accent-teal-400"
							/>
							<div>
								<span className="font-bold block text-white">No — Open Live Mode Next Time</span>
								<span className="text-[11px] text-slate-400">
									Subsequent application launches will open directly in Live mode if integrations are configured.
								</span>
							</div>
						</label>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1b2542]">
					<button
						onClick={onCancel}
						className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-[#161f36] transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={() => onConfirm(futurePreference)}
						className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-slate-950 rounded-xl bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-300 hover:to-teal-400 shadow-md shadow-teal-950/40 active:scale-95 transition-all"
					>
						<span>Confirm Live Mode</span>
						<ArrowRight className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>
		</div>
	);
};
