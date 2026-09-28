/**
 * Match Deck browsing snapshot, kept in module memory only.
 *
 * Opening a candidate's profile navigates to the `/u/:username` tab route.
 * PeoplePage now stays mounted across bottom tabs, so the live deck is usually
 * still there on Back. This snapshot is the fallback if People remounts (auth
 * gate, leaving the tab container). Nothing here is persisted or sent anywhere
 * - a reload clears it.
 */

export type MatchDeckSessionMode = "p2p" | "groups";
export type MatchDeckPairUpScope = "my_plans" | "discover" | "open_plans";

export type GroupUpBrowseTab = "new" | "yours";

export type GroupUpDeckScopeSnapshot = {
  browseTab: GroupUpBrowseTab;
  currentOpportunityIdByTab: Record<GroupUpBrowseTab, string | null>;
  activeOrderedIdsByTab: Record<GroupUpBrowseTab, string[]>;
  retiredIdsByTab: Record<GroupUpBrowseTab, string[]>;
  visitedIds: string[];
  removedIds: string[];
};

export type MatchDeckScopeSnapshot = {
  currentOpportunityId: string | null;
  /**
   * @deprecated Pair-up Mine/Discover use photoIndexByPersonKey.
   * Kept for Open Plans (opportunity-scoped) and legacy session restore.
   */
  photoIndexById: Record<string, number>;
  /**
   * Duo Mine/Discover: profile photo cycle index keyed by
   * pairUpPersonKey (profile_id || creator_id).
   */
  photoIndexByPersonKey: Record<string, number>;
  visitedIds: string[];
  removedIds: string[];
  /** Active navigation/render window (ids only). */
  activeOrderedIds: string[];
  /** Session-retired prefix history — not rejection. */
  retiredIds: string[];
};

export type MatchDeckSessionSnapshot = {
  mode: MatchDeckSessionMode;
  activeScope: MatchDeckPairUpScope;
  scopes: Record<MatchDeckPairUpScope, MatchDeckScopeSnapshot>;
  /** Present when mode === 'groups' at suspend time. */
  groupUp?: GroupUpDeckScopeSnapshot;
};

/** Long enough for reading a profile, short enough not to resurrect a stale deck. */
const RESTORE_TTL_MS = 10 * 60_000;

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

const emptyGroupUpScope = (): GroupUpDeckScopeSnapshot => ({
  browseTab: "new",
  currentOpportunityIdByTab: { new: null, yours: null },
  activeOrderedIdsByTab: { new: [], yours: [] },
  retiredIdsByTab: { new: [], yours: [] },
  visitedIds: [],
  removedIds: [],
});

function normalizeGroupUpScope(raw: unknown): GroupUpDeckScopeSnapshot {
  const empty = emptyGroupUpScope();
  if (!raw || typeof raw !== "object") return empty;
  const row = raw as Record<string, unknown>;

  const visitedIds = asStringArray(row.visitedIds);
  const removedIds = asStringArray(row.removedIds);

  let activeOrderedIdsByTab = empty.activeOrderedIdsByTab;
  if (
    row.activeOrderedIdsByTab &&
    typeof row.activeOrderedIdsByTab === "object"
  ) {
    const byTab = row.activeOrderedIdsByTab as Record<string, unknown>;
    activeOrderedIdsByTab = {
      new: asStringArray(byTab.new),
      yours: asStringArray(byTab.yours),
    };
  }

  let retiredIdsByTab = empty.retiredIdsByTab;
  if (row.retiredIdsByTab && typeof row.retiredIdsByTab === "object") {
    const byTab = row.retiredIdsByTab as Record<string, unknown>;
    retiredIdsByTab = {
      new: asStringArray(byTab.new),
      yours: asStringArray(byTab.yours),
    };
  }

  if (
    row.currentOpportunityIdByTab &&
    typeof row.currentOpportunityIdByTab === "object"
  ) {
    const byTab = row.currentOpportunityIdByTab as Record<string, unknown>;
    const browseTab = row.browseTab === "yours" ? "yours" : "new";
    return {
      browseTab,
      currentOpportunityIdByTab: {
        new:
          typeof byTab.new === "string" || byTab.new === null
            ? (byTab.new as string | null)
            : null,
        yours:
          typeof byTab.yours === "string" || byTab.yours === null
            ? (byTab.yours as string | null)
            : null,
      },
      activeOrderedIdsByTab,
      retiredIdsByTab,
      visitedIds,
      removedIds,
    };
  }

  const legacyId =
    typeof row.currentOpportunityId === "string" ||
    row.currentOpportunityId === null
      ? (row.currentOpportunityId as string | null)
      : null;

  return {
    browseTab: "new",
    currentOpportunityIdByTab: { new: legacyId, yours: legacyId },
    activeOrderedIdsByTab,
    retiredIdsByTab,
    visitedIds,
    removedIds,
  };
}

