export interface TourHighlightItem {
	label: string;
	detail: string;
}

export interface TourStep {
	id: string;
	title: string;
	description: string;
	selector?: string;
	badge: string;
	highlights: TourHighlightItem[];
}

export const TOUR_STEPS: TourStep[] = [
	{
		id: "chat",
		title: "AI Multi-Agent Group Chat & Live Demo Launch",
		description:
			"Welcome to GovernMindz Mission Control! This interactive tour starts a live-paced Multi-Agent Demo Deliberation so you can watch the council work in real time while exploring every part of the platform.",
		selector: "#tour-chat",
		badge: "Step 1 of 10",
		highlights: [
			{
				label: "Auto-Launched Demo Run",
				detail:
					"Track 01 (Solving Fragmented Intelligence) launches automatically so live research crews, council messages, and outputs populate on screen.",
			},
			{
				label: "Council Complexity & Deliverable Contract",
				detail:
					"Top status banners display the Inquiry Complexity score (Level 1–10) and track the Supervisor-validated primary deliverable.",
			},
			{
				label: "Stream Pacing, Filters & Sequential Audio",
				detail:
					"Use Pause / Resume / Reset to control demo pacing, filter between All Deliberation vs. Consensus Only, or click Listen to Deliberation.",
			},
		],
	},
	{
		id: "chatboxes",
		title: "Inside Every Chatbox — Crews, Barrier & Council Cards",
		description:
			"Every chatbox in the conversation stream exposes transparent governance telemetry, calibrated confidence, and interactive controls:",
		selector: "#tour-chat",
		badge: "Step 2 of 10",
		highlights: [
			{
				label: "Parallel Research Crew Stack & Barrier Gate",
				detail:
					"Data Research Crew (Zetaris SQL) and Web Search Crew run concurrently with live status pips (talking, wrapping_up, ready) and a hard Barrier Synchronization Gate (2/2 Ready).",
			},
			{
				label: "Agent Persona, Seat Role & Round Badge",
				detail:
					"Each message shows the agent's rotating human name, domain seat (FactChecker, CloudArchitect, RivalChallenger, Thinker, Synthesizer), and round number.",
			},
			{
				label: "Self-Confidence Bar & Expert Agreement %",
				detail:
					"Dual metrics show the agent's internal Self-Confidence (0–100%) alongside Bayesian credibility-weighted Expert Agreement (%).",
			},
			{
				label: "Expandable Details, Voice (🔊), Copy & Ratings (👍/👎)",
				detail:
					"Click Details ⌵ to inspect structured reasoning, /evidence/<id> citations, and caveats; click 🔊 to read aloud, or rate 👍/👎 to update SQLite Bayesian credibility weights.",
			},
		],
	},
	{
		id: "options",
		title: "Available Options — Presets, Templates & Debate History",
		description:
			"The Left Navigation Sidebar controls your execution preset, governance benchmark templates, and mode-isolated session history:",
		selector: "#tour-sidebar-options",
		badge: "Step 3 of 10",
		highlights: [
			{
				label: "+ New AI Debate & Instant Search",
				detail:
					"Start a clean council session at any time or filter historical deliberations by title and inquiry topic.",
			},
			{
				label: "Execution Preset (Demo Mode vs. Live Mode)",
				detail:
					"Toggle between deterministic keyless sample runs (DEMO) and fail-closed live enterprise execution (LIVE).",
			},
			{
				label: "Governance Template Selector",
				detail:
					"Switch between the 3 benchmark scenarios: 1. Solving Fragmented Intelligence, 2. The Agent That Can Explain Why, and 3. Reasoning Architecture.",
			},
			{
				label: "Conversation & Debate History",
				detail:
					"Sessions are grouped by Today / Yesterday / Older with inline rename (✎) and delete (🗑) actions.",
			},
		],
	},
	{
		id: "composer",
		title: "Composer Controls, Ways to Upload & Model Routing",
		description:
			"The Message Composer at the bottom provides 3 selectable Hackathon Track cards, multi-format document/image uploads, research tool toggles, and live Nightshift model routing:",
		selector: "#tour-composer",
		badge: "Step 4 of 10",
		highlights: [
			{
				label: "3 Hackathon Track Cards & Demo Options Toggle",
				detail:
					"Select Track 01, Track 02, or Track 03 to load its governance prompt, or collapse/re-open the cards via Demo Options.",
			},
			{
				label: "Ways to Upload (+ Button — Files & Images)",
				detail:
					"Click + (now open below) to upload Documents (.PDF, .DOCX, .CSV, .XLSX, .JSON, .SQL, .MD, .TXT) or Images. Uploaded files are parsed with coordinate-level (page/row/col) citations.",
			},
			{
				label: "Search Modalities (Search ⌵) & Computer Tool",
				detail:
					"Multi-select Web Search, Zetaris AI (Core SQL), Deep Research, Model Council (Max), and Learn Step by Step, plus the Computer SQL execution toggle.",
			},
			{
				label: "Model Selector (Meterless Auto ⌵) & Voice Toggle (🔊)",
				detail:
					"Automatically discovers local and cloud models (NVIDIA Nemotron, OpenAI, Anthropic, Gemini) from Meterless Nightshift.",
			},
		],
	},
	{
		id: "roster",
		title: "Active Agent Council & Live Reasoning",
		description:
			"Observe specialized agents with rotating human names and domain tasks in the Right Sidebar. Click any agent avatar to inspect their live reasoning scratchpad and evidence matrix:",
		selector: "#tour-roster",
		badge: "Step 5 of 10",
		highlights: [
			{
				label: "Dynamic 16-Seat Agent Roster",
				detail:
					"Agents join the roster dynamically as assigned, displaying live workflow phases (Researching, Analyzing, Responding, Adversarial Challenge, Synthesizing).",
			},
			{
				label: "Live Reasoning & Hypothesis Scratchpad Drawer",
				detail:
					"Click any agent in the roster (or use the button below) to open their slide-over reasoning scratchpad, mandate, and message history.",
			},
			{
				label: "Confidence Trajectory, Ledger & Sponsor Telemetry",
				detail:
					"Tracks multi-round confidence convergence, HMAC-SHA256 signed audit event count, and live Zetaris + Meterless status.",
			},
		],
	},
	{
		id: "explorer",
		title: "Processes — 12-State Deterministic Execution Explorer",
		description:
			"We have switched to the Execution view so you can verify the formal 12-state orchestration lifecycle that governs every deliberation:",
		selector: "#tour-explorer",
		badge: "Step 6 of 10",
		highlights: [
			{
				label: "Formal 12-State Workflow Machine",
				detail:
					"Traces IDLE → RECEIVED → ASSESSED → CONTEXT_READY → RESEARCHING → DEBATING → WAIT_MORE_INFO → RE_EVALUATING → FINAL_REVIEW → COMPLETED (plus HALTED / FAILED).",
			},
			{
				label: "Complexity-Driven Council Scaling",
				detail:
					"Displays the assessed Inquiry Complexity score and how the Orchestrator allocated specialist seats and adversarial rounds.",
			},
			{
				label: "Chronological Transition Log",
				detail:
					"Millisecond-timestamped transition ledger proving every governance gate completed in deterministic order.",
			},
		],
	},
	{
		id: "zetaris",
		title: "Interactive Zetaris Evidence Explorer & Audit Ledger",
		description:
			"We have switched to Trust & Evidence so you can inspect the exact Zetaris dataset and verify the SHA-256 cryptographic audit chain:",
		selector: "#tour-evidence",
		badge: "Step 7 of 10",
		highlights: [
			{
				label: "Zetaris Lightning Federated Data Catalog",
				detail:
					"Shows the exact read-only SQL statement (SELECT / SHOW), execution latency, row count, and Circuit Breaker status (CLOSED / live_zetaris).",
			},
			{
				label: "Interactive Zetaris Data Explorer",
				detail:
					"Search and filter rows, click column headers to sort (ASC/DESC), click any row to inspect Raw JSON details, or download the dataset as CSV or JSON.",
			},
			{
				label: "Tamper-Evident SHA-256 Cryptographic Ledger",
				detail:
					"Inspect every hash-chained event (prevHash → hash), verify chain integrity, and download the RFC-6962 / NIST SP 800-92 Proof Certificate.",
			},
		],
	},
	{
		id: "outputs",
		title: "All Outputs, Presentation Suite & Complete .ZIP Archive",
		description:
			"Back in the Conversation view, we have opened the Header Export Menu to showcase all 8 server-verified export formats and the complete .ZIP archive bundle:",
		selector: "#tour-export",
		badge: "Step 8 of 10",
		highlights: [
			{
				label: "Final Governance Decision & Authoritative Deliverable",
				detail:
					"The gold Final Decision card displays Calibrated Confidence (%), cited evidence, caveats, and the Supervisor-approved primary artifact.",
			},
			{
				label: "Presentation & Visual Suite (.PPTX & .SVG)",
				detail:
					"On the final card, launch Visual Diagram & Charts (Mermaid & confidence SVGs) or Present & Share (fullscreen executive slide deck + .PPTX download).",
			},
			{
				label: "7 Individual Export Formats (Open in Header Menu)",
				detail:
					"Download Executive Report (.PDF), Word Document (.DOCX), Excel Workbook (.XLSX), Spreadsheet Dataset (.CSV), Granular Outputs (.JSON), Executive Briefing (.MD), or Audit Stream (.JSONL).",
			},
			{
				label: "Complete Conversation Archive — Download All (.ZIP)",
				detail:
					"Click Download All (.ZIP) (#tour-download-all) to package all 7 formats above, every generated deliverable file, and a manifest.json with SHA-256 file checksums!",
			},
		],
	},
	{
		id: "settings",
		title: "Settings — Where to Add API Keys & Encrypted Secrets",
		description:
			"We have opened the Live Mode Credential Configuration vault so you can see exactly where to enter your Zetaris and Meterless API keys and secrets:",
		selector: "#tour-credentials-modal",
		badge: "Step 9 of 10",
		highlights: [
			{
				label: "Meterless AI Runtime (Nightshift Endpoint & Token)",
				detail:
					"Set the Base URL (http://127.0.0.1:8088/v1), Model Identifier (nemotron-3.5-lightning-30b-a3b), and API Key/Token (or use Auto-detect Nightshift in Settings).",
			},
			{
				label: "Zetaris Lightning Federated Data Engine",
				detail:
					"Enter your Zetaris Host/Domain, Port (443), Database/Schema, and REST API Key / Token (used as the Bearer token for read-only live SQL queries).",
			},
			{
				label: "HMAC-SHA256 Audit Secret & AES-256-GCM Encryption",
				detail:
					"Configure your Audit Secret and click Save & Encrypt Credentials. All secrets are encrypted at rest with AES-256-GCM in data/credentials.enc and .env.local.",
			},
		],
	},
	{
		id: "ready-live",
		title: "Zetaris & Meterless Connected — Ready for Live Mode!",
		description:
			"Both Zetaris Lightning and Meterless Nightshift are connected and verified in the top header bar. You are now ready to run GovernMindz in Live Mode!",
		selector: "#tour-mode",
		badge: "Step 10 of 10",
		highlights: [
			{
				label: "Live Infrastructure Status Pills (Meterless & Zetaris)",
				detail:
					"Green pulsing Meterless and Zetaris indicators in the header confirm live read-only SQL and Nightshift model routing are online.",
			},
			{
				label: "Check Connectivity (↻) & Replay UI Tour",
				detail:
					"Click the refresh icon at any time to re-probe live health, or click Guided Tour in the header to replay this walkthrough.",
			},
			{
				label: "Switch to Fail-Closed Live Mode (#tour-mode)",
				detail:
					"Click the Demo Mode / Live Mode pill (or the button below) to unlock free-text enterprise inquiries with zero synthetic fallback!",
			},
		],
	},
];
