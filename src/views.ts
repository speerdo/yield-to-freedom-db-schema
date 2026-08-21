// @y2f/db-schema — read views.
//
// Three read views declared with `etf.view(name, columns).existing()`:
// `v_screener`, `v_fund_detail`, `v_distribution_history`. They are the
// contract Y2F + the public API bind to (PHASE_5_SPEC.md §7). `.existing()`
// means drizzle-kit never emits or drops their DDL — the migration that
// creates them is hand-written (custom migration), and `pnpm db:generate`
// stays clean. Y2F gets typed access to the columns below.

import { boolean, date, integer, numeric, text, varchar } from 'drizzle-orm/pg-core';
import { etf } from './schema';

/**
 * `etf.v_screener` — one row per fund, latest metrics only. The ranking surface.
 *
 * DDL lives in the Phase 5 views migration; this declaration only types the
 * columns for consumers. Fund identity, the six metrics, the two qualifiers
 * (`ttm_roc_coverage_pct`, `dist_cagr_years`), and the four context columns
 * that keep a number from being read as more than it is (`dists_ttm`,
 * `latest_ex_date`, `data_as_of`, `days_stale`, `avg_confidence`, `roc_source`).
 */
export const vScreener = etf.view(
  'v_screener',
  {
    ticker: varchar('ticker', { length: 12 }),
    name: text('name'),
    sponsor: varchar('sponsor', { length: 80 }),
    strategyType: varchar('strategy_type', { length: 40 }),
    underlying: varchar('underlying', { length: 40 }),
    expenseRatio: numeric('expense_ratio', { precision: 6, scale: 4 }),
    status: varchar('status', { length: 16 }),
    asOf: date('as_of'),
    ttmYield: numeric('ttm_yield', { precision: 8, scale: 4 }),
    realYield: numeric('real_yield', { precision: 8, scale: 4 }),
    navErosion12m: numeric('nav_erosion_12m', { precision: 8, scale: 4 }),
    distCagr: numeric('dist_cagr', { precision: 8, scale: 4 }),
    totalReturnDrip: numeric('total_return_drip', { precision: 8, scale: 4 }),
    ttmRocPct: numeric('ttm_roc_pct', { precision: 6, scale: 3 }),
    ttmRocCoveragePct: numeric('ttm_roc_coverage_pct', { precision: 5, scale: 2 }),
    distCagrYears: integer('dist_cagr_years'),
    // Context columns.
    distsTtm: integer('dists_ttm'),
    latestExDate: date('latest_ex_date'),
    dataAsOf: date('data_as_of'),
    daysStale: integer('days_stale'),
    avgConfidence: numeric('avg_confidence', { precision: 4, scale: 3 }),
    rocSource: varchar('roc_source', { length: 16 }),
    /**
     * How many TTM distributions `avgConfidence` was computed over. Added
     * 2026-08-20 with the row-level licensing gate (migration 0011): the
     * average now covers filing-sourced rows only, so it needs a denominator
     * to be readable. A mean over an unstated subset is the same defect as
     * OPEN_ITEMS.md #29.
     */
    confidenceN: integer('confidence_n'),
  },
).existing();

/**
 * `etf.v_fund_detail` — one row per fund, everything in `v_screener` plus the
 * long-tail provenance: identity fields (`inception`, `cik`, `series_id`,
 * `tiingo_perma_ticker`, `dist_frequency`), first/last distribution dates,
 * lifetime distribution count, composition counts by source,
 * `latest_final_ex_date` (how far the 8937 finals reach — §2.4's honest lag),
 * `superseded_count`, and `open_review_queue_count`.
 */
export const vFundDetail = etf.view(
  'v_fund_detail',
  {
    // Everything in v_screener (re-declared here so consumers can read the
    // detail view without a separate join to v_screener).
    ticker: varchar('ticker', { length: 12 }),
    name: text('name'),
    sponsor: varchar('sponsor', { length: 80 }),
    strategyType: varchar('strategy_type', { length: 40 }),
    underlying: varchar('underlying', { length: 40 }),
    expenseRatio: numeric('expense_ratio', { precision: 6, scale: 4 }),
    status: varchar('status', { length: 16 }),
    asOf: date('as_of'),
    ttmYield: numeric('ttm_yield', { precision: 8, scale: 4 }),
    realYield: numeric('real_yield', { precision: 8, scale: 4 }),
    navErosion12m: numeric('nav_erosion_12m', { precision: 8, scale: 4 }),
    distCagr: numeric('dist_cagr', { precision: 8, scale: 4 }),
    totalReturnDrip: numeric('total_return_drip', { precision: 8, scale: 4 }),
    ttmRocPct: numeric('ttm_roc_pct', { precision: 6, scale: 3 }),
    ttmRocCoveragePct: numeric('ttm_roc_coverage_pct', { precision: 5, scale: 2 }),
    distCagrYears: integer('dist_cagr_years'),
    distsTtm: integer('dists_ttm'),
    latestExDate: date('latest_ex_date'),
    dataAsOf: date('data_as_of'),
    daysStale: integer('days_stale'),
    avgConfidence: numeric('avg_confidence', { precision: 4, scale: 3 }),
    rocSource: varchar('roc_source', { length: 16 }),
    // Added by v_fund_detail.
    inception: date('inception'),
    cik: varchar('cik', { length: 12 }),
    seriesId: varchar('series_id', { length: 16 }),
    tiingoPermaTicker: varchar('tiingo_perma_ticker', { length: 24 }),
    distFrequency: varchar('dist_frequency', { length: 16 }),
    firstExDate: date('first_ex_date'),
    lastExDate: date('last_ex_date'),
    lifetimeDistributionCount: integer('lifetime_distribution_count'),
    comp8937Count: integer('comp_8937_count'),
    comp19a1Count: integer('comp_19a_1_count'),
    compTotalCount: integer('comp_total_count'),
    latestFinalExDate: date('latest_final_ex_date'),
    supersededCount: integer('superseded_count'),
    openReviewQueueCount: integer('open_review_queue_count'),
    /** Denominator for `avgConfidence` — see the note on `vScreener`. */
    confidenceN: integer('confidence_n'),
  },
).existing();

