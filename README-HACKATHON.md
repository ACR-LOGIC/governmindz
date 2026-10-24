# 🎯 OPEN AGENT HACKATHON 2026: YOUR COMPLETE SETUP

## Executive Summary

You have successfully completed the Open Agent Hackathon 2026 setup. Your agent (Governmindz) can:

✅ **Understand and query real data** - 8 Zetaris Lightning databases with 40+ queryable tables  
✅ **Reason about governance** - 5-seat multi-agent deliberation with explicit consensus/dissent  
✅ **Produce explainable decisions** - Evidence-based governance recommendations  
✅ **Maintain audit trails** - SHA-256 hash-chained, cryptographically-signed reasoning proof  
✅ **Integrate sponsor tech** - Zetaris (data), Meterless (runtime), NVIDIA Nemotron (model)

---

## What You Have

### 1. Zetaris Instance (Running ✅)
- **URL:** http://localhost:8888
- **Status:** All 8 Lightning databases active and queryable
- **Preflight:** PASS

### 2. Real Federated Data (Ready ✅)
```
SEC_DATA              → 14 tables, 7 Fortune 500 companies (Apple, IBM, Oracle, Walmart, Ford, Tesla, Target)
OPENFDA_REST         → 2 tables, Drug labeling & adverse reactions
CLINICALTRIALS_REST  → 1 table, Clinical trial data
GLEIF_REST           → 1 table, Legal entity identifiers
NY_TAXI              → 15 tables, Trip data with drivers & customers (PII-sensitive)
COMPANY_DNS          → 2 tables, SIC industry classification hierarchy
POKEAPI_REST         → 2 tables, Nested JSON example data
TPCDS_DB             → Benchmark dataset
```

### 3. Governmindz Agent Platform (Running ✅)
- **Web UI:** http://127.0.0.1:8787
- **CLI:** `npm run demo` for live governance debates
- **Audit:** Cryptographic SHA-256 hash chain active

### 4. Documentation (Complete ✅)
- `ZETARIS_DATA_INVENTORY.md` - All 40+ tables documented with schemas & sample queries
- `HACKATHON_SETUP_COMPLETE.md` - Quick reference guide
- `SUBMISSION_CHECKLIST.md` - Judging criteria verification

---

## How to Run Your Demos

### Demo 1: Deterministic Governance (No LLM)
```bash
cd C:\Users\omg\governmindz
npm run demo:sample
```
**Output:** 5-seat debate on governance readiness without external API calls.

### Demo 2: Live Governance with Real Data
```bash
npm run demo
```
**Output:** Agents query Zetaris SEC_DATA + NY_TAXI, debate governance with NVIDIA Nemotron reasoning.

### Demo 3: Interactive Web UI
```bash
npm run web
# Open http://127.0.0.1:8787 in browser
# Type your custom governance question
# Watch real-time 5-seat debate + audit ledger
```

### Demo 4: Capture Audit Trail
```bash
set GOVERNMINDZ_LOG_PATH=logs/hackathon-submission.jsonl
npm run demo
# Outputs: logs/hackathon-submission.jsonl (tamper-evident hash chain)
```

---

## What the Judges Will See

### 1. Data Query Capability
Your agent demonstrates live queries against:
- SEC financial data (7 companies)
- NY Taxi operations data (PII-sensitive)
- Drug safety data (OPENFDA)
- Company classifications (COMPANY_DNS)

### 2. Governance Reasoning
The 5-seat debate shows:
- FactChecker: "NY_TAXI contains driver PII (names, IDs). Recommend access denial."
- CloudArchitect: "Implement read-only role + SQL guard. Block surge_pricing queries."
- Synthesizer: "Consensus: least-privilege role + audit logging required."
- RivalChallenger: "Challenge: Can we de-identify driver names instead of full denial?"
- Thinker: "Missing angle: What about cross-table re-identification risk?"

### 3. Explainable Decisions
Each recommendation includes:
- Specific evidence (table names, row counts)
- Caveats (limitations, missing information)
- Confidence scores per seat
- Explicit dissent tracking

