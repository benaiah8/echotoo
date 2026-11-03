/**
 * Discover presentation grouping — opportunity stream → person appearances.
 * Max THREE opportunity boxes per appearance; same person may appear again later.
 * Does not fetch, rank, or drop opportunity ids.
 */

import { pairUpPersonKey } from "./pairUpPersonKey";

export const DISCOVER_OPPORTUNITIES_PER_APPEARANCE = 3;

export type DiscoverGroupableOpportunity = {
  opportunity_id: string;
  creator_id: string;
  profile_id?: string | null;
};

export type DiscoverPersonAppearance<T extends DiscoverGroupableOpportunity> = {
  /** Stable key: personKey + first opportunity id in this appearance. */
  appearanceKey: string;
  personKey: string;
  opportunities: T[];
};

function appearanceKeyFor<T extends DiscoverGroupableOpportunity>(
  personKey: string,
  first: T
): string {
  return `${personKey}:${first.opportunity_id}`;
}

/**
 * Pack remaining opportunities into appearances (≤ max per appearance).
 * Pulls later same-person rows into the open appearance (preserving relative order)
 * so other people separate subsequent appearances when present.
 */
function packAppearances<T extends DiscoverGroupableOpportunity>(
  remaining: T[],
  maxPerAppearance: number
): DiscoverPersonAppearance<T>[] {
  const pool = [...remaining];
  const out: DiscoverPersonAppearance<T>[] = [];

  while (pool.length > 0) {
    const first = pool.shift()!;
    const personKey = pairUpPersonKey(first);
    const opportunities: T[] = [first];

    let i = 0;
    while (opportunities.length < maxPerAppearance && i < pool.length) {
      if (pairUpPersonKey(pool[i]!) === personKey) {
        opportunities.push(pool.splice(i, 1)[0]!);
      } else {
        i += 1;
      }
    }

    out.push({
      appearanceKey: appearanceKeyFor(personKey, first),
      personKey,
      opportunities,
    });
  }

  return out;
}

/**
 * Deterministic Discover grouping.
 *
 * When `previous` is provided, those appearances are frozen (opportunity membership
 * filtered to ids still present). Newly appended opportunities only form
 * subsequent appearances — they never enlarge frozen groups.
 */
export function groupDiscoverOpportunities<
  T extends DiscoverGroupableOpportunity,
>(
  ordered: readonly T[],
  options?: {
    maxPerAppearance?: number;
    previous?: readonly DiscoverPersonAppearance<T>[] | null;
  }
): DiscoverPersonAppearance<T>[] {
  const maxPerAppearance =
    options?.maxPerAppearance ?? DISCOVER_OPPORTUNITIES_PER_APPEARANCE;
  const byId = new Map(ordered.map((row) => [row.opportunity_id, row]));
  const previous = options?.previous ?? null;

  if (!previous || previous.length === 0) {
    return packAppearances([...ordered], maxPerAppearance);
  }

  const used = new Set<string>();
  const frozen: DiscoverPersonAppearance<T>[] = [];

  for (const prev of previous) {
    const opportunities: T[] = [];
    for (const row of prev.opportunities) {
      const live = byId.get(row.opportunity_id);
      if (!live) continue;
      opportunities.push(live);
      used.add(live.opportunity_id);
    }
    if (opportunities.length === 0) continue;
    frozen.push({
      appearanceKey: prev.appearanceKey,
      personKey: prev.personKey,
      opportunities,
    });
  }

  const remaining = ordered.filter((row) => !used.has(row.opportunity_id));
  return [...frozen, ...packAppearances(remaining, maxPerAppearance)];
}

/** Flat opportunity ids in appearance order (for retention / tests). */
export function flattenDiscoverAppearanceOpportunityIds<
  T extends DiscoverGroupableOpportunity,
>(appearances: readonly DiscoverPersonAppearance<T>[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of appearances) {
    for (const row of a.opportunities) {
      if (seen.has(row.opportunity_id)) continue;
      seen.add(row.opportunity_id);
      out.push(row.opportunity_id);
    }
  }
  return out;
}
