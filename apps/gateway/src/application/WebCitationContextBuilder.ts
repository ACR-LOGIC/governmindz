import type { WebSearchCrewReport } from "@governmindz/core/agents/WebSearchCrew";

export function buildWebCitationContext(report: WebSearchCrewReport): string {
	if (report.findings.length === 0) return "";

	const allCitations = report.findings.flatMap((finding) => finding.citations);
	if (allCitations.length === 0) return "";

	return [
		"",
		"External Web Research & Verified Standards (Web Search Crew):",
		...allCitations.map(
			(citation, index: number) =>
				`[Web Citation ${index + 1}] "${citation.title}" (${citation.source}, URL: ${citation.url}) [Status: ${citation.status}]`,
		),
	].join("\n");
}
