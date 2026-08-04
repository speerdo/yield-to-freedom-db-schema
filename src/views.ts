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
  },
).existing();

/**
 * `etf.v_distribution_history` — one row per distribution; the fund-detail
 * page's table and the thing that makes the moat visible. Hides the
 * current-vs-superseded + source-precedence + split-adjustment joins from the
 * consumer (§7). `amount` is as-paid; `amount_adjusted` is split-adjusted into
 * current-share terms. `superseded` is always false in this view (present so
 * the shape does not change if a history variant is added later).
 */
export const vDistributionHistory = etf.view(
  'v_distribution_history',
  {
    ticker: varchar('ticker', { length: 12 }),
    exDate: date('ex_date'),
    recordDate: date('record_date'),
    payDate: date('pay_date'),
    amount: numeric('amount', { precision: 12, scale: 6 }),
    amountAdjusted: numeric('amount_adjusted', { precision: 16, scale: 8 }),
    closeOnExDate: numeric('close_on_ex_date', { precision: 12, scale: 4 }),
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