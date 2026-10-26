import { randomUUID } from "node:crypto";

export type DeliverableType =
	| "presentation"
	| "report"
	| "spreadsheet"
	| "chart"
	| "written_answer"
	| "multiple";

export type DeliverableFormat =
	| "pptx"
	| "pdf"
	| "docx"
	| "csv"
	| "xlsx"
	| "svg"
	| "png"
	| "text"
	| "json";

export interface DeliverableRequirement {
	id: string;
	type: DeliverableType;
	format: DeliverableFormat;
	title: string;
	filename: string;
	description: string;
	requiredSections: string[];
}

export interface DeliverableContract {
	contractId: string;
	originalUserRequest: string;
	primaryOutputType: DeliverableType;
	requiredDeliverables: DeliverableRequirement[];
	requiredSections: string[];
	fileFormat: DeliverableFormat;
	requiredVisuals: string[];
	audienceToneStyle: string;
	requiresFile: boolean;
	supplementaryEvidenceExport: boolean;
	createdAt: number;
}

export interface ArtifactDescriptor {
	id: string;
	contractId: string;
	type: DeliverableType;
	format: DeliverableFormat;
	title: string;
	filename: string;
	filePath: string;
	mimeType: string;
	sizeBytes: number;
	viewUrl: string;
	downloadUrl: string;
	summary: string;
	status: "validated" | "failed" | "rejected";
	validationDetails: {
		exists: boolean;
		readable: boolean;
		sizeBytes: number;
		formatMatches: boolean;
		hasExpectedContent: boolean;
		error?: string;
	};
	createdAt: number;
}

