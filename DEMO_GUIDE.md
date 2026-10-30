# GovernMindz Demo Guide — AI Collaboration & Governed Change Execution

This guide walks through the current GovernMindz vision: an independent project
intelligence and governance workspace that connects the AI assistants you already
use (Claude, ChatGPT, Gemini, Cursor, VS Code via MCP) to your projects — while
keeping project knowledge, permissions, decisions, and execution under your
control.

## What this demo covers

1. **MCP Server** — expose GovernMindz tools to external AI clients over stdio
2. **AI Provider Registry** — configure OpenAI, Anthropic, Google, OpenRouter,
   Meterless, and custom providers
3. **External Client Authorization** — approve/revoke which AI applications can
   connect and at what permission level
4. **Governed Change Execution** — propose → prepare → review → approve → execute
   changes with explicit user authorization
5. **Outgoing Webhooks** — push debate results and approved deliverables to your
   founder tools (Slack, Linear, etc.)
6. **Local Project Connect** — read-only git metadata from a local repo (no
   clone, no write)
7. **Founder Decision Templates** — structured starting points for common
   founder decisions

---

## 1. Start the app

```bash
npm install
npm run setup          # generates .env.local and AUDIT_TRAIL_SECRET
npm run web            # or npm run dev for Vite HMR
```

Open **http://127.0.0.1:8787**.

---

## 2. Connect an external AI client via MCP

GovernMindz exposes a stdio MCP server so your preferred AI assistant can query
project context, run debates, and prepare changes — all governed by your
permissions.

### Start the MCP server

```bash
npm run mcp
```

The server listens on stdio. Configure your MCP client (Claude Desktop, Cursor,
VS Code, etc.) to connect to:

```
npx tsx apps/gateway/src/mcp-server.ts
```

### MCP tools exposed

| Tool | What it does | Permission level |
|------|-------------|------------------|
| `project_catalog_search` | Search synced GitHub repos + connected local projects | OBSERVE |
| `zetaris_query` | Read-only SQL against Zetaris Lightning | OBSERVE |
| `web_search` | Web research with verification status | OBSERVE |
| `debate_start` | Request a multi-agent GovernMindz debate | PROPOSE |
| `debate_result` | Retrieve a completed debate result | OBSERVE |

### MCP resources

| URI | What it returns |
|-----|-----------------|
| `debate://{runId}/result` | Completed debate + deliverables |
| `project://{projectId}/context` | Project context (architecture, tech, decisions) |
| `project://{projectId}/architecture` | Architecture summary |
| `project://{projectId}/decisions` | Recorded decisions |

---

## 3. Configure an AI provider

In **Settings → GitHub** (or a dedicated provider panel), add an AI provider:

```bash
# Example: create a provider via the API
curl -X POST http://127.0.0.1:8787/api/ai-providers \
  -H "Content-Type: application/json" \
  -d '{"name":"My Anthropic","type":"anthropic","apiKey":"sk-ant-...","model":"claude-3-sonnet","status":"enabled"}'
```

Supported types: `openai`, `anthropic`, `google`, `openrouter`, `meterless`, `custom`.

Configuring a provider does **not** connect it to any project — it only stores
credentials. You must separately approve an external client.

---

## 4. Approve an external client

External AI applications (Claude Desktop, Cursor, VS Code) connect via MCP and
must be explicitly approved before accessing project data.

```bash
# 1. Register the client
curl -X POST http://127.0.0.1:8787/api/external-clients \
  -H "Content-Type: application/json" \
  -d '{"name":"Claude Desktop","clientType":"mcp","userId":"you"}'

# 2. Grant project permission (OBSERVE / PROPOSE / PREPARE / EXECUTE)
curl -X POST http://127.0.0.1:8787/api/client-permissions \
  -H "Content-Type: application/json" \
  -d '{"clientId":"<client-id>","projectId":"<project-id>","permissionLevel":"PROPOSE","grantedTools":["project_catalog_search","debate_start"]}'

# 3. Approve the client
curl -X POST http://127.0.0.1:8787/api/external-clients/<client-id>/approve \
  -H "Content-Type: application/json" \
  -d '{"userId":"you"}'
```

Permission levels:
- **OBSERVE** — read project metadata, catalog, debate results, evidence
- **PROPOSE** — submit ideas, plans, proposals, request debates
- **PREPARE** — generate code patches, draft changes (pending approval)
- **EXECUTE** — apply approved changes (explicit user authorization required)

---

## 5. Governed change execution

External AI assistants can prepare changes, but **never execute** them without
your explicit approval.

