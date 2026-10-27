# Meterless Integration

This document is the source of truth for how GovernMindz integrates Meterless
Nightshift: what Nightshift provides, what GovernMindz actually uses, how to
configure it, how to verify it, and what remains unused.

Related documents:

- `docs/METERLESS_COMPARISON.md` — architectural comparison with the Meterless
  engines and the deferred integration decisions.
- `.env.example` and `README.md` — local environment setup.
- Official Meterless docs: <https://meterless.ai/>, <https://meterless.ai/how-it-works.html>,
  <https://meterless.ai/models.html>, <https://meterless.ai/cli.html>,
  <https://meterless.ai/nightshift-getting-started.md>.

---

## 1. What Meterless provides

Meterless Nightshift is a local AI hotspot. It runs on the user's Windows PC,
Mac, or DGX Spark and exposes one OpenAI-compatible endpoint for the models and
providers the user has enabled.

Key properties:

- **OpenAI-compatible API** at `http://127.0.0.1:8088/v1` by default.
- **Local models** served from the user's own GPU (text, embeddings, image,
  video, audio, and more depending on edition and installation).
- **Cloud models** routed through Nightshift when the user adds their own
  provider keys inside the Nightshift cockpit.
- **One runtime token** (`proxy-token`) protects the local endpoint.
- **Model discovery** through `GET /v1/models`.
- **Health/status** through the runtime endpoint; `ns status --json` is the
  Nightshift CLI equivalent.
- **Jobs and queues** through the `ns` CLI (`ns generate`, `ns job watch`,
  `ns context get`, `ns route`, etc.).
- **Provider keys stay in Nightshift.** Per Meterless's documentation, `ns`
  cannot read or modify models, lanes, or provider keys; cloud provider keys
  are typed by the human in the Nightshift app.

GovernMindz deliberately treats Nightshift as the single AI gateway. It does
not store or forward OpenAI/Anthropic/Google/NVIDIA provider keys.

---

## 2. How GovernMindz uses Meterless

```text
Debate seats / agents
        │
        ▼
MeterlessSeatClient  (JSON-object responses, temperature, max_tokens)
        │
        ▼
MeterlessProvider  (OpenAI-compatible client)
        │  GET  /v1/models
        │  POST /v1/chat/completions
        ▼
Meterless Nightshift on 127.0.0.1:8088
        │
        ├── local models
        └── cloud models enabled in the Nightshift cockpit
```

Core implementation:

- `libs/core/src/providers/MeterlessProvider.ts` — HTTP client, model
  discovery, status, connect-link parsing, retries, redaction.
- `libs/core/src/providers/MeterlessSeatClient.ts` — adapts the provider to
  the debate `AgentSeat` contract and requests `response_format: json_object`.
- `libs/core/src/providers/MeterlessTokenStore.ts` — token and base-URL
  persistence plus Nightshift `proxy-token` discovery.
- `apps/gateway/src/debateRunner.ts` — live-mode preflight and seat wiring.
- `apps/web/server.ts` — `/api/health`, `/api/models`, and live-mode 503
  preflight.
- `apps/web/src/components/chat/MessageComposer.tsx` — model roster UI and
  refresh behavior.

---

## 3. Configuration

Add these to `.env.local` (never commit the file):

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `METERLESS_BASE_URL` | Recommended | `http://127.0.0.1:8088/v1` | Nightshift OpenAI-compatible base URL |
| `METERLESS_API_KEY` | Recommended | — | Nightshift runtime token |
| `METERLESS_RUNTIME_TOKEN` | Optional | — | Alternative runtime token variable |
| `METERLESS_CONNECT_LINK` | Optional | — | Full Nightshift `/connect` link; the token is extracted from its fragment |
| `METERLESS_MODEL` | Optional | `meterless/auto` | Preferred model/lane |
| `METERLESS_SEAT_MODEL` | Optional | `METERLESS_MODEL` | Faster model for debate seats |
| `METERLESS_APP_ID` | Optional | `governmindz` | Sent as the `meterless-app` header |
| `METERLESS_STATE_DIR` | Optional | OS-specific | Override token/state directory |
| `METERLESS_TIMEOUT_MS` | Optional | `180000` | Request timeout |
| `METERLESS_MAX_RETRIES` | Optional | `2` | Retry attempts for transient failures |
| `METERLESS_RETRY_BASE_MS` | Optional | `500` | Exponential retry base delay |
| `NEMOTRON_MODEL` | Legacy | — | Fallback when `METERLESS_MODEL` is empty |

