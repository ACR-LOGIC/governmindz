import React, { useMemo, useState } from "react";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Braces,
	Check,
	Copy,
	Database,
	Download,
	FileJson,
	FileSpreadsheet,
	RotateCcw,
	Search,
	Table2,
	X,
} from "lucide-react";
import type { ZetarisData } from "../../types";

interface ZetarisDataExplorerProps {
	data: ZetarisData;
	mode?: "live" | "demo" | "sample";
}

type SortState = { column: number; direction: "asc" | "desc" } | null;

function formatCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

function downloadText(filename: string, mimeType: string, content: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(columns: string[], rows: unknown[][]): string {
	const escape = (value: unknown) => {
		const text = formatCell(value);
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	return [columns, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}

export const ZetarisDataExplorer: React.FC<ZetarisDataExplorerProps> = ({ data, mode = "sample" }) => {
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortState>(null);
	const [view, setView] = useState<"table" | "json">("table");
	const [inspectedRow, setInspectedRow] = useState<number | null>(null);
	const [copied, setCopied] = useState<string | null>(null);

	const sourceLabel =
		data.evidenceSource === "sample_scenario"
			? "Deterministic scenario"
			: data.isSynthetic || data.evidenceSource === "synthetic_fallback"
				? "Synthetic fallback"
				: data.evidenceSource === "live_zetaris" ||
						data.evidenceSource === "zetaris_lightning" ||
						mode === "live"
					? "Live Zetaris"
					: "Deterministic scenario";

	const indexedRows = useMemo(
		() => data.rows.map((row, index) => ({ row, index })),
		[data.rows],
	);

	const filteredRows = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return indexedRows;
		return indexedRows.filter(({ row }) =>
			row.some((cell) => formatCell(cell).toLowerCase().includes(query)),
		);
	}, [indexedRows, search]);

	const visibleRows = useMemo(() => {
		if (!sort) return filteredRows;
		const sorted = [...filteredRows];
		sorted.sort((a, b) => {
			const aText = formatCell(a.row[sort.column]);
			const bText = formatCell(b.row[sort.column]);
			const aNumber = Number(aText);
			const bNumber = Number(bText);
			const bothNumeric =
				aText.trim() !== "" &&
				bText.trim() !== "" &&
				Number.isFinite(aNumber) &&
				Number.isFinite(bNumber);
			const comparison = bothNumeric
				? aNumber - bNumber
				: aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" });
			return comparison === 0
				? a.index - b.index
				: sort.direction === "asc"
					? comparison
					: -comparison;
		});
		return sorted;
	}, [filteredRows, sort]);

	const rawJson = useMemo(
		() =>
			JSON.stringify(
				{
					query: data.query,
					columns: data.columns,
					rows: data.rows,
					total: data.total,
					isSynthetic: data.isSynthetic,
					evidenceSource: data.evidenceSource,
				},
				null,
				2,
			),
		[data],
	);

	const copyText = async (key: string, text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(key);
			setTimeout(() => setCopied(null), 1800);
		} catch {
			// Clipboard access can be unavailable in an embedded browser.
		}
	};

	const toggleSort = (column: number) => {
		setSort((current) => {
			if (!current || current.column !== column) return { column, direction: "asc" };
			if (current.direction === "asc") return { column, direction: "desc" };
			return null;
		});
	};

	const clearFilters = () => {
		setSearch("");
		setSort(null);
		setInspectedRow(null);
	};

	const inspected =
		inspectedRow === null ? null : indexedRows.find(({ index }) => index === inspectedRow) || null;

	const inspectedObject = inspected
		? Object.fromEntries(
				data.columns.map((column, index) => [column, inspected.row[index] ?? null]),
			)
		: null;

	return (
		<div id="tour-zetaris" data-testid="zetaris-data-explorer" className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
					<span
						className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
							sourceLabel === "Live Zetaris"
								? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300"
								: sourceLabel === "Deterministic scenario"
									? "bg-amber-950/40 border-amber-700/50 text-amber-300"
									: "bg-rose-950/40 border-rose-700/50 text-rose-300"
						}`}
					>
						<Database className="w-3 h-3" />
						{sourceLabel}
					</span>
					<span className="px-2 py-0.5 rounded-full bg-[#18203a] border border-[#2c385c] text-slate-300">
						{visibleRows.length} / {data.rows.length} rows
					</span>
					<span className="px-2 py-0.5 rounded-full bg-[#18203a] border border-[#2c385c] text-slate-300">
						{data.columns.length} columns
					</span>
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					<div className="flex items-center rounded-lg border border-[#2c385c] bg-[#0a0e1a] p-0.5">
						<button
							type="button"
							onClick={() => setView("table")}
							className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
								view === "table" ? "bg-[#18203a] text-teal-300" : "text-slate-400 hover:text-slate-200"
							}`}
							aria-pressed={view === "table"}
						>
							<Table2 className="w-3 h-3" />
							Table
						</button>
						<button
							type="button"
							onClick={() => setView("json")}
							className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
								view === "json" ? "bg-[#18203a] text-teal-300" : "text-slate-400 hover:text-slate-200"
							}`}
							aria-pressed={view === "json"}
						>
							<Braces className="w-3 h-3" />
							Raw JSON
						</button>
					</div>

					<button
						type="button"
						onClick={() => void copyText("sql", data.query)}
						className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#18203a] hover:bg-[#202b4d] border border-[#2c385c] text-[10px] font-semibold text-slate-200 transition-colors"
						title="Copy the exact SQL query"
					>
						{copied === "sql" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-teal-400" />}
						Copy SQL
					</button>
					<button
						type="button"
						data-testid="zetaris-download-csv"
						onClick={() => downloadText("zetaris-evidence.csv", "text/csv;charset=utf-8", toCsv(data.columns, data.rows))}
						className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#18203a] hover:bg-[#202b4d] border border-[#2c385c] text-[10px] font-semibold text-slate-200 transition-colors"
						title="Download the full result set as CSV"
					>
						<FileSpreadsheet className="w-3 h-3 text-emerald-400" />
						CSV
					</button>
					<button
						type="button"
						data-testid="zetaris-download-json"
						onClick={() => downloadText("zetaris-evidence.json", "application/json;charset=utf-8", rawJson)}
						className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#18203a] hover:bg-[#202b4d] border border-[#2c385c] text-[10px] font-semibold text-slate-200 transition-colors"
						title="Download the full result set as JSON"
					>
						<FileJson className="w-3 h-3 text-amber-400" />
						JSON
					</button>
				</div>
			</div>

			<div className="bg-[#0a0e1a] p-3 rounded-xl border border-[#1e2842] font-mono text-xs flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-slate-300">
				<div className="flex items-start gap-2 min-w-0">
					<span className="text-teal-400 font-bold shrink-0">SQL:</span>
					<span className="text-amber-300 break-all">{data.query}</span>
				</div>
				<div className="flex items-center gap-2 shrink-0 text-[10px] text-slate-400">
					<span>read-only · 50 row limit</span>
					<button
						type="button"
						onClick={() => void copyText("query-row", data.query)}
						className="text-slate-400 hover:text-white"
						title="Copy SQL"
					>
						{copied === "query-row" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
					</button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="relative flex-1 min-w-[180px]">
					<Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
					<input
						type="text"
						data-testid="zetaris-search"
						value={search}
						onChange={(event) => {
							setSearch(event.target.value);
							setInspectedRow(null);
						}}
						placeholder="Search any column or value…"
						aria-label="Search Zetaris rows"
						className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0e1a] border border-[#1e2842] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
					/>
				</div>
				{sort && (
					<span className="text-[10px] font-mono text-slate-400">
						Sorted by {data.columns[sort.column]} · {sort.direction}
					</span>
				)}
				{(search || sort || inspectedRow !== null) && (
					<button
						type="button"
						onClick={clearFilters}
						className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white bg-[#12182b] border border-[#1e2842] transition-colors"
					>
						<RotateCcw className="w-3 h-3" />
						Reset view
					</button>
				)}
			</div>

			{view === "table" ? (
				<div className="overflow-x-auto rounded-xl border border-[#1e2842] bg-[#0c101e]">
					<table className="w-full text-left text-xs" aria-label="Zetaris query result">
						<thead className="bg-[#18203a] text-slate-300 font-mono uppercase text-[10px] tracking-wider border-b border-[#1e2842]">
							<tr>
								{data.columns.map((column, index) => {
									const active = sort?.column === index;
									return (
										<th
											key={`${column}-${index}`}
											className="py-2 px-3 font-semibold whitespace-nowrap"
											aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
										>
											<button
												type="button"
												onClick={() => toggleSort(index)}
												className="inline-flex items-center gap-1 hover:text-white transition-colors"
												title={`Sort by ${column}`}
											>
												{column}
												{active ? (
													sort.direction === "asc" ? (
														<ArrowUp className="w-3 h-3 text-teal-400" />
													) : (
														<ArrowDown className="w-3 h-3 text-teal-400" />
													)
												) : (
													<ArrowUpDown className="w-3 h-3 opacity-40" />
												)}
											</button>
										</th>
									);
								})}
								<th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Inspect</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[#1e2842]/50 font-mono text-slate-200">
							{visibleRows.length === 0 ? (
								<tr>
									<td colSpan={data.columns.length + 1} className="py-8 px-4 text-center text-slate-400">
										No rows match “{search}”.
									</td>
								</tr>
							) : (
								visibleRows.map(({ row, index }) => (
									<React.Fragment key={index}>
										<tr className="hover:bg-[#12182b]/60 transition-colors align-top">
											{data.columns.map((column, columnIndex) => {
												const text = formatCell(row[columnIndex]);
												const lower = text.toLowerCase();
												return (
													<td key={`${column}-${columnIndex}`} className="py-2 px-3 max-w-[260px]">
														{lower === "confidential" ? (
															<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/60 border border-rose-800 text-rose-300">
																confidential
															</span>
														) : lower === "internal" ? (
															<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950/60 border border-sky-800 text-sky-300">
																internal
															</span>
														) : text ? (
															<span className="break-words" title={text}>
																{text}
															</span>
														) : (
															<span className="text-slate-500">—</span>
														)}
													</td>
												);
											})}
											<td className="py-2 px-3 text-right">
												<button
													type="button"
													data-testid={`zetaris-inspect-${index}`}
													onClick={() => setInspectedRow(inspectedRow === index ? null : index)}
													className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
														inspectedRow === index
															? "bg-teal-950/70 border-teal-700 text-teal-300"
															: "bg-[#18203a] border-[#2c385c] text-slate-300 hover:text-white"
													}`}
													aria-expanded={inspectedRow === index}
													aria-label={`Inspect row ${index + 1}`}
												>
													{inspectedRow === index ? <X className="w-3 h-3" /> : <Search className="w-3 h-3" />}
													{inspectedRow === index ? "Close" : "Inspect"}
												</button>
											</td>
										</tr>
										{inspectedRow === index && inspectedObject && (
											<tr className="bg-[#101728]">
												<td colSpan={data.columns.length + 1} className="p-0">
													<div
														data-testid="zetaris-row-detail"
														className="m-2 rounded-xl border border-teal-700/40 bg-[#0a0e1a] p-3 space-y-2"
													>
														<div className="flex items-center justify-between gap-2">
															<span className="text-[10px] font-mono uppercase tracking-wider text-teal-300 font-bold">
																Row details · record {index + 1}
															</span>
															<button
																type="button"
																onClick={() => void copyText(`row-${index}`, JSON.stringify(inspectedObject, null, 2))}
																className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
															>
																{copied === `row-${index}` ? (
																	<Check className="w-3 h-3 text-emerald-400" />
																) : (
																	<Copy className="w-3 h-3" />
																)}
																Copy row JSON
															</button>
														</div>
														<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
															{data.columns.map((column, columnIndex) => (
																<div
																	key={`${column}-detail-${columnIndex}`}
																	className="rounded-lg border border-[#1e2842] bg-[#12182b] p-2"
																>
																	<div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
																		{column}
																	</div>
																	<div className="text-[11px] text-slate-200 break-words mt-0.5">
																		{formatCell(inspectedObject[column]) || "—"}
																	</div>
																</div>
															))}
														</div>
													</div>
												</td>
											</tr>
										)}
									</React.Fragment>
								))
							)}
						</tbody>
					</table>
				</div>
			) : (
				<div className="relative">
					<button
						type="button"
						onClick={() => void copyText("json", rawJson)}
						className="absolute right-2 top-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#18203a] hover:bg-[#202b4d] border border-[#2c385c] text-[10px] text-slate-200"
					>
						{copied === "json" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-teal-400" />}
						Copy JSON
					</button>
					<pre
						data-testid="zetaris-raw-json"
						className="max-h-[420px] overflow-auto rounded-xl border border-[#1e2842] bg-[#070b14] p-3 pt-11 text-[11px] leading-relaxed text-amber-200"
					>
						{rawJson}
					</pre>
				</div>
			)}

			<div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
				<span>
					Showing {visibleRows.length} of {data.rows.length} captured rows · {sourceLabel}
				</span>
				<span className="inline-flex items-center gap-1">
					<Download className="w-3 h-3" />
					Downloads include the full dataset, not just the filtered view
				</span>
			</div>
		</div>
	);
};
