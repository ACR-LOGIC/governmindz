# Governmindz Ready-to-Run Demo Commands
## Copy & paste these directly into PowerShell to showcase your agent

---

## DEMO 1: Regulatory Risk Analysis (Multi-Source Join: SEC + GLEIF + COMPANY_DNS)
### What Judges See: Zetaris joins 3 authoritative sources to rank companies by governance risk
```powershell
cd C:\Users\omg\governmindz
$env:GOVERNMINDZ_TOPIC = "Our organization received acquisition offers from 7 Fortune 500 companies: Apple, IBM, Oracle, Walmart, Target, Ford, Tesla. Before we accept any partnership, we must assess regulatory compliance risk using Zetaris to cross-reference: (1) SEC_DATA financial reporting consistency and revenue volatility, (2) GLEIF_REST legal entity status (active/inactive LEI), (3) COMPANY_DNS industry classification and regulatory burden. Produce a governance risk ranking of all 7 companies. Which company poses the HIGHEST compliance risk?"
npm run demo
```

**Judge Expectations:**
- ✅ Agent queries SEC_DATA (revenues), GLEIF_REST (LEI status), COMPANY_DNS (industry risk)
- ✅ 5-seat debate identifies: Tesla (high volatility), Ford (automotive regulation), Oracle (missing LEI)
- ✅ FactChecker provides evidence: "Tesla 42% YoY growth anomaly"
- ✅ CloudArchitect recommends: "Restrict data access for HIGH-risk companies"
- ✅ Audit trail shows SHA-256 hash chain proving reasoning

---

## DEMO 2: PII Re-identification Risk Assessment (NY_TAXI Multi-Table Join)
### What Judges See: Zetaris joins taxi_trips + drivers + zones to calculate PII exposure
```powershell
cd C:\Users\omg\governmindz
$env:GOVERNMINDZ_TOPIC = "We want to share NY_TAXI operational data with external researchers to study transportation patterns. However, we're concerned about driver PII exposure. Use Zetaris to join: taxi_trips (trip history), drivers (names + license numbers), zones (pickup locations), surge_pricing (pricing patterns). For each driver, calculate: (1) trip frequency (more trips = easier to identify), (2) geographic footprint (zone diversity), (3) earnings profile (another identifying characteristic). Create a PII exposure score (0-100) and recommend which drivers can be safely anonymized, and which must be blocked from research dataset. What governance policy should we implement to protect driver privacy?"
npm run demo
```

**Judge Expectations:**
- ✅ Agent joins 4 NY_TAXI tables with aggregations
- ✅ Returns: Driver IDs, trip counts, zone patterns, PII exposure scores
- ✅ Thinker raises: "Even if we remove names, driver with 5k trips in 3 zones = 95% re-identifiable"
- ✅ CloudArchitect: "Pseudonymize driver IDs; require de-identification approval"
- ✅ Synthesizer consensus: "Block high-exposure drivers from research dataset"

---

## DEMO 3: Clinical Trial + Drug Safety Data Alignment
### What Judges See: Zetaris joins healthcare data to detect compliance gaps
```powershell
cd C:\Users\omg\governmindz
$env:GOVERNMINDZ_TOPIC = "We're partnering with pharmaceutical companies conducting clinical trials on ibuprofen. Before granting them access to our health data, we must ensure trial integrity. Use Zetaris to join: CLINICALTRIALS_REST (active ibuprofen trials) with OPENFDA_REST (FDA-approved drug info + adverse reactions). Analyze: (1) What active ibuprofen trials exist? (2) Do they match FDA labeling for indications, dosage, warnings? (3) What known adverse reactions are in FDA data that trials AREN'T monitoring? (4) Are there data inconsistencies that create governance risk? Recommend which trials can be trusted for data partnership, and which require additional review or denial."
npm run demo
```

**Judge Expectations:**
- ✅ Agent joins healthcare sources, detects data gaps
- ✅ FactChecker: "3/5 trials use outdated FDA warnings" [EVIDENCE]
- ✅ Thinker: "Patient safety risk if trials miss known adverse reactions"
- ✅ Synthesizer: "Require FDA reconciliation before data access grant"

---

