// @y2f/db-schema — provenance manifest.
//
// PHASE_7_SPEC.md §4. Every column in every base table in `etf.*` carries a
// machine-checkable provenance tag. The manifest lives here — in the shared
// schema package, not in the engine and not as Postgres column comments —
// because Phase 9's API and Y2F both need these tags at runtime to scope
// endpoints, and neither can import from the engine. The package is the only
// place that is both importable and shared.
//
// Six tags:
//   filing   — parsed from a 19a-1, 8937 or 1099 document. This is the moat.
//   edgar    — from SEC EDGAR submissions / company data.
//   sponsor  — scraped from a sponsor's public site.
//   tiingo   — from the Tiingo API. NOT publishable without a written
//              redistribution right; the $50/mo Internal Commercial plan
//              covers derived scalars only (TIINGO_LICENSE_RESPONSE.md §1).
//   derived  — computed by this repo; carries `inputs: [...]` naming the
//              columns it derives from. Its effective provenance is the union
//              of its inputs, resolved transitively. `ttm_yield` is `derived`
//              from `distributions.amount` (`tiingo` today) and
//              `nav_history.close` (`tiingo`), so it resolves to
//              Tiingo-tainted today and resolves clean the moment those two
//              inputs are re-sourced — with no edit to `ttm_yield`'s own tag.
//              That property is the whole point of the design: the tags
//              describe the plumbing, and the licensing verdict falls out.
//   internal — surrogate keys, timestamps, bookkeeping. Never carries data
//              from a source. A deliberate escape hatch, and therefore the
//              weak point: `pnpm dq` requires an `internal` tag to justify
//              itself with a one-line `reason`, so an `internal` tag used to
//              smuggle a real column past the check is visible in review.
//
// The licensing gate in `pnpm dq` (Deliverable 4 assertion 3) resolves each
// column reachable from a granted view through this manifest. If any resolves
// to `tiingo` (and is not on the written-permission allowlist for the six
// cleared scalars), the gate fails.

/**
 * A column's provenance. `derived` carries the columns it derives from, as
 * `table.column` references into this same manifest; `internal` carries a
 * one-line reason because `internal` is the escape hatch and must justify
 * itself.
 */
export type Provenance =
  | { tag: 'filing' }
  | { tag: 'edgar' }
  | { tag: 'sponsor' }
  | { tag: 'tiingo' }
  | { tag: 'derived'; inputs: string[] } // 'table.column' refs into PROVENANCE
  | { tag: 'internal'; reason: string };

/**
 * The six scalar metrics in `computed_metrics` that Tiingo cleared on the
 * $50/mo Internal Commercial plan (TIINGO_LICENSE_RESPONSE.md §1). The tag on
 * each stays `derived` with `tiingo` inputs — the tag keeps telling the truth
 * about where the bytes came from — but this allowlist records that someone in
 * authority said yes, with the date and the permission's scope. The licensing
 * gate treats an allowlisted `tiingo`-resolved column as permitted.
 *
 * `computed_metrics` exposes the latest row only through the views, which is
 * the shape Tiingo cleared. The base table holds a per-`as_of` history; that
 * is why `computed_metrics` itself is not granted to `y2f_reader`
 * (PHASE_7_SPEC.md §2.2 / Deliverable 2) — a long daily history of
 * `nav_erosion_12m` published daily would leak the shape of the price series.
 */
export interface TiingoAllowlistedColumn {
  column: string; // 'table.column'
  reason: string;
  date: string; // ISO yyyy-mm-dd — the date the permission was recorded
  source: string; // citation, e.g. 'TIINGO_LICENSE_RESPONSE.md §1'
}

