# Track 03 — Reasoning Architecture: Complete Guided Demo

This is a single-demo, start-to-finish walkthrough for the
Track 03 scenario: **Reasoning Architecture**. It explains what to click,
what you should see, and where every important artifact lives — the data query,
the evidence, the teams, the conversation, the final outputs, the full records,
and the Zetaris/Meterless setup required before switching to Live Mode.

The demo is deterministic and runs without API keys. It takes roughly 60–90
seconds in the browser because the conversation is intentionally paced.

### Platform in one paragraph

GovernMindz is a local-first decision workspace. It runs two parallel research
crews, streams their evidence into a role-separated council, applies
policy and memory constraints, records every step in a tamper-evident audit
chain, and releases only deliverables that pass a physical validation gate.
The same interface that runs deterministic Demo Mode scenarios can be connected
to a real Zetaris federated catalog and Meterless/Nightshift runtime for Live
Mode.

---

## 1. What this demo proves

The official Track 03 challenge is to turn **data, knowledge, memory, and
reasoning into reliable decisions and actions**. This demo shows that in one
clinical scheduling decision:

- Four clinic requests with different acuity levels compete for limited rooms.
- The agent retrieves policy rules and historical H-MEM precedents.
- The council debates the allocation, challenges assumptions, and checks edge cases.
- The final decision is a policy-compliant queue, not a free-form answer.
- Every decision is anchored in a SHA-256 audit chain.
- The result is delivered as a validated PDF plus a supplementary evidence export.

### Judge lens

| Criterion | What this demo puts on screen |
| :--- | :--- |
| **Impact (30)** | A real scheduling decision with patient acuity, operating-room capacity, transfer risk, and policy consequences. |
| **Technical (20)** | Deterministic state machine, policy gates, H-MEM precedent retrieval, barrier-synchronized crews, typed event envelope, SHA-256 audit chain. |
| **Innovation (15)** | Role-separated adversarial debate applied to a policy decision, with explicit evidence and caveats. |
| **Demo (15)** | One focused scenario with a clear beginning, visible reasoning, and a downloadable result. |
| **Product & UX (10)** | One-card launch, paced conversation, pause/reset controls, confidence telemetry, and export actions. |
| **Sponsor Tech (10)** | Zetaris federated evidence and Meterless/NVIDIA routing are part of the reasoning path, not a side panel. |

---

## 2. Before you start

### Requirements

- Node.js 22 or later.
- Dependencies installed from the repository root.
- A browser at `http://127.0.0.1:8787`.
- No Zetaris, Meterless, or cloud credentials are needed for this walkthrough.

```bash
npm install
npm run web
# Open http://127.0.0.1:8787
```

`npm run web` builds the web client first, starts the local server, and opens the
Mission Control interface. Demo Mode is the default on first launch.

> If you only want the CLI version of the same scenario, see the appendix. The
> browser walkthrough is the best way to show the platform to judges.

### Screen map

```text
+------------------------------------------------------------------------------+
| GovernMindz  Mission Control   [Conversation] [Execution] [Trust & Evidence] |
|                                     [Meterless] [Zetaris] [Demo Mode] [gear] |
+---------------+----------------------------------------------+---------------+
| New AI Debate | Council Stream                               | Agent Roster  |
| Demo / Live   | Messages, confidence bars, Details inspector | 16/16 active  |
| Governance    | Parallel Research Crews                      | Confidence    |
| Template      | Final Synthesized Governance Decision        | Audit ledger  |
| History       | Professional Outputs                         | Sponsor stack |
|               | Composer + Start Demo                        |               |
+---------------+----------------------------------------------+---------------+
| System Settings - v0.1.0                                                    |
+------------------------------------------------------------------------------+
```

---

## 3. Start the Track 03 demo

1. Confirm the mode pill in the header says `Demo Mode`. If it says `Live Mode`,
   click it and switch back to demo before continuing. This walkthrough does not
   require live credentials.
2. In the center composer, find the three demo cards under `Demo Mode Scenarios`.
3. Select **`3. Reasoning Architecture`**. The card label is
   `Track 03 · Reasoning Architecture`.
4. Confirm the selected prompt preview reads:

   > Process high-priority clinic scheduling and resource allocation requests by
   > evaluating operational policies, historical H-MEM precedents, and
   > cryptographic audit constraints.

5. Click **`Start Demo`**.

### Checkpoint 1 — the run has started

Within a few seconds you should see:

