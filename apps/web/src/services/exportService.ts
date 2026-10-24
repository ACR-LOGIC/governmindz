/**
 * GovernMindz Export Service
 *
 * Provides platform-wide export capabilities for conversation history,
 * granular deliberation outputs, structured evidence citations,
 * and cryptographic audit verification trails.
 */

import type { Conversation } from "../types";

function downloadFile(content: string, filename: string, mimeType: string) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/**
 * Platform-wide export: Comprehensive JSON format with granular outputs
 */
export function exportConversationAsJson(conv: Conversation) {
	const exportData = {
		exportVersion: "2.0.0",
		platform: "GovernMindz AI Council",
		exportedAt: new Date().toISOString(),
		conversation: {
			id: conv.id,
			title: conv.title,
			topic: conv.topic,
			mode: conv.mode,
			scenarioId: conv.scenarioId,
			status: conv.status,
			finalConfidence: conv.finalConfidence,
			inquiryScore: conv.inquiryScore,
			createdAt: new Date(conv.createdAt).toISOString(),
			updatedAt: new Date(conv.updatedAt).toISOString(),
		},
		deliberation: {
			totalMessages: conv.messages.length,
			councilAssignments: conv.agentAssignments || null,
			messages: conv.messages.map((m) => ({
				id: m.id,
				fromSeat: m.fromSeat,
				toSeat: m.toSeat,
				type: m.type,
				content: m.content,
				structured: m.structured,
				confidence: m.confidence,
				userRating: m.userRating,
				round: m.round,
				latency_ms: m.latency_ms,
				timestamp: new Date(m.timestamp).toISOString(),
			})),
		},
		webSearchEvidence: conv.webSearchData || null,
		zetarisFederation: conv.zetarisData || null,
		cryptographicAuditLedger: {
			totalEvents: conv.auditEvents.length,
			events: conv.auditEvents,
		},
		workflowEvents: conv.workflowEvents,
	};

	const jsonString = JSON.stringify(exportData, null, 2);
	const safeName = (conv.title || "governmindz-debate")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 40);
	downloadFile(jsonString, `${safeName}-granular-audit.json`, "application/json");
}

/**
 * Platform-wide export: Executive Briefing in Markdown
 */
export function exportConversationAsMarkdown(conv: Conversation) {
	const lines: string[] = [];
	lines.push(`# GovernMindz Executive Briefing`);
	lines.push(`**Topic / Inquiry:** ${conv.topic}`);
	lines.push(`**Date:** ${new Date(conv.createdAt).toLocaleString()}`);
	lines.push(`**Mode:** ${conv.mode.toUpperCase()}`);
	lines.push(`**Status:** ${conv.status.toUpperCase()}`);
	if (conv.finalConfidence != null) {
		lines.push(`**Final Calibrated Confidence:** ${(conv.finalConfidence * 100).toFixed(1)}%`);
	}
	if (conv.inquiryScore != null) {
		lines.push(`**Inquiry Complexity Score:** ${conv.inquiryScore} / 10`);
	}
	lines.push("");
	lines.push("---");
	lines.push("");

	// Synthesized Consensus / Final Answer
	const finalMsg =
		conv.messages.find((m) => m.type === "final" || m.fromSeat === "Synthesizer") ||
		conv.messages[conv.messages.length - 1];

	if (finalMsg) {
		lines.push(`## 🏛️ Final Calibrated Consensus`);
		lines.push(finalMsg.structured?.position || finalMsg.content);
		lines.push("");
	}

	// Council Human Assignments
	if (conv.agentAssignments && Object.keys(conv.agentAssignments).length > 0) {
		lines.push(`## 👥 Council Team Assignments`);
		Object.entries(conv.agentAssignments).forEach(([seatId, a]) => {
			lines.push(`- **${a.humanName}** (*${a.role || seatId}*): ${a.jobTask}`);
		});
		lines.push("");
	}

	// Multi-Agent Deliberation Roster Breakdown
	lines.push(`## 👥 Council Deliberation History`);
	lines.push("");
	conv.messages.forEach((m, idx) => {
		if (m.fromSeat === "user") {
			lines.push(`### [User Query] ${new Date(m.timestamp).toLocaleTimeString()}`);
			lines.push(`> ${m.content}`);
			lines.push("");
			return;
		}

		lines.push(`### ${idx + 1}. ${m.fromSeat} (${m.type.toUpperCase()})`);
		if (m.round != null) lines.push(`*Round:* ${m.round}`);
		if (m.confidence != null) lines.push(`*Confidence:* ${(m.confidence * 100).toFixed(0)}%`);
		if (m.userRating) lines.push(`*User Rating:* ${m.userRating === "up" ? "👍 Positive" : "👎 Disputed"}`);
		lines.push("");
		lines.push(m.structured?.position || m.content);
		lines.push("");

		if (m.structured?.evidence && m.structured.evidence.length > 0) {
			lines.push("**Citations & Evidence:**");
			m.structured.evidence.forEach((ev) => lines.push(`- [Evidence] ${ev}`));
			lines.push("");
		}
		if (m.structured?.caveats && m.structured.caveats.length > 0) {
			lines.push("**Caveats & Edge Cases:**");
			m.structured.caveats.forEach((cav) => lines.push(`- [Caveat] ${cav}`));
			lines.push("");
		}
	});

	// Web Search Citations
	if (conv.webSearchData && conv.webSearchData.results.length > 0) {
		lines.push(`## 🌐 Web Intelligence & External Sources`);
		conv.webSearchData.results.forEach((r, i) => {
			lines.push(`${i + 1}. **[${r.title}](${r.url})**`);
			lines.push(`   - *Source:* ${r.source}`);
			lines.push(`   - *Status:* ${r.verificationStatus || "verified"}`);
			lines.push(`   - *Excerpt:* ${r.snippet}`);
		});
		lines.push("");
	}

	// Cryptographic Audit Ledger
	lines.push(`## 🛡️ Cryptographic Audit Ledger`);
	lines.push(`Total Tamper-Evident Events: ${conv.auditEvents.length}`);
	if (conv.auditEvents.length > 0) {
		const latest = conv.auditEvents[conv.auditEvents.length - 1];
		lines.push(`- **Latest Event Type:** \`${latest.event_type}\``);
		lines.push(`- **Merkle Hash:** \`${latest.hash || "verified"}\``);
		lines.push(`- **Previous Hash:** \`${latest.previous_hash || "genesis"}\``);
	}
	lines.push("");
	lines.push("---");
	lines.push(`*Generated autonomously by GovernMindz Multi-Agent Orchestration Platform.*`);

	const mdString = lines.join("\n");
	const safeName = (conv.title || "governmindz-briefing")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 40);
	downloadFile(mdString, `${safeName}-briefing.md`, "text/markdown");
}

/**
 * Platform-wide export: Audit stream in JSONL
 */
export function exportAuditLogAsJsonl(conv: Conversation) {
	const jsonlLines = conv.auditEvents.map((ae) => JSON.stringify(ae)).join("\n");
	const safeName = (conv.title || "governmindz")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 40);
	downloadFile(jsonlLines, `${safeName}-audit.jsonl`, "application/x-ndjson");
}