/**
 * `etf.v_distribution_history` — one row per distribution; the fund-detail
 * page's table and the thing that makes the moat visible. Hides the
 * current-vs-superseded + source-precedence + split-adjustment joins from the
 * consumer (§7). `superseded` is always false in this view (present so the
 * shape does not change if a history variant is added later).
 *
 * Phase 7 (PHASE_7_SPEC.md §5 Deliverable 3) removed four Tiingo-derived
 * price columns: `close_on_ex_date`, `close_on_ex_date_adjusted`,
 * `cum_split_factor`, `amount_adjusted`. Raw daily prices cannot be served
 * through the developer API at any tier, and require the $250/mo Display
 * Redistribution plan to show on the site; the $50/mo Internal Commercial
 * plan we are on does not cover them (TIINGO_LICENSE_RESPONSE.md §1/§2).
 * They come back tagged `sponsor` once Phase 8's sponsor NAV ingestion lands
 * them from sponsor pages.
 *
 * 2026-08-20 (OPEN_ITEMS.md Decisions D1, migration 0011): `amount` and
 * `confidence_score` are gated row-level. The view emits them only where
 * `field_sources->>'amount' = 'filing'`; otherwise NULL, with `amount_source`
 * naming the origin. The base column stays tagged `tiingo` in the manifest —
 * that is still true of 2,279 of 3,523 rows — so this is a statement about
 * what the view emits, not a re-tagging of the table. The raw dividend table
 * TIINGO_LICENSE_RESPONSE.md §2 bars therefore never forms: what leaves here
 * is the sponsor's own filed figure or nothing.
 *
 * Every row is kept, including the withheld ones. A filtered view would read
 * as complete coverage when it is 1,244 of 3,523 (#28), and the row still
 * carries the thing the product is actually about — a filed tax character
 * attached to a dated distribution.
 *
 * Phase 7 (PHASE_7_SPEC.md §5 Deliverable 7) changed the composition LATERAL
 * join to field-level precedence. One order throughout — 1099 > 8937 > 19a-1,
 * matching `SOURCE_PRECEDENCE` in the engine's supersede job:
 *
 *   `roc_pct`   → 1099, else 8937, else 19a-1
 *   `nii_pct`   → 1099, else 19a-1   (the 8937 reports ROC only)
 *   ST/LT gain  → 1099, else 19a-1   (empty in practice — no source reports them)
 *
 * The previous single-row pick made `nii_pct` NULL for TSLY and NVDY because
 * every current row for them is an 8937 (ROC-only); the data was in the
 * *superseded* 19a-1 rows and the view didn't surface it. The join therefore
 * does not consult `superseded_by_id` at all — reading across the
 * estimate/final pair is the point, and one row per source per distribution
 * is already guaranteed by `comp_dist_source_uniq`.
 *
 * `source` / `is_estimate` / `parse_confidence` / `source_key` /
 * `source_page_url` describe the row `roc_pct` came from, and follow the same
 * order as `roc_pct` deliberately: a `source` of '1099' beside a ROC figure
 * taken from the 19a-1 would attribute the filed number to the wrong document.
 */
export const vDistributionHistory = etf.view(
  'v_distribution_history',
  {
    ticker: varchar('ticker', { length: 12 }),
    exDate: date('ex_date'),
    recordDate: date('record_date'),
    payDate: date('pay_date'),
    /**
     * As paid on the ex-date, in the share terms of that date — and **NULL
     * unless a filing supplied it**. Migration 0011 gates this column on
     * `field_sources->>'amount' = 'filing'`; read `amountSource` to tell a
     * withheld amount from a missing one.
     */
    amount: numeric('amount', { precision: 12, scale: 6 }),
    /**
     * Where this row's amount came from — `filing`, `tiingo`, `sponsor`, or
     * `unknown`. Always populated, including when `amount` is NULL: it is the
     * column that makes "we may not publish this" distinguishable from "we do
     * not have this".
     */
    amountSource: varchar('amount_source', { length: 16 }),
    /** Gated by the same predicate as `amount` — the score is about an amount. */
    confidenceScore: numeric('confidence_score', { precision: 4, scale: 3 }),
    rocPct: numeric('roc_pct', { precision: 6, scale: 3 }),
    niiPct: numeric('nii_pct', { precision: 6, scale: 3 }),
    stGainPct: numeric('st_gain_pct', { precision: 6, scale: 3 }),
    ltGainPct: numeric('lt_gain_pct', { precision: 6, scale: 3 }),
    source: varchar('source', { length: 16 }),
    isEstimate: boolean('is_estimate'),
    parseConfidence: numeric('parse_confidence', { precision: 4, scale: 3 }),
    sourceKey: text('source_key'),
    sourcePageUrl: text('source_page_url'),
    superseded: boolean('superseded'),
  },
).existing();