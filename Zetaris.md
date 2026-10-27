# Zetaris Lightning in GovernMindz

This document explains what Zetaris does in GovernMindz, which demos use it,
how the agents interact with it, how the connection is configured, and how to
verify that the live read-only path is fully enabled.

Zetaris is a hackathon sponsor and the federated evidence layer of the
platform. It is not a decorative data source: every Zetaris result can become
grounded evidence in the deliberation, and the exact dataset can be inspected
after the run.

---

## 1. What Zetaris is

Zetaris Lightning is a federated data fabric that lets GovernMindz query
distributed enterprise sources through a single read-only SQL interface. In
this project it provides:

- **Federated data access** across relational, object-store, and REST-backed
  catalogs without copying the data into the application.
- **A read-only query surface** guarded by `assertReadOnlySql()` before any
  network call.
- **Deterministic demo evidence** through scenario datasets when no live
  credentials are configured.
- **Captured evidence** for every live run, including the exact SQL, result
  rows, and a canonical SHA-256 hash input.

The primary client is `ZetarisClient` in
`libs/core/src/integrations/zetarisClient.ts`. The resilient wrapper is
`ResilientZetarisClient` in
`libs/core/src/integrations/ResilientZetarisClient.ts`.

---

## 2. Role in the platform

Zetaris sits between the research agents and the final decision:

```text
User question
    ↓
Orchestrator / Supervisor
    ↓
Data Crew (4 specialists) ──────► Zetaris Lightning (read-only SQL)
    │                                  │
    │                                  ├─ exact query
    │                                  ├─ result rows
    │                                  └─ provenance / source metadata
    ↓
Fact Checker ──► Rival Challenger ──► Thinker ──► Synthesizer
    │
    └─ grounded claims, caveats, dissents, confidence

Web Crew ──────► external standards and counter-evidence
    ↓
Barrier synchronization
    ↓
Final synthesized decision + PDF deliverable + evidence export
    ↓
Trust & Evidence: SQL, rows, audit chain, interactive data explorer
```

The Data Crew is not allowed to invent schema or rows. The Fact Checker grounds
claims against the retrieved evidence; the Cloud Architect enforces the
read-only and least-privilege boundary; the Rival Challenger and Thinker probe
unsupported assumptions; the Synthesizer attributes the final answer to the
evidence.

---

## 3. How the agents interact with Zetaris

| Agent | Interaction |
| :--- | :--- |
| **Catalog & Schema Specialist** | Discovers databases, schemas, tables, and column families through read-only metadata queries. |
| **Record & Query Investigator** | Executes the scenario or live read-only SQL, retrieves rows, and reports record counts and limits. |
| **Pattern & Anomaly Detector** | Looks for cross-silo discrepancies, outliers, missing records, and boundary conditions in the returned data. |
| **Provenance & Limitations Analyst** | Checks query lineage, source provenance, row limits, access policy, and evidence completeness. |
| **Fact Checker** | Grounds each claim in the retrieved rows and rejects unsupported assertions. |
| **Cloud Architect** | Enforces read-only SQL, least privilege, statement limits, and zero-trust access boundaries. |
| **Rival Challenger** | Stress-tests the evidence, asks for receipts, and challenges unsupported interpretations. |
| **Thinker Agent** | Probes edge cases, missing evidence, and policy conflicts before the decision is finalized. |
| **Synthesizer** | Produces the final answer with evidence attribution and caveats. |
| **Supervisor** | Certifies the deliverable and ensures the validation/audit gate has passed. |
| **Web Crew** | Adds external standards and counter-evidence; it never replaces the Zetaris dataset. |

---

## 4. Where Zetaris is used in the demos

| Demo | Zetaris evidence | What it proves |
| :--- | :--- | :--- |
| **Track 01 — Solving Fragmented Intelligence** | `supplier_cross_silo_sync` across ERP, logistics, and risk-feed records. | Conflicting sources can be reconciled with explicit provenance and freshness instead of silent overwriting. |
| **Track 02 — The Agent That Can Explain Why** | `smb_retention_telemetry` across SMB and enterprise cohorts. | A pricing hypothesis can be falsified with evidence, and the real churn driver explained with caveats. |
| **Track 03 — Reasoning Architecture** | `clinic_queue_state` with policy rules and H-MEM precedents. | A policy-constrained decision can be traced from data to a validated queue and a cryptographic audit chain. |

