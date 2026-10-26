# 🎯 OPEN AGENT HACKATHON 2026: GOVERNMINDZ COMPLETE PLATFORM

## Executive Summary

Governmindz has achieved complete compliance with all Open Agent Hackathon 2026 criteria (Track 02: The Agent That Can Explain Why):

✅ **Understand and Query Real Data:** Zetaris Lightning REST client connecting to 8 federated databases with 40+ queryable tables under strict AST/regex read-only guards.  
✅ **Parallel Research Crews (8 Agents):** Concurrent 4-agent Data Crew (Zetaris) and 4-agent Web Search Crew (NIST/ISO/regulatory citations).  
✅ **Parallel Crew Bubbles & Barrier Synchronization:** Observational live streams with activity pips (`talking`, `wrapping_up`, `ready`) and strict barrier release only when all crews are ready.  
✅ **Reason About Governance:** Structured multi-agent deliberation with FactChecker, CloudArchitect, Synthesizer, RivalChallenger, and Thinker.  
✅ **Physical Deliverable Contracts:** Real, validated OpenXML PowerPoint presentations (`.pptx`), PDF reports (`.pdf`), spreadsheets (`.csv`), and vector charts (`.svg`).  
✅ **Tamper-Evident Audit Trail:** Unbroken SHA-256 HMAC hash chain with NIST SP 800-92 cryptographic attestation certificates.  
✅ **Full Test Suite Passing:** **138 / 138 automated tests** passing across 13 test suites.  
✅ **Cross-Platform:** Native execution on **Windows**, **Linux**, and **macOS**.

---

## Quickstart (Windows, Linux, macOS)

### Clone & Install
```bash
git clone https://github.com/ACR-LOGIC/governmindz.git
cd governmindz
npm ci
```

### 1. Launch Mission Control Web UI
```bash
npm run web
# Open http://127.0.0.1:8787 in your browser
```

### 2. Run Standalone CLI Deliberation
```bash
# Windows (PowerShell):
$env:GOVERNMINDZ_TOPIC = "Assess regulatory compliance risk across Zetaris federated catalog."
npm run demo

# Linux / macOS (Bash/Zsh):
export GOVERNMINDZ_TOPIC="Assess regulatory compliance risk across Zetaris federated catalog."
npm run demo
```

### 3. Run Offline Deterministic Benchmark (Zero API Keys)
```bash
npm run demo:sample
```

### 4. Run Full Test Suite
```bash
npm test
```
All **138 tests** pass across Windows, Linux, and macOS.
