/**
 * Source-scoped Group Up list cache (overlay browse).
 * Keyed by source_post_id. Lazy fetch, keyset pages, local viewer_state patches.
 */

import type {
  GroupUpViewerState,
  SourceGroupRow,
  SourceGroupListPage,
} from "./social/sourceGroupTypes";

export type SourceGroupListEntry = {
  rows: SourceGroupRow[];
  hasMore: boolean;
  nextCursor: string | null;
  ts: number;
  loading: boolean;
  error: string | null;
};

const cache = new Map<string, SourceGroupListEntry>();
const subscribers = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(subscribers)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeGroupUpSourceList(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function getGroupUpSourceListEntry(
  sourcePostId: string
): SourceGroupListEntry | undefined {
  return cache.get(sourcePostId);
}

export function setGroupUpSourceListPage(
  sourcePostId: string,
  page: SourceGroupListPage,
  opts?: { append?: boolean }
): void {
  if (!sourcePostId) return;
  const prev = cache.get(sourcePostId);
  const append = opts?.append === true;
  let rows = page.candidates;
  if (append && prev) {
    const seen = new Set(prev.rows.map((r) => r.opportunity_id));
    const merged = [...prev.rows];
    for (const row of page.candidates) {
      if (!seen.has(row.opportunity_id)) {
        merged.push(row);
        seen.add(row.opportunity_id);
      }
    }
    rows = merged;
  }
  cache.set(sourcePostId, {
    rows,
    hasMore: page.has_more,
    nextCursor: page.next_cursor,
    ts: Date.now(),
    loading: false,
    error: null,
  });
  emit();
}

export function markGroupUpSourceListLoading(sourcePostId: string): void {
  const prev = cache.get(sourcePostId);
  cache.set(sourcePostId, {
    rows: prev?.rows ?? [],
    hasMore: prev?.hasMore ?? false,
    nextCursor: prev?.nextCursor ?? null,
    ts: prev?.ts ?? 0,
    loading: true,
    error: null,
  });
  emit();
}

export function markGroupUpSourceListError(
  sourcePostId: string,
  message: string
): void {
  const prev = cache.get(sourcePostId);
  cache.set(sourcePostId, {
    rows: prev?.rows ?? [],
    hasMore: prev?.hasMore ?? false,
    nextCursor: prev?.nextCursor ?? null,
    ts: prev?.ts ?? 0,
    loading: false,
    error: message,
  });
  emit();
}

export function patchSourceGroupViewerState(
  sourcePostId: string,
  opportunityId: string,
  patch: { viewer_state: GroupUpViewerState; request_id: string | null }
): void {
  const entry = cache.get(sourcePostId);
  if (!entry) return;
  const rows = entry.rows.map((row) =>
    row.opportunity_id === opportunityId
      ? {
          ...row,
          viewer_state: patch.viewer_state,
          request_id: patch.request_id,
        }
      : row
  );
  cache.set(sourcePostId, { ...entry, rows, ts: Date.now() });
  emit();
}

export function prependSourceGroupRow(
  sourcePostId: string,
  row: SourceGroupRow
): void {
  const entry = cache.get(sourcePostId);
  const rows = entry?.rows ?? [];
  const without = rows.filter((r) => r.opportunity_id !== row.opportunity_id);
  cache.set(sourcePostId, {
    rows: [row, ...without],
    hasMore: entry?.hasMore ?? false,
    nextCursor: entry?.nextCursor ?? null,
    ts: Date.now(),
    loading: false,
    error: null,
  });
  emit();
}

export function removeSourceGroupRow(
  sourcePostId: string,
  opportunityId: string
): void {
  const entry = cache.get(sourcePostId);
  if (!entry) return;
  cache.set(sourcePostId, {
    ...entry,
    rows: entry.rows.filter((r) => r.opportunity_id !== opportunityId),
    ts: Date.now(),
  });
  emit();
}

export function invalidateGroupUpSourceList(sourcePostId: string): void {
  if (!sourcePostId) return;
  cache.delete(sourcePostId);
  emit();
}

export function __resetGroupUpSourceListCacheForTests(): void {
  cache.clear();
  subscribers.clear();
}