Each scenario also has a deterministic sample dataset in
`input_examples/`. The same UI shows the exact SQL and rows in
**Trust & Evidence**, and the interactive explorer adds search, sort, row
inspection, raw JSON, and CSV/JSON downloads.

---

## 5. What Zetaris contributes to the project

- **Evidence instead of assertion:** the final answer points back to actual
  rows and an exact query.
- **Provenance-aware reconciliation:** conflicts are preserved and attributed
  to source systems rather than averaged away.
- **Auditability:** the captured evidence is linked to the audit and artifact
  chain.
- **Reproducibility:** the exact SQL can be copied and rerun in a Zetaris
  client.
- **Sponsor-tech depth:** Zetaris is central to the agent workflow, not a
  one-off integration shown in a side panel.
- **Safe live operation:** read-only guards and fail-closed live-mode checks
  prevent synthetic data from masquerading as production evidence.

---

## 6. Connection architecture

```text
Browser (Mission Control)
  │
  ├─ /api/run ──────────────► apps/web/server.ts
  │                              │
  │                              ├─ RunDebateApplicationService
  │                              ├─ debateRunner
  │                              ├─ research crews
  │                              └─ zetarisQueryHandler
  │                                      │
  │                                      ▼
  │                              ResilientZetarisClient
  │                                      │
  │                    ┌─────────────────┴─────────────────┐
  │                    ▼                                   ▼
  │             ZetarisClient                     ZetarisFallbackCatalog
  │             (live REST)                       (sample / synthetic only)
  │                    │
  │                    ▼
  │             Zetaris Lightning
  │             /sql-editor/sqls/run
  │
  └─ /api/evidence/<conversationId>  (live evidence snapshot)
```

The browser never receives the Zetaris API key. The server performs the query
and streams the resulting columns/rows back as events. The final card and
Trust view use that evidence.

---

## 7. Configuration

### 7.1 Required for live REST queries

| Variable | Purpose |
| :--- | :--- |
| `ZETARIS_REST_URL` | Zetaris Lightning REST base URL, for example `http://localhost:8888/api/v1.0`. |
| `ZETARIS_ORG_ID` | Zetaris organization identifier. |
| `ZETARIS_API_KEY` | REST API key used as the Bearer token. |
| `ZETARIS_API_AUTH` | Alternative REST auth token; used when `ZETARIS_API_KEY` is absent. |
| `ZETARIS_HOST` | Optional host fallback when `ZETARIS_REST_URL` is not set. |
| `ZETARIS_PORT` | Port used with `ZETARIS_HOST` (443 selects HTTPS). |
| `ZETARIS_DATABASE` | Default database/schema, normally `LIGHTNING_DB`. |
| `ZETARIS_USER` / `ZETARIS_USERNAME` | Optional user metadata for onboarding/display. |
| `ZETARIS_PASSWORD` | Optional JDBC password; the REST query path uses the API key/auth token. |
| `ZETARIS_DEMO_QUERY` | Optional override for demo scenarios and CLI/check discovery queries. |

The client resolves the REST base URL in this order:

1. An explicit `restUrl` constructor option.
2. `ZETARIS_REST_URL`.
3. `ZETARIS_HOST` + `ZETARIS_PORT` (with `/api/v1.0` appended).
4. `http://localhost:8888/api/v1.0`.

`.env.example` contains the full template. Never commit `.env.local`.

### 7.2 Configure from the UI

1. Open **System Settings** (gear icon or bottom-left button).
2. Open **Models & Providers**.
3. Click **Configure Credentials**.
4. In the **Zetaris Lightning Federated Data Engine** section fill in:
   - **Zetaris Host / Domain**
   - **Port**
   - **Database / Schema**
   - **REST API Key / Token** (required for the live REST query path)
   - **Username** and optional **JDBC Password**
5. Click **Save & Encrypt Credentials**.
6. Verify the status cards and the header `Zetaris` pill, then click
   **Check Connectivity** if needed.

