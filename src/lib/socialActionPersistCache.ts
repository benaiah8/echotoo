/**
 * Compact, user-scoped localStorage bag for Duo/Group UI hydration.
 * Sync read on boot → no inactive flash; SWR still revalidates.
 * Pure storage — does not import in-memory caches (avoid cycles).
 *
 * Soft-stale vs hard retention:
 * - Own Duo/Group/Open Plan: hard TTL 7d
 * - Group counts: soft-stale at 3m (still returned for UI); hard prune at 7d
 */

export const SOCIAL_ACTION_PERSIST_SCHEMA = 1 as const;
/** Own Duo/Group/Open Plan active state — changes infrequently. */
export const SOCIAL_OWN_PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Soft window for Group counts — age past this means SWR, not UNKNOWN.
 * Kept for callers/tests; hard disk retention uses SOCIAL_OWN_PERSIST_TTL_MS.
 */
export const SOCIAL_COUNT_PERSIST_TTL_MS = 3 * 60 * 1000;

const LAST_USER_KEY = "echotoo_social_action_last_user_v1";

export type DuoPersistEntry = { active: boolean; ts: number };
export type OpenPlanPersistEntry = { active: boolean; ts: number };
export type GroupOwnPersistEntry = { active: boolean; ts: number };
export type CountPersistEntry = { count: number; ts: number };

export type SocialActionPersistBag = {
  v: typeof SOCIAL_ACTION_PERSIST_SCHEMA;
  userId: string;
  duo: Record<string, DuoPersistEntry>;
  /** Place Duo (Open Plan own). Optional for bags written before this field. */
  openPlan: Record<string, OpenPlanPersistEntry>;
  groupOwn: Record<string, GroupOwnPersistEntry>;
  counts: Record<string, CountPersistEntry>;
};

function bagKey(userId: string): string {
  return `echotoo_social_action_v${SOCIAL_ACTION_PERSIST_SCHEMA}:${userId}`;
}

function emptyBag(userId: string): SocialActionPersistBag {
  return {
    v: SOCIAL_ACTION_PERSIST_SCHEMA,
    userId,
    duo: {},
    openPlan: {},
    groupOwn: {},
    counts: {},
  };
}

export function readSocialActionLastUserId(): string | null {
  try {
    const id = localStorage.getItem(LAST_USER_KEY);
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function writeLastUserId(userId: string | null): void {
  try {
    if (!userId) localStorage.removeItem(LAST_USER_KEY);
    else localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* private / quota */
  }
}

export function readSocialActionPersistBag(
  userId: string
): SocialActionPersistBag {
  try {
    const raw = localStorage.getItem(bagKey(userId));
    if (!raw) return emptyBag(userId);
    const parsed = JSON.parse(raw) as Partial<SocialActionPersistBag>;
    if (
      !parsed ||
      parsed.v !== SOCIAL_ACTION_PERSIST_SCHEMA ||
      parsed.userId !== userId ||
      typeof parsed.duo !== "object" ||
      typeof parsed.groupOwn !== "object" ||
      typeof parsed.counts !== "object"
    ) {
      return emptyBag(userId);
    }
    return pruneExpired({
      v: SOCIAL_ACTION_PERSIST_SCHEMA,
      userId,
      duo: parsed.duo ?? {},
      openPlan:
        typeof parsed.openPlan === "object" && parsed.openPlan
          ? parsed.openPlan
          : {},
      groupOwn: parsed.groupOwn ?? {},
      counts: parsed.counts ?? {},
    });
  } catch {
    return emptyBag(userId);
  }
}

function writeBag(bag: SocialActionPersistBag): void {
  try {
    localStorage.setItem(bagKey(bag.userId), JSON.stringify(bag));
    writeLastUserId(bag.userId);
  } catch {
    /* private / quota */
  }
}

function isOwnEntryFresh(
  e: { active?: unknown; ts?: unknown } | null | undefined,
  now: number
): e is DuoPersistEntry {
  return (
    !!e &&
    typeof e.active === "boolean" &&
    typeof e.ts === "number" &&
    now - e.ts < SOCIAL_OWN_PERSIST_TTL_MS
  );
}

function pruneExpired(
  bag: SocialActionPersistBag,
  now = Date.now()
): SocialActionPersistBag {
  const duo: Record<string, DuoPersistEntry> = {};
  for (const [id, e] of Object.entries(bag.duo)) {
    if (isOwnEntryFresh(e, now)) duo[id] = e;
  }
  const openPlan: Record<string, OpenPlanPersistEntry> = {};
  for (const [id, e] of Object.entries(bag.openPlan ?? {})) {
    if (isOwnEntryFresh(e, now)) openPlan[id] = e;
  }
  const groupOwn: Record<string, GroupOwnPersistEntry> = {};
  for (const [id, e] of Object.entries(bag.groupOwn)) {
    if (isOwnEntryFresh(e, now)) groupOwn[id] = e;
  }
  /** Counts: soft-stale still known; only hard-prune at own TTL. */
  const counts: Record<string, CountPersistEntry> = {};
  for (const [id, e] of Object.entries(bag.counts)) {
    if (
      e &&
      typeof e.count === "number" &&
      typeof e.ts === "number" &&
      now - e.ts < SOCIAL_OWN_PERSIST_TTL_MS
    ) {
      counts[id] = e;
    }
  }
  return { ...bag, duo, openPlan, groupOwn, counts };
}

/** True when persisted count should trigger background SWR (still returned as known). */
export function isPersistedCountSoftStale(
  entry: CountPersistEntry | null | undefined,
  now = Date.now()
): boolean {
  if (!entry || typeof entry.ts !== "number") return true;
  return now - entry.ts >= SOCIAL_COUNT_PERSIST_TTL_MS;
}

export function persistDuoOwnState(
  userId: string,
  postId: string,
  active: boolean
): void {
  if (!userId || !postId) return;
  const bag = readSocialActionPersistBag(userId);
  bag.duo[postId] = { active, ts: Date.now() };
  writeBag(bag);
}

export function persistOpenPlanOwnState(
  userId: string,
  postId: string,
  active: boolean
): void {
  if (!userId || !postId) return;
  const bag = readSocialActionPersistBag(userId);
  bag.openPlan[postId] = { active, ts: Date.now() };
  writeBag(bag);
}

export function persistGroupOwnState(
  userId: string,
  postId: string,
  active: boolean
): void {
  if (!userId || !postId) return;
  const bag = readSocialActionPersistBag(userId);
  bag.groupOwn[postId] = { active, ts: Date.now() };
  writeBag(bag);
}

export function persistGroupCount(
  userId: string,
  postId: string,
  count: number
): void {
  if (!userId || !postId || !Number.isFinite(count)) return;
  const bag = readSocialActionPersistBag(userId);
  bag.counts[postId] = {
    count: Math.max(0, Math.floor(count)),
    ts: Date.now(),
  };
  writeBag(bag);
}

export function clearSocialActionPersistForUser(userId: string | null): void {
  if (!userId) {
    writeLastUserId(null);
    return;
  }
  try {
    localStorage.removeItem(bagKey(userId));
  } catch {
    /* noop */
  }
  const last = readSocialActionLastUserId();
  if (last === userId) writeLastUserId(null);
}

/** Test helper */
export function __resetSocialActionPersistForTests(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k?.startsWith("echotoo_social_action_v") ||
        k === LAST_USER_KEY
      ) {
        keys.push(k);
      }
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* noop */
  }
}
