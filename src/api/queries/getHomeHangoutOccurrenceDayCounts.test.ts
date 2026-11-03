import { describe, expect, it, vi, beforeEach } from "vitest";
import { HOME_EVENT_TIMEZONE } from "../../lib/homeFeedConstants";

const rpcMock = vi.fn();

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import {
  fetchHomeHangoutOccurrenceDayCounts,
  occurrenceCountRowDayToYmd,
  rowsToOccurrenceCountMap,
} from "./getHomeHangoutOccurrenceDayCounts";

describe("getHomeHangoutOccurrenceDayCounts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls RPC with month, friends, and Addis tz only (no viewer uuid)", async () => {
    rpcMock.mockResolvedValue({
      data: [{ day: "2026-11-01", event_count: 2 }],
      error: null,
    });

    const result = await fetchHomeHangoutOccurrenceDayCounts({
      monthStartYmd: "2026-11-01",
      friendsOnly: true,
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "get_home_hangout_occurrence_day_counts",
      {
        p_month_start: "2026-11-01",
        p_friends_only: true,
        p_occurs_tz: HOME_EVENT_TIMEZONE,
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.countsByYmd.get("2026-11-01")).toBe(2);
    }
  });

  it("converts rows to map and omits zero counts", () => {
    const map = rowsToOccurrenceCountMap([
      { day: "2026-11-01", event_count: 3 },
      { day: "2026-11-02", event_count: 0 },
    ]);
    expect(map.get("2026-11-01")).toBe(3);
    expect(map.has("2026-11-02")).toBe(false);
  });

  it("normalizes day keys to YYYY-MM-DD", () => {
    expect(occurrenceCountRowDayToYmd("2026-11-03")).toBe("2026-11-03");
    expect(occurrenceCountRowDayToYmd("2026-11-03T00:00:00.000Z")).toBe(
      "2026-11-03"
    );
  });

  it("returns missingRpc when function is absent", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message:
          "Could not find the function public.get_home_hangout_occurrence_day_counts",
      },
    });

    const result = await fetchHomeHangoutOccurrenceDayCounts({
      monthStartYmd: "2026-11-01",
      friendsOnly: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingRpc).toBe(true);
    }
  });
});
