import { useEffect, useRef, useState } from "react";
import type { HomeHangoutOccurrenceDayCountsMap } from "../api/queries/getHomeHangoutOccurrenceDayCounts";
import {
  invalidateHomeCalendarMonthCountsCache,
  loadHomeCalendarMonthCounts,
  pickerMonthToStartYmd,
} from "../lib/homeCalendarMonthCountsCache";

export type HomeCalendarMonthCountsStatus = "idle" | "loading" | "ready" | "error";

export type HomeCalendarMonthCountsState = {
  status: HomeCalendarMonthCountsStatus;
  /** Present only when status is `ready`. Empty map = no events that month. */
  countsByYmd: HomeHangoutOccurrenceDayCountsMap | null;
  missingRpc: boolean;
};

const INITIAL: HomeCalendarMonthCountsState = {
  status: "idle",
  countsByYmd: null,
  missingRpc: false,
};

export type UseHomeCalendarMonthCountsParams = {
  enabled: boolean;
  displayMonth: Date;
  friendsOnly: boolean;
  refreshEpoch?: number;
};

/**
 * Lazy monthly hangout counts for the Home filter calendar.
 * No fetch until `enabled` (drawer calendar visible).
 */
export function useHomeCalendarMonthCounts(
  params: UseHomeCalendarMonthCountsParams
): HomeCalendarMonthCountsState {
  const { enabled, displayMonth, friendsOnly, refreshEpoch = 0 } = params;
  const monthStartYmd = pickerMonthToStartYmd(displayMonth);

  const [state, setState] = useState<HomeCalendarMonthCountsState>(INITIAL);
  const requestSeq = useRef(0);

  const prevRefreshEpoch = useRef(refreshEpoch);
  useEffect(() => {
    if (!enabled) return;
    if (refreshEpoch !== prevRefreshEpoch.current) {
      prevRefreshEpoch.current = refreshEpoch;
      if (refreshEpoch > 0) {
        invalidateHomeCalendarMonthCountsCache();
      }
    }
  }, [refreshEpoch, enabled]);

  useEffect(() => {
    if (!enabled) {
      requestSeq.current += 1;
      setState(INITIAL);
      return;
    }

    const seq = ++requestSeq.current;
    const controller = new AbortController();

    setState({ status: "loading", countsByYmd: null, missingRpc: false });

    void (async () => {
      const result = await loadHomeCalendarMonthCounts({
        monthStartYmd,
        friendsOnly,
        signal: controller.signal,
      });

      if (controller.signal.aborted || seq !== requestSeq.current) return;

      if (result.ok) {
        setState({
          status: "ready",
          countsByYmd: result.countsByYmd,
          missingRpc: false,
        });
        return;
      }

      setState({
        status: "error",
        countsByYmd: null,
        missingRpc: result.missingRpc,
      });
    })();

    return () => {
      controller.abort();
    };
  }, [enabled, monthStartYmd, friendsOnly, refreshEpoch]);

  return state;
}