### Token resolution order

`MeterlessProvider` resolves the runtime token in this order:

1. Explicit `apiKey` passed by code.
2. `METERLESS_API_KEY` (unless it is a `/connect` link).
3. Token from `METERLESS_BASE_URL`/`METERLESS_CONNECT_LINK` if it is a valid
   Nightshift `/connect` link.
4. `METERLESS_RUNTIME_TOKEN`.
5. Persisted token in `meterless-provider.json`.
6. Nightshift runtime `proxy-token` discovery:
   - Windows: `%LOCALAPPDATA%\ai.meterless.runtime\proxy-token`, then
     `%LOCALAPPDATA%\Meterless\proxy-token`.
   - macOS M5+: `~/Library/Application Support/ai.meterless.runtime/proxy-token`,
     then `~/Library/Application Support/Meterless/proxy-token`.
   - Linux/DGX: `/var/lib/meterless/proxy-token`, then the XDG state
     directory, then `~/.local/state/meterless/proxy-token`.
   - An explicit `METERLESS_STATE_DIR` is checked first.

When a runtime token is discovered, the provider remembers it in its local
state file so subsequent runs do not need the environment variable.

### Base URL rules

- Bare hosts, `/v1` URLs, and full `/chat/completions` URLs are normalized to
  `origin/v1`.
- Credentials in the URL are rejected.
- `http` and `https` are supported.
- If no URL is configured, the provider defaults to
  `http://127.0.0.1:8088/v1` and can fall back to a stored base URL.
- `autoDetectMeterless()` can scan `127.0.0.1`, `localhost`, and `[::1]` on
  ports `8088`, `8090`, `8787`, and `11434`. The Settings → Models & Providers
  tab exposes this as **Auto-detect Nightshift**; a successful online result is
  persisted as the Meterless base URL.

---

## 4. Model discovery and the AI roster

The model roster is not hard-coded in production. The flow is:

1. `GET /api/models` on the GovernMindz web server.
2. The server calls Meterless `GET /v1/models` with the server-side token.
3. The response is mapped into model options:
   - `meterless/*` → local Meterless lanes (e.g. `meterless/auto`).
   - `nvidia/*`, `gpt-*`, `claude-*`, `gemini-*`, etc. → cloud models routed
     through Nightshift, labelled as such.
4. The browser reloads the roster:
   - on app load,
   - when the model picker opens,
   - after credentials or connectivity checks,
   - every 60 seconds while the tab is visible,
   - through the manual refresh control in the picker.

If the currently selected model disappears, GovernMindz falls back to
`meterless/auto`. If discovery fails, the last known roster is kept rather than
replaced with an empty or unrelated list.

This is how models enabled after adding provider keys in Nightshift become
available in GovernMindz without restarting the app.

---

## 5. Request behavior

`MeterlessProvider.chat(messages, options)` sends
`POST /v1/chat/completions` with:

- `model` — selected model or `METERLESS_MODEL`.
- `messages` — normalized system/user messages.
- `stream: false` — streaming is not enabled yet.
- `temperature` — when provided.
- `max_tokens` — when provided.
- `response_format` — used by debate seats as `{ type: "json_object" }`.

The client handles:

- Request timeouts (`METERLESS_TIMEOUT_MS`).
- Exponential retries for transient failures (`METERLESS_MAX_RETRIES`,
  `METERLESS_RETRY_BASE_MS`).
- `401/403` → unauthorized token error.
- `404` → endpoint/model error.
- `5xx` → retryable error with backoff.
- Non-JSON responses → explicit invalid-response error.
- Token redaction from error text.

---

## 6. Live-mode preflight

Live runs are fail-closed. Before starting a live debate, `POST /api/run`:

1. Rejects demo/live conversation mode mismatches.
2. Calls Meterless `/v1/models` through `MeterlessProvider.status()`.
3. Requires state `online` (not `offline` or `unauthorized`).
4. Verifies Zetaris is configured and that a real `SELECT 1` succeeds.
5. Returns `503` with an actionable error if any check fails.

