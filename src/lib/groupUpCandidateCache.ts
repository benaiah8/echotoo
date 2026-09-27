import type {
  GroupUpCandidatesPage,
  GroupUpViewerState,
} from "./people/types";

/** Hard cache lifetime: a normal read may return this data without networking. */
const TTL_MS = 120_000;
/** Soft-stale: background revalidation may run while this data is still shown. */
export const GROUP_UP_DECK_SOFT_STALE_MS = 30_000;

type DeckCacheEntry = { ts: number; value: GroupUpCandidatesPage };

const deckCache = new Map<string, DeckCacheEntry>();

type GroupUpCandidateCacheListener = () => void;
const listeners = new Set<GroupUpCandidateCacheListener>();

export function subscribeGroupUpCandidateCache(
  listener: GroupUpCandidateCacheListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitGroupUpCandidateCacheChanged(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* A broken subscriber must not block the others. */
    }
  }
}

/** First-page Group Up browse cache for one viewer. */
export function groupUpDeckCacheKey(userId: string): string {
  return `group_up_deck:${userId}`;
}

function readDeckCacheEntry(userId: string): DeckCacheEntry | undefined {
  const key = groupUpDeckCacheKey(userId);
  const entry = deckCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    deckCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedGroupUpDeck(
  userId: string
): GroupUpCandidatesPage | undefined {
  return readDeckCacheEntry(userId)?.value;
}

export function getGroupUpDeckFetchedAt(userId: string): number | undefined {
  return readDeckCacheEntry(userId)?.ts;
}

export function isGroupUpDeckSoftStale(userId: string): boolean {
  const fetchedAt = getGroupUpDeckFetchedAt(userId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= GROUP_UP_DECK_SOFT_STALE_MS;
}

export function setCachedGroupUpDeck(
  userId: string,
  value: GroupUpCandidatesPage
): void {
  deckCache.set(groupUpDeckCacheKey(userId), {
    ts: Date.now(),
    value,
  });
  emitGroupUpCandidateCacheChanged();
}

/** Patch first-page deck cache without emitting (avoids revalidate races). */
export function patchCachedGroupUpDeckViewerState(
  userId: string,
  opportunityId: string,
  patch: { viewer_state: GroupUpViewerState; request_id: string | null }
): void {
  if (!userId || !opportunityId) return;
  const entry = readDeckCacheEntry(userId);
  if (!entry) return;
  let changed = false;
  const candidates = entry.value.candidates.map((row) => {
    if (row.opportunity_id !== opportunityId) return row;
    if (
      row.viewer_state === patch.viewer_state &&
      row.request_id === patch.request_id
    ) {
      return row;
    }
    changed = true;
    return {
      ...row,
      viewer_state: patch.viewer_state,
      request_id: patch.request_id,
    };
  });
  if (!changed) return;
  deckCache.set(groupUpDeckCacheKey(userId), {
    ts: entry.ts,
    value: {
      ...entry.value,
      candidates,
    },
  });
}

/** Remove one candidate from first-page cache without emitting. */
export function removeCachedGroupUpDeckCandidate(
  userId: string,
  opportunityId: string
): void {
  if (!userId || !opportunityId) return;
  const entry = readDeckCacheEntry(userId);
  if (!entry) return;
  const candidates = entry.value.candidates.filter(
    (row) => row.opportunity_id !== opportunityId
  );
  if (candidates.length === entry.value.candidates.length) return;
  deckCache.set(groupUpDeckCacheKey(userId), {
    ts: entry.ts,
    value: {
      ...entry.value,
      candidates,
    },
  });
}

/** Write first-page deck cache without emitting (hook merges after list fetch). */
export function writeCachedGroupUpDeckSilent(
  userId: string,
  value: GroupUpCandidatesPage
): void {
  if (!userId) return;
  const key = groupUpDeckCacheKey(userId);
  const entry = deckCache.get(key);
  deckCache.set(key, {
    ts: entry?.ts ?? Date.now(),
    value,
  });
}
