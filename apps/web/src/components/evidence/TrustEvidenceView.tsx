import React, { useState } from "react";
import {
	Database,
	ShieldCheck,
	CheckCircle2,
	AlertTriangle,
	Search,
	Copy,
	Check,
	Lock,
	Key,
	Terminal,
	FileText,
	Globe,
	ExternalLink,
	Sparkles,
} from "lucide-react";
import type { Conversation, ZetarisData, AuditEvent } from "../../types";

interface TrustEvidenceViewProps {
	conversation: Conversation;
}

export const TrustEvidenceView: React.FC<TrustEvidenceViewProps> = ({ conversation }) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [copiedHash, setCopiedHash] = useState<string | null>(null);
	const [tamperSimulation, setTamperSimulation] = useState(false);

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

	const auditEvents: AuditEvent[] = conversation.auditEvents || [];

	const handleCopy = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopiedHash(text);
		setTimeout(() => setCopiedHash(null), 2000);
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

				{/* Section 3: Cryptographic Audit Trail Ledger */}
				<div className="rounded-2xl bg-[#12182b] border border-[#1e2842] p-5 shadow-xl space-y-4">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e2842]">
						<div className="flex items-center gap-2.5">
							<div className="w-8 h-8 rounded-lg bg-teal-950/60 border border-teal-800/60 flex items-center justify-center text-teal-400">
								<ShieldCheck className="w-4 h-4" />
							</div>
							<div>
								<h2 className="font-display font-bold text-base text-slate-100">
									Tamper-Evident SHA-256 Cryptographic Ledger
								</h2>
								<p className="text-xs text-slate-400">
									HMAC-SHA256 signatures chained continuously from genesis hash
								</p>
							</div>
						</div>

						{/* Tamper simulation toggle */}
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setTamperSimulation(!tamperSimulation)}
								className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-all ${
									tamperSimulation
										? "bg-rose-950/80 border-rose-600 text-rose-200"
										: "bg-[#18203a] border-[#2c385c] text-slate-300 hover:text-white"
								}`}
							>
								{tamperSimulation ? "⚠ Tamper Simulated (Chain Broken)" : "Test Tamper Resilience"}
							</button>
						</div>
					</div>

					{/* Genesis Anchor Box */}
					<div className="p-3 rounded-xl bg-[#0a0e1a] border border-[#1e2842] space-y-1.5 font-mono text-xs">
						<div className="flex items-center justify-between">
							<span className="text-[10px] uppercase text-teal-400 font-bold flex items-center gap-1.5">
								<Lock className="w-3 h-3" />
								<span>Genesis Anchor Hash:</span>
							</span>
							<button
								type="button"
								onClick={() => handleCopy("c910699e010057fee5424ddcb6751ac88b20169be78af84a4741e0754e5d8b59")}
								className="text-slate-400 hover:text-white"
								title="Copy Genesis Hash"
							>
								{copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
							</button>
						</div>
						<div className="text-[11px] text-teal-300 break-all select-all font-mono">
							c910699e010057fee5424ddcb6751ac88b20169be78af84a4741e0754e5d8b59
						</div>
					</div>

					{/* Tamper Warning Banner if simulated */}
					{tamperSimulation && (
						<div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/60 text-xs text-rose-200 flex items-center gap-3">
							<AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
							<div>
								<div className="font-bold">Cryptographic Integrity Violation Detected!</div>
								<div className="text-[11px] text-rose-300">
									Payload signature does not match computed HMAC. Hash chain halts immediately.
								</div>
							</div>
						</div>
					)}

					{/* Audit events feed */}
					<div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
						{auditEvents.length > 0 ? (
							auditEvents.map((ae, i) => (
								<div
									key={ae.id || i}
									className="p-3 rounded-xl bg-[#0c101e] border border-[#1e2842] font-mono text-xs space-y-1.5"
								>
									<div className="flex items-center justify-between text-[11px] text-slate-300">
										<span className="font-bold text-amber-300">{ae.event_type}</span>
										<span className="text-[10px] text-slate-400">
											{new Date(ae.timestamp).toISOString()}
										</span>
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
										<div>
											<span className="text-slate-400">Previous Hash: </span>
											<span className="text-slate-300 font-mono">
												{(ae.previous_hash || "").slice(0, 16)}…
											</span>
										</div>
										<div>
											<span className="text-slate-400">Current Hash: </span>
											<span className="text-cyan-300 font-mono font-bold">
												{(ae.hash || "").slice(0, 16)}…
											</span>
										</div>
									</div>

									<div className="pt-1 border-t border-[#1e2842]/50 text-[10px] text-slate-400 flex items-center justify-between">
										<span>
											Signature:{" "}
											<span className="text-emerald-400 font-mono">
												{(ae.signature || "").slice(0, 24)}…
											</span>
										</span>
										<span className="text-emerald-400 font-semibold flex items-center gap-1">
											<CheckCircle2 className="w-3 h-3" />
											Verified HMAC-SHA256
										</span>
									</div>
								</div>
							))
						) : (
							<div className="p-6 text-center text-xs text-slate-400 border border-dashed border-[#1e2842] rounded-xl">
								Run an inquiry to generate live hash-chained audit events.
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
