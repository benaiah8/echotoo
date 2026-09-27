/**
 * Deterministic client interleave for P2P candidate pages.
 * Does not change RPC order, drop rows, or reshuffle already-displayed ids.
 *
 * Soft anti-adjacent preference (newcomers only):
 * 1. different personKey (profile_id || creator_id)
 * 2. prefer personKeys not yet seen in frozen+out (spread unique people)
 * 3. different creator_id
 * 4. different source_post_id
 * If no alternative exists, allow repeat.
 */

import { pairUpPersonKey } from "./people/pairUpPersonKey";

export type InterleaveableCandidate = {
  opportunity_id: string;
  creator_id: string;
  source_post_id: string;
  /** Optional; when present preferred over creator_id for same-person key. */
  profile_id?: string | null;
};

function pickNextIndex<T extends InterleaveableCandidate>(
  pool: T[],
  lastPersonKey: string | null,
  lastCreatorId: string | null,
  lastSourcePostId: string | null,
  seenPersonKeys: ReadonlySet<string>
): number {
  let candidates = pool;
  if (lastPersonKey) {
    const canAvoidPerson = pool.some(
      (row) => pairUpPersonKey(row) !== lastPersonKey
    );
    if (canAvoidPerson) {
      candidates = pool.filter(
        (row) => pairUpPersonKey(row) !== lastPersonKey
      );
    }
  }

  const unseen = candidates.filter(
    (row) => !seenPersonKeys.has(pairUpPersonKey(row))
  );
  if (unseen.length > 0) {
    candidates = unseen;
  }

  const canAvoidCreator = candidates.some(
    (row) => row.creator_id !== lastCreatorId
  );
  if (canAvoidCreator) {
    candidates = candidates.filter((row) => row.creator_id !== lastCreatorId);
  }

  const canAvoidSource = candidates.some(
    (row) => row.source_post_id !== lastSourcePostId
  );
  if (canAvoidSource) {
    candidates = candidates.filter(
      (row) => row.source_post_id !== lastSourcePostId
    );
  }

  return pool.indexOf(candidates[0] ?? pool[0]!);
}

function greedyAppend<T extends InterleaveableCandidate>(
  remaining: T[],
  lastPersonKey: string | null,
  lastCreatorId: string | null,
  lastSourcePostId: string | null,
  seenPersonKeys: ReadonlySet<string>
): T[] {
  const pool = [...remaining];
  const out: T[] = [];
  let lastPerson = lastPersonKey;
  let lastCreator = lastCreatorId;
  let lastSource = lastSourcePostId;
  const seen = new Set(seenPersonKeys);
  while (pool.length > 0) {
    const index = pickNextIndex(
      pool,
      lastPerson,
      lastCreator,
      lastSource,
      seen
    );
    const [picked] = pool.splice(index, 1);
    out.push(picked!);
    lastPerson = pairUpPersonKey(picked!);
    lastCreator = picked!.creator_id;
    lastSource = picked!.source_post_id;
    seen.add(lastPerson);
  }
  return out;
}

/**
 * Keep the already-shown order frozen. Newly seen ids are interleaved into
 * the unseen suffix only, soft-avoiding consecutive same person / creator /
 * source when alternatives exist.
 */
export function interleavePairUpCandidates<T extends InterleaveableCandidate>(
  incoming: T[],
  previousOrderedIds: readonly string[],
  /** Session-retired window ids — do not re-append this session. */
  retiredIds: ReadonlySet<string> | readonly string[] = []
): T[] {
  if (incoming.length <= 1) return incoming;

  const retired = new Set(Array.from(retiredIds).filter(Boolean));

  const byId = new Map(incoming.map((row) => [row.opportunity_id, row]));
  const incomingIds = new Set(byId.keys());
  const frozenIds = previousOrderedIds.filter((id) => incomingIds.has(id));
  const frozenSet = new Set(frozenIds);
  const newcomers = incoming.filter(
    (row) =>
      !frozenSet.has(row.opportunity_id) && !retired.has(row.opportunity_id)
  );

  const frozenRows = frozenIds
    .map((id) => byId.get(id))
    .filter((row): row is T => row != null);

  if (newcomers.length === 0) return frozenRows;

  const last = frozenRows[frozenRows.length - 1] ?? null;
  const seenPersonKeys = new Set(frozenRows.map((row) => pairUpPersonKey(row)));
  return [
    ...frozenRows,
    ...greedyAppend(
      newcomers,
      last ? pairUpPersonKey(last) : null,
      last?.creator_id ?? null,
      last?.source_post_id ?? null,
      seenPersonKeys
    ),
  ];
}
