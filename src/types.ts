// @y2f/db-schema — inferred insert/select types for the etf.* tables.
//
// Re-exported via the package barrel. Y2F imports these to type its read-side
// data-access functions without redefining the schema.

import type {
  computedMetrics,
  distributionComposition,
  distributions,
  funds,
  navHistory,
  parseReviewQueue,
} from './schema';

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;

export type Distribution = typeof distributions.$inferSelect;
export type NewDistribution = typeof distributions.$inferInsert;

export type DistributionComposition = typeof distributionComposition.$inferSelect;
export type NewDistributionComposition = typeof distributionComposition.$inferInsert;

export type NavHistory = typeof navHistory.$inferSelect;
export type NewNavHistory = typeof navHistory.$inferInsert;

export type ComputedMetric = typeof computedMetrics.$inferSelect;
export type NewComputedMetric = typeof computedMetrics.$inferInsert;

export type ParseReviewItem = typeof parseReviewQueue.$inferSelect;
export type NewParseReviewItem = typeof parseReviewQueue.$inferInsert;