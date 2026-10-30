# Judge Demo Quick Reference

Three demos. Every demo runs in deterministic
Demo Mode with no API keys and no network access.

## Run the demos

```bash
npm run web
# Open http://127.0.0.1:8787
```

Demo Mode is selected by default. Pick a card, then click **Start Demo**.

After any demo reaches its final card, click **Explore Zetaris Data** (or open
**Trust & Evidence**) to show the interactive evidence explorer: exact SQL,
search, column sorting, row inspection, raw JSON, and CSV/JSON downloads. The
same dataset is labeled as live Zetaris, deterministic scenario, or synthetic
fallback. Full integration guide: [`Zetaris.md`](Zetaris.md).

For a CLI run of the same scenario (works in PowerShell and POSIX shells):

```bash
node --import tsx apps/gateway/src/sample.ts --scenario input_examples/01-fragmented-intelligence.json
node --import tsx apps/gateway/src/sample.ts --scenario input_examples/02-explain-why.json
node --import tsx apps/gateway/src/sample.ts --scenario input_examples/03-reasoning-architecture.json
```

---

## Demo 1 — Solving Fragmented Intelligence

**Card:** `1. Solving Fragmented Intelligence`

**What to watch:** The Data Crew reconciles three conflicting supplier records
(ERP Postgres export, Logistics Ticket API, Vendor Risk feed). The Fact Checker
attributes every claim to its source and freshness; the Cloud Architect defines a
provenance-weighted reconciliation rule; the Synthesizer publishes one canonical
delivery date without inventing missing timestamps.

**What judges want to see:**
- Discovery and joining of fragmented, heterogeneous data sources.
- Explicit source-system and freshness attribution.
- Conflict preservation before resolution, not silent overwriting.

**Look for:** `SUP-8021` resolves to `2026-11-14`; `SUP-4419` stays delivered;
the final answer cites all three silos and the audit chain stays intact.

---

## Demo 2 — The Agent That Can Explain Why

**Card:** `2. The Agent That Can Explain Why`

**What to watch:** The council tests the board's pricing hypothesis against SMB
retention telemetry. The evidence falsifies it: cohorts with 0% price change
churned just as hard while p99 latency spiked to 1.8–1.9 seconds. The final
answer explains the causal chain, cites the telemetry rows, and discloses limits.

**What judges want to see:**
- Multi-step investigation across data sources.
- Competing hypotheses and unsupported-claim challenges.
- An evidence-backed answer that explains *why*, including caveats.

**Look for:** enterprise churn stays at 2.1% despite the same price increase;
SMB churn tracks reliability degradation; `Final Executive Explanation` appears
in the final synthesis card.

---

## Demo 3 — Reasoning Architecture

**Card:** `3. Reasoning Architecture`

**What to watch:** The agent processes four clinic scheduling requests against
operational policy rules, historical H-MEM precedents, and audit constraints.
It allocates the single available operating room to the Level 1 emergency,
escalates the Level 2 transfer with a telemetry-bay fallback, and queues the
remaining requests by policy.

**What judges want to see:**
- A deterministic reasoning path from data to a decision.
- Policy gates and precedent retrieval before action.
- Cryptographic auditability of every consequential step.

**Look for:** `REQ-701` gets OR 1; `REQ-704` transfers with a Telemetry Bay B
fallback; every decision cites a policy rule and a precedent; the audit chain
reports verified integrity. Click **Explore Zetaris Data** and inspect the
`request_id`, `patient_tier`, `acuity_score`, and `policy_precedent_id` fields.

**Full walkthrough:** [`TRACK_03_REASONING_GUIDED_DEMO.md`](TRACK_03_REASONING_GUIDED_DEMO.md)
covers the complete Track 03 demo, including the data query, evidence, teams,
final outputs, full records, and the Zetaris/Meterless setup for Live Mode.

---

## Evaluation Criteria

The project is evaluated across Impact, Technical, Innovation, Demo,
Product & UX, and Sponsor Tech. Each demo is built to make evaluation easy:

| Criterion | Evidence in the demos |
| :--- | :--- |
| Impact | Real supplier, retention, and clinical decision workflows with explicit users and consequences. |
| Technical | Deterministic sample engine, typed event contracts, barrier synchronization, SQL read-only gate, and SHA-256 audit chain. |
| Innovation | Role-separated adversarial debate plus provenance-aware reconciliation and policy-gated reasoning. |
| Demo | Three focused end-to-end runs with visible evidence, disagreement, and final synthesis. |
| Product & UX | One-card launch, paced multi-agent presentation, pause/resume, and download-ready final decisions. |
| Sponsor Tech | Zetaris federated evidence and Meterless/NVIDIA model routing are part of the reasoning path, not decoration. |

**Primary demo:** Demo 2 — The Agent That Can Explain Why. The
other two demos show the same architecture applied to Demo 1 and Demo 3.

---

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run zetaris:check
npx playwright test tests/e2e/demo-scenarios.spec.ts
```

`npm run zetaris:check` requires live Zetaris credentials in `.env.local`; it
fails if the client returns synthetic fallback data. The Playwright test
launches all three demos, asserts that each reaches its final synthesis card
without a run failure, then exercises the Zetaris explorer (search, sort, row
inspection, raw JSON, and CSV/JSON downloads).
