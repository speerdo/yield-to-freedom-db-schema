// Unit tests for the provenance manifest's transitive resolution.
//
// PHASE_7_SPEC.md §5 Deliverable 4: "Unit tests for transitive resolution,
// including a deliberate `tiingo`-tainted `derived` column fixture."
//
// These run without a database — the resolution functions in provenance.ts
// are pure. The licensing gate in scripts/data-quality.ts calls them against
// the live catalog; here we test the logic itself against fixtures.

import { describe, expect, test } from 'vitest';
import {
  type Provenance,
  PROVENANCE,
  TIINGO_ALLOWLIST_COLUMNS,
  assertAcyclic,
  isTiingoTainted,
  resolveProvenance,
} from './provenance.js';

describe('resolveProvenance', () => {
  test('a source tag resolves to itself', () => {
    expect([...resolveProvenance('nav_history.close', PROVENANCE)]).toEqual(['tiingo']);
    expect([...resolveProvenance('distribution_composition.roc_pct', PROVENANCE)]).toEqual([
      'filing',
    ]);
    expect([...resolveProvenance('funds.inception', PROVENANCE)]).toEqual(['sponsor']);
    expect([...resolveProvenance('funds.cik', PROVENANCE)]).toEqual(['edgar']);
  });

  test('an internal tag resolves to nothing', () => {
    expect([...resolveProvenance('funds.id', PROVENANCE)]).toEqual([]);
    expect([...resolveProvenance('reconciliation_log.evidence', PROVENANCE)]).toEqual([]);
  });

  test('a derived column resolves transitively through its inputs', () => {
    // computed_metrics.nav_erosion_12m is derived from nav_history.close and
    // nav_history.cum_split_factor. cum_split_factor is itself derived from
    // nav_history.split_factor. Both paths bottom out at `tiingo`.
    const resolved = resolveProvenance('computed_metrics.nav_erosion_12m', PROVENANCE);
    expect([...resolved]).toEqual(['tiingo']);
  });

  test('a derived column with mixed inputs resolves to the union of its inputs', () => {
    // computed_metrics.ttm_roc_pct is derived from distribution_composition.roc_pct
    // (filing) and distributions.amount (tiingo). The union is {filing, tiingo}.
    const resolved = resolveProvenance('computed_metrics.ttm_roc_pct', PROVENANCE);
    expect(resolved.has('filing')).toBe(true);
    expect(resolved.has('tiingo')).toBe(true);
    expect(resolved.size).toBe(2);
  });

  test('the deliberate tiingo-tainted derived fixture (PHASE_7_SPEC.md §5 Deliverable 4)', () => {
    // The spec calls for a fixture where a `derived` column is tainted by a
    // `tiingo` input. computed_metrics.ttm_yield is exactly that today: it
    // derives from distributions.amount (tiingo) and nav_history.close (tiingo).
    // The whole point of the design is that ttm_yield's own tag never says
    // `tiingo` — it says `derived` — and the taint falls out of the inputs.
    const manifest: Record<string, Provenance> = {
      'raw.price': { tag: 'tiingo' },
      'raw.dividend': { tag: 'tiingo' },
      'scalar.yield': {
        tag: 'derived',
        inputs: ['raw.price', 'raw.dividend'],
      },
    };
    expect(isTiingoTainted('scalar.yield', manifest)).toBe(true);
    expect([...resolveProvenance('scalar.yield', manifest)]).toEqual(['tiingo']);
  });

  test('the fixture resolves clean the moment its inputs are re-sourced', () => {
    // Same plumbing, inputs now tagged `filing`. No edit to `scalar.yield`'s
    // own tag — the licensing verdict fell out of the inputs, exactly as
    // PHASE_7_SPEC.md §4 promises.
    const manifest: Record<string, Provenance> = {
      'raw.price': { tag: 'filing' },
      'raw.dividend': { tag: 'filing' },
      'scalar.yield': {
        tag: 'derived',
        inputs: ['raw.price', 'raw.dividend'],
      },
    };
    expect(isTiingoTainted('scalar.yield', manifest)).toBe(false);
  });

  test('a cycle in the derived graph does not loop forever', () => {
    // assertAcyclic flags this; resolution must still terminate.
    const cyclic: Record<string, Provenance> = {
      'a.x': { tag: 'derived', inputs: ['b.x'] },
      'b.x': { tag: 'derived', inputs: ['a.x'] },
    };
    expect(() => resolveProvenance('a.x', cyclic)).not.toThrow();
  });
});

