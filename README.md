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
- `src/index.ts` — re-exports the tables and inferred types.
- `migrations/` — drizzle-kit SQL migrations (committed).

## Status

Phase 0 scaffold only. The schema, migrations, read-only role grant, and read views land in
Action Plan Phase 1. See [`docs/ACTION_PLAN.md`](../../docs/ACTION_PLAN.md).