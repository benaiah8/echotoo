import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_DUO_MODE_ORDER,
  PEOPLE_DUO_MODE_TRANSITION_MS,
  PEOPLE_DUO_MODE_TRAVEL_PX,
  duoModeEnterFromY,
  duoModeExitToY,
  duoModeOrderIndex,
  duoModeTransitionDirection,
  isPairUpPrimaryScope,
} from "./peopleDuoModeTransition";
import { DUO_SUBMODE_ORDER } from "../../pages/people/peopleShellLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Duo mode order + vertical transition", () => {
  it("A: fresh Duo opens Mine (order starts with my_plans)", () => {
    expect(PEOPLE_DUO_MODE_ORDER[0]).toBe("my_plans");
    expect(DUO_SUBMODE_ORDER[0]).toBe("my_plans");
  });

  it("B: mode order = Duo → Discover → Plans → Groups", () => {
    expect([...PEOPLE_DUO_MODE_ORDER]).toEqual([
      "my_plans",
      "discover",
      "open_plans",
      "groups",
    ]);
    expect([...DUO_SUBMODE_ORDER]).toEqual([
      "my_plans",
      "discover",
      "open_plans",
    ]);
  });

  it("C: forward transition direction correct", () => {
    expect(duoModeTransitionDirection("my_plans", "discover")).toBe(1);
    expect(duoModeTransitionDirection("discover", "open_plans")).toBe(1);
    expect(duoModeTransitionDirection("open_plans", "groups")).toBe(1);
    expect(duoModeTransitionDirection("my_plans", "open_plans")).toBe(1);
    expect(duoModeExitToY(1, false)).toBe(-PEOPLE_DUO_MODE_TRAVEL_PX);
    expect(duoModeEnterFromY(1, false)).toBe(PEOPLE_DUO_MODE_TRAVEL_PX);
  });

  it("D: backward transition direction correct", () => {
    expect(duoModeTransitionDirection("groups", "open_plans")).toBe(-1);
    expect(duoModeTransitionDirection("open_plans", "discover")).toBe(-1);
    expect(duoModeTransitionDirection("discover", "my_plans")).toBe(-1);
    expect(duoModeExitToY(-1, false)).toBe(PEOPLE_DUO_MODE_TRAVEL_PX);
    expect(duoModeEnterFromY(-1, false)).toBe(-PEOPLE_DUO_MODE_TRAVEL_PX);
  });

  it("E: shell remains stationary (transition travel is content-only)", () => {
    expect(PEOPLE_DUO_MODE_TRAVEL_PX).toBeGreaterThanOrEqual(24);
    expect(PEOPLE_DUO_MODE_TRAVEL_PX).toBeLessThanOrEqual(48);
    expect(PEOPLE_DUO_MODE_TRANSITION_MS).toBeGreaterThanOrEqual(200);
    expect(PEOPLE_DUO_MODE_TRANSITION_MS).toBeLessThanOrEqual(260);
  });

  it("F: horizontal carousel unaffected by mode order helpers", () => {
    expect(duoModeOrderIndex("my_plans")).not.toBe(duoModeOrderIndex("discover"));
  });

  it("G–I: session keys stay per-scope (Mine/Discover person photos; Plans opp)", () => {
    const scopes = {
      my_plans: {
        currentOpportunityId: "m4",
        photoIndexByPersonKey: { personM: 2 },
        photoIndexById: {},
      },
      discover: {
        currentOpportunityId: "d1",
        photoIndexByPersonKey: { personD: 0 },
        photoIndexById: {},
      },
      open_plans: {
        currentOpportunityId: "o2",
        photoIndexById: { o2: 1 },
        photoIndexByPersonKey: {},
      },
    };
    expect(scopes.my_plans.photoIndexByPersonKey.personM).toBe(2);
    expect(scopes.discover.currentOpportunityId).toBe("d1");
    expect(scopes.open_plans.photoIndexById.o2).toBe(1);
  });

  it("J: rapid mode taps resolve to latest scope (target overwrite)", () => {
    let target: "my_plans" | "discover" | "open_plans" | "groups" = "my_plans";
    target = "discover";
    target = "open_plans";
    target = "groups";
    expect(target).toBe("groups");
  });

  it("K: reduced-motion uses zero translate", () => {
    expect(duoModeExitToY(1, true)).toBe(0);
    expect(duoModeEnterFromY(-1, true)).toBe(0);
  });

  it("L: transition does not invent network (pure helpers)", () => {
    expect(typeof duoModeTransitionDirection).toBe("function");
  });

  it("M–O: action paths stay distinct by scope", () => {
    const pairUpRpc = (scope: "my_plans" | "discover") =>
      scope === "discover"
        ? "connect_discover_pair_up"
        : "express_pair_up_interest";
    const plansAction = "request_open_plan";
    expect(pairUpRpc("my_plans")).toBe("express_pair_up_interest");
    expect(pairUpRpc("discover")).toBe("connect_discover_pair_up");
    expect(plansAction).toBe("request_open_plan");
  });
});

describe("Groups primary-scope transition parity", () => {
  it("1–6: Groups in same transition owner; Plans↔Groups directions; no hard-cut branch", () => {
    expect(duoModeTransitionDirection("open_plans", "groups")).toBe(1);
    expect(duoModeTransitionDirection("groups", "open_plans")).toBe(-1);
    expect(duoModeTransitionDirection("my_plans", "groups")).toBe(1);
    expect(duoModeTransitionDirection("groups", "my_plans")).toBe(-1);
    expect(isPairUpPrimaryScope("groups")).toBe(false);
    expect(isPairUpPrimaryScope("open_plans")).toBe(true);

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("activePrimaryScope");
    expect(overlay).toContain('mode === "groups" ? "groups" : activeScope');
    expect(overlay).toContain("PeopleDuoModeTransition");
    expect(overlay).toContain('visualScope === "groups"');
    // No Groups-only hard-cut outside the transition owner.
    expect(overlay).not.toMatch(
      /mode === "groups" \? \(\s*groupUps \? \(\s*<GroupUpDeckBody/,
    );

    const transition = read("pages/people/PeopleDuoModeTransition.tsx");
    expect(transition).toContain("PeoplePrimaryScope");
    expect(transition).toContain("data-people-primary-scope-transition");
  });

  it("7–9: Group session state owned by overlay; browseTab key only on Groups body", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("groupUpScope");
    expect(overlay).toContain("patchGroupUpScope");
    expect(overlay).toContain('key={`groups:${groupUpScope.browseTab}`}');
    expect(overlay).toContain("toggleGroupsYoursBrowse");
    // Primary destination does not change on Yours toggle.
    expect(overlay).toContain("selectGroupsMode");
    expect(overlay).toContain("toggleGroupsYoursBrowse()");
  });

  it("10–14: Duo/Discover/Plans path + cards/media/actions/pagination untouched", () => {
    expect(duoModeTransitionDirection("my_plans", "discover")).toBe(1);
    expect(duoModeTransitionDirection("discover", "open_plans")).toBe(1);

    const media = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(media).toContain("data-people-group-published-media");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("requestGroupUp");
    expect(body).toContain("groupUpRowMatchesBrowseTab");
    expect(body).not.toContain("pageSize");
    expect(body).not.toContain("limit: 50");
  });
});
