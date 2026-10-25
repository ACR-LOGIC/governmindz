import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
	classifyDeliverable,
	type DeliverableContract,
} from "../src/orchestration/DeliverableContract.js";
import { DataCrew, type DataCrewReport } from "../src/agents/DataCrew.js";
import { WebSearchCrew, type WebSearchCrewReport } from "../src/agents/WebSearchCrew.js";
import { RivalChallenger } from "../src/memory/RivalChallenger.js";
import { DesignAssistant } from "../src/documents/DesignAssistant.js";
import { SupervisorWorkflow } from "../src/orchestration/SupervisorWorkflow.js";

const TEST_ARTIFACTS_DIR = path.resolve(process.cwd(), "test-artifacts-supervisor");

test("DeliverableContract: classifies presentation request correctly and preserves original request", () => {
	const userPrompt = "Prepare a 5-slide PowerPoint presentation on Zetaris federated catalog access.";
	const contract = classifyDeliverable(userPrompt);

	assert.equal(contract.originalUserRequest, userPrompt);
	assert.equal(contract.primaryOutputType, "presentation");
	assert.equal(contract.fileFormat, "pptx");
	assert.equal(contract.requiresFile, true);
	assert.equal(contract.requiredDeliverables.length, 1);
	assert.equal(contract.requiredDeliverables[0].format, "pptx");
	assert.ok(contract.requiredDeliverables[0].filename.endsWith(".pptx"));
});

test("DeliverableContract: classifies report request correctly", () => {
	const userPrompt = "Generate an executive compliance report for Q3 cloud audit.";
	const contract = classifyDeliverable(userPrompt);

	assert.equal(contract.primaryOutputType, "report");
	assert.equal(contract.fileFormat, "pdf");
	assert.equal(contract.requiresFile, true);
	assert.ok(contract.requiredDeliverables[0].filename.endsWith(".pdf"));
});

test("DeliverableContract: classifies spreadsheet request correctly", () => {
	const userPrompt = "Reconcile supplier records and export as a spreadsheet.";
	const contract = classifyDeliverable(userPrompt);

	assert.equal(contract.primaryOutputType, "spreadsheet");
	assert.equal(contract.fileFormat, "csv");
	assert.equal(contract.requiresFile, true);
	assert.ok(contract.requiredDeliverables[0].filename.endsWith(".csv"));
});

test("DeliverableContract: classifies multiple requested deliverables", () => {
	const userPrompt = "Provide both a presentation and a report on clinic scheduling policies.";
	const contract = classifyDeliverable(userPrompt);

	assert.equal(contract.primaryOutputType, "multiple");
	assert.equal(contract.requiresFile, true);
	assert.equal(contract.requiredDeliverables.length, 2);
	const formats = contract.requiredDeliverables.map((r) => r.format);
	assert.ok(formats.includes("pptx"));
	assert.ok(formats.includes("pdf"));
});

test("DeliverableContract: classifies written answer only without forced file download", () => {
	const userPrompt = "What is the primary role of the Fact Checker? Written answer only, please.";
	const contract = classifyDeliverable(userPrompt);

	assert.equal(contract.primaryOutputType, "written_answer");
	assert.equal(contract.requiresFile, false);
	assert.equal(contract.requiredDeliverables.length, 0);
});

test("DataCrew & WebSearchCrew: execute concurrently and preserve findings", async () => {
	const events: Record<string, unknown>[] = [];
	const sink = (ev: Record<string, unknown>) => events.push(ev);

	const dataCrew = new DataCrew({
		runId: "test_concurrent_run",
		topic: "Assess database catalog security",
		mode: "sample",
		eventSink: sink,
	});

	const webCrew = new WebSearchCrew({
		runId: "test_concurrent_run",
		topic: "Assess database catalog security",
		eventSink: sink,
	});

	// Concurrently execute both crews
	const [dataReport, webReport] = await Promise.all([
		dataCrew.run(),
		webCrew.run(),
	]);

	// Verify Data Crew produced 4 independent agent findings
	assert.equal(dataReport.findings.length, 4);
	const dataAgentIds = dataReport.findings.map((f) => f.agentId);
	assert.ok(dataAgentIds.includes("DataCrew-Catalog"));
	assert.ok(dataAgentIds.includes("DataCrew-Query"));
	assert.ok(dataAgentIds.includes("DataCrew-Anomaly"));
	assert.ok(dataAgentIds.includes("DataCrew-Provenance"));

	// Verify Web Search Crew produced 4 independent agent findings
	assert.equal(webReport.findings.length, 4);
	const webAgentIds = webReport.findings.map((f) => f.agentId);
	assert.ok(webAgentIds.includes("WebCrew-Standards"));
	assert.ok(webAgentIds.includes("WebCrew-Freshness"));
	assert.ok(webAgentIds.includes("WebCrew-Scholarly"));
	assert.ok(webAgentIds.includes("WebCrew-Counter"));

	// Verify events were preserved during concurrent execution
	const findingEvents = events.filter((e) => e.type === "research_finding");
	assert.equal(findingEvents.length, 8); // 4 data + 4 web
});

