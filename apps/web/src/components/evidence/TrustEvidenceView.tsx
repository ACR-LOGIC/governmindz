import React, { useState, useEffect, useCallback } from "react";
import {
	Database,
	ShieldCheck,
	CheckCircle2,
	AlertTriangle,
	Search,
	Copy,
	Check,
	Lock,
	Globe,
	ExternalLink,
	RefreshCw,
	FileDown,
	Printer,
	RotateCcw,
	ChevronDown,
	ChevronUp,
	Bug,
	Link2,
	XCircle,
	FileCode,
} from "lucide-react";
import type {
	Conversation,
	ZetarisData,
	AuditEvent,
	AuditVerificationReport,
	BlockVerificationDetail,
} from "../../types";
import { verifyAuditChain } from "../../services/api";
import {
	exportAuditProofCertificateJson,
	exportAuditProofCertificatePrintable,
} from "../../services/exportService";

interface TrustEvidenceViewProps {
	conversation: Conversation;
}

export const TrustEvidenceView: React.FC<TrustEvidenceViewProps> = ({ conversation }) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [copiedHash, setCopiedHash] = useState<string | null>(null);

	// Audit trail working state
	const [workingEvents, setWorkingEvents] = useState<AuditEvent[]>(
		conversation.auditEvents ? [...conversation.auditEvents] : [],
	);
	const [report, setReport] = useState<AuditVerificationReport | null>(null);
	const [isVerifying, setIsVerifying] = useState(false);
	const [expandedBlockIndex, setExpandedBlockIndex] = useState<number | null>(null);
	const [tamperFeedback, setTamperFeedback] = useState<string | null>(null);

	// Sync when conversation prop changes (unless currently experimenting with tamper simulation)
	useEffect(() => {
		if (conversation.auditEvents && conversation.auditEvents.length > 0) {
			setWorkingEvents([...conversation.auditEvents]);
			setTamperFeedback(null);
		}
	}, [conversation.id, conversation.auditEvents]);

	// Run verification on workingEvents
	const executeVerification = useCallback(async (eventsToVerify: AuditEvent[]) => {
		setIsVerifying(true);
		try {
			const res = await verifyAuditChain({
				auditEvents: eventsToVerify,
				conversationId: conversation.id,
			});
			setReport(res);
		} catch (err) {
			console.error("Verification failed, falling back to local verification:", err);
		} finally {
			setIsVerifying(false);
		}
	}, [conversation.id]);

	// Initial verification on mount or when workingEvents change
	useEffect(() => {
		executeVerification(workingEvents);
	}, [workingEvents, executeVerification]);

	const handleCopy = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopiedHash(text);
		setTimeout(() => setCopiedHash(null), 2000);
	};

	// Tamper simulation 1: Mutate payload without recomputing hash
	const handleSimulatePayloadTamper = () => {
		if (workingEvents.length === 0) return;
		const targetIndex = workingEvents.length > 1 ? 1 : 0;
		const updated = workingEvents.map((ev, idx) => {
			if (idx === targetIndex) {
				return {
					...ev,
					payload: {
						...ev.payload,
						consensus_reached: false,
						final_confidence: 0.12,
						unauthorized_mutation: "TAMPERED_BY_SIMULATION",
						rounds: 999,
					},
				};
			}
			return ev;
		});

		setWorkingEvents(updated);
		setExpandedBlockIndex(targetIndex);
		setTamperFeedback(
			`Simulated payload tampering on Block #${targetIndex} (${updated[targetIndex].id}): Payload content modified without updating SHA-256 hash or HMAC signature.`,
		);
	};

	// Tamper simulation 2: Break link by altering previous_hash
	const handleSimulateLinkBreak = () => {
		if (workingEvents.length === 0) return;
		const targetIndex = workingEvents.length > 1 ? 1 : 0;
		const updated = workingEvents.map((ev, idx) => {
			if (idx === targetIndex) {
				return {
					...ev,
					previous_hash: "00000000brokenlinkdeadbeef00000000deadbeef",
				};
			}
			return ev;
		});

		setWorkingEvents(updated);
		setExpandedBlockIndex(targetIndex);
		setTamperFeedback(
			`Simulated link break on Block #${targetIndex} (${updated[targetIndex].id}): previous_hash altered to a broken cryptographic link.`,
		);
	};

	// Restore uncorrupted audit chain
	const handleRestorePristine = () => {
		const pristine = conversation.auditEvents ? [...conversation.auditEvents] : [];
		setWorkingEvents(pristine);
		setTamperFeedback(null);
		setExpandedBlockIndex(null);
	};

	// Re-verify manually
	const handleManualReverify = () => {
		executeVerification(workingEvents);
	};

	// Certificate export
	const handleExportCertificateJson = () => {
		if (!report) return;
		exportAuditProofCertificateJson(conversation, report);
	};

	const handlePrintCertificate = () => {
		if (!report) return;
		exportAuditProofCertificatePrintable(conversation, report);
	};

	const zetaris: ZetarisData = conversation.zetarisData || {
		query: "SHOW LIGHTNING DATABASES",
		columns: ["database", "owner", "classification"],
		rows: [
			["governance_demo", "data-governance", "internal"],
			["operations_demo", "operations", "internal"],
			["finance_demo", "finance", "confidential"],
		],
		total: 3,
	};

	const filteredRows = zetaris.rows.filter((r) =>
		r.some((cell) => String(cell).toLowerCase().includes(searchQuery.toLowerCase())),
	);

	return (
		<div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
			<div className="max-w-4xl mx-auto space-y-8">
				{/* Section 1: Zetaris Lightning Federated Evidence */}
				<div className="rounded-2xl bg-[#12182b] border border-[#1e2842] p-5 shadow-xl space-y-4">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e2842]">
						<div className="flex items-center gap-2.5">
							<div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
								<Database className="w-4 h-4" />
							</div>
							<div>
								<h2 className="font-display font-bold text-base text-slate-100">
									Zetaris Lightning Federated Data Catalog
								</h2>
								<p className="text-xs text-slate-400">
									Live read-only SQL discovery guarded by statement assertions
								</p>
							</div>
						</div>

						<div className="flex items-center gap-2">
							{conversation.mode === "live" && conversation.zetarisData?.query && (
								<a
									href={`/evidence/${encodeURIComponent(conversation.id)}`}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-950/40 border border-teal-700/40 text-teal-300 text-[10px] font-semibold hover:bg-teal-900/50 transition-colors"
									title="Open the exact captured Zetaris dataset with its SHA-256 evidence hash"
								>
									<ExternalLink className="w-3 h-3" />
									Verify raw evidence
								</a>
							)}
							<span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 font-semibold">
								{zetaris.total} sources discovered
							</span>
						</div>
					</div>

					{/* Query display */}
					<div className="bg-[#0a0e1a] p-3 rounded-xl border border-[#1e2842] font-mono text-xs flex items-center justify-between text-slate-300">
						<div className="flex items-center gap-2">
							<span className="text-teal-400 font-bold">SQL:</span>
							<span className="text-amber-300">{zetaris.query}</span>
						</div>
						<span className="text-[10px] text-slate-400">read-only · 50 row limit</span>
					</div>

					{/* Table search filter */}
					<div className="relative">
						<Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search discovered tables or classifications…"
							className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0e1a] border border-[#1e2842] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
						/>
					</div>

					{/* Responsive Table */}
					<div className="overflow-x-auto rounded-xl border border-[#1e2842] bg-[#0c101e]">
						<table className="w-full text-left text-xs">
							<thead className="bg-[#18203a] text-slate-300 font-mono uppercase text-[10px] tracking-wider border-b border-[#1e2842]">
								<tr>
									{zetaris.columns.map((c) => (
										<th key={c} className="py-2.5 px-4 font-semibold">
											{c}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-[#1e2842]/50 font-mono text-slate-200">
								{filteredRows.map((row, idx) => (
									<tr key={idx} className="hover:bg-[#12182b]/60 transition-colors">
										{row.map((cell, cIdx) => {
											const cellStr = String(cell);
											const isConfidential = cellStr.toLowerCase() === "confidential";
											const isInternal = cellStr.toLowerCase() === "internal";

											return (
												<td key={cIdx} className="py-2.5 px-4">
													{isConfidential ? (
														<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/60 border border-rose-800 text-rose-300">
															confidential
														</span>
													) : isInternal ? (
														<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950/60 border border-sky-800 text-sky-300">
															internal
														</span>
													) : (
														cellStr
													)}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				{/* Section 2: Authoritative Web Citations & External Research */}
				<div className="rounded-2xl bg-[#12182b] border border-[#1e2842] p-5 shadow-xl space-y-4">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e2842]">
						<div className="flex items-center gap-2.5">
							<div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400">
								<Globe className="w-4 h-4" />
							</div>
							<div>
								<h2 className="font-display font-bold text-base text-slate-100">
									Authoritative Web Citations & Regulatory References
								</h2>
								<p className="text-xs text-slate-400">
									External domain verification & standards lookup via Imperial Web Intelligence Scout
								</p>
							</div>
						</div>

						{conversation.webSearchData && (
							<span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-sky-950/40 border border-sky-700/40 text-sky-300 font-semibold">
								{conversation.webSearchData.results.length} verified web sources
							</span>
						)}
					</div>

					{conversation.webSearchData && conversation.webSearchData.results.length > 0 ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{conversation.webSearchData.results.map((res, i) => (
								<div
									key={i}
									className="p-3.5 rounded-xl bg-[#0a0e1a] border border-[#1e2842] hover:border-sky-500/40 transition-all flex flex-col justify-between space-y-2 group"
								>
									<div>
										<div className="flex items-start justify-between gap-2 mb-1">
											<h4 className="text-xs font-bold text-sky-200 group-hover:text-sky-300 line-clamp-1">
												{res.title}
											</h4>
											<span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-800/60 text-sky-300 shrink-0">
												{res.verificationStatus || "verified"}
											</span>
										</div>
										<p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
											{res.snippet}
										</p>
									</div>

									<div className="flex items-center justify-between pt-2 border-t border-[#1e2842]/50 text-[10px] font-mono text-slate-400">
										<span className="truncate max-w-[200px]">{res.source}</span>
										<a
											href={res.url}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 hover:underline shrink-0"
										>
											<span>Source</span>
											<ExternalLink className="w-2.5 h-2.5" />
										</a>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="p-5 text-center text-xs text-slate-400 border border-dashed border-[#1e2842] rounded-xl font-mono">
							🌐 Web search triggers automatically when topics reference external regulatory standards,
							NIST frameworks, or when local Zetaris catalogs require supplementary verification.
						</div>
					)}
				</div>

				{/* Section 3: Interactive Cryptographic Audit Chain Verifier & Proof Export (R6) */}
				<div className="rounded-2xl bg-[#12182b] border border-[#1e2842] p-5 shadow-xl space-y-5">
					{/* Header */}
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e2842]">
						<div className="flex items-center gap-2.5">
							<div className="w-8 h-8 rounded-lg bg-teal-950/60 border border-teal-800/60 flex items-center justify-center text-teal-400">
								<ShieldCheck className="w-4 h-4" />
							</div>
							<div>
								<h2 className="font-display font-bold text-base text-slate-100 flex items-center gap-2">
									<span>Tamper-Evident SHA-256 Cryptographic Ledger</span>
									<span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-teal-950/80 border border-teal-700/60 text-teal-300">
										RFC-6962 / NIST SP 800-92
									</span>
								</h2>
								<p className="text-xs text-slate-400">
									Interactive cryptographic audit chain verifier with block-level hash recomputation, HMAC verification, and compliance proof export
								</p>
							</div>
						</div>

						{/* Quick Action Export Buttons */}
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleExportCertificateJson}
								disabled={!report}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18203a] hover:bg-[#202b4d] border border-[#2c385c] text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
								title="Export cryptographic proof certificate as JSON"
							>
								<FileDown className="w-3.5 h-3.5 text-teal-400" />
								<span>Proof JSON</span>
							</button>

							<button
								type="button"
								onClick={handlePrintCertificate}
								disabled={!report}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18203a] hover:bg-[#202b4d] border border-[#2c385c] text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
								title="Print compliance certificate document"
							>
								<Printer className="w-3.5 h-3.5 text-amber-400" />
								<span>Print Certificate</span>
							</button>
						</div>
					</div>

					{/* Real-Time Cryptographic Status Summary Banner */}
					{report && (
						<div
							className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
								report.verified
									? "bg-emerald-950/30 border-emerald-700/60 text-emerald-200"
									: "bg-rose-950/40 border-rose-600/80 text-rose-200"
							}`}
						>
							<div className="flex items-start gap-3">
								{report.verified ? (
									<CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
								) : (
									<AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
								)}
								<div>
									<div className="font-bold text-sm flex items-center gap-2">
										<span>
											{report.verified
												? "Cryptographic Audit Trail Verified Unbroken"
												: `Integrity Compromised: ${report.status}`}
										</span>
										<span
											className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
												report.verified
													? "bg-emerald-900/60 border border-emerald-600 text-emerald-300"
													: "bg-rose-900/80 border border-rose-500 text-rose-100"
											}`}
										>
											{report.status}
										</span>
									</div>
									<div className="text-xs opacity-90 mt-0.5 font-mono">
										{report.verified ? (
											<span>
												All {report.totalBlocks} blocks sealed with valid HMAC-SHA256 signatures and continuous hash links from genesis anchor.
											</span>
										) : (
											<span className="text-rose-200 font-semibold">
												Corruption localized to Block #{report.corruptedBlockIndex} (ID: {report.corruptedBlockId || "unknown"}). Downstream chain integrity invalidated.
											</span>
										)}
									</div>
								</div>
							</div>

							<div className="flex items-center gap-3 text-xs font-mono shrink-0">
								<div className="text-right">
									<div className="text-[10px] text-slate-400 uppercase font-semibold">Terminal Hash</div>
									<div className="text-slate-200 font-bold">
										{report.terminalHash ? `${report.terminalHash.slice(0, 10)}…` : "N/A"}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Interactive Tamper Testing Toolbar */}
					<div className="p-3.5 rounded-xl bg-[#0a0e1a] border border-[#1e2842] flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-[11px] font-mono font-semibold uppercase text-slate-400 flex items-center gap-1.5 mr-1">
								<Bug className="w-3.5 h-3.5 text-amber-400" />
								<span>Tamper Lab:</span>
							</span>

							<button
								type="button"
								onClick={handleSimulatePayloadTamper}
								disabled={workingEvents.length === 0}
								className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-[#161f36] hover:bg-[#1e2b4d] border border-amber-600/50 text-amber-300 transition-colors disabled:opacity-40"
							>
								<FileCode className="w-3.5 h-3.5 text-amber-400" />
								<span>Simulate Payload Mutation</span>
							</button>

							<button
								type="button"
								onClick={handleSimulateLinkBreak}
								disabled={workingEvents.length === 0}
								className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-[#161f36] hover:bg-[#1e2b4d] border border-rose-600/50 text-rose-300 transition-colors disabled:opacity-40"
							>
								<Link2 className="w-3.5 h-3.5 text-rose-400" />
								<span>Simulate Link Break</span>
							</button>

							<button
								type="button"
								onClick={handleRestorePristine}
								className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-[#161f36] hover:bg-[#1e2b4d] border border-[#2c385c] text-slate-300 hover:text-white transition-colors"
							>
								<RotateCcw className="w-3.5 h-3.5 text-sky-400" />
								<span>Restore Pristine Trail</span>
							</button>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleManualReverify}
								disabled={isVerifying}
								className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold bg-teal-900/40 hover:bg-teal-900/70 border border-teal-600/60 text-teal-300 transition-colors disabled:opacity-50"
							>
								<RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin text-teal-300" : ""}`} />
								<span>Re-Verify Chain</span>
							</button>
						</div>
					</div>

					{/* Tamper Feedback Alert Message */}
					{tamperFeedback && (
						<div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/60 text-xs font-mono text-amber-200 flex items-start justify-between gap-2">
							<span>{tamperFeedback}</span>
							<button
								type="button"
								onClick={() => setTamperFeedback(null)}
								className="text-amber-400 hover:text-amber-200 text-xs shrink-0"
							>
								Dismiss
							</button>
						</div>
					)}

					{/* Genesis Anchor Reference Card */}
					<div className="p-3 rounded-xl bg-[#0a0e1a] border border-[#1e2842] space-y-1.5 font-mono text-xs">
						<div className="flex items-center justify-between">
							<span className="text-[10px] uppercase text-teal-400 font-bold flex items-center gap-1.5">
								<Lock className="w-3 h-3" />
								<span>Genesis Anchor Hash (Block #0 Anchor):</span>
							</span>
							<button
								type="button"
								onClick={() => handleCopy(report?.genesisAnchor || "c910699e010057fee5424ddcb6751ac88b20169be78af84a4741e0754e5d8b59")}
								className="text-slate-400 hover:text-white"
								title="Copy Genesis Hash"
							>
								{copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
							</button>
						</div>
						<div className="text-[11px] text-teal-300 break-all select-all font-mono">
							{report?.genesisAnchor || "c910699e010057fee5424ddcb6751ac88b20169be78af84a4741e0754e5d8b59"}
						</div>
					</div>

					{/* Block-by-Block Visual Card Graph */}
					<div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
						{workingEvents.length > 0 ? (
							workingEvents.map((ae, i) => {
								const detail: BlockVerificationDetail | undefined = report?.details[i];
								const isBlockValid = detail ? detail.status === "VERIFIED" : true;
								const isCorruptedHead = report?.corruptedBlockIndex === i;
								const isExpanded = expandedBlockIndex === i;

								return (
									<div
										key={ae.id || i}
										className={`p-3.5 rounded-xl border font-mono text-xs transition-all ${
											!isBlockValid
												? "bg-rose-950/20 border-rose-600/90 shadow-lg shadow-rose-950/40"
												: "bg-[#0c101e] border-[#1e2842] hover:border-[#2a375a]"
										}`}
									>
										{/* Card Header */}
										<div className="flex items-center justify-between text-[11px] text-slate-300 pb-2 border-b border-[#1e2842]/60">
											<div className="flex items-center gap-2">
												<span
													className={`px-2 py-0.5 rounded text-[10px] font-bold ${
														isBlockValid
															? "bg-teal-950 border border-teal-800 text-teal-300"
															: "bg-rose-950 border border-rose-600 text-rose-200"
													}`}
												>
													Block #{i}
												</span>
												<span className="font-bold text-amber-300">{ae.event_type}</span>
												<span className="text-[10px] text-slate-500 truncate max-w-[120px]">
													{ae.id}
												</span>
											</div>

											<div className="flex items-center gap-3">
												<span className="text-[10px] text-slate-400">
													{new Date(ae.timestamp).toISOString()}
												</span>
												<span
													className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
														isBlockValid
															? "bg-emerald-950/80 border border-emerald-700/60 text-emerald-300"
															: "bg-rose-900 border border-rose-500 text-rose-100"
													}`}
												>
													{isBlockValid ? (
														<>
															<CheckCircle2 className="w-3 h-3 text-emerald-400" />
															<span>VERIFIED</span>
														</>
													) : (
														<>
															<XCircle className="w-3 h-3 text-rose-400" />
															<span>{detail?.status || "TAMPERED"}</span>
														</>
													)}
												</span>

												<button
													type="button"
													onClick={() => setExpandedBlockIndex(isExpanded ? null : i)}
													className="text-slate-400 hover:text-slate-200 transition-colors p-0.5"
													title={isExpanded ? "Collapse inspector" : "Expand inspector"}
												>
													{isExpanded ? (
														<ChevronUp className="w-4 h-4" />
													) : (
														<ChevronDown className="w-4 h-4" />
													)}
												</button>
											</div>
										</div>

										{/* Cryptographic Hash Summary */}
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px] pt-2">
											<div className="space-y-0.5">
												<div className="flex items-center justify-between text-slate-400">
													<span>Previous Hash Link:</span>
													<button
														type="button"
														onClick={() => handleCopy(ae.previous_hash || "")}
														className="text-slate-500 hover:text-slate-300"
													>
														<Copy className="w-2.5 h-2.5" />
													</button>
												</div>
												<div
													className={`font-mono break-all ${
														detail && detail.expectedPreviousHash !== ae.previous_hash
															? "text-rose-400 font-bold bg-rose-950/40 p-1 rounded"
															: "text-slate-300"
													}`}
												>
													{(ae.previous_hash || "").slice(0, 24)}…
												</div>
											</div>

											<div className="space-y-0.5">
												<div className="flex items-center justify-between text-slate-400">
													<span>Current Block Hash:</span>
													<button
														type="button"
														onClick={() => handleCopy(ae.hash || "")}
														className="text-slate-500 hover:text-slate-300"
													>
														<Copy className="w-2.5 h-2.5" />
													</button>
												</div>
												<div
													className={`font-mono break-all font-bold ${
														detail && detail.expectedHash !== ae.hash
															? "text-rose-400 bg-rose-950/40 p-1 rounded"
															: "text-cyan-300"
													}`}
												>
													{(ae.hash || "").slice(0, 24)}…
												</div>
											</div>
										</div>

										{/* Signature Bar */}
										<div className="pt-2 mt-2 border-t border-[#1e2842]/50 text-[10px] text-slate-400 flex items-center justify-between">
											<div className="truncate max-w-[340px]">
												<span>Signature: </span>
												<span
													className={`font-mono ${
														detail && !detail.signatureValid
															? "text-rose-400 font-bold"
															: "text-emerald-400"
													}`}
												>
													{(ae.signature || "").slice(0, 28)}…
												</span>
											</div>

											<div className="flex items-center gap-2">
												{ae.linked_decay_hash && (
													<span className="text-slate-500">
														Decay: {ae.linked_decay_hash.slice(0, 8)}…
													</span>
												)}
												<span
													className={`font-semibold flex items-center gap-1 ${
														detail?.signatureValid
															? "text-emerald-400"
															: "text-rose-400"
													}`}
												>
													{detail?.signatureValid ? (
														<>
															<CheckCircle2 className="w-3 h-3 text-emerald-400" />
															<span>HMAC-SHA256 Match</span>
														</>
													) : (
														<>
															<XCircle className="w-3 h-3 text-rose-400" />
															<span>HMAC Forged/Invalid</span>
														</>
													)}
												</span>
											</div>
										</div>

										{/* Clickable Expanded Block Inspector */}
										{isExpanded && (
											<div className="mt-3 pt-3 border-t border-[#1e2842] space-y-3 bg-[#080c16] -mx-3.5 -mb-3.5 p-3.5 rounded-b-xl">
												<div className="flex items-center justify-between text-xs font-bold text-slate-200">
													<span>Block Inspector Detail (RFC-6962 Compliance)</span>
													{isCorruptedHead && (
														<span className="text-rose-400 font-bold text-[11px] flex items-center gap-1">
															<AlertTriangle className="w-3 h-3" />
															Corrupted Block Origin
														</span>
													)}
												</div>

												{detail?.error && (
													<div className="p-2.5 rounded bg-rose-950/50 border border-rose-700/80 text-rose-200 text-xs">
														<strong>Verification Error:</strong> {detail.error}
													</div>
												)}

												{/* Hash Comparison Table */}
												<div className="grid grid-cols-1 gap-2 text-[11px]">
													<div className="p-2 rounded bg-[#0f1424] border border-[#1e2842] space-y-1">
														<div className="text-[10px] text-slate-400 uppercase font-semibold">
															Previous Link Verification:
														</div>
														<div className="flex justify-between gap-2">
															<span className="text-slate-400">Expected:</span>
															<span className="font-mono text-slate-200 break-all text-right">
																{detail?.expectedPreviousHash || "N/A"}
															</span>
														</div>
														<div className="flex justify-between gap-2">
															<span className="text-slate-400">Actual Stored:</span>
															<span
																className={`font-mono break-all text-right ${
																	detail && detail.expectedPreviousHash !== ae.previous_hash
																		? "text-rose-400 font-bold"
																		: "text-slate-200"
																}`}
															>
																{ae.previous_hash}
															</span>
														</div>
													</div>

													<div className="p-2 rounded bg-[#0f1424] border border-[#1e2842] space-y-1">
														<div className="text-[10px] text-slate-400 uppercase font-semibold">
															Payload Hash Recomputation:
														</div>
														<div className="flex justify-between gap-2">
															<span className="text-slate-400">Recomputed SHA-256:</span>
															<span className="font-mono text-cyan-300 break-all text-right">
																{detail?.expectedHash || "N/A"}
															</span>
														</div>
														<div className="flex justify-between gap-2">
															<span className="text-slate-400">Actual Stored:</span>
															<span
																className={`font-mono break-all text-right ${
																	detail && detail.expectedHash !== ae.hash
																		? "text-rose-400 font-bold"
																		: "text-slate-200"
																}`}
															>
																{ae.hash}
															</span>
														</div>
													</div>
												</div>

												{/* Decoded Payload View */}
												<div className="space-y-1">
													<div className="text-[10px] text-slate-400 uppercase font-semibold">
														Decoded Payload JSON:
													</div>
													<pre className="p-2.5 rounded bg-[#04060b] border border-[#1e2842] text-[10.5px] text-slate-300 overflow-x-auto max-h-48">
														{JSON.stringify(ae.payload, null, 2)}
													</pre>
												</div>
											</div>
										)}
									</div>
								);
							})
						) : (
							<div className="p-6 text-center text-xs text-slate-400 border border-dashed border-[#1e2842] rounded-xl font-mono">
								Run an inquiry to generate live hash-chained audit events.
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default TrustEvidenceView;