// @y2f/db-schema — the `etf.*` Drizzle schema.
//
// This is the contract between etf-data-engine (writer, this repo) and
// yieldtofreedom (reader, separate repo). The shape is fixed by
// docs/DATA_ENGINE_CONTEXT_BLUEPRINT.md §Schema — implement it verbatim; do
// not add, rename, or "improve" columns without a blueprint change.
//
// Five tables: funds, distributions, distribution_composition, nav_history,
// computed_metrics. All live in the `etf` schema; `public` belongs to Y2F
// and is never touched by this repo's migrations.

import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const etf = pgSchema('etf');

/** Master fund registry. Seeded from EDGAR + sponsor pages. */
export const funds = etf.table(
  'funds',
  {
    id: serial('id').primaryKey(),
    ticker: varchar('ticker', { length: 12 }).notNull().unique(),
    name: text('name').notNull(),
    sponsor: varchar('sponsor', { length: 80 }).notNull(), // YieldMax, Roundhill, NEOS...
    cik: varchar('cik', { length: 12 }), // SEC identifier (trust-level, not unique)
    seriesId: varchar('series_id', { length: 16 }), // EDGAR series id, e.g. S000077650 — the real per-fund key
    classId: varchar('class_id', { length: 16 }), // EDGAR class id, e.g. C000238138
    tiingoPermaTicker: varchar('tiingo_perma_ticker', { length: 24 }), // Stable Tiingo id, e.g. US000000107614
    lastIngestedAt: timestamp('last_ingested_at'), // When ingestion last touched this fund
    strategyType: varchar('strategy_type', { length: 40 }), // single_stock_option, weekly_index, covered_call, cef...
    underlying: varchar('underlying', { length: 40 }), // TSLA, NDX, etc. (nullable)
    inception: date('inception'),
    expenseRatio: numeric('expense_ratio', { precision: 6, scale: 4 }),
    distFrequency: varchar('dist_frequency', { length: 16 }), // weekly, monthly, quarterly
    status: varchar('status', { length: 16 }).default('active'), // active, closed, merged
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    seriesIdUniq: uniqueIndex('funds_series_id_uniq').on(t.seriesId).where(sql`series_id is not null`),
  }),
);

/** Core time-series: one row per distribution. */
export const distributions = etf.table(
  'distributions',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict' }),
    exDate: date('ex_date').notNull(),
    recordDate: date('record_date'),
    payDate: date('pay_date'),
    declarationDate: date('declaration_date'),
    amount: numeric('amount', { precision: 12, scale: 6 }).notNull(),
    frequency: varchar('frequency', { length: 16 }),
    sourceProvider: varchar('source_provider', { length: 40 }).notNull(), // tiingo, sponsor, stockanalysis
    confidenceScore: numeric('confidence_score', { precision: 4, scale: 3 }), // 0..1
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    fundExUnique: uniqueIndex('dist_fund_ex_uniq').on(t.fundId, t.exDate),
    fundIdx: index('dist_fund_idx').on(t.fundId),
  }),
);