describe('isTiingoTainted', () => {
  test('a directly-Tiingo column is tainted', () => {
    expect(isTiingoTainted('nav_history.close', PROVENANCE)).toBe(true);
    expect(isTiingoTainted('distributions.amount', PROVENANCE)).toBe(true);
  });

  test('a filing column is not tainted', () => {
    expect(isTiingoTainted('distribution_composition.roc_pct', PROVENANCE)).toBe(false);
  });

  test('a derived column whose inputs are all Tiingo is tainted', () => {
    expect(isTiingoTainted('computed_metrics.nav_erosion_12m', PROVENANCE)).toBe(true);
  });

  test('a derived column with a Tiingo input is tainted even if other inputs are clean', () => {
    expect(isTiingoTainted('computed_metrics.ttm_roc_pct', PROVENANCE)).toBe(true);
  });
});

describe('assertAcyclic', () => {
  test('the production manifest is acyclic and every derived input resolves', () => {
    const violations = assertAcyclic(PROVENANCE);
    expect(violations).toEqual([]);
  });

  test('flags a derived input that names a non-existent column', () => {
    const manifest: Record<string, Provenance> = {
      'a.x': { tag: 'derived', inputs: ['does.not.exist'] },
    };
    const violations = assertAcyclic(manifest);
    expect(violations.length).toBe(1);
    expect(violations[0]?.column).toBe('a.x');
  });

  test('flags a direct cycle', () => {
    const manifest: Record<string, Provenance> = {
      'a.x': { tag: 'derived', inputs: ['b.x'] },
      'b.x': { tag: 'derived', inputs: ['a.x'] },
    };
    const violations = assertAcyclic(manifest);
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  test('flags a longer cycle', () => {
    const manifest: Record<string, Provenance> = {
      'a.x': { tag: 'derived', inputs: ['b.x'] },
      'b.x': { tag: 'derived', inputs: ['c.x'] },
      'c.x': { tag: 'derived', inputs: ['a.x'] },
    };
    const violations = assertAcyclic(manifest);
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  test('a clean manifest has no violations', () => {
    const manifest: Record<string, Provenance> = {
      'raw.price': { tag: 'tiingo' },
      'scalar.yield': { tag: 'derived', inputs: ['raw.price'] },
    };
    expect(assertAcyclic(manifest)).toEqual([]);
  });
});

describe('API-key billing tables (0015 + 0016)', () => {
  // The exact column set information_schema reports for the three tables. A
  // column added to either migration without a manifest entry fails
  // `pnpm dq`'s completeness check; this pins the fix that made it green, and
  // fails first if someone deletes one of these entries.
  const columns = [
    'api_keys.id',
    'api_keys.key_hash',
    'api_keys.key_prefix',
    'api_keys.owner_email',
    'api_keys.plan',
    'api_keys.created_at',
    'api_keys.revoked_at',
    'api_keys.note',
    'api_keys.stripe_customer_id',
    'api_keys.stripe_subscription_id',
    'api_key_usage.api_key_id',
    'api_key_usage.day',
    'api_key_usage.requests',
    'api_key_stripe_events.event_id',
    'api_key_stripe_events.received_at',
  ] as const;

  test('every column is tagged internal', () => {
    for (const column of columns) {
      expect(PROVENANCE[column], column).toEqual({
        tag: 'internal',
        reason: expect.any(String),
      });
    }
  });

  test('every internal tag justifies itself', () => {
    // `internal` is the escape hatch: an empty reason is how a real column
    // would slip past review.
    for (const column of columns) {
      const entry = PROVENANCE[column];
      expect(entry?.tag, column).toBe('internal');
      expect(entry?.tag === 'internal' ? entry.reason.trim().length : 0, column).toBeGreaterThan(0);
    }
  });
});

describe('TIINGO_ALLOWLIST', () => {
  test('the six cleared scalars are on the allowlist', () => {
    // TIINGO_LICENSE_RESPONSE.md §1 names these six. The gate treats them as
    // permitted-when-tiingo-tainted because Tiingo cleared them in writing.
    const expected = [
      'computed_metrics.ttm_yield',
      'computed_metrics.real_yield',
      'computed_metrics.nav_erosion_12m',
      'computed_metrics.dist_cagr',
      'computed_metrics.total_return_drip',
      'computed_metrics.ttm_roc_pct',
    ];
    for (const col of expected) {
      expect(TIINGO_ALLOWLIST_COLUMNS.has(col)).toBe(true);
    }
  });

  test('the six cleared scalars are indeed Tiingo-tainted in the manifest', () => {
    // The allowlist is what records the written permission; the tag keeps
    // telling the truth about where the bytes came from. If any of these
    // were NOT tiingo-tainted, the allowlist would be lying about what it
    // was permitting. This test pins the contract: the permission is real
    // and necessary, not decorative.
    for (const col of TIINGO_ALLOWLIST_COLUMNS) {
      expect(isTiingoTainted(col, PROVENANCE)).toBe(true);
    }
  });
});