## DEMO 4: Data Reconciliation Audit (Cross-Source Identity Matching)
### What Judges See: Zetaris reconciles company identifiers across 3 authoritative sources
```powershell
cd C:\Users\omg\governmindz
$env:GOVERNMINDZ_TOPIC = "We must reconcile company identities across three authoritative sources: SEC_DATA (uses CIK identifiers), GLEIF_REST (uses LEI codes), COMPANY_DNS (uses SIC industry codes). For the 7 companies in our database: (1) Which have EXACT name matches across all three sources? (2) Which show name variations (e.g., 'International Business Machines' vs 'IBM')? (3) Which are MISSING from any source? (4) What governance implications does this create for our data quality and compliance? Use Zetaris to perform full outer joins and reconciliation. Where is our master data unreliable?"
npm run demo
```

**Judge Expectations:**
- ✅ Agent performs full outer joins, detects missing records
- ✅ Shows reconciliation status: EXACT_MATCH, PARTIAL_MATCH, NO_MATCH
- ✅ FactChecker: "Oracle missing LEI = cannot verify legal entity"
- ✅ Governance implication: "High data quality risk; require manual verification"

---

## DEMO 5: Fairness Audit - Surge Pricing Equity Analysis
### What Judges See: Zetaris joins operational + demographic data to assess fairness
```powershell
cd C:\Users\omg\governmindz
$env:GOVERNMINDZ_TOPIC = "Ethical governance question: Does our surge pricing disproportionately affect low-income areas? Use Zetaris to join: surge_pricing (multipliers by zone + time), zones (borough + demographics), drivers (earnings during surge), taxi_trips (customer fare impact). Analysis: (1) Which zones have highest surge multipliers? (2) Are these low-income vs affluent neighborhoods? (3) What's the driver vs. customer fairness ratio during surge? (4) Do surge prices correlate with area income level? This could violate Fair Housing Act and equity principles. What governance policy should we implement to ensure fair pricing across all neighborhoods?"
npm run demo
```

**Judge Expectations:**
- ✅ Agent joins operational + demographic + fairness data
- ✅ Detects pattern: "3.2x surge in low-income zones vs 1.5x in affluent areas"
- ✅ CloudArchitect: "CRITICAL equity risk; potential regulatory violation"
- ✅ RivalChallenger: "Could this be race/income-based discrimination?"
- ✅ Synthesizer: "Recommend capping surge multipliers in vulnerable zones"

---

## DEMO 6: Enterprise Risk Scorecard (Multi-Dimensional Aggregation)
### What Judges See: Zetaris calculates composite governance risk from 4 dimensions
```powershell
cd C:\Users\omg\governmindz
$env:GOVERNMINDZ_TOPIC = "Create a comprehensive enterprise governance risk scorecard for all 7 companies in our database. Calculate composite risk across four dimensions: (1) FINANCIAL RISK from SEC_DATA (revenue volatility, debt levels, reporting gaps), (2) LEGAL/COMPLIANCE RISK from GLEIF_REST (LEI status, registration recency), (3) INDUSTRY RISK from COMPANY_DNS (sector regulation burden), (4) DATA QUALITY RISK (missing records, inconsistencies). Use Zetaris to join all three sources, calculate weighted risk scores (0-100 per dimension), and produce a final governance risk ranking. Recommend data access policy (FULL_ACCESS, CONDITIONAL, RESTRICTED) for each company."
npm run demo
```

**Judge Expectations:**
- ✅ Agent produces risk scorecard with 4 dimensions
- ✅ Example output: Apple (40/100 = LOW, FULL_ACCESS), Tesla (70/100 = HIGH, RESTRICTED)
- ✅ FactChecker: "Financial risk scores are based on SEC volatility data" [EVIDENCE]
- ✅ CloudArchitect: "Access policy tied to risk score"
- ✅ Scorecard is audit-ready and governance-grade

---

## DEMO 7: Anomaly Detection - Financial Reporting Integrity
### What Judges See: Zetaris uses window functions to detect suspicious patterns
```powershell
cd C:\Users\omg\governmindz
$env:GOVERNMINDZ_TOPIC = "Red flag detection: Analyze SEC_DATA year-over-year revenue patterns for all 7 companies to detect: (1) Unrealistic growth curves (potential fraud indicators), (2) Data quality issues (missing fiscal years, inconsistent reporting), (3) Timing anomalies (unusual filing patterns). Use Zetaris window functions to calculate YoY change, flag outliers (>50% growth/decline), and identify reporting gaps. Correlate anomalies with company size and industry. What companies require additional due diligence? What governance controls should we implement?"
npm run demo
```

