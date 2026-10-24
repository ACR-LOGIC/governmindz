# Advanced Governmindz Test Scenarios
## Showcasing Multi-Source Data Joining, Pattern Discovery & Governance Reasoning

These scenarios are designed to demonstrate:
- **Zetaris Heavy Lifting:** Multi-database joins, aggregations, anomaly detection
- **Pattern Discovery:** Cross-source data reconciliation and risk identification
- **Governance Reasoning:** Evidence-based policy recommendations from 5-seat debate
- **Real-World Impact:** Questions judges want to see answered

---

## Tier 1: Multi-Source Company Risk Analysis (High Impact)

### Scenario 1.1: "Regulatory Red Flags" 
**Question:** "Our organization received acquisition offers from 7 Fortune 500 companies (Apple, IBM, Oracle, Walmart, Target, Ford, Tesla). Before we accept any partnership, we need to assess regulatory compliance risk. Which companies show:
- Active legal entity status (GLEIF)?
- Consistent financial reporting (SEC)?
- Industry classification risk?
Use Zetaris to cross-reference SEC_DATA, GLEIF_REST, and COMPANY_DNS. Which company poses the HIGHEST compliance risk, and why?"

**What Judges See:**
- ✅ Zetaris joins 3 data sources
- ✅ Returns risk-scored companies with evidence
- ✅ FactChecker identifies red flags (inactive LEI, volatility, high-risk industry)
- ✅ CloudArchitect recommends access controls per company
- ✅ Synthesizer ranks companies by governance risk

**Expected Output:**
```
Company: Tesla
LEI Status: ACTIVE
Avg Revenue: $81.5B
Revenue Volatility: 42% YoY
Industry: Automotive (HIGH_RISK)
Compliance Risk: MEDIUM
Reason: High revenue volatility + automotive industry regulation
```

---

### Scenario 1.2: "Data Reconciliation Audit"
**Question:** "We need to reconcile company identities across three authoritative sources (SEC_DATA uses CIK, GLEIF_REST uses LEI, COMPANY_DNS uses SIC code). For the 7 companies in our database:
- Which have exact name matches across all three sources?
- Which have data inconsistencies or missing records?
- What governance implications does this create for our data governance policy?

Use Zetaris to perform the reconciliation. Where is our data unreliable?"

**What Judges See:**
- ✅ Zetaris performs full outer joins across 3 sources
- ✅ Detects missing records and name variations
- ✅ Agents debate data reliability implications
- ✅ RivalChallenger challenges: "Can we trust companies with mismatched data?"
- ✅ Synthesizer recommends: "Require manual verification before access"

**Expected Output:**
```
Apple: EXACT_MATCH across SEC/GLEIF/DNS ✅
IBM: PARTIAL_MATCH (name variations found) ⚠️
Oracle: MISSING_FROM_GLEIF ❌ [Governance Risk: MEDIUM]
Walmart: EXACT_MATCH but LEI_INACTIVE ⚠️
```

---

## Tier 2: PII Risk & Privacy Governance (Very High Impact)

### Scenario 2.1: "Re-identification Risk Assessment"
**Question:** "We want to share NY_TAXI operational data with a research team to study transportation patterns. However, we have serious concerns about PII exposure. 

Zetaris, cross-reference:
- taxi_trips (trip history)
- drivers (driver names, license numbers, earnings)
- zones (pickup/dropoff locations)
- surge_pricing (pricing patterns)

For each driver:
1. How many trips do they have? (high-frequency = easier to identify)
2. Which zones do they work? (geographic fingerprint)
3. What's their estimated earnings? (correlatable with external data)

Create a 'PII exposure score' and recommend which drivers' data is safe to share, and which requires de-identification or blocking."

**What Judges See:**
- ✅ Zetaris joins 4 NY_TAXI tables with aggregations
- ✅ Pattern discovery: identifies high-exposure drivers
- ✅ FactChecker: "Driver with 5,000 trips in only 2 zones = 95% re-identifiable"
- ✅ CloudArchitect: "Block personal identifiers; pseudonymize driver IDs"
- ✅ Thinker: "Even anonymized, zone + earnings + trip count = re-identification risk"

**Expected Output:**
```
Driver ID: D12345
Name: [REDACTED]
Trip Count: 5,847
Unique Zones: 3
Earnings Pattern: $2,100/week (identifiable with taxi medallion license data)
PII Exposure Score: 92/100 [HIGH]
Recommendation: BLOCK from research dataset
```

---

### Scenario 2.2: "Surge Pricing Fairness Audit"
**Question:** "Ethical governance question: Does surge pricing disproportionately affect lower-income areas? 

Zetaris, join:
- surge_pricing (multipliers by zone/time)
- zones (borough, demographics)
- drivers (earnings during surge)
- taxi_trips (customer fare impact)

