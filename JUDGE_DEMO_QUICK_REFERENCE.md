# ✅ Governmindz Hackathon: Complete Judge Demo Quick Reference

## 3-Demo Showcase (15 Minutes)

### DEMO 1: Zetaris Multi-Source Company Risk Analysis
**Windows (PowerShell):**
```powershell
$env:GOVERNMINDZ_TOPIC = "Our organization received acquisition offers from 7 Fortune 500 companies (Apple, IBM, Oracle, Walmart, Target, Ford, Tesla). Before accepting any partnership, assess regulatory compliance risk. Use Zetaris to cross-reference: (1) SEC_DATA financial volatility, (2) GLEIF_REST legal entity status, (3) COMPANY_DNS industry risk. Rank all 7 companies by governance risk. Which poses HIGHEST compliance risk?"
npm run demo
```

**Linux / macOS (Bash/Zsh):**
```bash
export GOVERNMINDZ_TOPIC="Our organization received acquisition offers from 7 Fortune 500 companies (Apple, IBM, Oracle, Walmart, Target, Ford, Tesla). Before accepting any partnership, assess regulatory compliance risk. Use Zetaris to cross-reference: (1) SEC_DATA financial volatility, (2) GLEIF_REST legal entity status, (3) COMPANY_DNS industry risk. Rank all 7 companies by governance risk. Which poses HIGHEST compliance risk?"
npm run demo
```

**What Judges Hear & See:**
- Parallel Crews: Data Crew queries 3 Zetaris tables while Web Search Crew retrieves regulatory standards.
- FactChecker: "Tesla 42% YoY growth anomaly - recommend verification".
- CloudArchitect: "Oracle missing LEI in GLEIF registry - cannot verify legal entity".
- Synthesizer: "Policy recommendation: RESTRICTED access for Tesla/Oracle, CONDITIONAL for Ford".

---

### DEMO 2: PII Re-identification Risk & Privacy Governance
**Windows (PowerShell):**
```powershell
$env:GOVERNMINDZ_TOPIC = "We want to share NY_TAXI data with researchers. Zetaris, join taxi_trips + drivers + zones + surge_pricing. For each driver, calculate: (1) trip frequency, (2) geographic footprint, (3) earnings profile. Create PII exposure score. Which drivers safe to anonymize? Which must be blocked? What privacy policy?"
npm run demo
```

**Linux / macOS (Bash/Zsh):**
```bash
export GOVERNMINDZ_TOPIC="We want to share NY_TAXI data with researchers. Zetaris, join taxi_trips + drivers + zones + surge_pricing. For each driver, calculate: (1) trip frequency, (2) geographic footprint, (3) earnings profile. Create PII exposure score. Which drivers safe to anonymize? Which must be blocked? What privacy policy?"
npm run demo
```

**What Judges Hear & See:**
- FactChecker: "Driver D12345: 5,847 trips in 3 zones = 92/100 PII exposure (HIGH)".
- Thinker: "Even pseudonymized, zone + earnings pattern = re-identifiable".
- Synthesizer: "Recommend: Block high-exposure drivers OR mandate de-identification".

---

### DEMO 3: Interactive Mission Control Web UI (Parallel Crews & Barrier Sync)
**Windows / Linux / macOS:**
```bash
npm run web
# Open http://127.0.0.1:8787 in browser
```

**What Judges See:**
- Real-time **Parallel Research Crew Bubbles** with independent progress streams.
- **Barrier Synchronization**: Observational bubbles remain visible until all required crews are ready; posts one combined summary before animated closure.
- Expressive Character Avatars (FactChecker, CloudArchitect, Synthesizer, RivalChallenger, Thinker, Supervisor, DesignAssistant).
- **Authoritative Deliverable Card** with direct download links (`.pptx`, `.pdf`, `.csv`, `.svg`) and separate `-evidence.json` exports.
- **Cryptographic Audit Ledger**: Block-by-block hash chain with NIST SP 800-92 proof validation.

---

## Complete Test Suite Verification (**114 / 114 Tests Passing**)

```bash
npm test
```

- **Cryptographic Audit Chain Verifier:** 8/8 PASS
- **Parallel Crew Barrier Synchronization:** 7/7 PASS
- **Crew Barrier Types & State:** 7/7 PASS
- **Supervisor Multi-Agent Workflow:** 12/12 PASS
- **Gravity Receipts & Master Key Crypto:** 5/5 PASS
- **Meterless Runtime Provider:** 12/12 PASS
- **Zetaris SQL Guard & Policy Gate:** 6/6 PASS
- **12-State Deterministic Engine:** 34/34 PASS
- **Scheduler & Adversarial Resilience:** 47/47 PASS

---

## Competitive Advantage Overview

| Feature | GovernMindz | Generic LLM Agents |
| :--- | :--- | :--- |
| **Data Access** | Read-only SQL guard over 8 federated databases | Unguarded or hallucinated queries |
| **Research Model** | Concurrent 4-agent Data Crew + 4-agent Web Crew | Single-agent sequential scraping |
| **Barrier Sync** | Coordinated parallel bubbles with barrier release | Uncoordinated or silent background threads |
| **Deliverables** | Physical `.pptx`, `.pdf`, `.csv`, `.svg` file generation | Plain text chat substitution |
| **Audit Trail** | Tamper-evident SHA-256 HMAC hash chain | Ephemeral, unverified chat history |
