# Threat Model (Lite) — GovernMindz

## Assets
- Conversation data (SQLite `data/conversations.db`, messages, topics, final answers)
- Audit trail (HMAC-chained events, proof certificates, secrets)
- Credentials/tokens (Meterless runtime token, Zetaris API key, AUDIT_TRAIL_SECRET, .env.local)
- H-MEM store (logs/hmem.json, hmem-audit.json) and backups
- AI outputs (debate answers, tool results, web search results)
- Config state (cryptoConfig persisted settings, env vars)
- File system paths (static root, data dir, logs)

## Actors
- Operator (local user running the app)
- Debate seats/agents (AI personas invoking tools)
- External providers (Meterless runtime, Zetaris Lightning, web search)
- Untrusted content (user prompts, imported documents, web search results, Zetaris rows)
- Potential local attacker (other processes/users on host)

## Trust Boundaries
- Browser/UI ↔ web server (HTTP, no auth layer observed)
- Web server ↔ gateway tools (in-process; callerRole enforced for zetaris)
- App ↔ Meterless runtime (localhost:8088, bearer token)
- App ↔ Zetaris (remote API, API key)
- App ↔ file system (logs, data, .env)
- AI model input boundary (prompts include memory, tool results, user content)
- Audit secret boundary (HMAC key in env)

## Abuse Paths
1. Prompt injection via user input or imported docs leading to tool misuse (zetaris query, web search).
2. SQL injection / data exfiltration through zetaris_query (mitigated by read-only validator, but verify).
3. Token/secret leakage in logs, errors, or git (zetaris test explicitly checks no leak).
4. Unauthorized local access to web server (no auth) → conversation data exposure.
5. Path traversal in static file serving or file-based memory paths.
6. AI agents over-claiming tool authority; missing callerRole checks on some paths.
7. Webhook/callback abuse (none observed; N/A unless added).
8. Payments (none in repo; N/A).
9. H-MEM poisoning via mined content → influenced future prompts.
10. Audit tampering if secret leaked or chain not verified.

## Recommended Mitigations
- Enforce callerRole on all tool invocations; default-deny policy.
- Keep zetaris read-only SQL validator strict; add allowlist of tables/columns.
- Redact secrets in all logs/errors; never return raw tokens.
- Add authentication/authorization to web server if exposed beyond localhost.
- Validate/sanitize file paths; restrict to known roots.
- Treat all retrieved memory/tool/web results as untrusted; sanitize before prompt injection.
- Rotate and protect AUDIT_TRAIL_SECRET and API keys; ensure .env in .gitignore.
- Verify audit chain on load; fail closed on signature mismatch.
- Rate limit tool calls and AI endpoints per caller.
- Add input size limits and timeouts for document mining and web search.
- Log tool calls with callerRole and traceId for accountability.