Analysis:
1. Which zones have highest surge multipliers?
2. What are the demographics of these zones? (low-income vs affluent)
3. What's the driver vs. customer fairness ratio? (do drivers earn proportionally to surge, or does company take most margin?)
4. Is surge pricing being weaponized against vulnerable populations?"

**What Judges See:**
- ✅ Zetaris joins operational + geographic + fairness data
- ✅ CloudArchitect identifies equity risks: "Surge > 2x in low-income zones"
- ✅ RivalChallenger challenges: "This could violate Fair Housing Act"
- ✅ Synthesizer recommends: "Cap surge multipliers in vulnerable zones; transparent pricing"

**Expected Output:**
```
Zone: East New York, Brooklyn (Low-Income)
Max Surge Multiplier: 3.2x
Avg Customer Fare: $34 (base) → $109 (during surge)
Driver Earnings: $12 (base) → $28 (during surge)
Company Margin: 65% during surge vs. 35% baseline
Fairness Risk: CRITICAL [Potential violation of equity policy]
```

---

## Tier 3: Healthcare Data Compliance (High Trust Impact)

### Scenario 3.1: "Clinical Trial + Drug Safety Alignment"
**Question:** "We're evaluating whether to partner with pharmaceutical companies conducting clinical trials. Before we grant them access to our data, we need to ensure trial integrity.

Zetaris, join:
- CLINICALTRIALS_REST (ibuprofen studies)
- OPENFDA_REST (FDA-approved drug info + adverse reactions)

Analysis:
1. What ibuprofen trials are currently active?
2. Do they match FDA labeling for indications, dosage, warnings?
3. Are there adverse reactions in FDA data that the trials aren't monitoring for?
4. What's the governance risk of data inconsistency between trial protocol and FDA data?"

**What Judges See:**
- ✅ Zetaris joins healthcare data sources
- ✅ FactChecker identifies: "3/5 trials use outdated FDA warnings"
- ✅ Thinker raises: "Patient safety risk if trials miss known adverse reactions"
- ✅ Synthesizer: "Require FDA reconciliation before access grant"

**Expected Output:**
```
Trial: NCT04957890 (Ibuprofen + Aspirin interaction study)
FDA Record: Ibuprofen monotherapy
Status: INCONSISTENCY_DETECTED
Known Adverse Reaction in FDA: GI bleeding (10%)
Trial Monitoring: No mention of GI tracking
Governance Action: REQUIRE_AMENDMENT or DENY_ACCESS
```

---

## Tier 4: Enterprise Risk Scorecard (Executive-Level Insight)

### Scenario 4.1: "Comprehensive Governance Risk Score"
**Question:** "Create an enterprise governance risk scorecard for all companies in our database. For each company, calculate a composite risk score across four dimensions:

1. **Financial Risk** (SEC_DATA): Revenue volatility, debt levels, reporting gaps
2. **Legal/Compliance Risk** (GLEIF_REST): LEI status, registration gaps, update recency
3. **Industry Risk** (COMPANY_DNS): High-risk sectors, regulatory burden
4. **Data Quality Risk** (Cross-source): Missing records, inconsistencies, freshness

Zetaris should:
- Join all three sources
- Calculate weighted risk scores per dimension
- Produce a final governance risk ranking (HIGH/MEDIUM/LOW)
- Recommend data access policy per company"

**What Judges See:**
- ✅ Zetaris performs complex multi-dimensional aggregation
- ✅ Output: Risk-ranked company list with evidence
- ✅ FactChecker: 'Tesla has highest financial risk (42% YoY volatility)'
- ✅ CloudArchitect: 'Recommend restricted access for HIGH-risk companies'
- ✅ Synthesizer: 'Consensus: 3 companies = LOW risk, can grant full access; 2 companies = MEDIUM, conditional access; 2 companies = HIGH, deny or restricted'

**Expected Output:**
```
Company Risk Scorecard:
┌─────────────────────────────────────────────────────────────┐
│ Company  │ Fin │ Legal │ Ind │ Data │ Total │ Policy        │
├──────────┼─────┼───────┼─────┼──────┼───────┼───────────────┤
│ Apple    │ 15  │ 8     │ 12  │ 5    │ 40    │ FULL_ACCESS   │
│ IBM      │ 18  │ 12    │ 15  │ 10   │ 55    │ CONDITIONAL   │
│ Oracle   │ 20  │ 18*   │ 18  │ 15   │ 71    │ RESTRICTED**  │
│ Walmart  │ 12  │ 8     │ 10  │ 6    │ 36    │ FULL_ACCESS   │
│ Target   │ 22  │ 15    │ 12  │ 8    │ 57    │ CONDITIONAL   │
│ Ford     │ 25  │ 10    │ 20  │ 12   │ 67    │ RESTRICTED    │
│ Tesla    │ 30* │ 12    │ 20  │ 8    │ 70    │ RESTRICTED    │
└─────────────────────────────────────────────────────────────┘
* = Flagged by data quality checks
** = Oracle missing LEI; recommend manual verification
```