function normalizePairUpScope(raw: unknown): MatchDeckScopeSnapshot {
  const empty = emptyScope();
  if (!raw || typeof raw !== "object") return empty;
  const row = raw as Record<string, unknown>;
  const photoIndexById =
    row.photoIndexById && typeof row.photoIndexById === "object"
      ? (row.photoIndexById as Record<string, number>)
      : {};
  const photoIndexByPersonKey =
    row.photoIndexByPersonKey && typeof row.photoIndexByPersonKey === "object"
      ? (row.photoIndexByPersonKey as Record<string, number>)
      : {};
  return {
    currentOpportunityId:
      typeof row.currentOpportunityId === "string" ||
      row.currentOpportunityId === null
        ? (row.currentOpportunityId as string | null)
        : null,
    photoIndexById: { ...photoIndexById },
    photoIndexByPersonKey: { ...photoIndexByPersonKey },
    visitedIds: asStringArray(row.visitedIds),
    removedIds: asStringArray(row.removedIds),
    activeOrderedIds: asStringArray(row.activeOrderedIds),
    retiredIds: asStringArray(row.retiredIds),
  };
}

let snapshot: (MatchDeckSessionSnapshot & { savedAt: number }) | null = null;

function isFresh(): boolean {
  if (!snapshot) return false;
  if (Date.now() - snapshot.savedAt < RESTORE_TTL_MS) return true;
  snapshot = null;
  return false;
}

function normalizeScope(
  scope: MatchDeckPairUpScope | string | undefined
): MatchDeckPairUpScope {
  if (scope === "discover" || scope === "open_plans" || scope === "my_plans") {
    return scope;
  }
  return "my_plans";
}

/** Called right before leaving the deck for a route that unmounts People. */
export function suspendMatchDeckSession(next: MatchDeckSessionSnapshot): void {
  snapshot = { ...next, savedAt: Date.now() };
}

export function hasMatchDeckSession(): boolean {
  return isFresh();
}

/** Reads and clears, so a snapshot can only restore the deck once. */
export function consumeMatchDeckSession(): MatchDeckSessionSnapshot | null {
  if (!isFresh() || !snapshot) return null;
  const restored: MatchDeckSessionSnapshot = {
    mode: snapshot.mode,
    activeScope: normalizeScope(snapshot.activeScope),
    scopes: {
      my_plans: normalizePairUpScope(snapshot.scopes.my_plans),
      discover: normalizePairUpScope(snapshot.scopes.discover),
      open_plans: normalizePairUpScope(snapshot.scopes.open_plans),
    },
    groupUp: normalizeGroupUpScope(snapshot.groupUp),
  };
  snapshot = null;
  return restored;
}

export function clearMatchDeckSession(): void {
  snapshot = null;
}

/**
 * After a successful People hard refresh, clear that scope in the suspended
 * session so an older snapshot cannot restore pre-refresh current/order.
 * Groups New only clears the New tab window — Yours is preserved.
 */
export function invalidateMatchDeckSessionScopeAfterHardRefresh(
  target:
    | { kind: "pairUp"; scope: MatchDeckPairUpScope }
    | { kind: "groups_new" }
): void {
  if (!snapshot) return;
  if (target.kind === "pairUp") {
    snapshot = {
      ...snapshot,
      scopes: {
        ...snapshot.scopes,
        [target.scope]: emptyScope(),
      },
      savedAt: Date.now(),
    };
    return;
  }
  const groupUp = normalizeGroupUpScope(snapshot.groupUp);
  snapshot = {
    ...snapshot,
    groupUp: {
      ...groupUp,
      currentOpportunityIdByTab: {
        ...groupUp.currentOpportunityIdByTab,
        new: null,
      },
      activeOrderedIdsByTab: {
        ...groupUp.activeOrderedIdsByTab,
        new: [],
      },
      retiredIdsByTab: {
        ...groupUp.retiredIdsByTab,
        new: [],
      },
    },
    savedAt: Date.now(),
  };
}

export function emptyMatchDeckScopeSnapshot(): MatchDeckScopeSnapshot {
  return emptyScope();
}

export function emptyGroupUpDeckScopeSnapshot(): GroupUpDeckScopeSnapshot {
  return emptyGroupUpScope();
}

const emptyScope = (): MatchDeckScopeSnapshot => ({
  currentOpportunityId: null,
  photoIndexById: {},
  photoIndexByPersonKey: {},
  visitedIds: [],
  removedIds: [],
  activeOrderedIds: [],
  retiredIds: [],
});