/** THE MOAT TABLE: per-distribution income-character breakdown (ROC etc). */
export const distributionComposition = etf.table(
  'distribution_composition',
  {
    id: serial('id').primaryKey(),
    distributionId: integer('distribution_id')
      .notNull()
      .references(() => distributions.id, { onDelete: 'restrict' }),
    rocPct: numeric('roc_pct', { precision: 6, scale: 3 }), // return of capital %
    niiPct: numeric('nii_pct', { precision: 6, scale: 3 }), // net investment income %
    stGainPct: numeric('st_gain_pct', { precision: 6, scale: 3 }),
    ltGainPct: numeric('lt_gain_pct', { precision: 6, scale: 3 }),
    source: varchar('source', { length: 16 }).notNull(), // 19a-1, 8937, 1099
    isEstimate: boolean('is_estimate').notNull().default(true), // 19a-1 = estimate, 8937/1099 = final
    sourceKey: text('source_key'), // R2 object key — PRIVATE bucket, read via presigned GET
    sourcePageUrl: text('source_page_url'), // public sponsor page the PDF came from
    capturedAt: timestamp('captured_at').defaultNow(),
    // Phase 3 parse provenance.
    parseMethod: varchar('parse_method', { length: 16 }), // pdfplumber | gemini | manual
    parseConfidence: numeric('parse_confidence', { precision: 4, scale: 3 }), // 0..1
    parsedAt: timestamp('parsed_at'), // when this parse ran
    // Phase 4 supersession. NULL = current; set on the ESTIMATE row pointing at
    // the final that replaced it. The estimate row is never deleted or edited
    // in place — history is preserved by construction (PHASE_4_SPEC.md §5).
    //
    // Not a Drizzle `references()` self-FK: a self-referential FK through
    // `references(() => distributionComposition.id)` makes the table implicit-any
    // in its own initializer (TS7022/7024 under strict), so the FK is enforced
    // by `pnpm dq` invariant checks (PHASE_4_SPEC.md §8: no cycles, no row
    // superseded by a lower-precedence row) rather than a DB constraint. A
    // concrete no-composition-row-deletion rule in the worker covers the
    // practical `onDelete: restrict` intent — composition rows are append-only
    // in this repo.
    supersededById: integer('superseded_by_id'),
    supersededAt: timestamp('superseded_at'),
  },
  (t) => ({
    distIdx: index('comp_dist_idx').on(t.distributionId),
    // One row per distribution per source form (19a-1 / 8937 / 1099), so a
    // re-parse updates rather than duplicates — the idempotency contract for
    // the whole phase (PHASE_3_SPEC.md §4).
    distSourceUniq: uniqueIndex('comp_dist_source_uniq').on(t.distributionId, t.source),
    // Phase 4: read surfaces select `where superseded_by_id is null`, so index
    // the column for those lookups.
    supersededByIdIdx: index('comp_superseded_by_id_idx').on(t.supersededById),
  }),
);

/**
 * Phase 4 — the "which source won and why" trail. Append-only; never update or
 * delete a row here (PHASE_4_SPEC.md §5). The `evidence` JSON holds the values
 * compared, so any decision can be re-audited long after the row is written.
 */
export const reconciliationLog = etf.table(
  'reconciliation_log',
  {
    id: serial('id').primaryKey(),
    distributionId: integer('distribution_id')
      .notNull()
      .references(() => distributions.id, { onDelete: 'restrict' }),
    // superseded | date_backfilled | agreement | disagreement
    //
    // Every value here MUST be emitted by some code path. `confidence_scored`
    // was originally listed and dropped: scoring touches all 336 distributions
    // on every run, so logging it would add a row per distribution per run to an
    // append-only table while the score column already records the outcome. A
    // declared-but-never-emitted value is indistinguishable from a broken one.
    action: varchar('action', { length: 24 }).notNull(),
    winningSource: varchar('winning_source', { length: 16 }), // e.g. "8937"
    losingSource: varchar('losing_source', { length: 16 }), // e.g. "19a-1"
    detail: text('detail').notNull(),
    evidence: jsonb('evidence'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    distCreatedIdx: index('recon_dist_created_idx').on(t.distributionId, t.createdAt),
  }),
);

/** Human-in-the-loop review surface for low-confidence / ambiguous parses (Phase 3). */
export const parseReviewQueue = etf.table(
  'parse_review_queue',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict' }),
    // NULL when the match itself failed (no distribution could be resolved).
    distributionId: integer('distribution_id').references(() => distributions.id, {
      onDelete: 'restrict',
    }),
    sourceKey: text('source_key').notNull(), // R2 object key of the PDF
    sourcePageUrl: text('source_page_url'), // index page it was found on
    reason: varchar('reason', { length: 40 }).notNull(), // no_match | ambiguous_match | sum_out_of_range | amount_mismatch | date_mismatch | parse_failed | low_confidence
    detail: text('detail'), // human-readable explanation
    rawExtract: jsonb('raw_extract'), // whatever the parser produced, for triage
    status: varchar('status', { length: 16 }).notNull().default('open'), // open | accepted | rejected
    createdAt: timestamp('created_at').defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => ({
    statusCreatedIdx: index('review_status_created_idx').on(t.status, t.createdAt),
  }),
);

