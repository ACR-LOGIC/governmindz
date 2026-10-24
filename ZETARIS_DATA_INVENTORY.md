# Governmindz Hackathon Data Setup: Complete Inventory

## Status: ✅ READY FOR TESTING

Your Zetaris instance has **8 Lightning databases** with **real queryable data** from multiple sources.

---

## Available Data Sources & Schemas

### 1. **SEC_DATA** (SEC EDGAR XBRL Company Facts)
- **Tables (14 total):**
  - Revenue facts: `apple_revenue_facts`, `ibm_revenue_facts`, `oracle_revenue_facts`, `walmart_revenue_facts`, `target_revenue_facts`, `ford_revenue_facts`, `tesla_revenue_facts`
  - Raw submissions: `apple_submissions_raw`, `ibm_submissions_raw`, `oracle_submissions_raw`, `walmart_submissions_raw`, `target_submissions_raw`, `ford_submissions_raw`, `tesla_submissions_raw`
- **Use for:** Financial governance, regulatory compliance, multi-source reconciliation
- **Sample queries:**
  - `SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 5`
  - `SELECT COUNT(*) FROM SEC_DATA.walmart_revenue_facts`

### 2. **OPENFDA_REST** (FDA Drug Labeling)
- **Tables (2 total):**
  - `drug_labels_raw` - Full drug labeling information
  - `adverse_reactions_raw` - Adverse reaction data
- **Use for:** Healthcare compliance, pharmaceutical governance, PII risk assessment
- **Sample queries:**
  - `SELECT * FROM OPENFDA_REST.drug_labels_raw LIMIT 3`
  - `SELECT COUNT(*) FROM OPENFDA_REST.adverse_reactions_raw`

### 3. **CLINICALTRIALS_REST** (ClinicalTrials.gov Studies)
- **Tables (1 total):**
  - `trials_raw` - Clinical trial data for ibuprofen studies
- **Use for:** Healthcare compliance, multi-source data reconciliation
- **Sample queries:**
  - `SELECT * FROM CLINICALTRIALS_REST.trials_raw LIMIT 5`
  - `SELECT COUNT(*) FROM CLINICALTRIALS_REST.trials_raw`

### 4. **GLEIF_REST** (Global Legal Entity Identifier Foundation)
- **Tables (1 total):**
  - `lei_records_raw` - Legal entity identifier registry
- **Use for:** Company verification, cross-registry data governance, re-identification risk
- **Sample queries:**
  - `SELECT * FROM GLEIF_REST.lei_records_raw LIMIT 5`
  - `SELECT COUNT(*) FROM GLEIF_REST.lei_records_raw`

### 5. **POKEAPI_REST** (Pokémon Game Data - Nested JSON Example)
- **Tables (2 total):**
  - `pikachu_facts` - Pikachu attributes
  - `charizard_facts` - Charizard attributes
- **Use for:** Testing nested JSON handling, complex data structure governance
- **Sample queries:**
  - `SELECT * FROM POKEAPI_REST.pikachu_facts LIMIT 5`
  - `SELECT * FROM POKEAPI_REST.charizard_facts LIMIT 5`

### 6. **NY_TAXI** (NYC Taxi Sample Dataset)
- **Tables (15 total):**
  - Trip data: `taxi_trips`, `yellow_taxi`, `green_taxi`
  - Infrastructure: `trips`, `customers`, `drivers`, `vehicles`, `for_hire_vehicles`
  - Operations: `driver_shifts`, `surge_pricing`, `trip_payments`
  - Geography: `taxi_zones`, `zones`
  - Weather: `weather_data`
- **Use for:** PII risk assessment (passenger names, locations), transportation data governance
- **Sample queries:**
  - `SELECT * FROM NY_TAXI.taxi_trips LIMIT 5`
  - `SELECT COUNT(*) FROM NY_TAXI.trips`
  - `SELECT * FROM NY_TAXI.surge_pricing LIMIT 5`

### 7. **COMPANY_DNS** (SIC Classification Hierarchy)
- **Tables (2 total):**
  - `sic_codes_raw` - SIC V3 classification
  - `sic_codes_v4_raw` - SIC V4 classification
- **Use for:** Industry classification, multi-source data reconciliation
- **Sample queries:**
  - `SELECT * FROM COMPANY_DNS.sic_codes_raw LIMIT 5`
  - `SELECT * FROM COMPANY_DNS.sic_codes_v4_raw LIMIT 5`

### 8. **TPCDS_DB** (TPC-DS Benchmark Dataset)
- **Type:** Benchmark data for performance testing
- **Use for:** Load testing, performance governance, scalability assessment

---

## Recommended Test Questions for Governmindz