export const TIINGO_ALLOWLIST: readonly TiingoAllowlistedColumn[] = [
  {
    column: 'computed_metrics.ttm_yield',
    reason:
      'Single scalar 12-month distribution yield — cleared as a non-reconstructible derived figure',
    date: '2026-08-06',
    source: 'TIINGO_LICENSE_RESPONSE.md §1',
  },
  {
    column: 'computed_metrics.real_yield',
    reason:
      'Single scalar 12-month simple total return on the starting price — cleared as a non-reconstructible derived figure',
    date: '2026-08-06',
    source: 'TIINGO_LICENSE_RESPONSE.md §1',
  },
  {
    column: 'computed_metrics.nav_erosion_12m',
    reason:
      'Single scalar signed 12-month price return — cleared as a non-reconstructible derived figure. Latest-only through views; the base-table history is not granted (Deliverable 2).',
    date: '2026-08-06',
    source: 'TIINGO_LICENSE_RESPONSE.md §1/§4',
  },
  {
    column: 'computed_metrics.dist_cagr',
    reason:
      'Single scalar distribution CAGR — cleared as a non-reconstructible derived figure',
    date: '2026-08-06',
    source: 'TIINGO_LICENSE_RESPONSE.md §1',
  },
  {
    column: 'computed_metrics.total_return_drip',
    reason:
      'Single scalar 12-month DRIP total return — cleared as a non-reconstructible derived figure',
    date: '2026-08-06',
    source: 'TIINGO_LICENSE_RESPONSE.md §1',
  },
  {
    column: 'computed_metrics.ttm_roc_pct',
    reason:
      'Single scalar trailing ROC share — cleared as a non-reconstructible derived figure',
    date: '2026-08-06',
    source: 'TIINGO_LICENSE_RESPONSE.md §1',
  },
] as const;

/**
 * Every column in every base table in `etf.*`. Keys are `table.column`.
 *
 * Field-level provenance for `distributions.{amount, ex_date, record_date,
 * pay_date, declaration_date}` is recorded per-row in
 * `distributions.field_sources` (PHASE_7_SPEC.md §5 Deliverable 6) once that
 * column exists. While any row reports `tiingo` for a field, the licensing
 * gate resolves that column to `tiingo` (the row-level majority wins — the
 * gate is conservative). The manifest tag below names the column's
 * *declared* provenance today; when Deliverable 6 finishes and every row
 * reports `filing`, this entry moves to `{ tag: 'filing' }` with no other
 * change to the gate.
 */