test("RivalChallenger: challenges Data Crew and Web Search Crew independently", async () => {
	const challengerEvents: Record<string, unknown>[] = [];
	const sink = (ev: Record<string, unknown>) => challengerEvents.push(ev);

	const dummyLlm = {
		complete: async () => ({
			content: JSON.stringify({
				challenge: "none",
				verifiedClaims: ["Verified"],
				unsupportedClaims: [],
				correctedPosition: "",
				confidence: 0.9,
			}),
			confidence: 0.9,
		}),
	};

	const rival = new RivalChallenger(dummyLlm as any);

	const mockDataReport: DataCrewReport = {
		runId: "mock_run",
		mode: "sample",
		catalogDatabases: ["SEC_DATA"],
		queriesExecuted: [],
		anomaliesDetected: ["Timestamp anomaly"],
		provenanceSummary: "Sample catalog provenance",
		overallConfidence: 0.88,
		isSyntheticFallback: true,
		summary: "Mock data crew summary",
		findings: [
			{
				agentId: "DataCrew-Anomaly",
				role: "Pattern & Anomaly Detector",
				title: "Anomaly detection",
				claim: "Timestamp drift of 48 hours detected across logistics records.",
				evidence: ["Logistics table line 42"],
				limitations: ["Sample catalog fallback schema"],
				uncertainty: "Missing batch receipts",
				confidence: 0.85,
				provenanceHash: "hash_anomaly_1",
				timestamp: Date.now(),
			},
		],
	};

	const mockWebReport: WebSearchCrewReport = {
		runId: "mock_run",
		topic: "Data reconciliation",
		totalCitationsFound: 2,
		contradictionsFound: ["Disputed latency claims"],
		unresolvedGaps: ["Peak load failover"],
		overallConfidence: 0.9,
		summary: "Mock web crew summary",
		findings: [
			{
				agentId: "WebCrew-Counter",
				role: "Counter-Evidence & Dispute Investigator",
				title: "Counter-evidence review",
				claim: "Alternative centralized approaches dispute federated overhead.",
				citations: [],
				contradictoryEvidence: ["Centralized ETL proponents argue lower query latency"],
				gapsIdentified: ["Peak load failover limits"],
				confidence: 0.86,
				timestamp: Date.now(),
			},
		],
	};

	const result = await rival.challengeCrewsIndependently({
		dataCrewReport: mockDataReport,
		webCrewReport: mockWebReport,
		eventSink: sink,
	});

	// Verify Data Crew was challenged separately
	assert.ok(result.dataCrewChallenges.length > 0);
	assert.equal(result.dataCrewChallenges[0].targetAgent, "DataCrew-Anomaly");
	assert.ok(result.dataCrewResponse.defendedClaims.length > 0);

	// Verify Web Crew was challenged separately
	assert.ok(result.webCrewChallenges.length > 0);
	assert.equal(result.webCrewChallenges[0].targetAgent, "WebCrew-Counter");
	assert.ok(result.webCrewResponse.defendedClaims.length > 0);

	// Verify events were emitted separately for each crew
	const dataChallenges = challengerEvents.filter(
		(e) => e.type === "hater_crew_challenge" && e.targetCrew === "DataCrew",
	);
	const webChallenges = challengerEvents.filter(
		(e) => e.type === "hater_crew_challenge" && e.targetCrew === "WebSearchCrew",
	);

	assert.ok(dataChallenges.length > 0);
	assert.ok(webChallenges.length > 0);
});

test("DesignAssistant: generates actual valid PPTX presentation file", async () => {
	const assistant = new DesignAssistant(TEST_ARTIFACTS_DIR);
	const contract = classifyDeliverable("Create a PowerPoint presentation on AI governance.");

	const { primaryArtifact } = await assistant.generateDeliverables({
		contract,
		topic: "AI Governance Strategy",
		synthesizedContent: {
			title: "AI Governance Presentation",
			summary: "Executive slides on multi-agent governance and auditability.",
			sections: [
				{ heading: "Executive Summary", body: "Council achieved calibrated consensus." },
				{ heading: "Key Evidence", body: "Zetaris Lightning fabric verified across 7 catalogs." },
			],
			evidence: ["Evidence citation 1", "Evidence citation 2"],
			caveats: ["Statistical confidence score."],
			confidence: 0.94,
			consensusMethod: "synthesizer",
		},
		artifactsDir: TEST_ARTIFACTS_DIR,
	});

	assert.equal(primaryArtifact.format, "pptx");
	assert.equal(primaryArtifact.status, "validated");
	assert.ok(fs.existsSync(primaryArtifact.filePath));
	assert.ok(primaryArtifact.sizeBytes > 500);

	// Read and verify zip signature (0x04034b50)
	const rawBuf = fs.readFileSync(primaryArtifact.filePath);
	const buf = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf as any);
	assert.equal(buf.readUInt32LE(0), 0x04034b50);
});