- A new history entry under `Today`: **`3. Reasoning Architecture`**.
- The first operator message in the conversation.
- The Orchestrator’s convening message: “Inquiry initiated in SAMPLE mode.
  Council convening for deliberation.”
- The right sidebar change from `Roster Empty` to **`Agent Roster`** with
  **`16/16 active`**.
- The composer button changes to **`Deliberating…`**.

> **Presenter cue:** “This is not a single chatbot turn. The orchestrator has
> created a run, assigned roles, and assembled the council and research crews.”

---

## 4. Stage 1 — The teams assemble

### Where to look

- **Right sidebar → `Agent Roster`**: every participating agent, with a role,
  a task, a live status, and a confidence value when one is available.
- **Conversation header**: each message shows the human persona and role, for
  example `Priya · Fact Checker`, `Marcus · Cloud Architect`, and
  `Val · Synthesizer`.
- **Assignments message**: the council’s focus areas are listed in the
  conversation as the run begins.

The roster is larger than the five-seat debate council. It includes:

- **Council and orchestration seats:** Fact Checker, Cloud Architect,
  Synthesizer, Rival Challenger, Thinker Agent, Context Agent, Workflow
  Supervisor, and the Orchestrator.
- **Data Crew (4 specialists):** Catalog & Schema Specialist, Record & Query
  Investigator, Pattern & Anomaly Detector, and Provenance & Limitations
  Analyst.
- **Web Crew (4 specialists):** Regulatory & Standards Verifier, Freshness &
  Domain News Researcher, Academic & Scholarly Analyst, and Counter-Evidence &
  Dispute Investigator.

### What to click

1. Click any roster entry, for example **`Priya · Fact Checker`**.
2. The **Agent Detail Drawer** opens on the right. It shows:
   - Current status and persona.
   - Domain focus and calibrated confidence.
   - The delegated job task.
   - **Live Reasoning & Hypothesis Watcher**.
   - **Reasoning Records & Assertions**, including verified grounding evidence,
     operational caveats, supports, and dissents.
   - The role mandate and deliberation history.

> **Presenter cue:** “The teams are visible before the answer is. Each seat has
> a job, and the platform records what it was asked to verify.”

---

## 5. Stage 2 — Parallel research crews

### Where to look

While the research phase is running, the conversation shows a
**`Parallel Research Crews`** panel between messages:

- **`Data Research Crew (Zetaris)`** with a database icon.
- **`Web Search Crew (External Standards)`** with a globe icon.
- A barrier badge that reads **`Barrier Locked`**, then **`Barrier Ready (2/2)`**
  when both crews finish.
- Two independent, scrollable crew logs with entries such as
  `DataCrew-Catalog`, `DataCrew-Query`, `DataCrew-Anomaly`, and
  `DataCrew-Provenance`.

Each crew log is an observable channel, not a hidden background job. The crew
entries show:

- What was assigned.
- What data source was examined.
- What query or check was performed.
- What anomaly or limitation was found.
- The final crew verdict.

If the crew panel has already closed by the time you reach this step, the
harmonized crew briefing remains in the conversation, and the data evidence is
still available in `Trust & Evidence`.

### The pause trick

If the crew bubbles are moving too quickly for the room, use the demo controls
that appear in the conversation header:

- **`Pause`** freezes the presentation.
- **`Resume`** continues it.
- **`Reset demo presentation`** clears the presentation queue.

This does not stop the backend run; it only pauses the display pacing.

### Where is the data query during this stage?

There are two related places:

1. **Crew log:** the Query Investigator’s entries describe the query activity
   and record counts.
2. **Trust & Evidence:** after the run, the exact SQL and the captured result
   set are shown in full. This is the authoritative view for the scenario data.

For this Track 03 scenario the exact query is:

```sql
SELECT request_id, patient_tier, acuity_score, requested_specialty,
       provider_capacity, policy_precedent_id
FROM clinic_queue_state
```

The Trust view displays the captured rows as:

