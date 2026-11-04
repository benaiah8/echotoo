/**
 * DEV-only Discover completeness diagnostics.
 * Counts and anonymized hashes only — no user ids, tokens, or message content.
 */

import { groupDiscoverOpportunities } from "./groupDiscoverOpportunities";

const IS_DEV = import.meta.env.DEV;

export type DiscoverPageDiag = {
  pageIndex: number;
  fromCache: boolean;
  rpcFailed: boolean;
  candidateCount: number;
  creatorCount: number;
  hasMore: boolean;
  hasCursor: boolean;
  loadMoreTriggered: boolean;
  loadMoreSkipReason: string | null;
};

export type DiscoverRenderDiag = {
  received: number;
  afterFilter: number;
  creatorsAfterFilter: number;
  appearanceCount: number;
  renderedOpportunityCount: number;
  hiddenRemovedRetired: number;
  uiThinksEnd: boolean;
};

type Session = {
  accountKey: string;
  pages: DiscoverPageDiag[];
  uniqueCandidateHashes: Set<string>;
  uniqueCreatorHashes: Set<string>;
};

let session: Session | null = null;

/** Stable anonymized key from an opaque id (first 8 of a simple hash). */
export function discoverDiagHash(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function discoverDiagResetSession(accountKey: string): void {
  if (!IS_DEV) return;
  session = {
    accountKey: discoverDiagHash(accountKey || "anon"),
    pages: [],
    uniqueCandidateHashes: new Set(),
    uniqueCreatorHashes: new Set(),
  };
}

export function discoverDiagNotePage(input: {
  accountKey?: string;
  pageIndex: number;
  fromCache: boolean;
  rpcFailed?: boolean;
  opportunityIds: readonly string[];
  creatorIds: readonly string[];
  hasMore: boolean;
  hasCursor: boolean;
  loadMoreTriggered?: boolean;
  loadMoreSkipReason?: string | null;
}): void {
  if (!IS_DEV) return;
  if (!session) {
    discoverDiagResetSession(input.accountKey ?? "anon");
  }
  if (!session) return;
  for (const id of input.opportunityIds) {
    if (id) session.uniqueCandidateHashes.add(discoverDiagHash(id));
  }
  for (const id of input.creatorIds) {
    if (id) session.uniqueCreatorHashes.add(discoverDiagHash(id));
  }
  const creators = new Set(
    input.creatorIds.filter(Boolean).map((id) => discoverDiagHash(id))
  );
  session.pages.push({
    pageIndex: input.pageIndex,
    fromCache: input.fromCache,
    rpcFailed: input.rpcFailed === true,
    candidateCount: input.opportunityIds.length,
    creatorCount: creators.size,
    hasMore: input.hasMore,
    hasCursor: input.hasCursor,
    loadMoreTriggered: input.loadMoreTriggered === true,
    loadMoreSkipReason: input.loadMoreSkipReason ?? null,
  });
}

export function discoverDiagMeasureRender(input: {
  received: readonly { opportunity_id: string; creator_id: string }[];
  afterFilter: readonly { opportunity_id: string; creator_id: string }[];
  removedOrRetiredIds: ReadonlySet<string> | readonly string[];
  hasMore: boolean;
}): DiscoverRenderDiag {
  const removed = new Set(
    Array.from(input.removedOrRetiredIds as Iterable<string>).filter(Boolean)
  );
  const appearances = groupDiscoverOpportunities(input.afterFilter);
  const renderedIds = appearances.flatMap((a) =>
    a.opportunities.map((o) => o.opportunity_id)
  );
  const creators = new Set(
    input.afterFilter.map((r) => r.creator_id).filter(Boolean)
  );
  const hidden = input.received.filter((r) => removed.has(r.opportunity_id))
    .length;
  return {
    received: input.received.length,
    afterFilter: input.afterFilter.length,
    creatorsAfterFilter: creators.size,
    appearanceCount: appearances.length,
    renderedOpportunityCount: renderedIds.length,
    hiddenRemovedRetired: hidden,
    uiThinksEnd: !input.hasMore,
  };
}

/**
 * Pure pipeline used by tests: soft page-0 revalidate must not drop a loaded tail.
 */
export function discoverSoftRevalidatePreservesTail<
  T extends { opportunity_id: string },
>(options: {
  previous: readonly T[];
  page0: readonly T[];
  firstPageIds: ReadonlySet<string>;
}): T[] {
  const incomingById = new Map(
    options.page0.map((row) => [row.opportunity_id, row])
  );
  const out: T[] = [];
  const used = new Set<string>();
  for (const row of options.page0) {
    out.push(row);
    used.add(row.opportunity_id);
  }
  for (const row of options.previous) {
    if (used.has(row.opportunity_id)) continue;
    if (options.firstPageIds.has(row.opportunity_id)) {
      // Dropped from authoritative page-0 unless still present above.
      continue;
    }
    out.push(incomingById.get(row.opportunity_id) ?? row);
    used.add(row.opportunity_id);
  }
  return out;
}

export function discoverDiagSnapshot(): {
  accountKey: string;
  pages: DiscoverPageDiag[];
  uniqueCandidates: number;
  uniqueCreators: number;
} | null {
  if (!IS_DEV || !session) return null;
  return {
    accountKey: session.accountKey,
    pages: [...session.pages],
    uniqueCandidates: session.uniqueCandidateHashes.size,
    uniqueCreators: session.uniqueCreatorHashes.size,
  };
}

declare global {
  interface Window {
    __echotooDiscoverDiag?: () => ReturnType<typeof discoverDiagSnapshot>;
  }
}

if (IS_DEV && typeof window !== "undefined") {
  window.__echotooDiscoverDiag = () => discoverDiagSnapshot();
}
