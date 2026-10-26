# GovernMindz vs Meterless Engines — Comparison & Acceptance Criteria

## Scope
GovernMindz compared against the four open Meterless engines (H-MEM, World Model, Markovian, Scout Intent) plus the Swarm orchestration and Nightshift runtime layers referenced in the Meterless stack. Goal: identify justified, non-duplicative improvements.

## GovernMindz baseline (existing)
- Multi-agent debate (seats, supervisor workflow, scheduler, resilience, crew barriers)
- HMemService (file-backed memory, keyword retrieval, feedback, 500-entry cap)
- AuditChainVerifier / AuditTrailEmitter / SqliteAuditPersistence
- RivalChallenger / ThinkerAgent / IndependentInterventionManager
- DocumentIngestionService, Zetaris federation, gravity scoring
- Meterless runtime provider (local model routing)

## Comparison matrix

| Meterless component | GovernMindz status | Overlap | Gap | Decision |
|---|---|---|---|---|
| H-MEM (tiered memory, hybrid ranking, provenance, dreaming, sleep, trust ledger, conflicts) | Partial: HMemService flat file, keyword retrieval, feedback | Memory store, feedback loop | No tiers, no hybrid ranking, no provenance, no dreaming, no sleep, no trust ledger, no conflict detection | Integrate low-risk subset now (provenance, hybrid ranking, access stats, audit ledger, conflict detection). Defer dreaming/sleep. |
| World Model (event-sourced entity graph, stable IDs, ingest pipeline, control plane) | None (Zetaris federation only) | Data federation | No entity graph, stable IDs, ingest pipeline, control plane | Defer — large, new subsystem; flag for future. |
| Markovian (bounded-context chunked reasoning, compression cascade, history) | None (full-history debate) | Debate orchestration | No chunked reasoning, no carryover compression, no run history | Defer core engine; flag. Consider carryover compression in long debates later. |
| Scout Intent (intent registry, scoring, guard, capability graph, signed contracts) | Partial: policy middleware, orchestrator routing | Policy/routing | No intent registry, confidence bands, guard stack, signed contracts | Defer — large. Flag. |
| Swarm orchestration | Partial: crew barriers, scheduler | Multi-agent coordination | No signed contracts between engines | Defer (depends on Scout). |
| Nightshift runtime routing | Partial: Meterless provider | Model routing | No cost/latency quality routing | Defer. |

## Justified improvements integrated in this change
1. HMemService: provenance on every record (mandatory source preserved; provenance object added).
2. HMemService: hierarchical layer field (short_term/working/long_term) with working default.
3. HMemService: entity extraction and namespace/domain enrichment on mine.
4. HMemService: hybrid retrieval scoring (semantic/keyword/tag/domain/entity/layer/recency/superseded) x confidence, replacing pure keyword count.
5. HMemService: access stats (lastAccessed, accessCount) updated on retrieve.
6. HMemService: append-only trust ledger (hmem-audit.json) for create/read/feedback/conflict/resolve.
7. HMemService: conflict detection (opposing polarity heuristic) and resolution strategies.
8. HMemService: relatedTo/supersedes/supersededBy/derivedFrom lineage fields.
9. HMemService: dreaming cycle (cluster-based insight/domain/invariant proposals with human approval boundary).
10. HMemService: sleep cycle (preview/execute with backup, consolidation, archival, synthesis, restore).
11. Hardening: canonical feedback deltas (+0.05/-0.03/-0.20 wrong + review tag), enrichment (relatedTo/supersedes bidirectional), mineDocument, mineEvent (7 event types), autoResolveConflicts (>=0.70 gate), sleep guardrails (protected high-relationship memories), retrieval threshold 0.35 with fallback.

## Acceptance criteria
- `npm run typecheck` passes.
- `npm test` passes (162+ tests, 0 failures) with no regression.
- HMemService public API remains backwards compatible (mine, retrieve, list, count, recordFeedback signatures unchanged; new optional fields/methods additive).
- Retrieval returns same or better recall for existing feedback test query ("compliance security").
- New methods (detectConflicts, resolveConflict, getAuditLog) are additive and do not alter existing behavior.
- No .env or secret leakage; no changes to Meterless provider contract.
- Deferred items (World Model, Markovian core, Scout Intent, dreaming, sleep) documented with rationale and completion conditions.

## Deferred items (Flagged)
- World Model engine: requires new subsystem (entity store, event log, stable IDs, control plane). Complete when a concrete domain entity (e.g., Zetaris tables) needs persistent graph state.
- Markovian engine: requires chunk manager, compression cascade, run history. Complete when debate runs exceed token budget thresholds.
- Scout Intent engine: requires intent registry + eval harness. Complete when routing bugs exceed policy middleware capacity.
- H-MEM dreaming + sleep cycles: integrated (basic heuristic). Enhance with LLM-based synthesis when model available.
- Feedback deltas: currently +0.1/-0.2 (stronger than Meterless canonical +0.05/-0.03). Align in follow-up with test updates if desired.
