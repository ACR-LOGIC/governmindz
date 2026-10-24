# Open Agent Hackathon 2026: Setup Complete ✅

## Your Complete Setup Verification

### ✅ Phase 1: Zetaris Instance
- **Status:** Running at http://localhost:8888
- **Authentication:** All credentials configured in `.env.local`
- **Preflight:** PASS (REST endpoint, databases accessible)

### ✅ Phase 2: 8 Lightning Databases with Real Data
All databases are **immediately queryable**:

| Database | Tables | Primary Use |
|---|---|---|
| **SEC_DATA** | 14 | Financial (Apple, IBM, Oracle, Walmart, Target, Ford, Tesla revenue facts) |
| **OPENFDA_REST** | 2 | Drug labeling & adverse reactions (PII-sensitive) |
| **CLINICALTRIALS_REST** | 1 | Clinical trial data (ibuprofen studies) |
| **GLEIF_REST** | 1 | Legal entity identifiers (governance reference) |
| **POKEAPI_REST** | 2 | Nested JSON test data |
| **NY_TAXI** | 15 | Trip data, drivers, customers (PII-rich dataset) |
| **COMPANY_DNS** | 2 | SIC industry classification hierarchy |
| **TPCDS_DB** | N/A | Benchmark data |

### ✅ Phase 3: Governmindz Agent Platform
- **Web UI:** http://127.0.0.1:8787
- **Status:** Live and ready for agent testing
- **Configuration:** Points to Zetaris instance + Meterless runtime
- **Audit Trail:** Cryptographic signing active
- **Sample Scenarios:** 5-seat debate system ready

### ✅ Phase 4: Data Documentation
Created: `ZETARIS_DATA_INVENTORY.md` with:
- All 40+ queryable tables documented
- Sample SQL queries for each source
- Governance use cases
- Multi-source reconciliation examples

---

## How to Use for Hackathon Submission

### Test 1: Single-Source Governance (5 minutes)
```bash
cd C:\Users\omg\governmindz

# Run a Zetaris governance question
npm run demo
```
**Agents will debate:** Which tables contain PII? What governance controls exist?

### Test 2: Multi-Source Query (5 minutes)
```bash
# Interactive web UI
npm run web
# Open http://127.0.0.1:8787
# Paste: "Cross-reference SEC_DATA companies with COMPANY_DNS SIC classifications. Which appear in both?"
```

### Test 3: Data Classification Risk Assessment
```bash
set GOVERNMINDZ_TOPIC=Rank these 8 databases by re-identification risk. Why? What's your recommended access policy?
npm run demo
```

### Test 4: Audit Trail Verification
```bash
# Run demo with logging
set GOVERNMINDZ_LOG_PATH=logs/hackathon-audit.jsonl
npm run demo
# Check: logs/hackathon-audit.jsonl for tamper-evident hash chain
```

---

## Key Files for Your Submission

1. **ZETARIS_DATA_INVENTORY.md** — Complete data documentation
2. **logs/hackathon-*.jsonl** — Debate transcript + audit trail (run `npm run demo` with logging)
3. **.env.local** — Your configuration (DO NOT COMMIT, it's gitignored)
4. **apps/gateway/src/main.ts** — Entry point for governance debates
5. **apps/web/** — Mission Control UI for interactive testing

---

## Hackathon Judging Criteria: What You've Demonstrated

✅ **Agent can understand and query data:**
   - Zetaris client integrates 8 databases with real schemas
   - 40+ tables discoverable via `SHOW TABLES FROM <db>`
   - Sample queries provided for each source

✅ **Agent demonstrates reasoning about governance:**
   - 5-seat debate system (FactChecker, CloudArchitect, Synthesizer, RivalChallenger, Thinker)
   - Explicit disagreement/dissent tracking
   - Consensus scoring with confidence levels

✅ **Tamper-evident audit trail:**
   - SHA-256 hash-chained events
   - Gravity HMAC signatures
   - Unbroken cryptographic proof of reasoning

✅ **Data governance focus:**
   - PII detection (NY_TAXI, OPENFDA)
   - Financial confidentiality (SEC_DATA)
   - Multi-source reconciliation (COMPANY_DNS + SEC_DATA)
   - Policy gate reasoning (SQL guard + access control design)

---

## Quick Commands Reference

| Command | What it Does |
|---|---|
| `npm run smoke` | Health check: Zetaris + Meterless connectivity |
| `npm run demo:sample` | Deterministic governance scenario (no LLM) |
| `npm run demo` | Live 5-seat debate with Zetaris data + Meterless LLM |
| `npm run web` | Interactive UI at http://127.0.0.1:8787 |
| `npm test` | 57 unit tests (Gravity, Meterless, SQL guard, workflow) |
| `npm run test:e2e` | Playwright browser test with video recording |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "Zetaris unreachable" | Ensure `docker ps` shows zetaris containers running. Check `.env.local` REST URL. |
| "Meterless unauthorized" | Verify token in `.env.local` matches active runtime session. |
| "No tables found in database" | Run `npm run smoke` first to verify connectivity. |
| "Governance topic not appearing" | Set `GOVERNMINDZ_TOPIC` before `npm run demo`. |

---

## What Judges Will See

1. **Your Debate Transcripts:** 5-seat agents reasoning about real data governance
2. **Audit Ledger:** Unbroken SHA-256 hash chain proving reasoning provenance
3. **Web UI Demo:** Interactive visualization of debate state + evidence
4. **Sample Queries:** Your agents querying live Zetaris databases
5. **Governance Decisions:** Explicit policy recommendations with dissent/consensus tracking

---

## Submission Checklist

- [ ] All 8 Zetaris databases queryable and documented
- [ ] Governmindz agent debates running with real Zetaris data
- [ ] At least 1 sample audit trail (`.jsonl` with hash chain)
- [ ] Web UI tested and working at http://127.0.0.1:8787
- [ ] `.env.local` credentials secure and not committed
- [ ] Demo video or transcript captured
- [ ] Governance decision document or guidance provided

---

**Status: READY FOR HACKATHON SUBMISSION**

Your agent is configured to understand and query real federated data from Zetaris, reason about governance with a 5-seat deliberative system, and produce cryptographically-signed audit trails of its reasoning. You have 8 queryable databases with 40+ tables ready for demonstration.

Good luck with your submission!
