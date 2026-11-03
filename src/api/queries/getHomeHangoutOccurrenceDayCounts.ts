import { supabase } from "../../lib/supabaseClient";
import { HOME_EVENT_TIMEZONE } from "../../lib/homeFeedConstants";

export type HomeHangoutOccurrenceDayCountRow = {
  day: string;
  event_count: number;
};

export type FetchHomeHangoutOccurrenceDayCountsParams = {
  /** Addis calendar month start YYYY-MM-DD (normalized to 1st of month server-side). */
  monthStartYmd: string;
  friendsOnly: boolean;
  occursTz?: string;
  signal?: AbortSignal;
};

export type HomeHangoutOccurrenceDayCountsMap = ReadonlyMap<string, number>;

function isMissingRpcError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("get_home_hangout_occurrence_day_counts") ||
    m.includes("could not find the function") ||
    m.includes("schema cache")
  );
}

/** Postgres `date` or ISO string → Addis YYYY-MM-DD key. */
export function occurrenceCountRowDayToYmd(day: string): string {
  const trimmed = day.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  return trimmed;
}

export function rowsToOccurrenceCountMap(
  rows: HomeHangoutOccurrenceDayCountRow[]
): HomeHangoutOccurrenceDayCountsMap {
  const map = new Map<string, number>();
  for (const row of rows) {
    const ymd = occurrenceCountRowDayToYmd(String(row.day));
    const count = Number(row.event_count);
    if (!ymd || !Number.isFinite(count) || count <= 0) continue;
    map.set(ymd, Math.floor(count));
  }
  return map;
}

/**
 * Monthly discoverable hangout counts (viewer from auth.uid() in SQL).
 * Does not send p_viewer_user_id — never use client UUID for authorization.
 */
export async function fetchHomeHangoutOccurrenceDayCounts(
  params: FetchHomeHangoutOccurrenceDayCountsParams
): Promise<
  | { ok: true; countsByYmd: HomeHangoutOccurrenceDayCountsMap }
  | { ok: false; error: Error; missingRpc: boolean }
> {
  const occursTz = params.occursTz?.trim() || HOME_EVENT_TIMEZONE;

  if (params.signal?.aborted) {
    return {
      ok: false,
      error: new Error("Aborted"),
      missingRpc: false,
    };
  }

  const { data, error } = await supabase.rpc(
    "get_home_hangout_occurrence_day_counts",
    {
      p_month_start: params.monthStartYmd,
      p_friends_only: params.friendsOnly,
      p_occurs_tz: occursTz,
    }
  );

  if (params.signal?.aborted) {
    return {
      ok: false,
      error: new Error("Aborted"),
      missingRpc: false,
    };
  }

  if (error) {
    const missingRpc = isMissingRpcError(error.message);
    return {
      ok: false,
      error: new Error(error.message),
      missingRpc,
    };
  }

  const rows = (Array.isArray(data) ? data : []) as HomeHangoutOccurrenceDayCountRow[];
  return {
    ok: true,
    countsByYmd: rowsToOccurrenceCountMap(rows),
  };
}
