# @y2f/db-schema

Drizzle table definitions and inferred TypeScript types for the shared Neon **`etf.*`**
schema — the contract between the ingestion engine that writes it and the consumers that
read it.

This package is the **shape contract only**. It contains no migrations and no business
logic: the engine repo owns `drizzle/` and is the only thing permitted to migrate `etf.*`.

> **On links:** the engine repo (`etf-data-engine`) is private, so this README deliberately
> does not link into it — anything you need is restated here.

## Consume

Via **git submodule**, not a registry:

```bash
git submodule add git@github.com:speerdo/yield-to-freedom-db-schema.git packages/db-schema
git submodule update --init --recursive
```

**Build it before importing.** `package.json` points `main`/`types` at `dist/`, and `dist/`
is gitignored — a fresh checkout contains source only:

```bash
pnpm install && pnpm build     # emits dist/index.js + dist/index.d.ts
```

Skipping this gives `TS2307: Cannot find module '@y2f/db-schema'` at typecheck and a bundler
`packageEntryFailure` at test time. Put `pnpm build` **before** typecheck and test in CI.

`drizzle-orm` and `pg` are **peer dependencies** — the consumer supplies them, so there is
exactly one copy of Drizzle in the dependency graph.

> If `pnpm build` prints `Done` but emits no `dist/`, delete the stale `.tsbuildinfo`. It is
> a dotfile, so a `rm *.tsbuildinfo` glob misses it and `tsc` then believes the output is
> current. `pnpm clean` handles it.

## Usage

```ts
import { funds, type Fund, createPooledClient } from '@y2f/db-schema';

const { db } = createPooledClient(process.env.DATABASE_URL_READONLY);
const rows: Fund[] = await db.select().from(funds);
```

## Contents

| File | What |
|---|---|
| `src/schema.ts` | The seven `etf.*` tables, with indexes and constraints |
| `src/views.ts` | The three read views (`v_screener`, `v_fund_detail`, `v_distribution_history`) declared `.existing()` so drizzle-kit never emits or drops their DDL |
| `src/types.ts` | Inferred select/insert type pairs for every table |
| `src/client.ts` | `createDirectClient` / `createPooledClient` factories |
| `src/index.ts` | Barrel re-exporting all of the above |

**Tables:** `funds`, `distributions`, `distribution_composition`, `nav_history`,
`computed_metrics`, `parse_review_queue`, `reconciliation_log`.

**Views:** `v_screener` (one row per fund, latest metrics — the ranking surface),
`v_fund_detail` (one row per fund, everything in `v_screener` plus long-tail
provenance), `v_distribution_history` (one row per distribution with its current
composition and split adjustment). Y2F binds to these views, never to raw tables.

**Types:** `Fund`/`NewFund`, `Distribution`/`NewDistribution`,
`DistributionComposition`/`NewDistributionComposition`, `NavHistory`/`NewNavHistory`,
`ComputedMetric`/`NewComputedMetric`, `ParseReviewItem`/`NewParseReviewItem`,
`ReconciliationLogEntry`/`NewReconciliationLogEntry`.

### Connection helpers

Neon exposes two endpoints per compute differing only by a `-pooler` infix, which makes them
easy to swap by accident — and the failure is silent until a migration behaves oddly. Both
factories reject a connection string whose shape contradicts their purpose:

- `createDirectClient(url?)` — non-pooled `pg.Client` for migrations and long-running
  workers. Defaults to `DATABASE_URL`. **Rejects** a `-pooler` host.
- `createPooledClient(url?)` — `pg.Pool` for serverless reads. Defaults to
  `DATABASE_URL_POOLED`. **Rejects** a non-pooler host.

## Write ownership

`etf.*` is written by the engine and read by everyone else. Read access goes through the
`y2f_reader` Postgres role, which holds `SELECT` on `etf.*` and nothing more — enforced at
the database level, so a bug in consumer code cannot write.

## Versioning

Semver by git tag. Consumers pin a tag deliberately rather than tracking `main`.

| Tag | Change |
|---|---|
| `v0.1.0` | Initial five `etf.*` tables, inferred types, connection helpers |
| `v0.2.0` | Fund identity — `series_id`, `class_id`, `tiingo_perma_ticker`, `last_ingested_at` |
| `v0.3.0` | Parse provenance on composition, plus `parse_review_queue` |
| `v0.4.0` | Supersession (`superseded_by_id`, `superseded_at`) and `reconciliation_log` |
| `v0.4.1` | Build-script fix only — no schema change |
| `v0.5.0` | Phase 5 — `nav_history.split_factor` / `cum_split_factor`, `computed_metrics.ttm_roc_coverage_pct` / `dist_cagr_years`, and three read views (`v_screener`, `v_fund_detail`, `v_distribution_history`) declared `.existing()` |

**Any `etf.*` change needs a version bump and a tag.** A schema change that reaches `main`
untagged is invisible to consumers pinning tags, which is the whole point of the contract.
