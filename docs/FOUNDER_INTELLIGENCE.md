# Founder Intelligence

Phase 1 of the founder onboarding, project discovery, intelligence, evaluation and growth
system. This document records the architecture decisions and the scope that is implemented
today.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain library | `libs/founder-intelligence` | Pure TypeScript: questionnaire catalog, conditional visibility engine, stage evaluation, scoring engines, store contract. No database or React dependencies, fully unit-testable. |
| Persistence | `apps/gateway/src/services/SqliteFounderStore.ts` | SQLite implementation of the `FounderStore` contract. Stores onboarding answers and assessment history in `data/conversations.db`. |
| Application service | `libs/founder-intelligence/src/service/FounderIntelligenceService.ts` | Composes questionnaire, stage evaluator and scoring engine over a `FounderStore`. Owns answer validation and assessment generation. |
| API | `apps/web/server.ts` | `GET /api/founder/onboarding`, `POST /api/founder/onboarding/answers`, `POST /api/founder/project`, `GET|POST /api/founder/assessment`. |
| UI | `apps/web/src/components/founder/FounderWorkspace.tsx` | Guided onboarding workspace with a section navigator, conditional questions and the assessment dashboard. Reachable from the "Founder" tab in Mission Control. |

Import alias: `@governmindz/founder-intelligence` (registered in `tsconfig.json` and
`vite.config.ts`).

## Decisions

1. **SQLite first.** The existing app already persists to `data/conversations.db` through
   `better-sqlite3`. Founder intelligence reuses that database and adds two tables
   (`founder_onboarding`, `founder_assessments`) instead of introducing a new service or
   container. The `FounderStore` interface keeps the storage backend replaceable, so a
   PostgreSQL backend can be added later without touching the domain logic.
2. **Deterministic rules before LLM interpretation.** Question visibility, answer validation,
   stage evaluation and scoring are pure functions over the recorded answers. Language
   models are reserved for interpretation, documentation and recommendations, so the same
   inputs always produce the same scores and every number can be traced to a question.
3. **Technical, market, business and founder capacity stay separate.** Business formation
   (LLC, EIN, bank account) affects `business_readiness` only. It never reduces the
   technical readiness, market opportunity or product-quality scores.
4. **Self-reported stage and evidence-based stage are stored separately.** The founder's
   answer is recorded verbatim and never overwritten. The assessed stage is derived from
   evidence signals and compared against the self-report with a constructive explanation.
5. **Evidence-first findings.** Every finding carries an evidence reference, a confidence
   value, a verification status and an explicit list of missing evidence. Unverified
   capabilities are never awarded points, and market demand is never inferred from an idea.
6. **The overall score cannot hide a blocking gap.** The derived overall score is capped at
   the weakest dimension plus 20 points, and the weakest dimension is always reported as a
   finding.
7. **Conditional questions.** Visibility rules are declarative (`visibleWhen` on a question
   definition) and evaluated against the current answers, so a founder only sees questions
   relevant to their circumstances. Rules for a question whose source answer is unanswered
   evaluate to hidden, which keeps the flow focused.

## Implemented today

- Guided onboarding across the eight directive sections (45 visible questions at the start
  of a session), with conditional questions, progress tracking, per-section completion,
  answer validation and save/resume.
- Evidence-based startup stage evaluation with signal-level transparency and a constructive
  comparison against the self-reported stage.
- Four independent scores (technical readiness, market opportunity, business readiness,
  founder operating capacity) plus a derived overall score with documented weighting,
  findings, evidence references and missing-evidence lists.
- Assessment history stored per owner so progress across runs stays visible.

## Not yet implemented

The remaining directive phases are tracked as separate work: repository import and
ingestion into a project intelligence store, automated project documentation generation,
market and competitor research agents, the expanded multi-agent debate roster, marketing
asset generation, the personalized 90-day action plan, continuous re-indexing on new
commits, and the desktop edition with an automatically managed PostgreSQL instance.

## Validation

- `npm run typecheck`
- `npm test` (includes `tests/founder_intelligence.test.ts`)
- `npm run build`
- Manual API and browser verification of the Founder workspace against a running server.
