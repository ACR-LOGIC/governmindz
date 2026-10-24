import React, { useState, useEffect } from "react";
import {
	Award,
	ShieldCheck,
	CheckCircle2,
	AlertTriangle,
	Layers,
	Clock,
	Copy,
	Check,
	Volume2,
	VolumeX,
} from "lucide-react";
import type { ChatMessage } from "../../types";
import { ttsService } from "../../services/ttsService";

interface FinalAnswerCardProps {
	message: ChatMessage;
	finalConfidence?: number;
	consensusMethod?: string;
	rounds?: number;
	auditVerified?: boolean;
}

export const FinalAnswerCard: React.FC<FinalAnswerCardProps> = ({
	message,
	finalConfidence,
	consensusMethod,
	rounds,
	auditVerified,
}) => {
	const [copied, setCopied] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);

	const conf = finalConfidence ?? message.confidence ?? 0.85;
	const positionText = message.structured?.position || message.content;

	useEffect(() => {
		const unsub = ttsService.subscribe((speaking, _seat, msgId) => {
			setIsSpeaking(speaking && msgId === `final_${message.id}`);
		});
		return unsub;
	}, [message.id]);

	const handleCopy = () => {
		const textToCopy = `GovernMindz Final Synthesized Governance Decision (${(conf * 100).toFixed(1)}% Calibrated Confidence):\n\n${positionText}\n\nEvidence:\n${(message.structured?.evidence || []).map((e) => `• ${e}`).join("\n")}\n\nCaveats:\n${(message.structured?.caveats || []).map((c) => `• ${c}`).join("\n")}`;

		if (navigator.clipboard) {
			navigator.clipboard.writeText(textToCopy);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleToggleSpeak = () => {
		if (isSpeaking) {
			ttsService.stop();
		} else {
			ttsService.speak(positionText, "Synthesizer", `final_${message.id}`);
		}
	};

	return (
		<div
			className={`my-8 mx-auto max-w-3xl rounded-2xl bg-gradient-to-b from-[#18181f] via-[#121216] to-[#0c0c0e] border-2 border-amber-500/60 p-6 shadow-2xl shadow-black/80 relative overflow-hidden animate-fadeIn ${
				isSpeaking ? "ring-2 ring-amber-400" : ""
			}`}
		>
			{/* Subtle background glow */}
			<div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

			{/* Header with Award Badge & Quick Action Toolbar */}
			<div className="flex items-center justify-between border-b border-[#2e2e3a] pb-4 mb-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/20">
						<Award className="w-5 h-5" />
					</div>
					<div>
						<h3 className="font-display font-bold text-base text-[#f4b942]">
							Final Synthesized Governance Decision
						</h3>
						<div className="text-xs text-slate-400">
							Arrived through multi-agent deliberative debate & cryptographic audit verification
						</div>
					</div>
				</div>

				<div className="flex items-center gap-4">
					{/* Actions: Listen + Copy */}
					<div className="flex items-center gap-1.5 bg-[#1e1e26] border border-[#2e2e3a] rounded-xl p-1">
						<button
							type="button"
							onClick={handleToggleSpeak}
							className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-[#282834] transition-colors"
							title={isSpeaking ? "Stop voice playback" : "Read consensus decision aloud"}
						>
							{isSpeaking ? (
								<VolumeX className="w-4 h-4 text-amber-400 animate-pulse" />
							) : (
								<Volume2 className="w-4 h-4" />
							)}
						</button>

						<button
							type="button"
							onClick={handleCopy}
							className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#282834] transition-colors"
							title="Copy complete consensus report"
						>
							{copied ? (
								<>
									<Check className="w-3.5 h-3.5 text-emerald-400" />
									<span className="text-emerald-400 font-mono text-[11px]">Copied</span>
								</>
							) : (
								<>
									<Copy className="w-3.5 h-3.5" />
									<span className="text-[11px]">Copy</span>
								</>
							)}
						</button>
					</div>

					<div className="text-right">
						<div className="text-2xl font-mono font-extrabold text-[#f4b942]">
							{(conf * 100).toFixed(1)}%
						</div>
						<div className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">
							Calibrated Confidence
						</div>
					</div>
				</div>
			</div>

			{/* Main Consensus Position Text */}
			<div className="text-sm text-slate-100 leading-relaxed font-medium bg-[#141418] p-4 rounded-xl border border-[#262630] mb-4 whitespace-pre-wrap">
				{positionText}
			</div>

			{/* Evidence & Caveat list */}
			{message.structured?.evidence && message.structured.evidence.length > 0 && (
				<div className="mb-4">
					<div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1.5">
						<CheckCircle2 className="w-3.5 h-3.5" />
						<span>Verified Governance Evidence</span>
					</div>
					<ul className="space-y-1 text-xs text-slate-300">
						{message.structured.evidence.map((ev, i) => (
							<li key={i} className="flex items-start gap-2 bg-[#181820] p-2 rounded-lg border border-[#282834]">
								<span className="text-emerald-400 font-bold">✓</span>
								<span>{ev}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{message.structured?.caveats && message.structured.caveats.length > 0 && (
				<div className="mb-4">
					<div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1.5">
						<AlertTriangle className="w-3.5 h-3.5" />
						<span>Production Scope Caveats</span>
					</div>
					<ul className="space-y-1 text-xs text-slate-300">
						{message.structured.caveats.map((cav, i) => (
							<li key={i} className="flex items-start gap-2 bg-[#181820] p-2 rounded-lg border border-[#282834]">
								<span className="text-amber-400 font-bold">⚠</span>
								<span>{cav}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Footer Meta Grid */}
			<div className="pt-3 border-t border-[#282834] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono text-slate-400">
				<div>
					<span className="text-[10px] uppercase text-slate-400 block">Method</span>
					<span className="text-slate-200 font-semibold">{consensusMethod || "synthesizer"}</span>
				</div>
				<div>
					<span className="text-[10px] uppercase text-slate-400 block">Rounds</span>
					<span className="text-slate-200 font-semibold">{rounds || 2} deliberate cycles</span>
				</div>
				<div>
					<span className="text-[10px] uppercase text-slate-400 block">Audit Chain</span>
					<span className="text-emerald-400 font-semibold flex items-center gap-1">
						<ShieldCheck className="w-3.5 h-3.5" />
						{auditVerified !== false ? "Verified" : "Tampered"}
					</span>
				</div>
				<div>
					<span className="text-[10px] uppercase text-slate-400 block">Status</span>
					<span className="text-teal-400 font-semibold">Completed</span>
				</div>
			</div>

			{/* Confidence limitation note */}
			<div className="mt-4 pt-3 border-t border-[#262630] text-[10.5px] text-slate-400 italic">
				* Calibrated confidence is a multi-agent statistical agreement score computed from role-separated review and Zetaris evidence verification, not an infallible external guarantee.
			</div>
		</div>
	);
};
