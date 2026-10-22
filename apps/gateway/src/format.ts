
import type { ZetarisQueryResult } from "@governmindz/core/integrations/zetarisClient";

function formatCell(value: unknown, maxLength = 80): string {
	const text =
		typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
	const singleLine = text.replace(/\s+/g, " ").trim();
	return singleLine.length > maxLength
		? `${singleLine.slice(0, maxLength - 3)}...`
		: singleLine;
}

export function formatZetarisResult(
	result: ZetarisQueryResult,
	maxRows = 10,
): string {
	if (result.rows.length === 0) return "(no rows)";

	const lines = [result.columns.join(" | ")];
	for (const row of result.rows.slice(0, maxRows)) {
		lines.push(row.map((value) => formatCell(value)).join(" | "));
	}
	if (result.rows.length > maxRows) {
		lines.push(`... ${result.rows.length - maxRows} more rows`);
	}
	return lines.join("\n");
}