export const PROVENANCE: Record<string, Provenance> = {
  // ─── funds ────────────────────────────────────────────────────────────
  'funds.id': { tag: 'internal', reason: 'surrogate primary key' },
  'funds.ticker': { tag: 'edgar' },
  'funds.name': {
    tag: 'derived',
    inputs: ['funds.ticker'],
    // The name is committed in the universe file today; Phase 3 sponsor pages
    // later supply/confirm it. Treat it as derived from identity for now.
  },
  'funds.sponsor': { tag: 'edgar' },
  'funds.cik': { tag: 'edgar' },
  'funds.series_id': { tag: 'edgar' },
  'funds.class_id': { tag: 'edgar' },
  // Phase 8 — CUSIP is a public securities identifier (issued by CUSIP Global
  // Services, appears on SEC filings and sponsor tax documents). It is the
  // stable per-fund key the group 19a-1 parser resolves a parsed block by,
  // since group notices carry no ticker. Tagged `edgar`, not `sponsor`: the
  // value comes from filings (8937 Statement 1, N-PORT) even when the
  // immediate source is a sponsor PDF, because the CUSIP itself is a public
  // SEC identifier rather than sponsor-derived market data.
  'funds.cusip': { tag: 'edgar' },
  'funds.tiingo_perma_ticker': {
    tag: 'internal',
    reason: 'Tiingo stable internal identifier (e.g. US000000107614) — a lookup key for Tiingo API resolution, not market data; not reconstructible into prices or dividends',
  },
  'funds.last_ingested_at': { tag: 'internal', reason: 'ingestion bookkeeping timestamp' },
  'funds.strategy_type': { tag: 'edgar' },
  'funds.underlying': { tag: 'edgar' },
  'funds.inception': { tag: 'sponsor' },
  'funds.expense_ratio': { tag: 'sponsor' },
  'funds.dist_frequency': { tag: 'sponsor' },
  'funds.status': { tag: 'internal', reason: 'lifecycle flag (active/closed/merged), set by operator' },
  'funds.created_at': { tag: 'internal', reason: 'row-creation timestamp' },
  'funds.updated_at': { tag: 'internal', reason: 'row-update timestamp' },

  // ─── distributions ────────────────────────────────────────────────────
  // amount + the four date fields are row-level provenance via
  // `distributions.field_sources` once Deliverable 6 lands. Until then, every
  // row is Tiingo-sourced (§3.1: 336/336) and the gate resolves them to
  // `tiingo`. The manifest tag is what the column *declares* today.
  'distributions.id': { tag: 'internal', reason: 'surrogate primary key' },
  'distributions.fund_id': {
    tag: 'internal',
    reason: 'FK to funds.id; identity reference, not source data',
  },
  'distributions.ex_date': { tag: 'tiingo' },
  'distributions.record_date': { tag: 'tiingo' },
  'distributions.pay_date': { tag: 'tiingo' },
  'distributions.declaration_date': { tag: 'tiingo' },
  'distributions.amount': { tag: 'tiingo' },
  'distributions.frequency': { tag: 'internal', reason: 'derived from the ex-date cadence, set by ingestion' },
  'distributions.source_provider': {
    tag: 'internal',
    reason: 'row-level source label (tiingo/filing/sponsor); see distributions.field_sources for field-level',
  },
  'distributions.field_sources': {
    tag: 'internal',
    reason: 'jsonb map of per-field provenance; written by the filing-source job (Deliverable 6)',
  },
  'distributions.confidence_score': {
    tag: 'derived',
    // Computed from composition-source agreement and amount matches, so it
    // inherits `distributions.amount` — Tiingo today, `filing` once
    // Deliverable 6 re-sources that row.
    //
    // NOT allowlisted, deliberately. The argument that a comparison-derived
    // score is not itself Tiingo data is only an argument: it is the *open
    // follow-up question* in TIINGO_LICENSE_RESPONSE.md §5, not something
    // Tiingo has answered. An allowlist entry means "someone in authority said
    // yes, on this date, in this document"; there is no such date to cite here.
    // Allowlist it only if and when a reply arrives.
    inputs: ['distribution_composition.source', 'distributions.amount'],
  },
  'distributions.created_at': { tag: 'internal', reason: 'row-creation timestamp' },

  // ─── distribution_composition ─────────────────────────────────────────
  'distribution_composition.id': { tag: 'internal', reason: 'surrogate primary key' },
  'distribution_composition.distribution_id': {
    tag: 'internal',
    reason: 'FK to distributions.id; identity reference, not source data',
  },
  'distribution_composition.roc_pct': { tag: 'filing' },
  'distribution_composition.nii_pct': { tag: 'filing' },
  'distribution_composition.st_gain_pct': { tag: 'filing' },
  'distribution_composition.lt_gain_pct': { tag: 'filing' },
  'distribution_composition.source': {
    tag: 'internal',
    reason: 'source label (19a-1/8937/1099) naming which filing this row came from',
  },
  'distribution_composition.is_estimate': {
    tag: 'internal',
    reason: 'boolean derived from `source` (19a-1 = estimate, 8937/1099 = final)',
  },
  'distribution_composition.source_key': {
    tag: 'internal',
    reason: 'R2 object key of the source PDF — internal pointer, not the source data itself',
  },
  'distribution_composition.source_page_url': { tag: 'sponsor' },
  'distribution_composition.captured_at': { tag: 'internal', reason: 'archive timestamp' },
  'distribution_composition.parse_method': {
    tag: 'internal',
    reason: 'parser bookkeeping (pdfplumber/gemini/manual)',
  },
  'distribution_composition.parse_confidence': {
    tag: 'internal',
    reason: 'parser confidence scalar (0..1), set by the parser service',
  },
  'distribution_composition.parsed_at': { tag: 'internal', reason: 'parse timestamp' },
  'distribution_composition.superseded_by_id': {
    tag: 'internal',
    reason: 'FK to a composition row that replaced this one; supersession bookkeeping',
  },
  'distribution_composition.superseded_at': { tag: 'internal', reason: 'supersession timestamp' },

  // ─── reconciliation_log ───────────────────────────────────────────────
  'reconciliation_log.id': { tag: 'internal', reason: 'surrogate primary key' },
  'reconciliation_log.distribution_id': {
    tag: 'internal',
    reason: 'FK to distributions.id; identity reference, not source data',
  },
  'reconciliation_log.action': { tag: 'internal', reason: 'audit-trail action label' },
  'reconciliation_log.winning_source': { tag: 'internal', reason: 'audit-trail source label' },
  'reconciliation_log.losing_source': { tag: 'internal', reason: 'audit-trail source label' },
  'reconciliation_log.detail': { tag: 'internal', reason: 'audit-trail human-readable detail' },
  'reconciliation_log.evidence': {
    tag: 'internal',
    reason: 'audit-trail JSON; may contain values from either source but is itself bookkeeping',
  },
  'reconciliation_log.created_at': { tag: 'internal', reason: 'row-creation timestamp' },

  // ─── parse_review_queue ───────────────────────────────────────────────
  'parse_review_queue.id': { tag: 'internal', reason: 'surrogate primary key' },
  'parse_review_queue.fund_id': {
    tag: 'internal',
    reason: 'FK to funds.id; identity reference, not source data',
  },
  'parse_review_queue.distribution_id': {
    tag: 'internal',
    reason: 'FK to distributions.id; identity reference, not source data',
  },
  'parse_review_queue.source_key': {
    tag: 'internal',
    reason: 'R2 object key of the PDF under review — internal pointer',
  },
  'parse_review_queue.source_page_url': { tag: 'sponsor' },
  'parse_review_queue.reason': { tag: 'internal', reason: 'queue reason label' },
  'parse_review_queue.detail': { tag: 'internal', reason: 'queue detail text' },
  'parse_review_queue.raw_extract': {
    tag: 'internal',
    reason: 'parser raw output kept for triage; not exposed by any view',
  },
  'parse_review_queue.status': { tag: 'internal', reason: 'review lifecycle flag' },
  'parse_review_queue.created_at': { tag: 'internal', reason: 'row-creation timestamp' },
  'parse_review_queue.resolved_at': { tag: 'internal', reason: 'review resolution timestamp' },

  // ─── nav_history ──────────────────────────────────────────────────────
  // `nav_history.close` and `nav_history.split_factor` are genuinely Tiingo
  // data — raw daily closes and split factors. `nav_history.date` is the
  // NYSE trading calendar: Tiingo supplied the specific dates, but the dates
  // themselves are public information (the exchange publishes them) and are
  // not market data in the licensing sense. Tagging `date` as `internal`
  // (temporal index) rather than `tiingo` keeps the gate from false-
  // positives on views that use `date` only as a `WHERE`/aggregate key —
  // `v_screener`'s `data_as_of = max(date)` is "which trading day is this
  // snapshot for", not a Tiingo-derived value. `nav` and `close` stay
  // tagged by their real source.
  //
  // Deliverable 5 (de-scoped to Phase 8) replaces `close` with sponsor close
  // and fills `nav` from sponsor pages. A `source_provider` column is a
  // prerequisite for that work (PHASE_7_SPEC.md §3.3); the manifest entry
  // for it is added in the migration that adds the column, so the
  // completeness check (assertion 1) never sees a stale entry.
  'nav_history.id': { tag: 'internal', reason: 'surrogate primary key' },
  'nav_history.fund_id': {
    tag: 'internal',
    reason: 'FK to funds.id; identity reference, not source data',
  },
  'nav_history.date': {
    tag: 'internal',
    reason: 'NYSE trading calendar date — public information, not market data; Tiingo supplied the dates but is not the source of the calendar',
  },
  'nav_history.nav': { tag: 'sponsor' },
  'nav_history.close': { tag: 'tiingo' },
  'nav_history.split_factor': { tag: 'tiingo' },
  'nav_history.cum_split_factor': {
    tag: 'derived',
    inputs: ['nav_history.split_factor'],
  },

  // ─── computed_metrics ─────────────────────────────────────────────────
  'computed_metrics.id': { tag: 'internal', reason: 'surrogate primary key' },
  'computed_metrics.fund_id': {
    tag: 'internal',
    reason: 'FK to funds.id; identity reference, not source data',
  },
  'computed_metrics.as_of': {
    tag: 'derived',
    inputs: ['nav_history.date'],
  },
  'computed_metrics.ttm_yield': {
    tag: 'derived',
    inputs: ['distributions.amount', 'nav_history.close', 'nav_history.cum_split_factor'],
  },
  'computed_metrics.real_yield': {
    tag: 'derived',
    inputs: ['distributions.amount', 'nav_history.close', 'nav_history.cum_split_factor'],
  },
  'computed_metrics.nav_erosion_12m': {
    tag: 'derived',
    inputs: ['nav_history.close', 'nav_history.cum_split_factor'],
  },
  'computed_metrics.dist_cagr': {
    tag: 'derived',
    inputs: ['distributions.amount', 'nav_history.cum_split_factor'],
  },
  'computed_metrics.total_return_drip': {
    tag: 'derived',
    inputs: ['distributions.amount', 'nav_history.close', 'nav_history.cum_split_factor'],
  },
  'computed_metrics.ttm_roc_pct': {
    tag: 'derived',
    inputs: ['distribution_composition.roc_pct', 'distributions.amount'],
  },
  'computed_metrics.ttm_roc_coverage_pct': {
    tag: 'derived',
    inputs: ['distribution_composition.roc_pct', 'distributions.amount'],
  },
  'computed_metrics.dist_cagr_years': {
    tag: 'internal',
    reason: 'span qualifier for dist_cagr (1/2/3); derived from ex-date span, not source data',
  },
  'computed_metrics.created_at': { tag: 'internal', reason: 'row-creation timestamp' },
} as const;