---

## Tier 5: Advanced Pattern Discovery (Wow Factor)

### Scenario 5.1: "Anomaly Detection: Financial Reporting Integrity"
**Question:** "Red flag detection: Analyze SEC_DATA across 7 companies for suspicious patterns that might indicate:
- Fraudulent reporting (unrealistic growth curves)
- Data quality issues (missing years, inconsistent units)
- Timing anomalies (unusual filing patterns)

Zetaris, use window functions to:
1. Calculate year-over-year revenue change per company
2. Flag outliers (> 50% growth or decline in single year)
3. Identify gaps in reporting (missing fiscal years)
4. Correlate anomalies with company events (bankruptcies, mergers)

What governance implications?"

**What Judges See:**
- ✅ Zetaris performs sophisticated window function aggregation
- ✅ Detects patterns that require human review
- ✅ FactChecker: "Tesla: 42% YoY growth in 2021 (flagged for verification)"
- ✅ CloudArchitect: "Require additional due diligence for anomalous companies"

---

### Scenario 5.2: "Cross-Source Data Validation"
**Question:** "Quality audit: When the same company appears in multiple sources (SEC_DATA, GLEIF_REST, COMPANY_DNS), do the records agree?

Zetaris:
1. Join companies across all three sources
2. Compare fields: company name, location, industry
3. Calculate a 'data consistency score' per company
4. Identify which source is authoritative when conflicts arise

What does poor consistency suggest about data governance?"

**Expected Output:**
```
Company: IBM
SEC Data: IBM Corporation, Armonk NY, Technology
GLEIF Data: International Business Machines Corp, Armonk NY, Conglomerate
DNS Data: IBM, NY, Conglomerate (SIC 7371)
Consistency Score: 78/100 [MEDIUM_VARIANCE]
Governance Action: Flag for manual reconciliation; establish single source of truth
```

---

## Running These Scenarios in Governmindz

### Option 1: Set Custom Topic (CLI)
```bash
cd C:\Users\omg\governmindz

set GOVERNMINDZ_TOPIC="Our organization received acquisition offers from 7 Fortune 500 companies. Before we accept any partnership, assess regulatory compliance risk. Which company poses the HIGHEST compliance risk, and why? Use SEC financial data, GLEIF legal entity status, and COMPANY_DNS industry classification."

npm run demo
```

### Option 2: Interactive Web UI
```bash
npm run web
# Open http://127.0.0.1:8787
# Paste scenario question
# Watch 5-seat debate in real-time
# View audit trail with evidence
```

### Option 3: Run SQL Directly (Pre-Join Data)
```bash
cd C:\Users\omg\getting-started

# Run all advanced scenarios
python3 scripts/run_sql.py advanced-governance-queries.sql

# Or individual scenario (e.g., Scenario 1.1)
python3 scripts/run_sql.py \
  "SELECT company_name, lei_status, avg_revenue, governance_risk FROM ... WHERE ..."
```

---

## Why These Scenarios Showcase What Judges Want

### ✅ Zetaris Doing Heavy Lifting
- Multi-database joins (3-4 sources per query)
- Complex aggregations (window functions, CASE statements)
- Real data joining on company identifiers (CIK → LEI → SIC)

### ✅ Pattern Discovery
- Cross-source reconciliation (finding inconsistencies)
- Anomaly detection (revenue spikes, missing data)
- Risk scoring (composite index from multiple dimensions)

### ✅ Governance Relevance
- PII exposure analysis (real regulatory concern)
- Compliance gap detection (audit-ready output)
- Data quality metrics (actionable recommendations)

### ✅ 5-Seat Debate Value
- FactChecker: "Found the evidence in the data"
- CloudArchitect: "Here's how we protect against this risk"
- Synthesizer: "Here's the policy we should adopt"
- RivalChallenger: "But have we considered this angle?"
- Thinker: "What are we still missing?"

### ✅ Audit Trail Proof
- Each agent's reasoning tied to specific data findings
- Dissent explicitly tracked ("RivalChallenger challenges: ...")
- Final consensus supported by evidence

---

## Expected Judge Reaction

"Wow, the agent actually queried multiple real databases, joined disparate data sources, discovered patterns, and used evidence to reason about governance policy. This is exactly what we built the hackathon for."

---

## Files Referenced

- Advanced queries: `C:\Users\omg\getting-started\advanced-governance-queries.sql`
- Governmindz UI: `http://127.0.0.1:8787`
- Audit trail: `logs/hackathon-submission.jsonl` (after running `npm run demo`)