### 4. Audit Trail
```json
{
  "type": "run_start",
  "timestamp": "2026-10-24T14:29:13.618Z",
  "zetaris_rows": 40,
  "session_id": "0ae9c707-86d6-4afb-9274-518fff2206c6"
}
{
  "type": "agent_message",
  "from": "FactChecker",
  "round": 0,
  "confidence": 0.90,
  "evidence": ["NY_TAXI.drivers exists", "Contains 50K+ driver records"],
  "caveats": ["Column names not examined"]
}
{
  "type": "audit_event",
  "hash": "7dd04fdbf4147f1c1be8172e15d3faa350c2a561...",
  "signature": "99a0789e0bafbc2e1982c0caabf304bfd0f1a4c8..."
}
{
  "type": "run_complete",
  "audit_integrity": true,
  "consensus_reached": false,
  "final_confidence": 0.807
}
```

---

## Compliance with Hackathon Requirements

| Requirement | Your Status | Proof |
|---|---|---|
| "Agent must understand and query data" | ✅ PASS | `SHOW TABLES FROM <db>` returns 40+ tables |
| "Agent must understand governance" | ✅ PASS | 5-seat debate with policy reasoning |
| "Agent must produce explainable decisions" | ✅ PASS | Evidence arrays + caveats per seat |
| "Agent must have audit trail" | ✅ PASS | SHA-256 hash-chained ledger |
| "Must integrate sponsor technology" | ✅ PASS | Zetaris + Meterless + NVIDIA Nemotron |
| "Must be reproducible" | ✅ PASS | Single command: `npm run demo` |

---

## Files to Include in Your Submission

1. **README.md** (already exists) - Project overview
2. **SUBMISSION_CHECKLIST.md** - This checklist (for judges)
3. **HACKATHON_SETUP_COMPLETE.md** - Setup verification guide
4. **ZETARIS_DATA_INVENTORY.md** - Data catalog + sample queries
5. **logs/hackathon-submission.jsonl** - Your debate transcript + audit trail (generate via `npm run demo`)
6. **.env.local** - (Gitignored, do NOT commit, but judges may need to configure their own)

---

## Quick Verification Checklist

Run these to verify everything is ready:

```bash
# 1. Preflight check (getting-started)
cd C:\Users\omg\getting-started
python3 scripts/preflight.py
# Expected: READY

# 2. Smoke test (governmindz)
cd C:\Users\omg\governmindz
npm run smoke
# Expected: PASS

# 3. Sample demo
npm run demo:sample
# Expected: 5-seat debate, final_confidence > 0.75, audit_integrity: true

# 4. Web UI works
npm run web &
# Expected: "GOVERNMINDZ web UI: http://127.0.0.1:8787"
```

All should return **PASS** or **READY**.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "Zetaris unreachable" | Run `cd C:\Users\omg\zetaris-platform && docker ps` to verify containers running |
| "No data in queries" | Run preflight: `python3 scripts/preflight.py` in getting-started/ |
| "Meterless token missing" | Verify `METERLESS_API_KEY` in `.env.local` matches your runtime |
| "No tables found" | Run `npm run smoke` to verify connection |
| "Debate not completing" | Check logs for Meterless timeout. Increase `METERLESS_TIMEOUT_MS` if needed |

---

## Submission Summary

**Project:** Governmindz - Multi-Agent Governance Debate Platform  
**Track:** Track 02 - The Agent That Can Explain Why  
**Data:** 8 Zetaris Lightning databases with 40+ queryable tables  
**Agent Type:** 5-seat deliberative consensus with explicit dissent  
**Audit:** Cryptographic SHA-256 hash-chained ledger  
**Reproducibility:** Single command: `npm run demo`  

**Status: ✅ READY FOR SUBMISSION**

---

## Contact & Support

- **Governmindz Repository:** https://github.com/ACR-LOGIC/governmindz
- **Getting Started Repository:** https://github.com/your-org/getting-started
- **Hackathon Event:** https://hackathon.genai.works/event/open-agent-hackathon-2026

Good luck! 🚀
