import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("../api/queries/getHomeHangoutOccurrenceDayCounts", () => ({
  fetchHomeHangoutOccurrenceDayCounts: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: () => getSessionMock(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import {
  clearHomeCalendarMonthCountsCache,
  homeCalendarCountsCacheKey,
  loadHomeCalendarMonthCounts,
  pickerMonthToStartYmd,
} from "./homeCalendarMonthCountsCache";
import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";

describe("homeCalendarMonthCountsCache", () => {
  beforeEach(() => {
    clearHomeCalendarMonthCountsCache();
    fetchMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-a" } } },
    });
  });

  it("builds cache keys with viewer, month, friends, tz", () => {
    expect(
      homeCalendarCountsCacheKey({
        viewerKey: "user-a",
        monthStartYmd: "2026-11-01",
        friendsOnly: true,
        occursTz: HOME_EVENT_TIMEZONE,
      })
    ).toBe(`user-a|2026-11-01|1|${HOME_EVENT_TIMEZONE}`);
  });

  it("dedupes concurrent loads for the same key", async () => {
    let resolveFetch!: (v: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = loadHomeCalendarMonthCounts({
      monthStartYmd: "2026-11-01",
      friendsOnly: false,
    });
    const p2 = loadHomeCalendarMonthCounts({
      monthStartYmd: "2026-11-01",
      friendsOnly: false,
    });

    await vi.waitUntil(() => fetchMock.mock.calls.length === 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      countsByYmd: new Map([["2026-11-05", 2]]),
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok && r2.ok).toBe(true);
  });

  it("separates friends-only cache entries", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        countsByYmd: new Map([["2026-11-01", 1]]),
      })
      .mockResolvedValueOnce({
        ok: true,
        countsByYmd: new Map([["2026-11-01", 5]]),
      });

    await loadHomeCalendarMonthCounts({
      monthStartYmd: "2026-11-01",
      friendsOnly: false,
    });
    await loadHomeCalendarMonthCounts({
      monthStartYmd: "2026-11-01",
      friendsOnly: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pickerMonthToStartYmd returns first of month", () => {
    expect(pickerMonthToStartYmd(new Date(2026, 10, 15))).toBe("2026-11-01");
  });
});