Credentials entered in the UI are written to `.env.local` (gitignored) and an
AES-256-GCM encrypted copy is stored in `data/credentials.enc` using the local
key in `data/.master.key`. These files are local-only and must never be
committed. Protect `.env.local` as a plaintext secret file; the encrypted copy
does not remove that requirement.

### 7.3 Configure from `.env.local`

```dotenv
ZETARIS_REST_URL=http://localhost:8888/api/v1.0
ZETARIS_ORG_ID=1
ZETARIS_API_KEY=your_read_only_api_key
ZETARIS_DATABASE=LIGHTNING_DB
```

Restart the web server after editing `.env.local` if the process was already
running outside the credential modal.

---

## 8. Verify that Zetaris is fully enabled

### 8.1 Run the dedicated check

```bash
npm run zetaris:check
```

This performs a read-only discovery query and prints a safe summary. The query
is `ZETARIS_DEMO_QUERY` when set, otherwise `SHOW LIGHTNING DATABASES`. A healthy
live connection looks like:

```json
{
  "query": "SHOW LIGHTNING DATABASES",
  "columns": ["name", "description", "id"],
  "rows": 8,
  "total": 8,
  "source": "live_zetaris",
  "synthetic": false,
  "circuitBreakerState": "CLOSED"
}
Zetaris check PASSED: live read-only query returned non-synthetic data.
```

If the result contains `source: "synthetic_fallback"` or
`synthetic: true`, the check exits with a failure. The fallback is useful for
Demo Mode but is not proof of a live connection.

### 8.2 Check the platform health endpoint

With `npm run web` running:

```bash
curl -s http://127.0.0.1:8787/api/health
```

Confirm:

- `zetaris.ok: true`
- `zetaris.configured: true`
- `meterless.state: "online"` for a full live run

The header `Zetaris` pill and the Settings status card should also be green.

### 8.3 Check the exact evidence page

For a live conversation, open **Trust & Evidence** and click
**Verify raw evidence**. The evidence page shows:

- The exact SQL query.
- The captured result set.
- The source label (`Live Zetaris Lightning query`).
- The SHA-256 content hash over the canonical payload.

The corresponding API endpoints are:

```text
GET /api/evidence/<conversationId>
GET /api/evidence/<conversationId>/canonical
GET /evidence/<conversationId>
```

### 8.4 What was verified in this repository

A live local check was run with the configured credentials:

- `npm run zetaris:check` → `source: "live_zetaris"`, `synthetic: false`,
  `circuitBreakerState: "CLOSED"`; the configured `ZETARIS_DEMO_QUERY` returned
  14 non-synthetic rows.
- The server health probe and Settings status reported Zetaris as configured
  and reachable.

No credentials are printed in this document.

---

## 9. Sample mode vs live mode

| Behavior | Demo / sample mode | Live mode |
| :--- | :--- | :--- |
| Credentials | Not required | Zetaris + Meterless required |
| Query source | Scenario dataset / fallback catalog | Real Zetaris Lightning |
| Synthetic fallback | Allowed and labeled | Forbidden; live preflight fails closed |
| Evidence snapshot | Local UI data; demo history is local-only | Persisted in `data/conversations.db` and exposed through `/api/evidence/...` |
| Artifacts | `data/artifacts/` | `data/artifacts/` |
| Raw evidence page | Not shown for demo runs | `Verify raw evidence` link is shown |

The live preflight checks both Meterless and Zetaris before a run starts. It
rejects synthetic Zetaris fallback explicitly:

```text
Live mode unavailable: Zetaris returned a synthetic fallback. No demo or
synthetic data is permitted in live mode.
```

---

## 10. Interactive Zetaris data explorer

After a run, the final answer card includes an **Explore Zetaris Data** button.
It switches to **Trust & Evidence** and focuses the interactive explorer.

The explorer supports:

- **Exact SQL** display and copy.
- **Search** across every column.
- **Column sorting** (ascending, descending, then original order).
- **Row inspection** with a field-by-field detail panel and copy-row JSON.
- **Table / Raw JSON** view switching.
- **CSV** and **JSON** downloads of the full result set.
- **Row counts** and **source labels**: live Zetaris, deterministic scenario,
  or synthetic fallback.

