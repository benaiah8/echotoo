import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";
import {
  applyRefreshEventNudge,
  buildUnseenHomeReplacementPage,
  cloneHomeFeedCycleState,
  homeFeedPresentationKey,
  recordHomeFeedCycleDelivery,
  startNextHomeFeedCycle,
  stampHomeFeedPresentationKeys,
  type HomeFeedCycleState,
} from "./homeFeedCycle";
import { isUpcomingEligibleHangout } from "./feedExpiryFilters";
import type { FeedItemWithDates } from "./feedSorting";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const NOW = new Date("2026-09-10T09:00:00.000Z"); // Addis ~12:00 Wed Sep 10

function place(id: string) {
  return {
    id,
    type: "experience" as const,
    selected_dates: null,
  };
}

function upcomingEvent(id: string, day = "2026-09-12") {
  return {
    id,
    type: "hangout" as const,
    selected_dates: [`${day}T18:00:00.000Z`],
    is_recurring: false,
    recurrence_days: [] as string[],
  };
}

function pastEvent(id: string) {
  return {
    id,
    type: "hangout" as const,
    selected_dates: ["2020-01-01T18:00:00.000Z"],
    is_recurring: false,
    recurrence_days: [] as string[],
  };
}

function recurringUpcoming(id: string) {
  return {
    id,
    type: "hangout" as const,
    selected_dates: [] as string[],
    is_recurring: true,
    recurrence_days: ["FR", "SA"],
  };
}

function nudge<T extends { id: string; type?: string }>(items: T[]) {
  return applyRefreshEventNudge(items, {
    frontWindow: 6,
    desiredUpcomingEvents: 2,
    maxPromotions: 2,
    now: NOW,
    timeZone: HOME_EVENT_TIMEZONE,
  });
}

function emptyState(): HomeFeedCycleState {
  return {
    cycleId: 1,
    cursorOffset: 0,
    cycleSeenIds: new Set(),
    authoritativeCount: null,
    replacedThisCycle: false,
  };
}

describe("isUpcomingEligibleHangout for refresh nudge", () => {
  it("counts upcoming hangouts and recurring; rejects Places and past", () => {
    expect(
      isUpcomingEligibleHangout(
        upcomingEvent("e1") as FeedItemWithDates,
        NOW,
        HOME_EVENT_TIMEZONE
      )
    ).toBe(true);
    expect(
      isUpcomingEligibleHangout(
        recurringUpcoming("r1") as FeedItemWithDates,
        NOW,
        HOME_EVENT_TIMEZONE
      )
    ).toBe(true);
    expect(
      isUpcomingEligibleHangout(
        pastEvent("past") as FeedItemWithDates,
        NOW,
        HOME_EVENT_TIMEZONE
      )
    ).toBe(false);
    expect(
      isUpcomingEligibleHangout(
        place("p1") as FeedItemWithDates,
        NOW,
        HOME_EVENT_TIMEZONE
      )
    ).toBe(false);
    expect(
      isUpcomingEligibleHangout(
        {
          id: "unsched",
          type: "hangout",
          selected_dates: [],
          recurrence_days: [],
        } as unknown as FeedItemWithDates,
        NOW,
        HOME_EVENT_TIMEZONE
      )
    ).toBe(false);
  });
});

