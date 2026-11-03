import { supabase } from "./supabaseClient";
import {
  fetchHomeHangoutOccurrenceDayCounts,
  type HomeHangoutOccurrenceDayCountsMap,
} from "../api/queries/getHomeHangoutOccurrenceDayCounts";
import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";

const TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  countsByYmd: HomeHangoutOccurrenceDayCountsMap;
  fetchedAt: number;
};

type InFlight = Promise<
  | { ok: true; countsByYmd: HomeHangoutOccurrenceDayCountsMap }
  | { ok: false; error: Error; missingRpc: boolean }
>;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, InFlight>();

let authListenerRegistered = false;
let cachedViewerKey: string | null = null;

export function homeCalendarCountsCacheKey(params: {
  viewerKey: string;
  monthStartYmd: string;
  friendsOnly: boolean;
  occursTz: string;
}): string {
  return `${params.viewerKey}|${params.monthStartYmd}|${params.friendsOnly ? "1" : "0"}|${params.occursTz}`;
}

export async function resolveHomeCalendarViewerKey(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    return uid ?? "anon";
  } catch {
    return "anon";
  }
}

export function clearHomeCalendarMonthCountsCache(): void {
  cache.clear();
  inFlight.clear();
  cachedViewerKey = null;
}

function ensureAuthCacheIsolation(): void {
  if (authListenerRegistered) return;
  authListenerRegistered = true;
  supabase.auth.onAuthStateChange(() => {
    clearHomeCalendarMonthCountsCache();
  });
}

export function invalidateHomeCalendarMonthCountsCache(): void {
  cache.clear();
  inFlight.clear();
}

export type LoadHomeCalendarMonthCountsParams = {
  monthStartYmd: string;
  friendsOnly: boolean;
  occursTz?: string;
  signal?: AbortSignal;
  /** Bumped to bypass TTL (e.g. Home tab refresh). */
  forceRefresh?: boolean;
};

export async function loadHomeCalendarMonthCounts(
  params: LoadHomeCalendarMonthCountsParams
): Promise<
  | { ok: true; countsByYmd: HomeHangoutOccurrenceDayCountsMap; fromCache: boolean }
  | { ok: false; error: Error; missingRpc: boolean }
> {
  ensureAuthCacheIsolation();

  const occursTz = params.occursTz?.trim() || HOME_EVENT_TIMEZONE;
  const viewerKey = await resolveHomeCalendarViewerKey();
  if (cachedViewerKey !== null && cachedViewerKey !== viewerKey) {
    clearHomeCalendarMonthCountsCache();
  }
  cachedViewerKey = viewerKey;

  const key = homeCalendarCountsCacheKey({
    viewerKey,
    monthStartYmd: params.monthStartYmd,
    friendsOnly: params.friendsOnly,
    occursTz,
  });

  if (!params.forceRefresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt <= TTL_MS) {
      return { ok: true, countsByYmd: hit.countsByYmd, fromCache: true };
    }
  }

  const existing = inFlight.get(key);
  if (existing) {
    const shared = await existing;
    if (shared.ok) {
      return { ok: true, countsByYmd: shared.countsByYmd, fromCache: false };
    }
    return {
      ok: false,
      error: shared.error,
      missingRpc: shared.missingRpc,
    };
  }

  const promise = fetchHomeHangoutOccurrenceDayCounts({
    monthStartYmd: params.monthStartYmd,
    friendsOnly: params.friendsOnly,
    occursTz,
    signal: params.signal,
  });
  inFlight.set(key, promise);

  try {
    const result = await promise;
    if (result.ok) {
      cache.set(key, {
        countsByYmd: result.countsByYmd,
        fetchedAt: Date.now(),
      });
      return { ok: true, countsByYmd: result.countsByYmd, fromCache: false };
    }
    return {
      ok: false,
      error: result.error,
      missingRpc: result.missingRpc,
    };
  } finally {
    inFlight.delete(key);
  }
}

/** First day of the visible picker month as YYYY-MM-01. */
export function pickerMonthToStartYmd(month: Date): string {
  const y = month.getFullYear();
  const m = month.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