The same explorer is available directly from the **Trust & Evidence** tab under
**Zetaris Lightning Federated Data Catalog**. It is also covered by the guided
product tour as the **Interactive Zetaris Evidence Explorer** step.

The explorer is intentionally read-only. It does not execute new SQL from the
browser; it visualizes the evidence already captured by the server for the run.

---

## 11. Read-only and security model

- **SQL guard:** `assertReadOnlySql()` allows only `SELECT`, `WITH`, `SHOW`,
  `DESCRIBE`, `DESC`, and `EXPLAIN`; it rejects writes, DDL, `INTO`, `FOR UPDATE`,
  multiple statements, and over-long SQL before dispatch.
- **Read-only account:** the recommended Zetaris credential is a read-only role
  with `SELECT` and metadata permissions only. The client-side guard is defense
  in depth, not a substitute for database authorization.
- **Server-side execution:** the API key stays on the server; the browser only
  receives query results and evidence metadata.
- **Redaction:** HTTP error details are redacted for the configured API key.
- **Local secret storage:** `.env.local` is gitignored; `data/credentials.enc`
  and `data/.master.key` are under the gitignored `data/` directory.
- **Evidence integrity:** live evidence snapshots include a SHA-256 hash of the
  canonical `{query, columns, rows, total}` payload.

---

## 12. Troubleshooting

| Symptom | Check |
| :--- | :--- |
| `npm run zetaris:check` returns `synthetic_fallback` | `ZETARIS_REST_URL`, `ZETARIS_ORG_ID`, `ZETARIS_API_KEY`/`ZETARIS_API_AUTH`; server reachability. |
| HTTP 401/403 | API key/token or org id is wrong, expired, or lacks permission. |
| `Zetaris host not configured` in `/api/health` | Set `ZETARIS_HOST` or `ZETARIS_REST_URL` in `.env.local` or the credential modal. |
| Live mode says Zetaris credentials are missing | The live preflight requires a REST URL/host and API key/auth token. |
| Live mode says Zetaris returned synthetic fallback | The live Zetaris endpoint was unreachable; live mode deliberately refuses fallback data. |
| The explorer shows “Deterministic scenario” | You are in Demo Mode. That label is expected for the track demos. |
| The `Verify raw evidence` link is missing | It appears only for live conversations with a captured Zetaris dataset. |
| Query succeeds but rows are empty | Inspect the catalog/table name and row limit; use `SHOW LIGHTNING DATABASES` to confirm access. |

---

## 13. Relevant files

| File | Responsibility |
| :--- | :--- |
| `libs/core/src/integrations/zetarisClient.ts` | REST client, URL resolution, read-only guard, response mapping, token redaction. |
| `libs/core/src/integrations/ResilientZetarisClient.ts` | Circuit breaker and labeled synthetic fallback. |
| `libs/core/src/integrations/ZetarisFallbackCatalog.ts` | Offline catalog and synthetic scenario data. |
| `apps/gateway/src/tools/zetaris.tools.ts` | MCP tool registration, policy gate, query handler. |
| `apps/web/server.ts` | Live preflight, evidence snapshots, health probe, evidence/artifact endpoints. |
| `apps/web/src/components/evidence/ZetarisDataExplorer.tsx` | Interactive table, sorting, filtering, row inspection, raw JSON, downloads. |
| `apps/web/src/components/evidence/TrustEvidenceView.tsx` | Evidence catalog, web citations, audit ledger, evidence page link. |
| `scripts/check-zetaris.ts` | Safe live-connection verification (`npm run zetaris:check`). |
| `.env.example` | Required and optional Zetaris variables. |

---

## 14. Verification commands

```bash
npm run typecheck
npm test
npm run build
npm run zetaris:check
npm run web
# curl -s http://127.0.0.1:8787/api/health
```

For the Track 03 demo and the explorer, see
[`TRACK_03_REASONING_GUIDED_DEMO.md`](TRACK_03_REASONING_GUIDED_DEMO.md).
