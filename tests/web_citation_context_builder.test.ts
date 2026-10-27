import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebSearchCrewReport } from "@governmindz/core/agents/WebSearchCrew";
import { buildWebCitationContext } from "../apps/gateway/src/application/WebCitationContextBuilder.js";

function reportWithFindings(findings: WebSearchCrewReport["findings"]): WebSearchCrewReport {
	return {
		runId: "web-run",
		topic: "governance",
		findings,
		totalCitationsFound: findings.reduce((count, finding) => count + finding.citations.length, 0),
		contradictionsFound: [],
		unresolvedGaps: [],
		overallConfidence: 0.9,
		summary: "web findings",
	};
}

test("buildWebCitationContext returns empty context without findings", () => {
	assert.equal(buildWebCitationContext(reportWithFindings([])), "");
});

test("buildWebCitationContext returns empty context without citations", () => {
	assert.equal(
		buildWebCitationContext(
			reportWithFindings([
				{
					agentId: "WebSearchAgent",
					claim: "No citations",
					citations: [],
					evidence: [],
					limitations: [],
				},
			]),
		),
		"",
	);
});

test("buildWebCitationContext preserves citation order and formatting", () => {
	const context = buildWebCitationContext(
		reportWithFindings([
			{
				agentId: "WebSearchAgent",
				claim: "Standards verified",
				citations: [
					{ title: "First source", source: "Regulator", url: "https://example.test/one", status: "verified" },
					{ title: "Second source", source: "Standards body", url: "https://example.test/two", status: "reviewed" },
				],
				evidence: [],
				limitations: [],
			},
		]),
	);

	assert.equal(
		context,
		'\nExternal Web Research & Verified Standards (Web Search Crew):\n[Web Citation 1] "First source" (Regulator, URL: https://example.test/one) [Status: verified]\n[Web Citation 2] "Second source" (Standards body, URL: https://example.test/two) [Status: reviewed]',
	);
});