describe("Home Feed Phase 2B.2C soft Event refresh nudge", () => {
  it("1. first 6 already contain 2 Events → unchanged", () => {
    const items = [
      upcomingEvent("e1"),
      upcomingEvent("e2"),
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      upcomingEvent("e3"),
    ];
    const out = nudge(items);
    expect(out).toBe(items);
    expect(out.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("2. first 6 have 0 Events → bounded promotion from later candidates", () => {
    const items = [
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      upcomingEvent("e1"),
      upcomingEvent("e2"),
      place("p7"),
    ];
    const out = nudge(items);
    expect(out.map((i) => i.id).slice(0, 4)).toEqual([
      "p1",
      "e1",
      "e2",
      "p2",
    ]);
    expect(
      out.slice(0, 6).filter((i) => i.type === "hangout").map((i) => i.id)
    ).toEqual(["e1", "e2"]);
  });

  it("3. first 6 contain 1 Event → only enough promotion to reach 2", () => {
    const items = [
      place("p1"),
      upcomingEvent("e0"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      upcomingEvent("e1"),
      upcomingEvent("e2"),
    ];
    const out = nudge(items);
    expect(out.map((i) => i.id)).toEqual([
      "p1",
      "e1",
      "e0",
      "p2",
      "p3",
      "p4",
      "p5",
      "e2",
    ]);
    const frontEvents = out
      .slice(0, 6)
      .filter((i) => i.type === "hangout")
      .map((i) => i.id);
    expect(frontEvents).toContain("e0");
    expect(frontEvents).toContain("e1");
    expect(frontEvents).not.toContain("e2");
  });

  it("4. only one eligible Event exists → only one promoted", () => {
    const items = [
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      upcomingEvent("e1"),
      place("p7"),
    ];
    const out = nudge(items);
    expect(out.filter((i) => i.id === "e1")).toHaveLength(1);
    expect(out.map((i) => i.id).slice(0, 3)).toEqual(["p1", "e1", "p2"]);
  });

  it("5. no Events exist → original order unchanged", () => {
    const items = [
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      place("p7"),
    ];
    expect(nudge(items)).toBe(items);
  });

  it("6. past Event does not count or get promoted", () => {
    const items = [
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      pastEvent("past"),
      upcomingEvent("e1"),
    ];
    const out = nudge(items);
    expect(out.map((i) => i.id).slice(0, 3)).toEqual(["p1", "e1", "p2"]);
    expect(out.findIndex((i) => i.id === "past")).toBeGreaterThan(5);
  });

  it("7. eligible recurring upcoming Event can count", () => {
    const items = [
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      recurringUpcoming("r1"),
      upcomingEvent("e1"),
    ];
    const out = nudge(items);
    expect(out.map((i) => i.id).slice(0, 4)).toEqual([
      "p1",
      "r1",
      "e1",
      "p2",
    ]);
  });

  it("8. new unseen rank-1 Place remains first", () => {
    const items = [
      place("NEW"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      upcomingEvent("e1"),
      upcomingEvent("e2"),
    ];
    const out = nudge(items);
    expect(out[0]?.id).toBe("NEW");
    expect(out.map((i) => i.id).slice(0, 3)).toEqual(["NEW", "e1", "e2"]);
  });

  it("9–10. at most 2 promotions; no page-wide Event quota", () => {
    const items = [
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      upcomingEvent("e1"),
      upcomingEvent("e2"),
      upcomingEvent("e3"),
      upcomingEvent("e4"),
    ];
    const out = nudge(items);
    const promotedIntoFront = out
      .slice(0, 6)
      .filter((i) => ["e1", "e2", "e3", "e4"].includes(i.id));
    expect(promotedIntoFront.map((i) => i.id)).toEqual(["e1", "e2"]);
    expect(out.filter((i) => i.type === "hangout")).toHaveLength(4);
  });

  it("11–12. deterministic; real post.id unchanged", () => {
    const items = [
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      upcomingEvent("e1"),
      upcomingEvent("e2"),
    ];
    expect(nudge(items).map((i) => i.id)).toEqual(
      nudge(items).map((i) => i.id)
    );
    const stamped = stampHomeFeedPresentationKeys(items, 2);
    const out = nudge(stamped);
    expect(out.every((i) => typeof i.id === "string")).toBe(true);
    expect(out[1]?.id).toBe("e1");
    expect(out[1]).toMatchObject({
      id: "e1",
      __homePresentationKey: homeFeedPresentationKey(2, "e1"),
    });
  });

  it("13–14. cycleSeenIds / cursorOffset unchanged by nudge", () => {
    let state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: [place("a"), place("b")],
      requestOffset: 0,
      consumedOffset: 15,
      count: 40,
      countIsAuthoritative: true,
    });
    const before = cloneHomeFeedCycleState(state);
    nudge([
      place("p1"),
      place("p2"),
      place("p3"),
      place("p4"),
      place("p5"),
      place("p6"),
      upcomingEvent("e1"),
    ]);
    expect([...state.cycleSeenIds]).toEqual([...before.cycleSeenIds]);
    expect(state.cursorOffset).toBe(before.cursorOffset);
    expect(state.cycleId).toBe(before.cycleId);
  });

  it("15–16. Phase 2B.2A refresh + 2B.2B wrap helpers remain intact", async () => {
    const first = Array.from({ length: 15 }, (_, i) => place(`p${i}`));
    const state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first,
      requestOffset: 0,
      consumedOffset: 15,
      count: 30,
      countIsAuthoritative: true,
    });
    const refresh = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: async () => ({
        items: first,
        consumedOffset: 15,
        count: 30,
        countIsAuthoritative: true,
      }),
      fetchAtOffset: async () => ({
        items: Array.from({ length: 15 }, (_, i) => place(`q${i}`)),
        consumedOffset: 15,
        count: 30,
        countIsAuthoritative: true,
      }),
    });
    expect(refresh.ok).toBe(true);
    if (!refresh.ok) return;
    expect(refresh.items[0]?.id).toBe("q0");
    const wrap = startNextHomeFeedCycle(refresh.nextState);
    expect(wrap.cycleId).toBe(refresh.nextState.cycleId + 1);
    expect(wrap.cursorOffset).toBe(0);
  });

  it("17–19. nudge is refresh-only; initial/load-more/filters untouched", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("applyRefreshEventNudge(result.items");
    expect(home).toContain("runUnseenHomeReplacement");
    // Not applied in loadVerticalHomePosts path
    const loadIdx = home.indexOf("const loadVerticalHomePosts");
    const loadSlice = home.slice(loadIdx, loadIdx + 2500);
    expect(loadSlice).not.toContain("applyRefreshEventNudge");
    expect(home).toContain("continuousCycling={browseIsTrueDefaultAll}");
  });

  it("20. no past Event fallback / no randomization", () => {
    expect(read("src/lib/homeFeedCycle.ts")).toContain("applyRefreshEventNudge");
    expect(read("src/lib/homeFeedCycle.ts")).not.toMatch(
      /Math\.random|seededShuffle/
    );
    expect(read("src/lib/feedExpiryFilters.ts")).toContain(
      "isUpcomingEligibleHangout"
    );
  });
});
