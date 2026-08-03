# @y2f/db-schema

Drizzle schema + inferred TypeScript types for the **shared Neon `etf.*` schema** — the
contract between [`etf-data-engine`](../../) (write owner) and `yieldtofreedom` (read-only
consumer).

This is a **separate git repository**, consumed by `etf-data-engine` (and, later, by
`yieldtofreedom`) as a **git submodule** at `packages/db-schema`. The data engine is the
**source of truth**; bump the tag/commit here whenever `etf.*` changes, and Y2F updates the
submodule reference deliberately.

## Contents (post Phase 1)

- `src/schema.ts` — Drizzle table definitions for `etf.*` (`funds`, `distributions`,
  `distribution_composition`, `nav_history`, `computed_metrics`) plus indexes/constraints.
  Implemented verbatim from [`docs/DATA_ENGINE_CONTEXT_BLUEPRINT.md`](../../docs/DATA_ENGINE_CONTEXT_BLUEPRINT.md) §Schema.
- `src/types.ts` — inferred `Fund` / `NewFund` (and the same pair for the other four tables).
- `src/client.ts` — `createDirectClient` / `createPooledClient` factories that assert the
  pooled/direct shape of the connection string they're handed.
- `src/index.ts` — barrel re-exporting all of the above.
- Migrations live in the **parent** repo at `drizzle/` (drizzle-kit `out:`), not here — the
  engine owns and runs them; this package is the shape contract only.

## Status

Phase 1 complete: the five `etf.*` tables, inferred types, and connection helpers are
implemented. The `etf` schema is created and migrated by `etf-data-engine`; Y2F consumes
this package read-only. See [`docs/ACTION_PLAN.md`](../../docs/ACTION_PLAN.md) Phase 1.