```bash
# 1. Assistant prepares a change (draft)
curl -X POST http://127.0.0.1:8787/api/project-artifacts \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<project-id>","type":"code_patch","title":"Fix null pointer in parser","content":"{\"diff\":\"...\",\"targetFiles\":[\"src/parser.ts\"],\"changeHash\":\"...\",\"version\":1}","status":"draft","originatingClient":"<client-id>"}'

# 2. Submit for review (creates an approval record)
curl -X POST http://127.0.0.1:8787/api/approvals \
  -H "Content-Type: application/json" \
  -d '{"clientId":"<client-id>","changeHash":"<hash>","changeDescription":"Fix null pointer","projectId":"<project-id>"}'

# 3. Review the diff in the UI, then approve or reject
curl -X POST http://127.0.0.1:8787/api/approvals/<approval-id>/approve \
  -H "Content-Type: application/json" \
  -d '{"approvedBy":"you"}'

# 4. Execute (revalidates authorization before applying)
curl -X POST http://127.0.0.1:8787/api/project-artifacts/<artifact-id> \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

Safety guarantees:
- Changes remain **pending** until you explicitly approve them
- Approval is bound to the **exact change hash** — any modification invalidates
  it
- **EXECUTE** requires separate authorization (not the assistant that prepared it)
- High-risk changes (migrations, deployments, secret access) always require
  explicit user execution
- Read-only GitHub sync is preserved — no Git push permissions are granted

---

## 6. Outgoing webhooks on debate completion

Push debate results and approved deliverables to your founder tools.

```bash
# Create an outgoing webhook (public HTTPS only — SSRF protected)
curl -X POST http://127.0.0.1:8787/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{"targetUrl":"https://hooks.slack.com/services/...","secret":"whsec_your_secret","events":["debate.completed","deliverable.approved"],"enabled":true}'
```

Events:
- `debate.completed` — fired when a GovernMindz debate finishes
- `deliverable.approved` — fired when the supervisor approves a deliverable

Delivery:
- HMAC-SHA256 signatures with an independent webhook secret
- 3 delivery attempts with exponential backoff (1s, 2s, 4s)
- Persistent delivery records + dead-letter logging
- Idempotency keys + replay protection

View delivery history in **Settings → Webhooks** (outgoing section).

---

## 7. Connect a local project (read-only)

Point GovernMindz at a local git repository to read its metadata — **no clone,
no pull, no push, no write**.

```bash
curl -X POST http://127.0.0.1:8787/api/github/connect-local-project \
  -H "Content-Type: application/json" \
  -d '{"localPath":"/absolute/path/to/your/repo"}'
```

GovernMindz reads (via fixed git subcommands only):
- Remote URL
- Current branch
- Working tree status (clean/dirty)
- Ahead/behind vs upstream

This metadata is stored in the project catalog with `provider='local'` and is
searchable via `project_catalog_search` — so your AI assistants can reference
your local project during debates.

---

## 8. Founder decision templates

Start from structured templates instead of blank prompts:

| Template | What it covers |
|----------|---------------|
| `hire-or-outsource` | Hire FTE vs. outsource to contractor/agency |
| `vendor-selection` | Weighted vendor decision matrix |
| `pricing-change` | Revenue impact, churn risk, rollout plan |
| `feature-build-vs-buy` | Build in-house vs. buy SaaS |
| `security-review` | Security posture, OWASP coverage, remediation |
| `technical-debt-review` | Debt inventory, impact/effort, roadmap |
| `dependency-review` | Vulnerable deps, updates, rollback plan |

Load any template via **Settings → Demo Scenarios** or the CLI:

```bash
node --import tsx apps/gateway/src/sample.ts --scenario input_examples/04-hire-or-outsource.json
```

Templates prepopulate topic, investigation instructions, evidence requirements,
and expected output structure — editable starting points, not restrictive
workflows.

---

## 9. Run a multi-agent debate

Ask GovernMindz to investigate a problem using its existing multi-agent system:

```bash
# Sample mode (deterministic, no credentials needed)
node --import tsx apps/gateway/src/main.ts --topic "Should we migrate to a vector database?"

# Live mode (requires Zetaris + Meterless)
npm run demo -- --topic "Should we migrate to a vector database?" --mode live
```

The debate runs:
1. **Data Crew** + **Web Search Crew** gather evidence in parallel
2. **Rival Challenger** challenges both crews; crews defend
3. **Fact Checker** validates claims; **Thinker** finds blind spots
4. **DebateLoop** runs tiered rounds with consensus checks
5. **Synthesizer** resolves and the **Supervisor** releases the deliverable

Result is available via the `debate://{runId}/result` MCP resource or the UI.

---

## 10. Verification

```bash
npm run typecheck   # strict TypeScript
npm test            # full test suite (216 tests)
npm run build       # production client bundle
```

No secrets are committed — `.env.local` is gitignored. External AI assistants
are collaborators, not administrators: you remain the decision-maker and control
what gets changed or executed.

---

## Next steps

- Add the MCP server connection to your preferred AI client
- Register and approve an external client with PROPOSE permission
- Run a debate on a real project question
- Prepare a change, review the diff, and explicitly approve or reject it
- Configure an outgoing webhook to push results to your founder stack
