import { describe, expect, it } from "vitest";
import {
  getHomeFilterEndCopy,
  getHomeSearchPostsEmptyHeading,
} from "./homeFilterEndCopy";

const TUESDAY = new Date("2026-09-08T02:00:00.000Z");
const FRIDAY = new Date("2026-09-11T02:00:00.000Z");

describe("getHomeFilterEndCopy", () => {
  it("uses distinct zero vs exhausted headings for base modes", () => {
    const todayZero = getHomeFilterEndCopy({
      dateFilter: "today",
      viewMode: "hangouts",
      friendsFilter: false,
      variant: "zero",
      now: TUESDAY,
    });
    const todayExhausted = getHomeFilterEndCopy({
      dateFilter: "today",
      viewMode: "hangouts",
      friendsFilter: false,
      variant: "exhausted",
      now: TUESDAY,
    });
    expect(todayZero.heading).toBe("Nothing happening today yet");
    expect(todayExhausted.heading).toBe("That's all for today");
    expect(todayZero.createPrompt).toBe("Want to post something others can join?");
    expect(todayZero.primaryLabel).toBe("Create");
    expect(todayZero.secondaryLabel).toBe("See tomorrow");
    expect(todayZero.tertiaryLabel).toBe("Back to Feed");
    expect(todayZero.secondaryAction).toEqual({
      type: "selectDate",
      target: "tomorrow",
    });
  });

  it("maps Tomorrow secondary to weekend or next week by Addis rule", () => {
    const tue = getHomeFilterEndCopy({
      dateFilter: "tomorrow",
      viewMode: "hangouts",
      friendsFilter: false,
      variant: "exhausted",
      now: TUESDAY,
    });
    const fri = getHomeFilterEndCopy({
      dateFilter: "tomorrow",
      viewMode: "hangouts",
      friendsFilter: false,
      variant: "exhausted",
      now: FRIDAY,
    });
    expect(tue.secondaryLabel).toBe("See this weekend");
    expect(tue.secondaryAction).toEqual({
      type: "selectDate",
      target: "this_weekend",
    });
    expect(fri.secondaryLabel).toBe("See next week");
    expect(fri.secondaryAction).toEqual({
      type: "selectDate",
      target: "next_week",
    });
  });

  it("maps Next Week / Events / Places / Friends-only secondaries", () => {
    expect(
      getHomeFilterEndCopy({
        dateFilter: "next_week",
        viewMode: "hangouts",
        friendsFilter: false,
        variant: "zero",
        now: TUESDAY,
      }).secondaryAction
    ).toEqual({ type: "selectEvents" });
    expect(
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "hangouts",
        friendsFilter: false,
        variant: "zero",
        now: TUESDAY,
      }).secondaryAction
    ).toEqual({ type: "selectPlaces" });
    expect(
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "experiences",
        friendsFilter: false,
        variant: "zero",
        now: TUESDAY,
      }).secondaryAction
    ).toEqual({ type: "selectEvents" });
    expect(
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "all",
        friendsFilter: true,
        variant: "zero",
        now: TUESDAY,
      }).secondaryAction
    ).toEqual({ type: "selectEvents" });
  });

  it("uses simple combined headings", () => {
    expect(
      getHomeFilterEndCopy({
        dateFilter: "today",
        viewMode: "hangouts",
        friendsFilter: true,
        variant: "zero",
        now: TUESDAY,
      }).heading
    ).toBe("Nothing from friends today yet");
    expect(
      getHomeFilterEndCopy({
        dateFilter: "today",
        viewMode: "hangouts",
        friendsFilter: true,
        variant: "exhausted",
        now: TUESDAY,
      }).heading
    ).toBe("That's all from friends today");
    expect(
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "hangouts",
        friendsFilter: true,
        variant: "exhausted",
        now: TUESDAY,
      }).heading
    ).toBe("That's all the events from friends");
    expect(
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "experiences",
        friendsFilter: true,
        variant: "exhausted",
        now: TUESDAY,
      }).heading
    ).toBe("That's all the posts from friends");
  });

  it("uses date/type create prompts, including Friends combined with date", () => {
    expect(
      getHomeFilterEndCopy({
        dateFilter: "today",
        viewMode: "hangouts",
        friendsFilter: true,
        variant: "exhausted",
        now: TUESDAY,
      }).createPrompt
    ).toBe("Want to post something others can join?");
    expect(
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "all",
        friendsFilter: true,
        variant: "zero",
        now: TUESDAY,
      }).createPrompt
    ).toBe("Want to post something with friends?");
  });

  it("wires every primary label without inventing Create query params", () => {
    const modes = [
      getHomeFilterEndCopy({
        dateFilter: "today",
        viewMode: "hangouts",
        friendsFilter: false,
        variant: "zero",
        now: TUESDAY,
      }),
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "hangouts",
        friendsFilter: false,
        variant: "zero",
        now: TUESDAY,
      }),
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "experiences",
        friendsFilter: false,
        variant: "zero",
        now: TUESDAY,
      }),
    ];
    expect(modes.map((m) => m.primaryLabel)).toEqual([
      "Create",
      "Create",
      "Create",
    ]);
    expect(modes.map((m) => m.createPrompt)).toEqual([
      "Want to post something others can join?",
      "Want to post something others can join?",
      "Have something worth sharing? Create one.",
    ]);
    expect(modes[1].heading).toBe("No events found.");
    expect(modes[2].heading).toBe("No posts found.");
    expect(modes[2].secondaryLabel).toBe("See events");
    for (const mode of modes) {
      expect(JSON.stringify(mode)).not.toContain("type=");
      expect(JSON.stringify(mode)).not.toContain("/create/finalize");
    }
  });

  it("prioritizes search-aware zero copy over Events/Posts headings", () => {
    expect(getHomeSearchPostsEmptyHeading(false)).toBe(
      "No posts match your search."
    );
    expect(getHomeSearchPostsEmptyHeading(true)).toBe(
      "No posts match your search and filters."
    );

    const eventsSearch = getHomeFilterEndCopy({
      dateFilter: "none",
      viewMode: "hangouts",
      friendsFilter: false,
      variant: "zero",
      searchActive: true,
      now: TUESDAY,
    });
    expect(eventsSearch.heading).toBe(
      "No posts match your search and filters."
    );
    expect(eventsSearch.secondaryAction).toEqual({ type: "selectPlaces" });
    expect(eventsSearch.secondaryLabel).toBe("Explore posts");
    expect(eventsSearch.tertiaryLabel).toBe("Back to Feed");
    expect(eventsSearch.createPrompt).toContain("filters");

    const postsSearch = getHomeFilterEndCopy({
      dateFilter: "none",
      viewMode: "experiences",
      friendsFilter: false,
      variant: "zero",
      searchActive: true,
      now: TUESDAY,
    });
    expect(postsSearch.heading).toBe(
      "No posts match your search and filters."
    );
    expect(postsSearch.secondaryAction).toEqual({ type: "selectEvents" });

    // Exhausted still uses filter copy even with searchActive.
    expect(
      getHomeFilterEndCopy({
        dateFilter: "none",
        viewMode: "hangouts",
        friendsFilter: false,
        variant: "exhausted",
        searchActive: true,
        now: TUESDAY,
      }).heading
    ).toBe("That's all the events for now");
  });
});