/**
 * Convenience set: every column on the Tiingo written-permission allowlist.
 * The licensing gate consults this to treat an allowlisted `tiingo`-resolved
 * column as permitted rather than failed.
 */
export const TIINGO_ALLOWLIST_COLUMNS: ReadonlySet<string> = new Set(
  TIINGO_ALLOWLIST.map((a) => a.column),
);

// ─── Transitive resolution ──────────────────────────────────────────────
//
// Pure functions. The licensing gate in `pnpm dq` (Deliverable 4 assertion 3)
// calls these; the unit tests in provenance.test.ts exercise them without a
// database. Kept here rather than in scripts/data-quality.ts so the schema
// package can be consumed by Phase 9's API and Y2F for the same resolution
// logic, and so the fixture in the test can live next to the manifest.

/** The set of source tags that carry real source data. */
export type SourceTag = 'filing' | 'edgar' | 'sponsor' | 'tiingo';

const SOURCE_TAGS: ReadonlySet<SourceTag> = new Set(['filing', 'edgar', 'sponsor', 'tiingo']);

/**
 * Resolve a single column to the set of source tags it ultimately derives
 * from. `internal` contributes nothing (it carries no source data); `derived`
 * resolves through its inputs transitively; a source tag resolves to itself.
 *
 * Cycles are guarded: a `derived` chain that revisits a column already on the
 * current path stops descending and returns what it has so far. The
 * resolvability check (`assertAcyclic`) catches the same cycle as a hard
 * error, so a cycle here means the manifest was not validated before use —
 * the resolution does not loop forever either way.
 */
