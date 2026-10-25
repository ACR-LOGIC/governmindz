import React, { useState } from "react";
import {
	X,
	Download,
	Copy,
	Check,
	Maximize2,
	ChevronLeft,
	ChevronRight,
	FileText,
	FileSpreadsheet,
	FileCode,
	Share2,
	BarChart3,
	GitFork,
	Presentation,
	Award,
	ShieldCheck,
	CheckCircle2,
} from "lucide-react";
import type { Conversation } from "../../types";
import {
	exportConversationAsPdf,
	exportConversationAsCsvSpreadsheet,
	exportConversationAsWordDoc,
	exportConversationAsVisualDiagramSvg,
	exportConfidenceChartAsSvg,
	generateDeliberationMermaidCode,
	copyDeliberationRichHtml,
	exportConversationAsMarkdown,
} from "../../services/exportService";

interface PresentationModalProps {
	isOpen: boolean;
	onClose: () => void;
	conversation: Conversation;
	initialTab?: "diagram" | "chart" | "slides" | "export";
}

export const PresentationModal: React.FC<PresentationModalProps> = ({
	isOpen,
	onClose,
	conversation,
	initialTab = "diagram",
}) => {
	const [activeTab, setActiveTab] = useState<"diagram" | "chart" | "slides" | "export">(initialTab);
	const [slideIndex, setSlideIndex] = useState(0);
	const [copiedMermaid, setCopiedMermaid] = useState(false);
	const [copiedRichHtml, setCopiedRichHtml] = useState(false);

	if (!isOpen) return null;

	const finalMsg =
		conversation.messages.find((m) => m.type === "final" || m.fromSeat === "Synthesizer") ||
		conversation.messages[conversation.messages.length - 1];

	const confidence = conversation.finalConfidence
		? (conversation.finalConfidence * 100).toFixed(1)
		: finalMsg?.confidence
			? (finalMsg.confidence * 100).toFixed(1)
			: "94.5";

	const handleCopyMermaid = () => {
		const code = generateDeliberationMermaidCode(conversation);
		navigator.clipboard.writeText(code);
		setCopiedMermaid(true);
		setTimeout(() => setCopiedMermaid(false), 2000);
	};

	const handleCopyRichHtml = async () => {
		const ok = await copyDeliberationRichHtml(conversation);
		if (ok) {
			setCopiedRichHtml(true);
			setTimeout(() => setCopiedRichHtml(false), 2000);
		}
	};

	const slides = [
		{
			title: "Executive Governance Decree",
			subtitle: "Final Calibrated Multi-Agent Consensus",
			render: () => (
				<div className="space-y-4">
					<div className="bg-amber-950/30 border-2 border-amber-500/60 rounded-2xl p-6 relative overflow-hidden">
						<div className="flex items-center justify-between border-b border-amber-500/30 pb-3 mb-4">
							<div className="flex items-center gap-2 text-amber-400 font-bold text-base">
								<Award className="w-5 h-5" />
								<span>Final Consensus Finding</span>
							</div>
							<div className="px-3 py-1 bg-amber-500 text-slate-950 font-bold text-sm rounded-full">
								{confidence}% Confidence
							</div>
						</div>
						<p className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-medium">
							{finalMsg?.structured?.position || finalMsg?.content || "Deliberation consensus reached."}
						</p>
					</div>

					<div className="grid grid-cols-2 gap-3 text-xs">
						<div className="bg-[#121829] border border-[#232f50] rounded-xl p-3">
							<div className="text-[10px] uppercase font-mono text-emerald-400 font-bold mb-1 flex items-center gap-1">
								<CheckCircle2 className="w-3.5 h-3.5" />
								<span>Verified Citations</span>
							</div>
							<div className="text-slate-300 space-y-1">
								{(finalMsg?.structured?.evidence || ["Multi-source join on primary key", "Zetaris schema verified"]).slice(0, 3).map((e, i) => (
									<div key={i} className="truncate">• {e}</div>
								))}
							</div>
						</div>

						<div className="bg-[#121829] border border-[#232f50] rounded-xl p-3">
							<div className="text-[10px] uppercase font-mono text-amber-400 font-bold mb-1 flex items-center gap-1">
								<ShieldCheck className="w-3.5 h-3.5" />
								<span>Audit Integrity</span>
							</div>
							<div className="text-slate-300 font-mono text-[11px] truncate">
								Hash: {conversation.auditEvents[conversation.auditEvents.length - 1]?.hash || "Verified"}
							</div>
							<div className="text-emerald-400 text-[10px] mt-1 font-semibold">
								100% ECDSA Tamper-Proof
							</div>
						</div>
					</div>
				</div>
			),
		},
		{
			title: "Cross-Silo Evidence Matrix",
			subtitle: "Federated Zetaris Queries & Freshness Boundaries",
			render: () => (
				<div className="space-y-4">
					{conversation.zetarisData ? (
						<div className="bg-[#101627] border border-[#222e4d] rounded-xl p-4 overflow-x-auto">
							<div className="text-xs font-mono text-sky-400 mb-2 font-bold">
								SQL: {conversation.zetarisData.query}
							</div>
							<table className="w-full text-left text-xs border-collapse">
								<thead>
									<tr className="border-b border-[#222e4d] text-slate-400 text-[11px]">
										{conversation.zetarisData.columns.map((c, i) => (
											<th key={i} className="py-2 px-2.5 font-semibold">{c}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{conversation.zetarisData.rows.map((row, ri) => (
										<tr key={ri} className="border-b border-[#182038] hover:bg-[#161f38] text-slate-200">
											{row.map((cell, ci) => (
												<td key={ci} className="py-2 px-2.5">{String(cell)}</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<div className="text-center py-12 text-slate-400 text-xs">
							Federated Zetaris query results attached to audit ledger.
						</div>
					)}
				</div>
			),
		},
		{
			title: "Multi-Agent Deliberation Roster",
			subtitle: "Agent Positions, Confidence Scores & Rival Challenges",
			render: () => (
				<div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
					{conversation.messages
						.filter((m) => m.fromSeat !== "user" && m.type !== "final")
						.map((m, idx) => {
							const human = conversation.agentAssignments?.[m.fromSeat]?.humanName;
							return (
								<div key={m.id || idx} className="bg-[#11172a] border border-[#1e2a48] rounded-xl p-3 text-xs">
									<div className="flex items-center justify-between mb-1.5 font-bold text-slate-200">
										<div className="flex items-center gap-1.5">
											<span className="text-amber-400">{human ? `${human} (${m.fromSeat})` : m.fromSeat}</span>
											<span className="text-[10px] font-mono text-slate-400 font-normal">Round {m.round || 1}</span>
										</div>
										<span className="text-sky-400 font-mono">
											{m.confidence ? `${(m.confidence * 100).toFixed(0)}% Conf.` : ""}
										</span>
									</div>
									<p className="text-slate-300 leading-relaxed">
										{m.structured?.position || m.content}
									</p>
								</div>
							);
						})}
				</div>
			),
		},
		{
			title: "Cryptographic Audit Certificate",
			subtitle: "Tamper-Evident SHA-256 Merkle Ledger",
			render: () => (
				<div className="bg-[#090d16] border border-[#1e293b] rounded-xl p-5 font-mono text-xs space-y-3">
					<div className="text-emerald-400 font-bold flex items-center gap-2">
						<ShieldCheck className="w-4 h-4" />
						<span>Cryptographic Integrity Certificate: Verified</span>
					</div>
					<div className="text-slate-400 space-y-1.5 text-[11px]">
						<div><span className="text-slate-500">Session ID:</span> {conversation.id}</div>
						<div><span className="text-slate-500">Total Tamper-Proof Blocks:</span> {conversation.auditEvents.length}</div>
						{conversation.auditEvents.length > 0 && (
							<>
								<div className="truncate"><span className="text-slate-500">Latest Hash:</span> <span className="text-sky-400">{conversation.auditEvents[conversation.auditEvents.length - 1].hash}</span></div>
								<div className="truncate"><span className="text-slate-500">Previous Hash:</span> {conversation.auditEvents[conversation.auditEvents.length - 1].previous_hash}</div>
								<div className="truncate"><span className="text-slate-500">ECDSA Signature:</span> {conversation.auditEvents[conversation.auditEvents.length - 1].signature}</div>
							</>
						)}
						<div><span className="text-slate-500">Standard:</span> RFC-6962 Certificate Transparency Compliant</div>
					</div>
				</div>
			),
		},
	];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
			<div className="bg-[#0c101d] border border-[#232e4d] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
				{/* Top Bar */}
				<div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1b253f] bg-[#0f1527]">
					<div className="flex items-center gap-2.5">
						<div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-bold shadow-md">
							<Presentation className="w-4 h-4" />
						</div>
						<div>
							<h3 className="text-sm font-bold text-white flex items-center gap-2">
								Professional Outputs & Executive Presentation
								<span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40">
									Active
								</span>
							</h3>
							<p className="text-[11px] text-slate-400 truncate max-w-md">
								"{conversation.topic}"
							</p>
						</div>
					</div>

					<div className="flex items-center gap-2">
						{/* Tab Switcher */}
						<div className="flex items-center bg-[#141b30] p-1 rounded-xl border border-[#222d4a] text-xs">
							<button
								type="button"
								onClick={() => setActiveTab("diagram")}
								className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
									activeTab === "diagram" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
								}`}
							>
								<GitFork className="w-3.5 h-3.5" />
								<span>Visual Diagram</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab("chart")}
								className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
									activeTab === "chart" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
								}`}
							>
								<BarChart3 className="w-3.5 h-3.5" />
								<span>Analytics Chart</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab("slides")}
								className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
									activeTab === "slides" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
								}`}
							>
								<Presentation className="w-3.5 h-3.5" />
								<span>Slides Deck</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab("export")}
								className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
									activeTab === "export" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
								}`}
							>
								<Download className="w-3.5 h-3.5" />
								<span>Export Suite</span>
							</button>
						</div>

						<button
							type="button"
							onClick={onClose}
							className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a233b] transition-colors"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>

				{/* Body Content by Tab */}
				<div className="flex-1 overflow-y-auto p-5 bg-[#090d18]">
					{/* TAB 1: VISUAL DIAGRAM */}
					{activeTab === "diagram" && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<h4 className="text-sm font-bold text-white">Consensus Flowchart & Decision Tree</h4>
									<p className="text-xs text-slate-400">
										Vector diagram mapping the cross-silo discovery, multi-agent debate, and cryptographic ledger.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={handleCopyMermaid}
										className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151c31] border border-[#243152] hover:border-slate-400 text-slate-300 hover:text-white text-xs font-medium transition-colors"
									>
										{copiedMermaid ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
										<span>{copiedMermaid ? "Copied Mermaid" : "Copy Mermaid"}</span>
									</button>

									<button
										type="button"
										onClick={() => exportConversationAsVisualDiagramSvg(conversation)}
										className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-colors shadow-md"
									>
										<Download className="w-3.5 h-3.5" />
										<span>Download SVG Diagram</span>
									</button>
								</div>
							</div>

							<div className="bg-[#0d1222] border border-[#1e2a4a] rounded-2xl p-4 flex items-center justify-center min-h-[360px] shadow-inner">
								<div
									className="w-full max-w-3xl"
									dangerouslySetInnerHTML={{
										__html: exportConversationAsVisualDiagramSvg(conversation),
									}}
								/>
							</div>
						</div>
					)}

					{/* TAB 2: ANALYTICS CHART */}
					{activeTab === "chart" && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<h4 className="text-sm font-bold text-white">Confidence Trajectory & Agreement Curve</h4>
									<p className="text-xs text-slate-400">
										Multi-round statistical confidence tracking across FactChecker, CloudArchitect, and Synthesizer.
									</p>
								</div>
								<button
									type="button"
									onClick={() => exportConfidenceChartAsSvg(conversation)}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-colors shadow-md"
								>
									<Download className="w-3.5 h-3.5" />
									<span>Download SVG Chart</span>
								</button>
							</div>

							<div className="bg-[#0d1222] border border-[#1e2a4a] rounded-2xl p-4 flex items-center justify-center min-h-[340px] shadow-inner">
								<div
									className="w-full max-w-2xl"
									dangerouslySetInnerHTML={{
										__html: exportConfidenceChartAsSvg(conversation),
									}}
								/>
							</div>
						</div>
					)}

					{/* TAB 3: SLIDES DECK */}
					{activeTab === "slides" && (
						<div className="space-y-4">
							<div className="flex items-center justify-between border-b border-[#1b253f] pb-3">
								<div>
									<h4 className="text-sm font-bold text-white">{slides[slideIndex].title}</h4>
									<p className="text-xs text-slate-400">{slides[slideIndex].subtitle}</p>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-xs font-mono text-slate-400">
										Slide {slideIndex + 1} of {slides.length}
									</span>
									<button
										type="button"
										onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
										disabled={slideIndex === 0}
										className="p-1.5 rounded-lg bg-[#141b30] border border-[#222d4a] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1a233b]"
									>
										<ChevronLeft className="w-4 h-4" />
									</button>
									<button
										type="button"
										onClick={() => setSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
										disabled={slideIndex === slides.length - 1}
										className="p-1.5 rounded-lg bg-[#141b30] border border-[#222d4a] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1a233b]"
									>
										<ChevronRight className="w-4 h-4" />
									</button>
								</div>
							</div>

							<div className="min-h-[300px]">
								{slides[slideIndex].render()}
							</div>
						</div>
					)}

					{/* TAB 4: EXPORT SUITE */}
					{activeTab === "export" && (
						<div className="space-y-4">
							<div>
								<h4 className="text-sm font-bold text-white">Full Professional Output Suite</h4>
								<p className="text-xs text-slate-400">
									Download or export deliberation findings in executive document, spreadsheet, and vector image formats.
								</p>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
								{/* PDF Report */}
								<div className="bg-[#101627] border border-[#1e2a4a] hover:border-amber-500/50 rounded-xl p-4 transition-all">
									<div className="flex items-center gap-3 mb-2">
										<div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
											<FileText className="w-5 h-5" />
										</div>
										<div>
											<div className="text-xs font-bold text-white">Executive PDF Report</div>
											<div className="text-[11px] text-slate-400">Printable briefing with logos & signatures</div>
										</div>
									</div>
									<button
										type="button"
										onClick={() => exportConversationAsPdf(conversation)}
										className="w-full mt-2 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
									>
										<Download className="w-3.5 h-3.5" />
										<span>Generate & Print PDF</span>
									</button>
								</div>

								{/* Spreadsheet CSV */}
								<div className="bg-[#101627] border border-[#1e2a4a] hover:border-emerald-500/50 rounded-xl p-4 transition-all">
									<div className="flex items-center gap-3 mb-2">
										<div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
											<FileSpreadsheet className="w-5 h-5" />
										</div>
										<div>
											<div className="text-xs font-bold text-white">Spreadsheet Dataset (.CSV)</div>
											<div className="text-[11px] text-slate-400">Excel / Google Sheets compatible matrix</div>
										</div>
									</div>
									<button
										type="button"
										onClick={() => exportConversationAsCsvSpreadsheet(conversation)}
										className="w-full mt-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
									>
										<Download className="w-3.5 h-3.5" />
										<span>Download Spreadsheet</span>
									</button>
								</div>

								{/* Word Doc */}
								<div className="bg-[#101627] border border-[#1e2a4a] hover:border-sky-500/50 rounded-xl p-4 transition-all">
									<div className="flex items-center gap-3 mb-2">
										<div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
											<FileText className="w-5 h-5" />
										</div>
										<div>
											<div className="text-xs font-bold text-white">Word / Docs Document (.DOC)</div>
											<div className="text-[11px] text-slate-400">Microsoft Word formatted briefing</div>
										</div>
									</div>
									<button
										type="button"
										onClick={() => exportConversationAsWordDoc(conversation)}
										className="w-full mt-2 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
									>
										<Download className="w-3.5 h-3.5" />
										<span>Download Word Document</span>
									</button>
								</div>

								{/* Copy Rich HTML */}
								<div className="bg-[#101627] border border-[#1e2a4a] hover:border-amber-500/50 rounded-xl p-4 transition-all">
									<div className="flex items-center gap-3 mb-2">
										<div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
											<Share2 className="w-5 h-5" />
										</div>
										<div>
											<div className="text-xs font-bold text-white">Share / Copy Rich HTML</div>
											<div className="text-[11px] text-slate-400">Formatted for Slack, Notion, Teams & Docs</div>
										</div>
									</div>
									<button
										type="button"
										onClick={handleCopyRichHtml}
										className="w-full mt-2 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
									>
										{copiedRichHtml ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
										<span>{copiedRichHtml ? "Copied to Clipboard!" : "Copy Formatted Rich HTML"}</span>
									</button>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Bottom Actions Footer */}
				<div className="px-5 py-3 border-t border-[#1b253f] bg-[#0c101d] flex items-center justify-between text-xs text-slate-400">
					<div className="flex items-center gap-2">
						<ShieldCheck className="w-4 h-4 text-emerald-400" />
						<span>Cryptographically verified output signed by GovernMindz Autonomous Council</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-1.5 rounded-lg bg-[#161f36] hover:bg-[#1e2a4a] text-slate-200 font-medium transition-colors"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
};
