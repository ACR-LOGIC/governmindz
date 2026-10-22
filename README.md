# GOVERNMINDZ

Lean, role-based multi-agent debate system with a read-only Zetaris Lightning data tool and a local Meterless Runtime provider.

Built for the Open Agent Hackathon 2026, October 22-27, 2026. Registration closes October 22, 2026, 23:59 UTC; submissions close October 27, 2026, 23:45 UTC.

## What is implemented

- Role-based agents, prompts, and supervisor (`libs/core/src/agents`, `libs/core/prompts`)
- Debate loop, seat transport, consensus, dissent, and audit trail (`libs/core/src/debate`, `libs/core/src/engine`)
- Meterless Runtime provider implementing the OpenAI-compatible `/v1` contract (`libs/core/src/providers/MeterlessProvider.ts`)
- Meterless-backed `ILLMClient` adapter used by debate seats (`libs/core/src/providers/MeterlessSeatClient.ts`)
- Zetaris Lightning REST client with a read-only SQL guard (`libs/core/src/integrations/zetarisClient.ts`)
- Policy-gated `zetaris_query` tool (`apps/gateway/src/tools/zetaris.tools.ts`)
- CLI demo and smoke test (`apps/gateway/src/main.ts`, `apps/gateway/src/smoke.ts`)

## Requirements

- Node.js 22 or later
- A reachable Zetaris Lightning REST endpoint and API key
- Meterless Runtime running locally for the full debate demo

## Setup

```powershell
npm install
Copy-Item .env.example .env.local
```

Fill in `.env.local`. It is gitignored and must never be committed. The demo loads it with `--env-file`, so do not rely on your shell environment alone.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUDIT_TRAIL_SECRET` | Yes | Signs the local audit trail. Core imports throw without it. |
| `ZETARIS_REST_URL` | Yes | Lightning REST base, normally `http://localhost:8888/api/v1.0`. |
| `ZETARIS_ORG_ID` | Yes | Organization header for Zetaris REST. |
| `ZETARIS_API_KEY` | Yes | Zetaris REST bearer key. Use a read-only role/key. |
| `ZETARIS_API_AUTH` | Fallback | Legacy alias for `ZETARIS_API_KEY`. |
| `METERLESS_BASE_URL` | No | Runtime base; bare host, `/v1`, full chat URL, `/healthz`, or a `/connect` link are normalized. Defaults to `http://127.0.0.1:8088/v1`. |
| `METERLESS_API_KEY` | One of | Runtime token from the `/connect` link, or use one of the token sources below. |
| `METERLESS_RUNTIME_TOKEN` | Fallback | Alternative token variable. |
| `METERLESS_CONNECT_LINK` | Optional | Full `/connect#k=...` link; configures base URL, token, model, and app id. |
| `METERLESS_STATE_DIR` | Optional | Directory containing the runtime's `proxy-token`; defaults to `%LOCALAPPDATA%\Meterless` on Windows. |
| `METERLESS_APP_ID` | No | Stable app id sent as `meterless-app`; defaults to `governmindz`. |
| `METERLESS_MODEL` | No | Model or lane id; defaults to `meterless/auto`. |
| `NEMOTRON_MODEL` | Fallback | Legacy model id used when `METERLESS_MODEL` is empty. |
| `METERLESS_SEAT_MODEL` | No | Faster model/lane for debate seats; defaults to `METERLESS_MODEL`. |
| `METERLESS_TIMEOUT_MS` | No | Request timeout; defaults to `180000`. |
| `METERLESS_MAX_RETRIES` | No | Retries for 429/5xx; defaults to `2`. |
| `KMS_MASTER_KEY` | No | Base64 key for Gravity receipt signing. Receipt minting throws without it. |
| `GOVERNMINDZ_TOPIC` | No | Overrides the demo debate topic. |
| `ZETARIS_DEMO_QUERY` | No | Read-only query used by the demo; defaults to `SHOW LIGHTNING DATABASES`. |

Generate the audit secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Commands

```powershell
npm run typecheck   # TypeScript, no emit
npm test            # Unit tests with local mock servers; no external services
npm run smoke       # Live read-only Zetaris check + Meterless status
npm run demo:dry    # Live Zetaris query without any LLM call
npm run demo        # Full three-seat debate; requires Meterless online
npm run demo -- --auto-detect  # Scan 8088, 8090, 8787, and 11434 first
```

`npm run smoke` reports Meterless state but passes when it is offline. Use `node --env-file=.env.local --import tsx apps/gateway/src/smoke.ts --require-meterless` to make it fail in that case. Add `--auto-detect` to either command to scan the standard Meterless ports on `127.0.0.1`, `localhost`, and `[::1]`.

The provider reads a token from `METERLESS_API_KEY`, `METERLESS_RUNTIME_TOKEN`, `METERLESS_CONNECT_LINK`, the app token store key `meterless_runtime_token`, or `<stateDir>/proxy-token`. It sends `meterless-scope: user` on chat only and normalizes plain-text prompts into a single user message.

## Demo flow

1. Read-only Zetaris query (`SELECT`, `SHOW`, `DESCRIBE`, or `EXPLAIN` only).
2. Three seats (`FactChecker`, `CloudArchitect`, `Synthesizer`) receive the query result and role prompts.
3. `LocalSeatTransport` runs the debate through `MeterlessSeatClient` and `MeterlessProvider`.
4. `DebateLoop` stops on consensus or the round limit and records a signed audit trail.

The gateway tool path is separate and testable: parse input, enforce the registry policy and rate limit, then call `ZetarisClient.query`. The read-only guard rejects multiple statements, DML/DDL, `INTO`, and `FOR UPDATE`, but it is defense-in-depth, not a replacement for Zetaris role-based access control.

## Security notes

- Use a read-only Zetaris role/key for this gateway. The SQL guard is client-side.
- Never log, commit, or paste Meterless tokens or `/connect` links into source, issues, or chat.
- `.env.local` is gitignored; `.env.example` contains placeholders only.
- The audit trail refuses to sign with a default key; set `AUDIT_TRAIL_SECRET`.
- Meterless tokens are sent only in the `Authorization` header and are redacted from errors.

## Layout

```text
apps/gateway/   CLI demo, smoke test, policy-gated tools
libs/core/                 agents, debate, audit, providers, Zetaris client
libs/mcp-core/             tool and registry types
src/types/environment.d.ts minimal ambient Node declarations
```
