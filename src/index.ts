// @y2f/db-schema — entry point.
//
// The full `etf.*` Drizzle schema lands in Action Plan Phase 1
// (funds, distributions, distribution_composition, nav_history, computed_metrics).
// For Phase 0 we export an empty barrel so the package builds and Y2F can wire
// the submodule without a hard dependency on schema content yet.
export {};