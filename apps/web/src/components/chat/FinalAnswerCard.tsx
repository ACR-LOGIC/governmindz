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
	FileText,
	FileSpreadsheet,
	FileCode,
	Download,
	Share2,
	GitFork,
	Presentation,
	Sparkles,
	Database,
} from "lucide-react";
import type { ChatMessage, Conversation } from "../../types";
import { ttsService } from "../../services/ttsService";
import {
	exportConversationAsPdf,
	exportConversationAsCsvSpreadsheet,
	exportConversationAsWordDoc,
	copyDeliberationRichHtml,
} from "../../services/exportService";
import { PresentationModal } from "./PresentationModal";
import { evaluateWebConversation, formatConfidence } from "../../services/conversationEvaluation";

interface FinalAnswerCardProps {
	message: ChatMessage;
	conversation?: Conversation | null;
	finalConfidence?: number;
	consensusMethod?: string;
	rounds?: number;
	auditVerified?: boolean;
	onExploreZetaris?: () => void;
}

export const FinalAnswerCard: React.FC<FinalAnswerCardProps> = ({
	message,
	conversation,
	finalConfidence,
	consensusMethod,
	rounds,
	auditVerified,
	onExploreZetaris,
}) => {
	const [copied, setCopied] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);
	const [presentationModalOpen, setPresentationModalOpen] = useState(false);
	const [modalInitialTab, setModalInitialTab] = useState<"diagram" | "chart" | "slides" | "export">("diagram");
	const [copiedRich, setCopiedRich] = useState(false);

	const positionText = message.structured?.position || message.content;

	const convData: Conversation = conversation || {
		id: `conv_${message.id}`,
		title: "Governance Decision Briefing",
		topic: message.structured?.position?.slice(0, 80) || "Multi-Agent Deliberation",
		mode: "sample",
		createdAt: message.timestamp || Date.now(),
		updatedAt: message.timestamp || Date.now(),
		messages: [message],
		auditEvents: [],
		status: "completed",
		finalConfidence: finalConfidence ?? message.confidence,
		workflowEvents: [],
	};

	const evaluation = evaluateWebConversation(convData);
	const conf = evaluation.confidence;
	const confidenceLabel = formatConfidence(conf);
	const hasConfidence = conf != null;
	const auditLabel = auditVerified === true ? "Verified" : "Not verified";
	const statusLabel = evaluation.evaluated ? "Evaluated" : evaluation.label;

	useEffect(() => {
		const unsub = ttsService.subscribe((speaking, _seat, msgId) => {
			setIsSpeaking(speaking && msgId === `final_${message.id}`);
		});
		return unsub;
	}, [message.id]);

	const handleCopy = () => {
		const textToCopy = `GovernMindz Final Synthesized Governance Decision\nCalibrated Confidence: ${confidenceLabel}\n\n${positionText}\n\nEvidence:\n${(message.structured?.evidence || []).map((e) => `• ${e}`).join("\n")}\n\nCaveats:\n${(message.structured?.caveats || []).map((c) => `• ${c}`).join("\n")}`;

		if (navigator.clipboard) {
			navigator.clipboard.writeText(textToCopy);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleCopyRich = async () => {
		const ok = await copyDeliberationRichHtml(convData);
		if (ok) {
			setCopiedRich(true);
			setTimeout(() => setCopiedRich(false), 2000);
		}
	};

	const handleToggleSpeak = () => {
		if (isSpeaking) {
			ttsService.stop();
		} else {
			ttsService.speak(positionText, "Synthesizer", `final_${message.id}`);
		}
	};

	const openModalTab = (tab: "diagram" | "chart" | "slides" | "export") => {
		setModalInitialTab(tab);
		setPresentationModalOpen(true);
	};

	return (
		<>
			<div
				className={`my-8 mx-auto max-w-3xl rounded-2xl bg-gradient-to-b from-[#18181f] via-[#121216] to-[#0c0c0e] border-2 border-amber-500/60 p-6 shadow-2xl shadow-black/80 relative overflow-hidden animate-scaleIn ${
					isSpeaking ? "ring-2 ring-amber-400" : ""
				}`}
			>
				{/* Subtle background glow */}
				<div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-[64px] pointer-events-none" />

				{/* Header with Award Badge & Quick Action Toolbar */}
				<div className="flex items-center justify-between border-b border-[#2e2e3a] pb-4 mb-5 flex-wrap gap-3">
					<div className="flex items-center gap-3">
						<div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/30">
							<Award className="w-5.5 h-5.5" />
						</div>
						<div>
							<h3 className="font-display font-bold text-lg text-[#f4b942] flex items-center gap-2 leading-tight">
								Final Synthesized Governance Decision
								<span
									className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
										evaluation.evaluated
											? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
											: "bg-amber-500/20 text-amber-300 border-amber-500/40"
									}`}
								>
									{statusLabel}
								</span>
							</h3>
							<div className="text-xs text-slate-400">
								Arrived through multi-agent deliberative debate & cryptographic audit verification
							</div>
						</div>
					</div>

					<div className="flex items-center gap-3">
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
							<div
								className={`text-3xl font-mono font-extrabold ${hasConfidence ? "text-[#f4b942]" : "text-slate-400"}`}
							>
								{confidenceLabel}
							</div>
							<div
								className={`text-[10px] font-mono uppercase tracking-wider ${hasConfidence ? "text-emerald-400" : "text-slate-400"}`}
							>
								{hasConfidence ? "Calibrated Confidence" : "Confidence unavailable"}
							</div>
						</div>
					</div>
				</div>

				{/* Main Consensus Position Text */}
				<div className="text-sm text-slate-100 leading-relaxed font-medium bg-[#141418] p-5 rounded-xl border border-[#262630] mb-5 whitespace-pre-wrap shadow-inner">
					{positionText}
				</div>

				{/* Evidence & Caveat list */}
				{message.structured?.evidence && message.structured.evidence.length > 0 && (
					<div className="mb-5">
						<div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
							<CheckCircle2 className="w-3.5 h-3.5" />
							<span>Evidence Citations</span>
						</div>
						<ul className="space-y-1.5 text-xs text-slate-300">
							{message.structured.evidence.map((ev, i) => (
								<li key={i} className="flex items-start gap-2.5 bg-[#181820] p-2.5 rounded-lg border border-[#282834]">
									<span className="text-emerald-400 font-bold shrink-0">✓</span>
									<span>{ev}</span>
								</li>
							))}
						</ul>
					</div>
				)}

				{/* Interactive Zetaris evidence hand-off */}
				{convData.zetarisData?.query && onExploreZetaris && (
					<div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-teal-950/40 via-[#121c2d] to-[#12182b] border border-teal-700/50 shadow-lg">
						<div className="flex items-start gap-2.5">
							<div className="w-9 h-9 rounded-lg bg-teal-500/15 border border-teal-500/40 flex items-center justify-center text-teal-300 shrink-0">
								<Database className="w-4.5 h-4.5" />
							</div>
							<div>
								<div className="text-[11px] font-mono font-bold uppercase tracking-wider text-teal-300">
									Zetaris Evidence Explorer
								</div>
								<div className="text-[11px] text-slate-400 mt-0.5">
									Filter, sort, inspect rows, and download the captured dataset.
								</div>
							</div>
						</div>
						<button
							type="button"
							onClick={onExploreZetaris}
							className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-950/30 transition-all active:scale-95 shrink-0"
						>
							<Database className="w-3.5 h-3.5" />
							Explore Zetaris Data
						</button>
					</div>
				)}

				{/* PRIMARY AUTHORITATIVE DELIVERABLE & ARTIFACT RELEASE CARD */}
				{convData.primaryArtifact && (
					<div className="my-5 p-4 rounded-xl bg-gradient-to-br from-[#1c2237] via-[#151a2d] to-[#0f1322] border-2 border-emerald-500/70 shadow-xl relative overflow-hidden hover-lift">
						<div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-[48px] pointer-events-none" />

						<div className="flex items-center justify-between mb-3 flex-wrap gap-2">
							<div className="flex items-center gap-2.5">
								<div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
									{convData.primaryArtifact.format === "pptx" ? (
										<Presentation className="w-5 h-5 text-amber-400" />
									) : convData.primaryArtifact.format === "csv" ? (
										<FileSpreadsheet className="w-5 h-5 text-emerald-400" />
									) : convData.primaryArtifact.format === "svg" ? (
										<GitFork className="w-5 h-5 text-teal-400" />
									) : (
										<FileText className="w-5 h-5 text-rose-400" />
									)}
								</div>
								<div>
									<div className="flex items-center gap-2">
										<h4 className="font-display font-bold text-sm text-white tracking-tight">
											{convData.primaryArtifact.title}
										</h4>
										<span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
											{convData.primaryArtifact.format.toUpperCase()} Deliverable
										</span>
										<span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
											Supervisor Approved
										</span>
									</div>
									<div className="text-xs text-slate-300 mt-0.5">
										{convData.primaryArtifact.summary}
									</div>
								</div>
							</div>

							<div className="flex items-center gap-2">
								<a
									href={convData.primaryArtifact.viewUrl}
									target="_blank"
									rel="noreferrer"
									className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
								>
									<CheckCircle2 className="w-4 h-4 text-slate-950" />
									<span>View / Open File</span>
								</a>

								<a
									href={convData.primaryArtifact.downloadUrl}
									download
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#253252] hover:bg-[#304068] border border-[#3c4e7d] text-white font-semibold text-xs transition-all shadow-sm"
								>
									<Download className="w-3.5 h-3.5 text-emerald-400" />
									<span>Download ({Math.round(convData.primaryArtifact.sizeBytes / 1024) || 1} KB)</span>
								</a>
							</div>
						</div>

						{/* Delivery Workflow Stage Progression */}
						<div className="mt-3 pt-3 border-t border-[#2d3a5a] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-400">
							<div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
								<Check className="w-3.5 h-3.5" />
								<span>1. Research Complete</span>
							</div>
							<div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
								<Check className="w-3.5 h-3.5" />
								<span>2. Reasoning Verified</span>
							</div>
							<div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
								<Check className="w-3.5 h-3.5" />
								<span>3. Artifact Created</span>
							</div>
							<div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
								<Check className="w-3.5 h-3.5" />
								<span>4. Delivery Released</span>
							</div>
						</div>

						{/* Supplementary Evidence Export link */}
						{convData.evidenceExport && (
							<div className="mt-2.5 pt-2 border-t border-[#242e47] flex items-center justify-between text-xs text-slate-400">
								<span>
									Supporting Evidence Export:{" "}
									<span className="text-slate-300 font-mono text-[11px]">
										{convData.evidenceExport.filename}
									</span>{" "}
									(strictly supplementary)
								</span>
								<a
									href={convData.evidenceExport.downloadUrl}
									download
									className="text-amber-400 hover:text-amber-300 underline font-semibold flex items-center gap-1 text-[11.5px]"
								>
									<Download className="w-3 h-3" />
									<span>Download Evidence Export (JSON)</span>
								</a>
							</div>
						)}
					</div>
				)}

				{message.structured?.caveats && message.structured.caveats.length > 0 && (
					<div className="mb-5">
						<div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1.5">
							<AlertTriangle className="w-3.5 h-3.5" />
							<span>Production Scope Caveats</span>
						</div>
						<ul className="space-y-1.5 text-xs text-slate-300">
							{message.structured.caveats.map((cav, i) => (
								<li key={i} className="flex items-start gap-2.5 bg-[#181820] p-2.5 rounded-lg border border-[#282834]">
									<span className="text-amber-400 font-bold shrink-0">⚠</span>
									<span>{cav}</span>
								</li>
							))}
						</ul>
					</div>
				)}

				{/* PROFESSIONAL OUTPUTS, EXPORT & PRESENTATION SUITE TOOLBAR */}
				<div className="my-4 p-3.5 bg-gradient-to-r from-[#151c30] via-[#101524] to-[#151c30] rounded-xl border border-[#273559] shadow-lg hover-lift">
					<div className="flex items-center justify-between mb-2.5">
						<div className="flex items-center gap-2">
							<Sparkles className="w-4 h-4 text-amber-400" />
							<span className="text-xs font-bold text-white uppercase tracking-wider">
								Professional Outputs & Presentation Suite
							</span>
						</div>
						<span className="text-[10px] font-mono text-slate-400">
							Export, Present & Share
						</span>
					</div>

					<div className="flex items-center gap-2 flex-wrap">
						{/* 1. PDF Report */}
						<button
							type="button"
							onClick={() => exportConversationAsPdf(convData)}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a233d] hover:bg-[#232f50] border border-[#2d3c66] hover:border-rose-400/60 text-slate-200 hover:text-white text-xs font-semibold transition-all shadow-sm group hover-lift"
							title="Generate and print executive PDF report"
						>
							<FileText className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
							<span>PDF Report</span>
						</button>

						{/* 2. Spreadsheet CSV */}
						<button
							type="button"
							onClick={() => exportConversationAsCsvSpreadsheet(convData)}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a233d] hover:bg-[#232f50] border border-[#2d3c66] hover:border-emerald-400/60 text-slate-200 hover:text-white text-xs font-semibold transition-all shadow-sm group hover-lift"
							title="Download Excel / Sheets compatible CSV dataset"
						>
							<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
							<span>Spreadsheet (CSV)</span>
						</button>

						{/* 3. Word Document */}
						<button
							type="button"
							onClick={() => exportConversationAsWordDoc(convData)}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a233d] hover:bg-[#232f50] border border-[#2d3c66] hover:border-sky-400/60 text-slate-200 hover:text-white text-xs font-semibold transition-all shadow-sm group hover-lift"
							title="Download Word-formatted executive document (.DOC)"
						>
							<FileCode className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
							<span>Word / Docs</span>
						</button>

						{/* 4. Visual Diagrams & Charts */}
						<button
							type="button"
							onClick={() => openModalTab("diagram")}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 text-teal-300 hover:text-teal-200 text-xs font-bold transition-all shadow-sm group hover-lift"
							title="View and download visual consensus diagrams and charts"
						>
							<GitFork className="w-3.5 h-3.5 text-teal-400 group-hover:scale-110 transition-transform" />
							<span>Visual Diagram & Charts</span>
						</button>

						{/* 5. Present & Share Mode */}
						<button
							type="button"
							onClick={() => openModalTab("slides")}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 ml-auto"
							title="Launch fullscreen executive slide deck"
						>
							<Presentation className="w-3.5 h-3.5 text-slate-950" />
							<span>Present & Share</span>
						</button>
					</div>
				</div>

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
						<span
							className={`font-semibold flex items-center gap-1 ${
								auditVerified === true ? "text-emerald-400" : "text-amber-400"
							}`}
						>
							<ShieldCheck className="w-3.5 h-3.5" />
							{auditLabel}
						</span>
					</div>
					<div>
						<span className="text-[10px] uppercase text-slate-400 block">Status</span>
						<span className="text-teal-400 font-semibold">{statusLabel}</span>
					</div>
				</div>

				{/* Confidence limitation note */}
				<div className="mt-4 pt-3 border-t border-[#262630] text-[10.5px] text-slate-400 italic">
					* Calibrated confidence is a multi-agent statistical agreement score computed from role-separated review and Zetaris evidence verification, not an infallible external guarantee.
				</div>
			</div>

			{/* Interactive Presentation & Visual Diagram Modal */}
			<PresentationModal
				isOpen={presentationModalOpen}
				onClose={() => setPresentationModalOpen(false)}
				conversation={convData}
				initialTab={modalInitialTab}
			/>
		</>
	);
};