test("DesignAssistant: generates actual valid PDF report file", async () => {
	const assistant = new DesignAssistant(TEST_ARTIFACTS_DIR);
	const contract = classifyDeliverable("Write an executive compliance report.");

	const { primaryArtifact } = await assistant.generateDeliverables({
		contract,
		topic: "Compliance Review",
		synthesizedContent: {
			title: "Compliance Executive Report",
			summary: "Complete governance and regulatory compliance evaluation.",
			sections: [
				{ heading: "Regulatory Findings", body: "ISO 42001 and NIST SP 800-92 verified." },
			],
			evidence: ["NIST SP 800-92 line 12"],
			caveats: ["Production scope bounds apply"],
			confidence: 0.92,
			consensusMethod: "synthesizer",
		},
		artifactsDir: TEST_ARTIFACTS_DIR,
	});

	assert.equal(primaryArtifact.format, "pdf");
	assert.equal(primaryArtifact.status, "validated");
	assert.ok(fs.existsSync(primaryArtifact.filePath));
	assert.ok(primaryArtifact.sizeBytes > 100);

	// Read and verify PDF header (%PDF-1.4)
	const content = fs.readFileSync(primaryArtifact.filePath, "utf8");
	assert.ok(content.startsWith("%PDF-1.4"));
	assert.ok(content.includes("%%EOF"));
});

test("DesignAssistant: generates actual CSV spreadsheet", async () => {
	const assistant = new DesignAssistant(TEST_ARTIFACTS_DIR);
	const contract = classifyDeliverable("Export data as a spreadsheet.");

	const { primaryArtifact } = await assistant.generateDeliverables({
		contract,
		topic: "Spreadsheet Reconciler",
		synthesizedContent: {
			title: "Supplier Reconciled Records",
			summary: "Cross-silo inventory and delivery date dataset.",
			sections: [
				{ heading: "Batch 101", body: "Discrepancy resolved via ERP confirmation." },
			],
			evidence: ["Postgres ERP Export line 14"],
			caveats: [],
			confidence: 0.95,
			consensusMethod: "synthesizer",
		},
		artifactsDir: TEST_ARTIFACTS_DIR,
	});

	assert.equal(primaryArtifact.format, "csv");
	assert.equal(primaryArtifact.status, "validated");
	assert.ok(fs.existsSync(primaryArtifact.filePath));

	const csvText = fs.readFileSync(primaryArtifact.filePath, "utf8");
	assert.ok(csvText.includes("GovernMindz Deliberative Multi-Agent Dataset"));
	assert.ok(csvText.includes("Section_Index,Section_Heading"));
});

test("DesignAssistant: generates SVG vector chart", async () => {
	const assistant = new DesignAssistant(TEST_ARTIFACTS_DIR);
	const contract = classifyDeliverable("Generate a visual chart showing confidence metrics.");

	const { primaryArtifact } = await assistant.generateDeliverables({
		contract,
		topic: "Confidence Metrics",
		synthesizedContent: {
			title: "Confidence Metrics Chart",
			summary: "Visual trajectory of agent agreement.",
			sections: [],
			evidence: [],
			caveats: [],
			confidence: 0.96,
			consensusMethod: "synthesizer",
		},
		artifactsDir: TEST_ARTIFACTS_DIR,
	});

	assert.equal(primaryArtifact.format, "svg");
	assert.equal(primaryArtifact.status, "validated");
	assert.ok(fs.existsSync(primaryArtifact.filePath));

	const svgText = fs.readFileSync(primaryArtifact.filePath, "utf8");
	assert.ok(svgText.includes("<svg"));
	assert.ok(svgText.includes("</svg>"));
});