| request_id | patient_acuity | specialty | operating_rooms_free | policy_rule | hmem_similarity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| REQ-701 | Level 1 (Critical Emergency) | Cardiac Surgery | 1 | POL-EMERGENCY-OVERRIDE | 0.98 (Case #2024-88) |
| REQ-702 | Level 3 (Urgent Specialist) | Neurology | 0 | POL-QUEUE-PRIORITY | 0.91 (Case #2025-14) |
| REQ-703 | Level 4 (Elective Routine) | Orthopedics | 2 | POL-FIRST-COME-FIRST-SERVED | 0.84 (Case #2026-03) |
| REQ-704 | Level 2 (High Acuity Urgent) | Cardiac Surgery | 0 | POL-TRANSFER-ESCALATE | 0.95 (Case #2025-99) |

The card above the table shows **`4 sources discovered`** and the exact SQL with
the annotation **`read-only · 50 row limit`**. In Demo Mode this is cached
deterministic data; in Live Mode the exact captured dataset is linked from the
same section after the run.

> **Presenter cue:** “This is the data query. The crew used a read-only,
> row-limited statement over the clinic queue. The exact SQL and the exact rows
> are inspectable later in Trust & Evidence.”

### Why the web citations area may be empty

The Track 03 scenario is primarily a policy-and-precedent decision over a small
clinical dataset. The Web Crew still contributes standards and counter-evidence
to the deliberation, but the **`Authoritative Web Citations & Regulatory
References`** section in Trust & Evidence can be empty for this scenario. That is
expected; it is not a failed run. Point to the Data Crew findings, the H-MEM
precedent references, and the audit ledger instead.

---

## 6. Stage 3 — The council debates the decision

The tracked scenario resolves four requests:

| Request | Request type | Constraint | Policy | Precedent | Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- |
| REQ-701 | Level 1 critical emergency, cardiac surgery | 1 room free | `POL-EMERGENCY-OVERRIDE` | Case #2024-88, 0.98 match | Immediate OR 1 |
| REQ-704 | Level 2 high-acuity urgent, cardiac surgery | 0 rooms free | `POL-TRANSFER-ESCALATE` | Case #2025-99, 0.95 match | Transfer with Telemetry Bay B fallback |
| REQ-702 | Level 3 urgent specialist, neurology | 0 rooms free | `POL-QUEUE-PRIORITY` | Case #2025-14, 0.91 match | Neurology queue hold |
| REQ-703 | Level 4 elective routine, orthopedics | 2 rooms free | `POL-FIRST-COME-FIRST-SERVED` | Case #2026-03, 0.84 match | Elective OR 2 |

### Where to look in the conversation

- **`Priya · Fact Checker`** states the policy match for REQ-701 and the
  operating-room constraint that forces REQ-704 into escalation.
- **`Marcus · Cloud Architect`** adds the operational/security boundary and the
  immutable execution ledger.
- **`Val · Synthesizer`** publishes the final queue and the audit claim.
- **`Arturo · Rival Challenger`** stress-tests assumptions and asks for
  cryptographic receipts.
- **`Lucy · Thinker Agent`** probes the edge case: what happens if the ICU
  transfer is delayed by weather or transit?
- **`Elena · Workflow Supervisor & Release Authority`** certifies the
  deliverable contract and the final release.

Each agent message includes:

- A **Self-Confidence** bar.
- An **Expert Agreement** value when available.
- A **`Details`** button.
- A **`View Reasoning Records`** link.
- Audio, copy, thumbs-up/down, and timestamp controls.

### Inspect one message

1. Click **`Details`** on a message.
2. The **Execution & Deliberation Inspector** opens under the message and shows:
   - Message type, for example `Consensus Vote`, `Adversarial Challenge`, or
     `Initial Proposal`.
   - The round number.
   - The reply target, when the message is a rebuttal.
   - Response latency.
   - The execution task ID.
   - The domain task assignment.
   - Referenced evidence IDs when the message envelope contains them.
3. Click **`View Reasoning Records`** to open the agent drawer. It aggregates:
   - Verified grounding evidence.
   - Caveats and policy limits.
   - Peer supports and dissents.
   - The full deliberation history for that agent.

> **Presenter cue:** “Every claim has an owner, a confidence value, a round, and
> a task ID. The debate is not hidden behind a single final answer.”

---

## 7. Stage 4 — Final synthesis and outputs

Wait for the final card. The presentation queue intentionally reveals messages
in order, so the artifact card appears after the final message has been
displayed. Wait for the toast **`AI Deliberation complete · Cryptographic audit
verified`** and the artifact section to appear before downloading anything.

### The final card

The card is titled **`Final Synthesized Governance Decision`** and shows:

- **`Consensus Reached`**.
- **`85.0% Calibrated Confidence`**.
- The final position:

  > Consensus calibrated! Final Reasoning Architecture Decree: Generated
  > prioritized, policy-compliant clinical allocation queue (REQ-701 Immediate
  > OR1 -> REQ-704 Transfer with Telemetry Bay B fallback -> REQ-702 Neuro Hold
  > -> REQ-703 Elective). Every decision is grounded in operational policy,
  > verified against historical precedent, and anchored in an immutable
  > cryptographic audit ledger.

- **`Verified Governance Evidence`**:
  - 100% adherence to clinical emergency override policies.
  - H-MEM precedent verification confirms zero precedent deviation.
  - Cryptographic audit trail receipt attached to discharge queue.
- **`Production Scope Caveats`**:
  - Follow-up telemetry review at T+4 hours.
- **Footer metadata**:
  - Method: `synthesizer`
  - Rounds: `2 deliberate cycles`
  - Audit chain: `Verified`
  - Status: `Completed`

### The primary deliverable

The card includes a **`PDF Deliverable`** with a `Supervisor Approved` badge and
a four-stage release strip:

1. `Research Complete`
2. `Reasoning Verified`
3. `Artifact Created`
4. `Delivery Released`

Use:

- **`View / Open File`** to open the PDF.
- **`Download (4 KB)`** to save it.
- **`Download Evidence Export (JSON)`** to save the supplementary evidence.

Expected filenames for this scenario:

```text
data/artifacts/process-high-priority-clinic-sch-briefing.pdf
data/artifacts/process-high-priority-clinic-sch-briefing-evidence.json
```

The evidence export is explicitly marked **`strictly supplementary`**. It does
not replace the PDF deliverable.

### The Professional Outputs suite

Below the evidence and caveats, the card exposes:

- **`PDF Report`**
- **`Spreadsheet (CSV)`**
- **`Word / Docs`**
- **`Visual Diagram & Charts`**
- **`Present & Share`**

`Present & Share` opens the presentation modal for a fullscreen executive slide
deck. The CSV and Word exports contain the conversation, decision, evidence, and
audit context for further analysis.

### Explore the Zetaris data interactively

After the final message is visible, click **`Explore Zetaris Data`** on the
final card. The app switches to **Trust & Evidence** and focuses the
**Interactive Zetaris Evidence Explorer** (`#tour-zetaris`).

You can also open it directly from **Trust & Evidence** under
**`Zetaris Lightning Federated Data Catalog`**. The explorer supports:

- Searching every column.
- Sorting by `request_id`, `patient_tier`, `acuity_score`, and the other fields.
- Inspecting a row field by field and copying its JSON.
- Switching between table view and raw JSON.
- Copying the exact SQL.
- Downloading the full result set as CSV or JSON.

The source badge reads **`Deterministic scenario`** in Demo Mode and
**`Live Zetaris`** for a live query. The guided product tour covers
this view as step 6, **Interactive Zetaris Evidence Explorer**. For the full
Zetaris architecture and credential guide, see [`Zetaris.md`](Zetaris.md).

### Wait for the artifact

If the final card is visible but the PDF card is not, the presentation queue is
still draining the `artifact_ready` and `complete` events. Wait a few seconds.
Do not click another demo or reload the page while the run is finishing.

---

## 8. Stage 5 — Verify the reasoning

### 8.1 Trust & Evidence: the exact data

Click **`Trust & Evidence`** in the header. This view is the evidence and
integrity cockpit.

**`Zetaris Lightning Federated Data Catalog`**

- The exact SQL statement.
- The annotation `read-only · 50 row limit`.
- The `4 sources discovered` count.
- The captured clinic queue table with `REQ-701` through `REQ-704`.
- An interactive explorer with search, sortable columns, row inspection, raw
  JSON, copy SQL/row, and CSV/JSON downloads.
- A source badge: **`Deterministic scenario`** in Demo Mode or **`Live Zetaris`**
  when the rows came from a live query.

This is where you answer: **“Where is the data query?”** Point to the SQL box,
then point to the four rows that the decision used. Click **`Explore Zetaris
Data`** from the final card or `#tour-zetaris` in this view to demonstrate the
interactive version. In Demo Mode this is the deterministic scenario dataset;
in Live Mode the same view exposes a **`Verify raw evidence`** link after a run.
The full Zetaris guide is [`Zetaris.md`](Zetaris.md).

### 8.2 Trust & Evidence: the audit ledger

Scroll to **`Tamper-Evident SHA-256 Cryptographic Ledger`**.

You should see:

- The `RFC-6962 / NIST SP 800-92` badge.
- **`Cryptographic Audit Trail Verified Unbroken`** with status `VERIFIED`.
- **`All 9 blocks sealed with valid HMAC-SHA256 signatures and continuous hash
  links from genesis anchor.`**
- A **`TERMINAL HASH`** value.
- The **`Genesis Anchor Hash`**:
  `c910699e010057fee5424ddcb6751ac88b20169be78af84a4741e0754e5d8b59`.
- A block-by-block ledger. Expand a block to see:
  - Event type.
  - Timestamp.
  - Previous hash link.
  - Current block hash.
  - HMAC signature.

### 8.3 Demonstrate tamper evidence

The **`Tamper Lab`** lets you prove the ledger is not decorative:

1. Click **`Simulate Payload Mutation`**. The ledger should mark the affected
   block as invalid and show an integrity-compromised banner.
2. Click **`Restore Pristine Trail`** to restore the real chain.
3. Optionally click **`Simulate Link Break`** and restore again.

This only mutates the in-memory working copy in the browser; it does not alter
the original run record. It is safe to demonstrate and then restore.

Export the proof with:

- **`Proof JSON`** — machine-readable audit proof certificate.
- **`Print Certificate`** — printable compliance certificate.

### 8.4 Execution Explorer: the reasoning path

Click **`Execution`** in the header. You should see:

- **`Deterministic Workflow Execution Explorer`**.
- **`Inquiry Complexity: 6 / 10`**.
- **`Status: COMPLETED`**.
- The state progression:
  `RECEIVED → ASSESSED → CONTEXT_READY → RESEARCHING → DEBATING →
  FINAL_REVIEW → COMPLETED`.
- **`Chronological Transition Log`** with timestamps, triggers, and actors.

This is the audit-friendly reasoning path. The timeline summarizes the research
phase; the exact scenario SQL and captured rows remain in **Trust & Evidence**.

### 8.5 The right sidebar

Keep the right sidebar visible during the walkthrough. It shows:

- **`Agent Roster`** with `16/16 active`.
- **`Confidence Trajectory`** with a `Target 75%` guideline and per-seat traces.
- **`Final Deliberation`** with `Consensus Achieved`, `synthesizer`, and the
  final calibrated confidence.
- **`Cryptographic Ledger`** with the audit event count, `HMAC Verified`, and the
  genesis hash.
- **`Sponsor Stack`** for Zetaris Lightning and Meterless Runtime.

### 8.6 The conversation

The left history entry for this run is **`3. Reasoning Architecture`** with
**`12 messages · sample`**. The center header shows
**`All Deliberation (12)`** and **`Consensus & Conclusions Only`**. Scroll the
conversation to show the full arc: inquiry, crew work, debate, challenges,
policy checks, synthesis, and delivery.

---

## 9. Where is everything? Quick map

| What you need | Demo Mode location | Live Mode / server location |
| :--- | :--- | :--- |
| **Data query** | `Trust & Evidence → Zetaris Lightning Federated Data Catalog`; click `Explore Zetaris Data`; crew log entries during research | Same UI plus `Verify raw evidence` and `/api/evidence/<conversationId>` |
| **Interactive data** | `Explore Zetaris Data` on the final card or `Trust & Evidence`; search, sort, inspect rows, raw JSON, CSV/JSON downloads | Same explorer over the live captured dataset |
| **Evidence** | Final card `Verified Governance Evidence`; crew logs; agent drawer; evidence export JSON | Same UI plus captured evidence snapshot and `/evidence/<conversationId>` page |
| **Teams** | Right `Agent Roster`; message headers; `Parallel Research Crews` | Same UI; live crew events stream into the same panels |
| **Conversation** | Center `/ Conversation`; left history; `Details` inspector | Same UI; persisted to `data/conversations.db` |
| **Final answer** | `Final Synthesized Governance Decision` card | Same UI; persisted with the live conversation |
| **Primary output** | PDF card; `View / Open File`; `Download` | `data/artifacts/` and `/api/artifacts/<filename>` |
| **Evidence export** | `Download Evidence Export (JSON)` | `data/artifacts/<slug>-evidence.json` |
| **Full transcript** | `Export → Granular Outputs (.JSON)` or `Executive Briefing (.MD)` | `data/conversations.db` plus the same exports |
| **Audit trail** | `Trust & Evidence` ledger; `Export → Audit Ledger Stream (.JSONL)`; `Proof JSON` | Conversation audit events plus the audit certificate endpoints |
| **Reasoning path** | `Execution` tab timeline | Same UI; workflow events stored with the live conversation |
| **Credentials** | Not required for this demo | `Settings → Models & Providers → Configure Credentials` |

### Judge questions, answered

| Question | Answer |
| :--- | :--- |
| **Where is the data query?** | `Trust & Evidence → Zetaris Lightning Federated Data Catalog` shows the exact SQL, the read-only/50-row annotation, and the four captured clinic rows. Click `Explore Zetaris Data` for search, sorting, row inspection, raw JSON, and CSV/JSON downloads. The crew log also shows the query activity during research. |
| **Where is the evidence?** | Three visible layers: the final card’s `Verified Governance Evidence`, the agent drawer’s `Reasoning Records & Assertions`, and the crew logs. The full evidence export is downloadable from the final card and stored in `data/artifacts/`. |
| **Where are the teams?** | Right sidebar `Agent Roster` (16/16 active), the message header on every turn, and the `Parallel Research Crews` panel with separate Data and Web crew logs. |
| **Where is the conversation?** | The center `Conversation` view, the left history entry `3. Reasoning Architecture`, and the `All Deliberation (12)` filter. Every message also has a `Details` inspector. |
| **Where are the final outputs?** | The final card’s `PDF Deliverable` and `Download Evidence Export (JSON)`, the `Professional Outputs & Presentation Suite`, and the header `Export` menu. |
| **Where are the full records?** | `Trust & Evidence` for the audit ledger, `Execution` for the reasoning path, `Export → Granular Outputs (.JSON)` for the full conversation record, and `data/artifacts/` for the physical deliverable and evidence export. |
| **How do I verify the audit?** | `Trust & Evidence → Tamper-Evident SHA-256 Cryptographic Ledger`; use `Re-Verify Chain`, `Proof JSON`, and `Print Certificate`. The `Tamper Lab` lets you simulate mutation and restore the pristine chain. |
| **Where do I connect Zetaris and Meterless?** | `System Settings → Models & Providers → Configure Credentials`; then save, verify the header pills, and click the `Demo Mode` pill to switch to Live Mode. |
| **Where does live data go?** | Live conversations persist to `data/conversations.db`; artifacts go to `data/artifacts/`; the captured Zetaris snapshot is available at `/api/evidence/<conversationId>` and `/evidence/<conversationId>`. |

### What is inside the evidence export?

The supplementary evidence JSON is not just a text dump. It contains:

- `exportType`, `title`, `topic`, `contractId`, and `primaryDeliverableType`.
- `generatedAt`, final `confidence`, and `consensusMethod`.
- `auditHash` for the evidence record.
- `evidence[]` — the grounded evidence and citation list.
- `caveats[]` — the operational limits and scope warnings.
- `sections[]` — Executive Deliberation Summary, Data Crew Findings & Evidence
  Lineage, External Regulatory Standards & Citations, Adversarial Review &
  Dispute Reconciliation, and Actionable Governance Recommendations.
- `note` — the explicit statement that the export is supplementary and does not
  replace the primary deliverable.

The exact Zetaris dataset is shown in `Trust & Evidence` (and in the live
evidence page). The evidence export adds the crew findings, citations, caveats,
and audit hash around that dataset.

### Demo persistence is intentionally local-only

Demo conversations are not written to the server’s SQLite conversation store.
The demo history lives in the browser under the local storage key
`governmindz_demo_history_v1`. The final artifact and evidence export are still
written to `data/artifacts/` by the server-side generator.

For Live Mode, the full record is server-side:

- `data/conversations.db` — conversation, messages, evidence, audit events, and
  deliverable metadata.
- `data/artifacts/` — generated PDF/PPTX/CSV/SVG deliverables and evidence JSON.
- `/api/evidence/<conversationId>` — JSON evidence snapshot.
- `/api/evidence/<conversationId>/canonical` — canonical hash input.
- `/evidence/<conversationId>` — human-readable captured dataset page.

### CLI records

If you run the Track 03 scenario from the CLI, the reproducible records are:

```text
output_examples/03-reasoning-architecture.json
logs/03-reasoning-architecture.jsonl
```

---

## 10. Connect Zetaris and Meterless before going Live

Demo Mode does not need credentials. Use this section when you are ready to run
real queries against your own Zetaris cluster and Meterless/Nightshift runtime.

### Step 1 — Open Settings

1. Click the gear icon in the header or **`System Settings`** in the bottom-left.
2. Open the **`Models & Providers`** tab.
3. Confirm the two status rows:
   - **`Meterless Model Runtime`**.
   - **`Zetaris Lightning Federated Data`**.

### Step 2 — Let GovernMindz find Nightshift

Click **`Auto-detect Nightshift`**. The app scans localhost ports for a running
Nightshift endpoint. If it finds an online runtime, it records the base URL and
refreshes the model catalog.

If the runtime is unauthorized, the status message tells you to open
**`Configure Credentials`** and paste the current token. Do not paste an
OpenAI, Anthropic, Google, or NVIDIA provider key into GovernMindz. Add provider
keys inside the Nightshift cockpit; GovernMindz only needs the Nightshift base
URL and runtime token.

### Step 3 — Configure credentials

Click **`Configure Credentials`**. The **`Live Mode Credential Configuration`**
modal opens with three status cards:

- **`Meterless AI`** — configured or not set.
- **`Zetaris Lightning`** — configured or not set.
- **`Audit Secret`** — configured or using a test secret.

Fill in the fields:

**Meterless AI Runtime**

- **Base URL / Endpoint**: for example `http://127.0.0.1:8088/v1`.
- **Model Identifier**: for example `nemotron-3.5-lightning-30b-a3b`.
- **API Key / Token**: the runtime token from Nightshift.

**Zetaris Lightning Federated Data Engine**

- **Zetaris Host / Domain**: for example `sql.lightning.zetaris.io`.
- **Port**: for example `443`.
- **Database / Schema**: for example `LIGHTNING_DB`.
- **REST API Key / Token**: required for the live REST query path.
- **Username**: optional metadata for onboarding/display.
- **JDBC Password / Secret**: optional; the REST path uses the API key, not the
  JDBC password.

For the complete variable reference and connection architecture, see
[`Zetaris.md`](Zetaris.md).

**Cryptographic Audit Trail**

- **`AUDIT_TRAIL_SECRET`**: the HMAC signing secret for the audit chain.

Click **`Save & Encrypt Credentials`**. The success message should read:

> Configuration saved securely and encrypted at rest with AES-256-GCM.

Credentials are stored in the local encrypted vault (`data/credentials.enc`
with the local master key in `data/.master.key`) and mirrored into `.env.local`
for local use. Never commit `.env.local`, `data/credentials.enc`, or
`data/.master.key`.

### Step 4 — Verify connectivity

1. Close the credential modal.
2. Click **`Check Connectivity`** in the header.
3. The `Meterless` and `Zetaris` pills should turn green when reachable.
4. The `Models & Providers` tab should show `ONLINE` for Meterless and
   `CONNECTED` for Zetaris.
5. For a direct health check:

   ```bash
   curl -s http://127.0.0.1:8787/api/health
   ```

   Look for `meterless.state: "online"` and `zetaris.ok: true`.

6. For a direct Zetaris-only check:

   ```bash
   npm run zetaris:check
   ```

   A healthy result reports `source: "live_zetaris"`, `synthetic: false`, and
   `circuitBreakerState: "CLOSED"`. The command exits non-zero if the client
   falls back to synthetic data.

### Step 5 — Switch to Live Mode

1. Click the **`Demo Mode`** pill in the header.
2. The **`Switch to Live Execution Mode`** dialog opens.
3. Choose:
   - **`Yes — Show Demo Again`** to keep Demo Mode as the next-launch default
     while running this session live.
   - **`No — Open Live Mode Next Time`** to launch in Live Mode next time.
4. Click **`Confirm Live Mode`**.

If credentials are missing, Live Mode still opens the credential modal and tells
you real credentials are required. If credentials are present, the mode switches
immediately.

### Step 6 — What changes in Live Mode

- The three demo cards disappear; the composer becomes a free-text prompt.
- Live runs require both providers to be reachable.
- Live mode is fail-closed. It will not silently substitute demo or synthetic
  data.
- The immutable Zetaris dataset behind a live run is available from
  **`Trust & Evidence → Verify raw evidence`**.
- The live conversation and evidence snapshot are persisted in
  `data/conversations.db` and `data/artifacts/`.

Common fail-closed messages you may see:

```text
Live mode unavailable: Meterless is offline. Configure the Nightshift endpoint
and token in Settings.

Live mode unavailable: Zetaris credentials are missing. Configure
ZETARIS_REST_URL and ZETARIS_API_KEY in Settings.

Live mode unavailable: Zetaris returned a synthetic fallback. No demo or
synthetic data is permitted in live mode.
```

> The Track 03 scenario is a deterministic Demo Mode dataset. A live Zetaris
> catalog may not contain `clinic_queue_state`; Live Mode is for your real
> federated tables. Use the Track 03 demo to show the reasoning architecture,
> and use Live Mode to demonstrate the same governance path against your own
> catalog.

---

## 11. Troubleshooting

### The demo seems slow or stuck after the first message

The presentation queue intentionally paces messages. Wait for the
`Deliberating…` state to finish. If the presentation is paused, click
**`Resume`**. If needed, use **`Reset demo presentation`** or reload the page and
start the scenario again.

### The final card is visible but the PDF card is not

The artifact metadata arrives in the `complete` event after the final message is
displayed. Wait a few seconds for `AI Deliberation complete · Cryptographic audit
verified`. Do not reload while the run is finishing.

### The web citations section is empty

This is expected for the Track 03 clinical-policy scenario. The Data Crew,
H-MEM precedents, final evidence bullets, and audit ledger carry the reasoning
for this demo.

### Live Mode says Meterless is offline

Start Nightshift, use **`Auto-detect Nightshift`**, or enter the runtime base URL
and token in **`Configure Credentials`**. Confirm `Meterless` is green in the
header.

### Live Mode says Zetaris credentials are missing

Open **`Configure Credentials`** and fill in the Zetaris host (or REST URL),
organization id, and **REST API Key / Token**. The JDBC password is optional for
the REST query path. Confirm `Zetaris` is green in the header and `/api/health`
reports `zetaris.ok: true`, then run `npm run zetaris:check`.

### The Zetaris explorer is missing or empty

The **`Explore Zetaris Data`** button appears on the final card only when the
run captured a Zetaris dataset. In Demo Mode, open **Trust & Evidence** directly
and scroll to **`Zetaris Lightning Federated Data Catalog`**. If the view is
empty, wait for the final card, then rerun the scenario. If a live query returned
no rows, check the catalog/table name and row limit.

### The server is missing the client build

Run:

```bash
npm run build
npm run web
```

---

## 12. Verification checklist

Use this before a live judging session:

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run web` opens at `http://127.0.0.1:8787`.
- [ ] The Track 03 card shows exactly one `Start Demo` action.
- [ ] The run reaches `Final Synthesized Governance Decision`.
- [ ] The final card shows the PDF deliverable and evidence export.
- [ ] `Explore Zetaris Data` opens the explorer with four clinic rows; search,
      sort, row inspection, raw JSON, CSV, and JSON downloads all work.
- [ ] `Trust & Evidence` shows the exact SQL, four clinic rows, and a verified
      audit ledger.
- [ ] `Execution` shows `6 / 10`, `COMPLETED`, and the transition log.
- [ ] `Export` downloads the Granular Outputs JSON and Audit Ledger JSONL.
- [ ] For Live Mode, both header indicators are green, `/api/health` is clean,
      and `npm run zetaris:check` reports `synthetic: false`.

### Reproduce the demo from the CLI

```bash
node --import tsx apps/gateway/src/sample.ts \
  --scenario input_examples/03-reasoning-architecture.json
```

### Run the browser demo test

```bash
npx playwright test tests/e2e/demo-scenarios.spec.ts
```

This test runs all three track demos and asserts that each reaches its final
synthesis card without a run failure. It then opens the Track 03 final card,
clicks **Explore Zetaris Data**, and exercises search, sorting, row inspection,
raw JSON, and CSV/JSON downloads.

---

## 13. Two-minute presenter script

> “This is Track 03, Reasoning Architecture. The question is not just what to do
> with four competing clinic requests; it is how the system proves the decision.
>
> The orchestrator convenes a council and two independent research crews. The
> scenario’s data query is a read-only, row-limited clinic queue statement. The
> Web Crew checks standards and counter-evidence. The agents debate the policy
> match: the critical cardiac emergency takes the available operating room, the
> next cardiac case escalates with a telemetry-bay fallback, and the remaining
> requests queue by policy.
>
> Every claim has an owner, a confidence value, a round, and a task ID. The final
> card gives us the decision, the evidence, the caveat, and a validated PDF.
> Trust & Evidence gives us the exact SQL, the captured rows, and a nine-block
> SHA-256 audit chain with a genesis anchor and terminal hash. We can tamper with
> the working copy to prove the chain detects mutation, then restore it.
>
> Click Explore Zetaris Data to inspect the same dataset interactively: search
> the rows, sort by acuity, open a row, switch to raw JSON, or download the
> evidence as CSV or JSON. This is not a screenshot; it is the exact captured
> query result behind the decision.
>
> The same architecture can run against a real Zetaris catalog and Meterless
> runtime. That is the path from deterministic demo evidence to production
> governance.”