export function resolveProvenance(
  column: string,
  manifest: Record<string, Provenance> = PROVENANCE,
): Set<SourceTag> {
  const out = new Set<SourceTag>();
  const visited = new Set<string>();
  walk(column);
  return out;

  function walk(col: string): void {
    if (visited.has(col)) return;
    visited.add(col);
    const entry = manifest[col];
    if (!entry) return; // unknown column contributes nothing; completeness check flags this
    if (SOURCE_TAGS.has(entry.tag as SourceTag)) {
      out.add(entry.tag as SourceTag);
    } else if (entry.tag === 'derived') {
      for (const input of entry.inputs) walk(input);
    }
    // `internal` contributes nothing.
  }
}

/**
 * Is a column's resolved provenance Tiingo-tainted? True iff `tiingo` is in
 * the resolved set. The licensing gate uses this; `TIINGO_ALLOWLIST_COLUMNS`
 * is consulted separately to permit the six cleared scalars.
 */
export function isTiingoTainted(
  column: string,
  manifest: Record<string, Provenance> = PROVENANCE,
): boolean {
  return resolveProvenance(column, manifest).has('tiingo');
}

interface AcyclicityViolation {
  column: string;
  cycle: string[];
}

/**
 * Assertion 2 (resolvability): every `derived` input reference resolves to a
 * manifest entry, and the input graph is acyclic. Returns the violations; an
 * empty array means the manifest is well-formed.
 */
export function assertAcyclic(
  manifest: Record<string, Provenance> = PROVENANCE,
): AcyclicityViolation[] {
  const violations: AcyclicityViolation[] = [];

  // First: every `derived` input names a column that exists in the manifest.
  for (const [col, entry] of Object.entries(manifest)) {
    if (entry.tag !== 'derived') continue;
    for (const input of entry.inputs) {
      if (!(input in manifest)) {
        violations.push({ column: col, cycle: [col, input] });
      }
    }
  }

  // Second: cycle detection via DFS. Track the current path; revisiting a
  // node on the path is a cycle.
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const col of Object.keys(manifest)) color.set(col, WHITE);

  const path: string[] = [];
  for (const col of Object.keys(manifest)) {
    if (color.get(col) === WHITE) dfs(col);
  }

  function dfs(col: string): void {
    color.set(col, GRAY);
    path.push(col);
    const entry = manifest[col];
    if (entry?.tag === 'derived') {
      for (const input of entry.inputs) {
        if (color.get(input) === GRAY) {
          // Back edge → cycle. Slice from the revisited node to current.
          const start = path.indexOf(input);
          violations.push({ column: input, cycle: path.slice(start).concat(input) });
        } else if (color.get(input) === WHITE) {
          dfs(input);
        }
      }
    }
    path.pop();
    color.set(col, BLACK);
  }

  return violations;
}