test("DesignAssistant: evidence exports are supplementary and do not replace primary deliverable", async () => {
	const assistant = new DesignAssistant(TEST_ARTIFACTS_DIR);
	const contract = classifyDeliverable("Create a PowerPoint presentation on clinical triage.");

	const { primaryArtifact, evidenceExport } = await assistant.generateDeliverables({
		contract,
		topic: "Clinical Triage",
		synthesizedContent: {
			title: "Clinical Triage Presentation",
			summary: "ICU transfer windows and bed allocation.",
			sections: [{ heading: "Overview", body: "Acuity levels assessed." }],
			evidence: ["REQ-704 acuity score 4"],
			caveats: ["15-minute transfer window boundary"],
			confidence: 0.89,
			consensusMethod: "synthesizer",
		},
		artifactsDir: TEST_ARTIFACTS_DIR,
	});

	// Primary deliverable MUST match the user request (presentation / pptx)
	assert.equal(primaryArtifact.format, "pptx");
	assert.notEqual(primaryArtifact.format, "json");

	// Evidence export is separate JSON file
	assert.equal(evidenceExport.format, "json");
	assert.ok(evidenceExport.filename.endsWith("-evidence.json"));
	assert.notEqual(primaryArtifact.filename, evidenceExport.filename);
});

test("SupervisorWorkflow: end-to-end execution, delivery validation, and real link release", async () => {
	const workflowEvents: Record<string, unknown>[] = [];
	const sink = (ev: Record<string, unknown>) => workflowEvents.push(ev);

	const supervisor = new SupervisorWorkflow({
		mode: "sample",
		artifactsDir: TEST_ARTIFACTS_DIR,
		eventSink: sink,
	});

	const result = await supervisor.execute("Prepare a 5-slide presentation on Zetaris federated catalog access.");

	// 1. Deliverable contract established and preserved
	assert.equal(result.contract.primaryOutputType, "presentation");
	assert.equal(result.contract.fileFormat, "pptx");

	// 2. Data and Web crews executed
	assert.equal(result.dataCrewReport.findings.length, 4);
	assert.equal(result.webCrewReport.findings.length, 4);

	// 3. Artifact generated and physically validated
	assert.equal(result.primaryArtifact.format, "pptx");
	assert.equal(result.primaryArtifact.status, "validated");
	assert.ok(fs.existsSync(result.primaryArtifact.filePath));

	// 4. Supervisor approved delivery
	assert.equal(result.supervisorDecision, "APPROVED");
	assert.equal(result.status, "completed");

	// 5. Final response contains exact markdown link to the validated artifact
	assert.ok(result.supervisorResponse.includes(`[View or download the presentation](${result.primaryArtifact.viewUrl})`));

	// 6. Final response links to supplementary evidence separately
	assert.ok(result.supervisorResponse.includes(`[Supporting evidence export](${result.evidenceExport.downloadUrl})`));

	// 7. Verify events progression
	const steps = workflowEvents
		.filter((e) => e.type === "workflow_step")
		.map((e) => e.step);

	assert.ok(steps.includes("1_RECEIVE_INQUIRY"));
	assert.ok(steps.includes("2_CLASSIFY_TASK"));
	assert.ok(steps.includes("3_LAUNCH_PARALLEL_RESEARCH"));
	assert.ok(steps.includes("5_HATER_INDEPENDENT_CHALLENGE"));
	assert.ok(steps.includes("8_FACT_CHECK_EVALUATION"));
	assert.ok(steps.includes("9_THINKER_COMPLETENESS_CHECK"));
	assert.ok(steps.includes("11_DESIGN_ASSISTANT_GENERATION"));
	assert.ok(steps.includes("12_VALIDATE_DELIVERY"));
	assert.ok(steps.includes("13_SUPERVISOR_RELEASE_REVIEW"));

	// Clean up test directory
	try {
		fs.rmSync(TEST_ARTIFACTS_DIR, { recursive: true, force: true });
	} catch {}
});

test("SupervisorWorkflow: rejects delivery if artifact file does not exist", async () => {
	const assistant = new DesignAssistant(TEST_ARTIFACTS_DIR);
	const fakeArtifact = {
		id: "fake_id",
		contractId: "contract_fake",
		type: "presentation" as const,
		format: "pptx" as const,
		title: "Missing Presentation",
		filename: "non_existent_file.pptx",
		filePath: path.join(TEST_ARTIFACTS_DIR, "non_existent_file.pptx"),
		mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		sizeBytes: 0,
		viewUrl: "/api/artifacts/non_existent_file.pptx",
		downloadUrl: "/api/artifacts/non_existent_file.pptx?download=true",
		summary: "Fake artifact",
		status: "validated" as const,
		validationDetails: {
			exists: true,
			readable: true,
			sizeBytes: 100,
			formatMatches: true,
			hasExpectedContent: true,
		},
		createdAt: Date.now(),
	};

	const validated = assistant.validateArtifact(fakeArtifact);
	assert.equal(validated.status, "rejected");
	assert.equal(validated.validationDetails.exists, false);
});