/**
 * NAV + price history for erosion / real-yield math.
 *
 * Phase 5 added `split_factor` (Tiingo's `splitFactor` for the trading day, as
 * reported; `0.2` on the day a 1-for-5 reverse split takes effect) and
 * `cum_split_factor` (the multiplier converting a per-share value on that date
 * into current-share terms: `1 / Π(split_factor of every split strictly after
 * this date)`. `1` for every date after the last split). Both are
 * split-adjustment inputs for the metrics in PHASE_5_SPEC.md §5. The `cum_`
 * column is derived-and-stored deliberately: it makes both the metrics job and
 * the read views a single multiplication instead of a correlated subquery.
 *
 * `nav` is unpopulated except for six Phase 1 fixture rows (JEPI + TSLY,
 * 2025-01-29..31 — invented numbers). Phase 5 nulls those out and proxies NAV
 * with split-adjusted `close` (PHASE_5_SPEC.md §2.3). Never `COALESCE(nav,
 * close)` — that silently mixes six fabricated numbers into a real series.
 */
export const navHistory = etf.table(
  'nav_history',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict' }),
    date: date('date').notNull(),
    nav: numeric('nav', { precision: 12, scale: 4 }),
    close: numeric('close', { precision: 12, scale: 4 }),
    // Phase 5 — Tiingo's `splitFactor` for this trading day, as reported. `0.2`
    // on the day a 1-for-5 reverse split takes effect; `1` on a normal day.
    splitFactor: numeric('split_factor', { precision: 12, scale: 6 }).notNull().default('1'),
    // Phase 5 — multiplier converting a per-share value on this date into
    // current-share terms. `1 / Π(split_factor of every split strictly after
    // this date)`. `1` for every date after the fund's last split. Recomputed
    // wholesale for the fund's entire series at the end of every nav run.
    cumSplitFactor: numeric('cum_split_factor', { precision: 16, scale: 8 })
      .notNull()
      .default('1'),
  },
  (t) => ({
    fundDateUniq: uniqueIndex('nav_fund_date_uniq').on(t.fundId, t.date),
  }),
);

/**
 * Materialized derived metrics, recomputed on each refresh. Read surface for UI + API.
 *
 * Phase 5 added `ttm_roc_coverage_pct` (share of TTM distribution dollars backed
 * by a current composition row — never NULL when `ttm_roc_pct` is non-NULL;
 * PHASE_5_SPEC.md §3 rule 6) and `dist_cagr_years` (the span `dist_cagr` was
 * measured over — 1, 2, or 3; NULL when `dist_cagr` is NULL). Both travel with
 * the metric they qualify, so a consumer cannot render one without the other.
 *
 * Units are percent, everywhere: `109.2233` means 109.2233%. `nav_erosion_12m`
 * is a signed return — negative means erosion (PHASE_5_SPEC.md §5.2).
 */
export const computedMetrics = etf.table(
  'computed_metrics',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict' }),
    asOf: date('as_of').notNull(),
    ttmYield: numeric('ttm_yield', { precision: 8, scale: 4 }),
    realYield: numeric('real_yield', { precision: 8, scale: 4 }), // 12m simple total return on the starting price (PHASE_5_SPEC.md §5.3)
    navErosion12m: numeric('nav_erosion_12m', { precision: 8, scale: 4 }), // signed 12m price return; negative = erosion
    distCagr: numeric('dist_cagr', { precision: 8, scale: 4 }),
    totalReturnDrip: numeric('total_return_drip', { precision: 8, scale: 4 }),
    ttmRocPct: numeric('ttm_roc_pct', { precision: 6, scale: 3 }), // trailing ROC share
    // Phase 5 — share of TTM distribution dollars (split-adjusted) backed by a
    // current composition row. Never NULL when `ttm_roc_pct` is non-NULL
    // (§3 rule 6); NULL only when `ttm_roc_pct` is NULL (JEPI/JEPQ today).
    ttmRocCoveragePct: numeric('ttm_roc_coverage_pct', { precision: 5, scale: 2 }),
    // Phase 5 — the span `dist_cagr` was measured over (1, 2, or 3). NULL when
    // `dist_cagr` is NULL. A 1-year change and a 3-year annualized rate are
    // not comparable numbers (§5.4).
    distCagrYears: smallint('dist_cagr_years'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    fundAsOfUniq: uniqueIndex('metrics_fund_asof_uniq').on(t.fundId, t.asOf),
  }),
);