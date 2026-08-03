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
  numeric,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const etf = pgSchema('etf');

/** Master fund registry. Seeded from EDGAR + sponsor pages. */
export const funds = etf.table('funds', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 12 }).notNull().unique(),
  name: text('name').notNull(),
  sponsor: varchar('sponsor', { length: 80 }).notNull(), // YieldMax, Roundhill, NEOS...
  cik: varchar('cik', { length: 12 }), // SEC identifier
  strategyType: varchar('strategy_type', { length: 40 }), // single_stock_option, weekly_index, covered_call, cef...
  underlying: varchar('underlying', { length: 40 }), // TSLA, NDX, etc. (nullable)
  inception: date('inception'),
  expenseRatio: numeric('expense_ratio', { precision: 6, scale: 4 }),
  distFrequency: varchar('dist_frequency', { length: 16 }), // weekly, monthly, quarterly
  status: varchar('status', { length: 16 }).default('active'), // active, closed, merged
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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
  },
  (t) => ({
    distIdx: index('comp_dist_idx').on(t.distributionId),
  }),
);

/** NAV + price history for erosion / real-yield math. */
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
  },
  (t) => ({
    fundDateUniq: uniqueIndex('nav_fund_date_uniq').on(t.fundId, t.date),
  }),
);

/** Materialized derived metrics, recomputed on each refresh. Read surface for UI + API. */
export const computedMetrics = etf.table(
  'computed_metrics',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict' }),
    asOf: date('as_of').notNull(),
    ttmYield: numeric('ttm_yield', { precision: 8, scale: 4 }),
    realYield: numeric('real_yield', { precision: 8, scale: 4 }), // dist yield − NAV erosion
    navErosion12m: numeric('nav_erosion_12m', { precision: 8, scale: 4 }),
    distCagr: numeric('dist_cagr', { precision: 8, scale: 4 }),
    totalReturnDrip: numeric('total_return_drip', { precision: 8, scale: 4 }),
    ttmRocPct: numeric('ttm_roc_pct', { precision: 6, scale: 3 }), // trailing ROC share
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    fundAsOfUniq: uniqueIndex('metrics_fund_asof_uniq').on(t.fundId, t.asOf),
  }),
);