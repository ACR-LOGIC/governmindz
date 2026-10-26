# Governmindz Ready-to-Run Demo Commands
## Copy & Paste Commands for Windows, Linux, and macOS

---

## DEMO 1: Regulatory Risk Analysis (Multi-Source Join: SEC + GLEIF + COMPANY_DNS)
### What Judges See: Zetaris joins 3 authoritative sources to rank companies by governance risk

**Windows (PowerShell):**
```powershell
$env:GOVERNMINDZ_TOPIC = "Our organization received acquisition offers from 7 Fortune 500 companies: Apple, IBM, Oracle, Walmart, Target, Ford, Tesla. Before we accept any partnership, we must assess regulatory compliance risk using Zetaris to cross-reference: (1) SEC_DATA financial reporting consistency and revenue volatility, (2) GLEIF_REST legal entity status (active/inactive LEI), (3) COMPANY_DNS industry classification and regulatory burden. Produce a governance risk ranking of all 7 companies. Which company poses the HIGHEST compliance risk?"
npm run demo
```

**Linux / macOS (Bash/Zsh):**
```bash
export GOVERNMINDZ_TOPIC="Our organization received acquisition offers from 7 Fortune 500 companies: Apple, IBM, Oracle, Walmart, Target, Ford, Tesla. Before we accept any partnership, we must assess regulatory compliance risk using Zetaris to cross-reference: (1) SEC_DATA financial reporting consistency and revenue volatility, (2) GLEIF_REST legal entity status (active/inactive LEI), (3) COMPANY_DNS industry classification and regulatory burden. Produce a governance risk ranking of all 7 companies. Which company poses the HIGHEST compliance risk?"
npm run demo
```

**Judge Expectations:**
- ✅ Parallel crews run: Data Crew inspects Zetaris tables, Web Search Crew retrieves regulatory standards.
- ✅ 5-seat debate identifies: Tesla (high volatility), Ford (automotive regulation), Oracle (missing LEI).
- ✅ FactChecker provides evidence: "Tesla 42% YoY growth anomaly".
- ✅ CloudArchitect recommends: "Restrict data access for HIGH-risk companies".
- ✅ Audit trail shows SHA-256 hash chain proving reasoning.

---

## DEMO 2: PII Re-identification Risk Assessment (NY_TAXI Multi-Table Join)
### What Judges See: Zetaris joins taxi_trips + drivers + zones to calculate PII exposure

**Windows (PowerShell):**
```powershell
$env:GOVERNMINDZ_TOPIC = "We want to share NY_TAXI operational data with external researchers to study transportation patterns. However, we're concerned about driver PII exposure. Use Zetaris to join: taxi_trips (trip history), drivers (names + license numbers), zones (pickup locations), surge_pricing (pricing patterns). For each driver, calculate: (1) trip frequency (more trips = easier to identify), (2) geographic footprint (zone diversity), (3) earnings profile (another identifying characteristic). Create a PII exposure score (0-100) and recommend which drivers can be safely anonymized, and which must be blocked from research dataset. What governance policy should we implement to protect driver privacy?"
npm run demo
```

**Linux / macOS (Bash/Zsh):**
```bash
export GOVERNMINDZ_TOPIC="We want to share NY_TAXI operational data with external researchers to study transportation patterns. However, we're concerned about driver PII exposure. Use Zetaris to join: taxi_trips (trip history), drivers (names + license numbers), zones (pickup locations), surge_pricing (pricing patterns). For each driver, calculate: (1) trip frequency (more trips = easier to identify), (2) geographic footprint (zone diversity), (3) earnings profile (another identifying characteristic). Create a PII exposure score (0-100) and recommend which drivers can be safely anonymized, and which must be blocked from research dataset. What governance policy should we implement to protect driver privacy?"
npm run demo
```

**Judge Expectations:**
- ✅ Agent joins 4 NY_TAXI tables with aggregations.
- ✅ Returns: Driver IDs, trip counts, zone patterns, PII exposure scores.
- ✅ Thinker raises: "Even if we remove names, driver with 5k trips in 3 zones = 95% re-identifiable".
- ✅ CloudArchitect: "Pseudonymize driver IDs; require de-identification approval".
- ✅ Synthesizer consensus: "Block high-exposure drivers from research dataset".

---

## DEMO 3: Deliverable Generation (PowerPoint Presentation & PDF Report)
### What Judges See: Pure Node.js zero-dependency OpenXML `.pptx` and `.pdf` generation

**Windows (PowerShell):**
```powershell
$env:GOVERNMINDZ_TOPIC = "Prepare an executive presentation and PDF compliance report evaluating our cross-silo data governance readiness for Zetaris federated catalog access."
npm run demo
```

**Linux / macOS (Bash/Zsh):**
```bash
export GOVERNMINDZ_TOPIC="Prepare an executive presentation and PDF compliance report evaluating our cross-silo data governance readiness for Zetaris federated catalog access."
npm run demo
```

**Judge Expectations:**
- ✅ Supervisor establishes Deliverable Contract: `presentation` (`.pptx`) and `report` (`.pdf`).
- ✅ Design Assistant compiles valid OpenXML PowerPoint deck in `data/artifacts/`.
- ✅ Supervisor validates file existence, size, and OpenXML structure before releasing.
- ✅ Output provides clickable download links and separate `-evidence.json` exports.

---

## DEMO 4: Deterministic Offline Sample Benchmark (Zero API Keys)
### What Judges See: Complete multi-agent deliberation and audit trail running 100% offline

**Windows / Linux / macOS:**
```bash
npm run demo:sample
```

**Judge Expectations:**
- ✅ Runs immediately without network or API tokens.
- ✅ Shows read-only Zetaris cached catalog output.
- ✅ Executes multi-agent debate and cryptographic audit trail.
- ✅ Verifies 100% SHA-256 hash-chain integrity from genesis to terminal head.

---

## DEMO 5: Mission Control Web Application
### What Judges See: Real-time 3-pane interface with animated parallel crew bubbles

**Windows / Linux / macOS:**
```bash
npm run web
# Open http://127.0.0.1:8787 in your browser
```

**Judge Expectations:**
- ✅ Real-time parallel research crew bubbles showing concurrent Data Crew and Web Crew queries.
- ✅ Strict barrier synchronization: bubbles stay open until all crews finish.
- ✅ Full 12-state deterministic workflow engine progress tracking.
- ✅ Live cryptographic audit ledger viewer with NIST SP 800-92 proof certificates.
- ✅ Authoritative Deliverable Card with direct view and download buttons.