export function classifyDeliverable(userRequest: string): DeliverableContract {
	const req = (userRequest || "").trim();
	const lower = req.toLowerCase();
	const contractId = `contract_${randomUUID()}`;
	const timestamp = Date.now();

	const mentionsPresentation =
		/\b(presentation|slides|deck|slide deck|pitch deck|powerpoint|pptx)\b/i.test(lower);
	const mentionsReport =
		/\b(report|briefing|dossier|whitepaper|formal report|executive report|pdf report|docx)\b/i.test(lower);
	const mentionsSpreadsheet =
		/\b(spreadsheet|csv|excel|sheets|sheet|tabular data|table export|xlsx)\b/i.test(lower);
	const mentionsChart =
		/\b(chart|graph|plot|visual diagram|pie chart|bar chart|line chart|visualization|visualize)\b/i.test(lower) &&
		!mentionsPresentation &&
		!mentionsReport;
	const mentionsWrittenOnly =
		/\b(written answer only|in text only|direct answer|short answer|brief answer|no download|just tell me|summarize in chat)\b/i.test(lower);

	const detectedTypes: DeliverableType[] = [];
	if (mentionsPresentation) detectedTypes.push("presentation");
	if (mentionsReport) detectedTypes.push("report");
	if (mentionsSpreadsheet) detectedTypes.push("spreadsheet");
	if (mentionsChart) detectedTypes.push("chart");

	// Clean safe slug from request topic without polynomial regex backtracking
	const slugChars: string[] = [];
	let prevDash = true;
	for (let i = 0; i < lower.length && slugChars.length < 32; i++) {
		const c = lower.charCodeAt(i);
		if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
			slugChars.push(lower[i]);
			prevDash = false;
		} else if (!prevDash) {
			slugChars.push("-");
			prevDash = true;
		}
	}
	let slug = slugChars.join("");
	while (slug.endsWith("-")) {
		slug = slug.slice(0, -1);
	}
	slug = slug || "governmindz-deliverable";

	// Handle Multiple requested deliverables
	if (detectedTypes.length > 1) {
		const requirements: DeliverableRequirement[] = detectedTypes.map((t, idx) => {
			const fmt: DeliverableFormat =
				t === "presentation"
					? "pptx"
					: t === "report"
						? "pdf"
						: t === "spreadsheet"
							? "csv"
							: "svg";
			return {
				id: `req_${idx + 1}_${t}`,
				type: t,
				format: fmt,
				title: `${t.toUpperCase()} Deliverable`,
				filename: `${slug}-${t}.${fmt}`,
				description: `User-requested ${t} deliverable`,
				requiredSections: [
					"Executive Overview",
					"Key Findings & Provenance",
					"Comparative Metrics",
					"Actionable Governance Recommendations",
				],
			};
		});

		return {
			contractId,
			originalUserRequest: req,
			primaryOutputType: "multiple",
			requiredDeliverables: requirements,
			requiredSections: [
				"Executive Overview",
				"Key Findings & Provenance",
				"Comparative Metrics",
				"Actionable Governance Recommendations",
			],
			fileFormat: "json",
			requiredVisuals: ["charts", "comparisons", "provenance tables"],
			audienceToneStyle: "Executive, authoritative, evidence-backed",
			requiresFile: true,
			supplementaryEvidenceExport: true,
			createdAt: timestamp,
		};
	}

	// Presentation
	if (mentionsPresentation) {
		const reqItem: DeliverableRequirement = {
			id: `req_pptx`,
			type: "presentation",
			format: "pptx",
			title: "Executive Presentation Deck",
			filename: `${slug}-presentation.pptx`,
			description: "Structured presentation slides covering findings, evidence, and recommendations",
			requiredSections: [
				"Title & Executive Summary",
				"Problem Statement & Inquiry Scope",
				"Data & Empirical Findings",
				"Cross-Silo Reconciliation & Analysis",
				"Governance Decisions & Action Plan",
			],
		};

		return {
			contractId,
			originalUserRequest: req,
			primaryOutputType: "presentation",
			requiredDeliverables: [reqItem],
			requiredSections: reqItem.requiredSections,
			fileFormat: "pptx",
			requiredVisuals: ["slide visual layout", "metrics cards", "comparison callouts"],
			audienceToneStyle: "Board-level executive briefing, concise, visual",
			requiresFile: true,
			supplementaryEvidenceExport: true,
			createdAt: timestamp,
		};
	}

	// Report
	if (mentionsReport) {
		const reqItem: DeliverableRequirement = {
			id: `req_pdf`,
			type: "report",
			format: "pdf",
			title: "Comprehensive Governance Report",
			filename: `${slug}-report.pdf`,
			description: "Formal report document with executive summary, empirical analysis, and citations",
			requiredSections: [
				"Executive Summary",
				"Inquiry Background & Regulatory Context",
				"Empirical Findings & Data Lineage",
				"Adversarial Review & Dispute Analysis",
				"Strategic Recommendations & Next Steps",
				"Evidence Citations & Audit Provenance",
			],
		};

		return {
			contractId,
			originalUserRequest: req,
			primaryOutputType: "report",
			requiredDeliverables: [reqItem],
			requiredSections: reqItem.requiredSections,
			fileFormat: "pdf",
			requiredVisuals: ["evidence table", "summary callout", "audit certificate stamp"],
			audienceToneStyle: "Formal, thorough, audit-ready",
			requiresFile: true,
			supplementaryEvidenceExport: true,
			createdAt: timestamp,
		};
	}

	// Spreadsheet
	if (mentionsSpreadsheet) {
		const reqItem: DeliverableRequirement = {
			id: `req_csv`,
			type: "spreadsheet",
			format: "csv",
			title: "Reconciled Governance Dataset",
			filename: `${slug}-data.csv`,
			description: "Tabular dataset with reconciled attributes, confidence scores, and source evidence",
			requiredSections: ["Records", "Provenance", "Metrics", "Audit Hash"],
		};

		return {
			contractId,
			originalUserRequest: req,
			primaryOutputType: "spreadsheet",
			requiredDeliverables: [reqItem],
			requiredSections: reqItem.requiredSections,
			fileFormat: "csv",
			requiredVisuals: ["tabular data", "summary row"],
			audienceToneStyle: "Structured, tabular, quantitative",
			requiresFile: true,
			supplementaryEvidenceExport: true,
			createdAt: timestamp,
		};
	}

	// Chart / Visualization
	if (mentionsChart) {
		const reqItem: DeliverableRequirement = {
			id: `req_svg`,
			type: "chart",
			format: "svg",
			title: "Analytical Governance Chart",
			filename: `${slug}-chart.svg`,
			description: "High-resolution vector visualization illustrating comparative metrics and confidence",
			requiredSections: ["Visualization", "Legend", "Source Notes"],
		};

		return {
			contractId,
			originalUserRequest: req,
			primaryOutputType: "chart",
			requiredDeliverables: [reqItem],
			requiredSections: reqItem.requiredSections,
			fileFormat: "svg",
			requiredVisuals: ["vector bar/pie chart", "legend", "axis labels"],
			audienceToneStyle: "Visual, quantitative, clear",
			requiresFile: true,
			supplementaryEvidenceExport: true,
			createdAt: timestamp,
		};
	}

	// Written Answer Only
	if (mentionsWrittenOnly) {
		return {
			contractId,
			originalUserRequest: req,
			primaryOutputType: "written_answer",
			requiredDeliverables: [],
			requiredSections: ["Direct Answer", "Key Evidence", "Caveats & Confidence"],
			fileFormat: "text",
			requiredVisuals: [],
			audienceToneStyle: "Conversational, direct, rigorous",
			requiresFile: false,
			supplementaryEvidenceExport: true,
			createdAt: timestamp,
		};
	}

	// Default: Standard Governance Report (with downloadable document artifact)
	const defaultReq: DeliverableRequirement = {
		id: `req_default_pdf`,
		type: "report",
		format: "pdf",
		title: "Executive Deliberation Briefing",
		filename: `${slug}-briefing.pdf`,
		description: "Standard executive briefing document with verified evidence and recommendations",
		requiredSections: [
			"Executive Summary",
			"Core Findings & Catalog Evidence",
			"Risk & Policy Considerations",
			"Final Consensus Recommendations",
		],
	};

	return {
		contractId,
		originalUserRequest: req,
		primaryOutputType: "report",
		requiredDeliverables: [defaultReq],
		requiredSections: defaultReq.requiredSections,
		fileFormat: "pdf",
		requiredVisuals: ["executive summary table", "confidence badge"],
		audienceToneStyle: "Executive, clear, evidence-grounded",
		requiresFile: true,
		supplementaryEvidenceExport: true,
		createdAt: timestamp,
	};
}