**Judge Expectations:**
- ✅ Agent detects patterns: "Tesla 42% YoY growth (flagged for verification)"
- ✅ FactChecker: "This anomaly requires manual review"
- ✅ CloudArchitect: "Require additional due diligence for anomalous companies"

---

## DEMO 8: Interactive Web UI (Real-Time Debate)
### What Judges See: Live 5-seat debate with real-time SSE streaming
```powershell
cd C:\Users\omg\governmindz
npm run web
# Then open http://127.0.0.1:8787 in browser
# Paste any of the above topics and watch the debate happen live
```

**Judge Experience:**
- ✅ Real-time agent messages appear in chat
- ✅ Confidence scores update live
- ✅ View agent character avatars (FactChecker's magnifying glass, CloudArchitect's hard hat)
- ✅ Click "Agent Inspector" to see full reasoning history
- ✅ View cryptographic audit ledger (hash chain)
- ✅ Export session for compliance records

---

## DEMO 9: Audit Trail Verification (Cryptographic Proof)
### What Judges See: Tamper-evident SHA-256 hash chain
```powershell
cd C:\Users\omg\governmindz

# Generate audit trail
$env:GOVERNMINDZ_LOG_PATH = "logs/hackathon-audit-final.jsonl"
npm run demo

# View audit trail (shows hash chain)
Get-Content logs/hackathon-audit-final.jsonl | ConvertFrom-Json | Select-Object type, hash, signature | Format-Table
```

**Judge Expectations:**
- ✅ Each event has hash + signature
- ✅ `audit_integrity: true` at end (proves no tampering)
- ✅ Genesis hash → session_complete hash (unbroken chain)

---

## DEMO 10: Sample Mode (No External Dependencies)
### What Judges See: Deterministic debate with pre-loaded data
```powershell
cd C:\Users\omg\governmindz
npm run demo:sample
# No LLM calls, no network latency, deterministic output
```

---

## How Judges Will Judge

| Criterion | What They're Looking For | Your Demo Shows |
|---|---|---|
| **Data Integration** | Can agent query multiple sources? | ✅ Zetaris joins 3-4 databases per demo |
| **Pattern Discovery** | Can agent find insights across data? | ✅ Risk scoring, anomaly detection, reconciliation |
| **Governance Reasoning** | Are recommendations evidence-based? | ✅ FactChecker cites specific data; CloudArchitect designs policy |
| **Explainability** | Is reasoning transparent? | ✅ 5-seat debate with dissent tracking |
| **Audit Trail** | Can you prove what the agent did? | ✅ SHA-256 hash chain, HMAC signatures |
| **Real-World Impact** | Does this solve actual problems? | ✅ PII detection, compliance audits, fairness analysis |

---

## Expected Judge Reaction

After running DEMO 1-3:
> "This agent actually queried real federated databases, joined disparate data sources, discovered governance-relevant patterns, and used evidence to reason about policy. And it's all cryptographically auditable. This is exactly what we hoped the hackathon would produce."

---

## Pro Tips for Demo Day

1. **Start with DEMO 1** (Regulatory Risk) - most impressive multi-source join
2. **Show DEMO 2** (PII Risk) - most relatable real-world problem
3. **Use Web UI for interactive demo** - visually impressive, shows reasoning in real-time
4. **Export audit trail** (`logs/hackathon-audit-final.jsonl`) - proof of cryptographic integrity
5. **Have DEMO 7** (Anomaly Detection) ready if judges ask "but can it detect fraud?"

---

## Troubleshooting During Demo

| Issue | Solution |
|---|---|
| Meterless timeout (slow LLM response) | Pre-run `npm run demo:sample` to cache models |
| Network latency to Zetaris | Ensure Docker containers running: `docker ps \| grep zetaris` |
| Agent not providing evidence | Check logs: `npm run smoke` |
| Judges want to see SQL | Show them: `cat C:\Users\omg\getting-started\advanced-governance-queries.sql` |