The debate runner also throws if the live Zetaris Data Crew fails. There is no
synthetic Zetaris fallback in live mode.

---

## 7. Security model

- Nightshift is expected to bind to loopback (`127.0.0.1`).
- The runtime token is only used server-side; it is never injected into the
  browser bundle.
- Provider keys belong in Nightshift. GovernMindz never asks users to paste
  OpenAI/Anthropic/Google keys into its UI or `.env.local`.
- Tokens are redacted from provider error messages.
- `.env.local`, `meterless-provider.json`, and Nightshift `proxy-token` must
  stay out of git.
- The AES-256-GCM credentials modal stores Zetaris and Nightshift credentials
  at rest in `.env.local`.

---

## 8. Operational verification

```powershell
# Runtime is up
curl.exe -s http://127.0.0.1:8088/v1/models

# GovernMindz health
curl.exe -s http://127.0.0.1:8787/api/health

# Discovered roster
curl.exe -s http://127.0.0.1:8787/api/models

# Full smoke test (requires live credentials for the live section)
npm run smoke

# Typecheck, unit tests, build
npm run typecheck
npm test
npm run build
```

Expected health fields:

```json
{
  "meterless": { "state": "online", "configured": true },
  "zetaris": { "ok": true, "configured": true },
  "missingCapabilities": []
}
```

---

## 9. Failure map

| Symptom | Meaning | Fix |
| :--- | :--- | :--- |
| `METERLESS_TOKEN_MISSING` | No token found | Paste the Nightshift runtime token or `/connect` link |
| `METERLESS_TOKEN_PLACEHOLDER` | `rt-local` placeholder token | Use the real runtime token |
| `METERLESS_UNAUTHORIZED` | Nightshift rejected the token | Refresh the token from Nightshift |
| `METERLESS_UNREACHABLE` | Endpoint not running/reachable | Start Nightshift and verify the base URL |
| `METERLESS_TIMEOUT` | Request exceeded timeout | Check model load, raise timeout if appropriate |
| `METERLESS_MODELS_FAILED` | `/v1/models` failed | Check Nightshift status and token scope |
| state `offline` with models present | No `meterless/*` lane exposed | Enable a Meterless lane or review Nightshift models |
| model missing from picker | Not exposed by Nightshift | Add/enable the provider or model in Nightshift, then refresh |
| live run `503` | Meterless or Zetaris preflight failed | Fix credentials; live mode never falls back to demo data |

---

## 10. Coverage matrix

### Used by GovernMindz

- OpenAI-compatible `POST /v1/chat/completions`.
- `GET /v1/models` dynamic roster.
- Runtime token from env, `/connect`, state file, or Nightshift `proxy-token`.
- Base URL normalization.
- JSON-object responses for debate seats.
- Temperature and max-token controls.
- Timeouts, retries, and error classification.
- Health/status reporting.
- Nightshift endpoint auto-detection from Settings.
- Server-side credential isolation.

### Available but not used yet

- **Streaming responses** (`stream: false` today). Could improve perceived
  latency for long generations.
- **Embeddings** (`meterless/embed`, local embedding models). These model IDs
  can appear in `/v1/models`, but the Nightshift build tested for this project
  returned `404 not_found` for `/v1/embeddings`. Do not rely on embeddings until
  the runtime exposes that endpoint; when it does, they would be the best next
  upgrade for H-MEM hybrid semantic retrieval.
- **Image, video, audio, music, speech, transcription** models. Not relevant to
  the current governance workflow.
- **Nightshift `ns` CLI job queue** (`ns generate`, `ns job watch`,
  `ns context get`, compositing, OCR, verify, repair). GovernMindz uses the
  synchronous OpenAI-compatible path instead.
- **`ns route` cost/latency routing** and Nightshift provider keys. GovernMindz
  already exposes `meterless/auto|fast|deep` but does not query routes.
- **Nightshift usage/outcome metadata** beyond the OpenAI usage block.

These are documented so they are not forgotten; add them only when they
materially improve product value, cost, latency, or reliability.