### Tier 1: Data Governance & Compliance
1. **"Which tables in Zetaris contain PII (personally identifiable information), and what safeguards exist?"**
   - Queries: NY_TAXI customer/driver tables, OPENFDA adverse reactions
   - Tests: FactChecker risk identification, CloudArchitect safeguard logic

2. **"SEC_DATA contains financial facts for 7 Fortune 500 companies. What's the governance risk of exposing this to an external ML team?"**
   - Query: `SELECT COUNT(*) FROM SEC_DATA.apple_revenue_facts`
   - Tests: Financial confidentiality reasoning, access control design

3. **"If we need to deny access to OPENFDA_REST.adverse_reactions_raw but allow OPENFDA_REST.drug_labels_raw, what policy would you recommend?"**
   - Tests: Fine-grained access control, table-level governance

### Tier 2: Multi-Source Reconciliation
4. **"Cross-reference companies in SEC_DATA (Apple, IBM, Oracle, Walmart) with COMPANY_DNS SIC classifications. Which companies appear in both sources?"**
   - Queries: 
     - `SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 1`
     - `SELECT * FROM COMPANY_DNS.sic_codes_v4_raw LIMIT 5`
   - Tests: Synthesizer's multi-source reconciliation, FactChecker's evidence verification

5. **"Combine CLINICALTRIALS_REST ibuprofen studies with OPENFDA_REST drug labeling. Do they have consistent safety information?"**
   - Tests: Data lineage, source authority ranking, dissent detection

### Tier 3: Data Classification & Sensitivity
6. **"Rank these by re-identification risk: COMPANY_DNS, SEC_DATA, NY_TAXI, CLINICALTRIALS_REST. Explain your reasoning."**
   - Tests: CloudArchitect's risk assessment, RivalChallenger's objections

7. **"NY_TAXI.drivers table + NY_TAXI.trip_payments could enable driver surveillance. What governance boundary do you recommend?"**
   - Tests: Thinker's edge-case detection, Synthesizer's policy reconciliation

### Tier 4: Audit Trail & Provenance
8. **"Show that any query we run against SEC_DATA, OPENFDA_REST, and NY_TAXI produces an unbroken, tamper-evident audit trail."**
   - Tests: Gravity cryptographic receipts, hash-chain integrity

---

## How to Use This for Governmindz Hackathon

### Command 1: Run a Governance Test
```bash
cd C:\Users\omg\governmindz
set GOVERNMINDZ_TOPIC=Which tables in Zetaris contain PII, and what safeguards exist?
npm run demo
```

### Command 2: Run a Multi-Source Query Test
```bash
set GOVERNMINDZ_TOPIC=Cross-reference companies in SEC_DATA with COMPANY_DNS SIC classifications. Which companies appear in both sources?
npm run demo
```

### Command 3: Interactive Web UI Test
```bash
npm run web
# Open http://127.0.0.1:8787
# Paste one of the above topics
# Watch the 5-seat debate in real-time
```

---

## Data Schema Details (For Agent Context)

### SEC_DATA Tables
- **apple_revenue_facts, ibm_revenue_facts, etc.**: Company fiscal year revenue data
  - Columns: fiscal_year, revenue, entity_id, (likely XBRL extracted fields)
- **apple_submissions_raw, etc.**: Raw SEC filing submissions
  - Columns: filing_date, cik, accession_number, form_type

### OPENFDA_REST Tables
- **drug_labels_raw**: Brand name, generic name, manufacturer, active ingredient, indications, warnings, dosage
- **adverse_reactions_raw**: Reported adverse reactions from FDA MedWatch

### NY_TAXI Tables
- **trips, taxi_trips, yellow_taxi, green_taxi**: Trip ID, pickup location, dropoff location, passenger count, fare, time
- **customers, drivers**: Name, ID, license (PII)
- **vehicles, for_hire_vehicles**: Vehicle ID, license plate
- **surge_pricing**: Pricing multipliers by zone/time (sensitive operational data)

---

## What's Still Needed for Full Hackathon Submission

- [ ] Custom multi-source queries (e.g., SEC_DATA + COMPANY_DNS + NY_TAXI joined via CIK)
- [ ] USL (Unified Semantic Layer) model over SEC_DATA + COMPANY_DNS for governance reasoning
- [ ] Documented data lineage for each source
- [ ] Governmindz demo questions that leverage all 8 databases
- [ ] Evidence snapshots (sample row counts, column profiling) for agent context
- [ ] Governance decision document (which data should go where, why)

---

## Next Steps

1. **Start with Tier 1 questions** (PII detection, classification risk)
2. **Move to Tier 2** (multi-source reconciliation)
3. **Build a custom demo scenario** with GOVERNMINDZ_TOPIC override
4. **Export your session history** and audit trail for the hackathon submission

**Status:** All 8 databases queryable, all tables discoverable, preflight passing. Ready for agent testing.
