// @y2f/db-schema — entry point.
//
// Re-exports the `etf.*` Drizzle tables, read views, inferred types, and
// connection helpers. Import as `import { funds, vScreener, type Fund,
// createDirectClient } from "@y2f/db-schema"`. Consumed by the worker + API in
// this repo and by yieldtofreedom (read-only) as a git submodule.

export * from './schema';
export * from './views';
export * from './types';
export * from './client';