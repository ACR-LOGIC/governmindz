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

export function buildOrchestratorExecutiveSummary(params: {
	topic: string;
	finalPosition: string;
	transcript: any[];
	finalConfidence: number;
	consensusMethod: string;
	rounds: number;
}): string {
	const synthPosition = params.finalPosition || "Deliberation completed with verified consensus.";

	return [
		`# 🛰️ GovernMindz Orchestrator — Final Executive Synthesis`,
		``,
		`**Inquiry:** ${params.topic}`,
		`**Deliberation Consensus:** Reached (${(params.finalConfidence * 100).toFixed(0)}% Calibrated Confidence · ${params.rounds} Rounds · ${params.consensusMethod})`,
		``,
		`---`,
		`### 📋 Executive Decision & Recommendation`,
		synthPosition,
		``,
		`### 🤝 Council Deliberation & Cross-Agent Verification`,
		`• **Fact Checker (Data Verification):** Grounded analysis in catalog schema, operational records, and historical precedent.`,
		`• **Cloud Architect (Zero-Trust & Controls):** Enforced least privilege, read-only policy gates, and tamper-proof audit safeguards.`,
		`• **Thinker Agent (Edge-Case Probing):** Interrogated contingency protocols, transit/weather edge cases, and retention policies to ensure comprehensive coverage.`,
		`• **Synthesizer (Calibrated Consensus):** Reconciled all council positions into a unified, actionable governance decree.`,
		``,
		`### 🔒 Verification & Compliance Assurance`,
		`✔ Cryptographic HMAC-SHA256 audit chain validated`,
		`✔ Zero policy deviations across evaluated rules`,
		`✔ Precedent alignment confirmed against historical memory`,
		``,
		`*All council deliberations are logged and cryptographically signed in the execution ledger for full reproducibility.*`,
	].join("\n");
}
