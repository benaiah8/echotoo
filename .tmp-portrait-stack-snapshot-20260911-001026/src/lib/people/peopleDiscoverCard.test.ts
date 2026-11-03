import { describe, expect, it } from "vitest";
import {
  PEOPLE_CANDIDATE_MEDIA_ASPECT,
  PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN,
  PEOPLE_DISCOVER_GAP_PX,
  PEOPLE_DISCOVER_STACK_PAD_X,
  PEOPLE_DISCOVER_STACK_PAD_Y,
  PEOPLE_DUO_FRONT_RADIUS,
  PEOPLE_DUO_FRONT_ROTATE_DEG,
  PEOPLE_DUO_NEIGHBOR_CARD_PEEK_PX,
  PEOPLE_DUO_NOTE_RESERVE_H_PX,
  PEOPLE_DUO_PHOTO_BORDER_DARK,
  PEOPLE_DUO_PHOTO_BORDER_LIGHT,
  PEOPLE_DUO_REAR_OPACITY,
  PEOPLE_DUO_REAR_RADIUS,
  PEOPLE_DUO_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX,
  PEOPLE_MINE_STACK_PAD_Y_TOP,
  PEOPLE_MINE_SURPLUS_PAD_BOTTOM_MAX_PX,
  PEOPLE_MINE_SURPLUS_PAD_TOP_MAX_PX,
  PEOPLE_NEIGHBOR_ROTATE_DEG,
  PEOPLE_PHOTO_CROSSFADE_EASE,
  PEOPLE_PHOTO_CROSSFADE_MS,
  PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX,
  computePeopleDiscoverCardMetrics,
  peopleDuoNeighborFacePeekPx,
  peopleDuoOuterNeighborBudgetPx,
  peopleDuoPeekBottomClearance,
  peopleDuoPhotoPeekTransform,
  peoplePhotoStackPeeks,
} from "./peopleCandidateMediaPresentation";
import { resolveProfileIdentityMedia } from "../profileIdentityMedia";
import {
  buildPeopleSourceContextMap,
  getPeopleSourceContext,
} from "./peopleSourceContext";
import type { PairUpCandidate } from "./types";
import {
  DEV_MATCH_DECK_MOCKS,
  DEV_MOCK_OPPORTUNITY_PREFIX,
  isDevMockCandidate,
} from "../../pages/people/matchDeckDevMocks";
import { pairUpPersonKey } from "./pairUpPersonKey";

function baseCandidate(
  patch: Partial<PairUpCandidate> & Pick<PairUpCandidate, "opportunity_id">
): PairUpCandidate {
  return {
    opportunity_id: patch.opportunity_id,
    source_post_id: patch.source_post_id ?? "source-x",
    creator_id: patch.creator_id ?? "user-1",
    description: patch.description ?? null,
    discoverable_until: "",
    created_at: "",
    display_name: patch.display_name ?? "Alex",
    username: patch.username ?? "alex",
    avatar_url: patch.avatar_url ?? null,
    profile_photos: patch.profile_photos ?? [],
    echo_preset: patch.echo_preset ?? null,
    expressed_by_me: false,
    profile_id: null,
    bio: patch.bio ?? null,
    source_caption: patch.source_caption ?? "Hike",
    source_type: patch.source_type ?? "hangout",
    source_created_at: patch.source_created_at ?? "2026-09-01T12:00:00.000Z",
    source_selected_dates: patch.source_selected_dates ?? null,
    source_is_recurring: patch.source_is_recurring ?? false,
    source_recurrence_days: patch.source_recurrence_days ?? null,
  };
}

describe("Duo visual recovery — Profile stack parity", () => {
  it("B–D: Discover peeks stay downward; Mine peeks go upward", () => {
    expect(peopleDuoPhotoPeekTransform("right", 0, "down")).toContain(
      "translate(5%, 3%)"
    );
    expect(peopleDuoPhotoPeekTransform("right", 0, "down")).toContain(
      "rotate(2.75deg)"
    );
    expect(peopleDuoPhotoPeekTransform("right", 0, "down")).toContain(
      "scale(0.955)"
    );
    expect(peopleDuoPhotoPeekTransform("left", 0, "down")).toContain(
      "translate(-5%, 3%)"
    );
    expect(peopleDuoPhotoPeekTransform("left", 0, "up")).toContain(
      "translate(-5%, -4%)"
    );
    expect(peopleDuoPhotoPeekTransform("right", 0, "up")).toContain(
      "translate(5%, -4%)"
    );
    expect(peopleDuoPhotoPeekTransform("right", 1, "up")).toContain(
      "translate(6%, -5.15%)"
    );
    expect(peopleDuoPhotoPeekTransform("right", 1, "down")).toContain(
      "translate(6%, 4%)"
    );
    expect(PEOPLE_DUO_REAR_OPACITY).toBeCloseTo(0.72, 2);
    expect(PEOPLE_DUO_FRONT_ROTATE_DEG).toBe(0);
    expect(PEOPLE_NEIGHBOR_ROTATE_DEG).toBe(0);
  });

  it("upward peeks: rear bottoms stay above front bottom (2 and 3 photo)", () => {
    expect(peopleDuoPeekBottomClearance("right", 0, "up")).toBeGreaterThan(0);
    expect(peopleDuoPeekBottomClearance("left", 0, "up")).toBeGreaterThan(0);
    expect(peopleDuoPeekBottomClearance("right", 1, "up")).toBeGreaterThan(0);
  });

  it("E–G: 1/2/3 photo rear counts", () => {
    expect(peoplePhotoStackPeeks(1, true)).toEqual([]);
    expect(peoplePhotoStackPeeks(2, true)).toEqual([
      { side: "right", depth: 0, zIndex: 0 },
    ]);
    expect(peoplePhotoStackPeeks(3, true)).toEqual([
      { side: "left", depth: 0, zIndex: 0 },
      { side: "right", depth: 1, zIndex: 1 },
    ]);
  });

  it("H: stack order A→B→C wraps", () => {
    const photos = ["a", "b", "c"];
    let idx = 0;
    const rearAfter = (front: number) =>
      [1, 2]
        .map((off) => photos[(front + off) % 3])
        .filter(Boolean);
    idx = (idx + 1) % 3;
    expect(photos[idx]).toBe("b");
    expect(rearAfter(idx)).toEqual(["c", "a"]);
    idx = (idx + 1) % 3;
    expect(photos[idx]).toBe("c");
    expect(rearAfter(idx)).toEqual(["a", "b"]);
  });

  it("I: tap-vs-drag threshold preserved", () => {
    expect(PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX).toBe(10);
  });

  it("radius + motion match Profile language", () => {
    expect(PEOPLE_DUO_FRONT_RADIUS).toBe("1.65rem");
    expect(PEOPLE_DUO_REAR_RADIUS).toBe("1.5rem");
    expect(PEOPLE_PHOTO_CROSSFADE_MS).toBe(280);
    expect(PEOPLE_PHOTO_CROSSFADE_EASE).toContain("0.22");
  });

  it("K–L: source above / note below chrome budgets", () => {
    expect(PEOPLE_DUO_SOURCE_CHROME_H_PX).toBeLessThanOrEqual(68);
    expect(PEOPLE_DUO_SOURCE_CHROME_H_PX).toBeGreaterThanOrEqual(52);
    expect(PEOPLE_DUO_NOTE_RESERVE_H_PX).toBeGreaterThanOrEqual(32);
    // Mine source surface reserve fits 3-line caption + pads + stack gap.
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeGreaterThan(
      PEOPLE_DUO_SOURCE_CHROME_H_PX
    );
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeLessThanOrEqual(130);
    expect(PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX).toBeGreaterThanOrEqual(8);
    expect(PEOPLE_MINE_STACK_PAD_Y_TOP).toBeGreaterThanOrEqual(16);
  });

  it("M–N: stackPad does not consume neighbor framed peek", () => {
    expect(PEOPLE_DISCOVER_STACK_PAD_X).toBeLessThan(
      PEOPLE_DUO_NEIGHBOR_CARD_PEEK_PX
    );
    expect(peopleDuoOuterNeighborBudgetPx()).toBe(
      PEOPLE_DUO_NEIGHBOR_CARD_PEEK_PX +
        PEOPLE_DISCOVER_GAP_PX +
        PEOPLE_DISCOVER_STACK_PAD_X
    );
    for (const hostW of [320, 360, 375, 390, 412]) {
      const m = computePeopleDiscoverCardMetrics({
        hostW,
        hostH: 680,
        reserveInFlowChrome: true,
      });
      expect(m.neighborFacePeekPx).toBeGreaterThanOrEqual(16);
      expect(m.neighborFacePeekPx).toBeLessThanOrEqual(28);
      expect(m.stackPadX).toBe(PEOPLE_DISCOVER_STACK_PAD_X);
    }
    expect(peopleDuoNeighborFacePeekPx(36)).toBe(20);
  });

  it("O: neighbor person 0deg", () => {
    expect(PEOPLE_NEIGHBOR_ROTATE_DEG).toBe(0);
  });

  it("aspect 3:4 primary / 4:5 fallback", () => {
    expect(PEOPLE_CANDIDATE_MEDIA_ASPECT).toBe(3 / 4);
    expect(PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN).toBe(4 / 5);
    const tall = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 720,
      reserveInFlowChrome: true,
    });
    expect(tall.aspect).toBeCloseTo(3 / 4, 2);
    expect(tall.slideH).toBeGreaterThan(
      tall.frameH + 2 * PEOPLE_DISCOVER_STACK_PAD_Y
    );
  });

  it("Mine surplus: bounded pads reduce unused host below vs legacy", () => {
    const viewports = [
      { hostW: 320, hostH: 568 },
      { hostW: 360, hostH: 640 },
      { hostW: 390, hostH: 844 },
      { hostW: 412, hostH: 915 },
    ];
    for (const vp of viewports) {
      const legacy = computePeopleDiscoverCardMetrics({
        ...vp,
        reserveInFlowChrome: true,
      });
      const mine = computePeopleDiscoverCardMetrics({
        ...vp,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: true,
      });
      expect(mine.aspect).toBeCloseTo(legacy.aspect, 2);
      expect(mine.padTop).toBeGreaterThanOrEqual(0);
      expect(mine.padTop).toBeLessThanOrEqual(PEOPLE_MINE_SURPLUS_PAD_TOP_MAX_PX);
      expect(mine.padBottom).toBeLessThanOrEqual(
        PEOPLE_MINE_SURPLUS_PAD_BOTTOM_MAX_PX
      );
      expect(mine.slideH).toBe(
        mine.contentH + mine.padTop + mine.padBottom
      );
      expect(mine.unusedHostH).toBeLessThanOrEqual(legacy.unusedHostH);
      expect(mine.stackPadYTop).toBe(PEOPLE_MINE_STACK_PAD_Y_TOP);
      // Note reserve is stable (does not depend on note text).
      expect(
        mine.contentH - (mine.frameH + mine.stackPadYTop + mine.stackPadY)
      ).toBeCloseTo(
        PEOPLE_MINE_SOURCE_CHROME_H_PX + PEOPLE_DUO_NOTE_RESERVE_H_PX,
        5
      );
    }
  });

  it("Discover metrics omit surplus pads (parity hold)", () => {
    const m = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: false,
    });
    expect(m.padTop).toBe(0);
    expect(m.padBottom).toBe(0);
    expect(m.slideH).toBe(m.contentH);
  });

  it("theme border tokens", () => {
    expect(PEOPLE_DUO_PHOTO_BORDER_LIGHT).toContain("0, 0, 0");
    expect(PEOPLE_DUO_PHOTO_BORDER_DARK).toContain("255, 255, 255");
  });

  it("1-photo / echo: no unfinished fan", () => {
    expect(peoplePhotoStackPeeks(1, true)).toEqual([]);
    const echo = resolveProfileIdentityMedia({
      profile_photos: [],
      echo_preset: "preset:owl_02",
    });
    expect(peoplePhotoStackPeeks(echo.photos.length, true)).toEqual([]);
  });
});

describe("DEV Mine fixtures", () => {
  it("mock IDs are gated and cover photo / note / person cases", () => {
    expect(DEV_MATCH_DECK_MOCKS.length).toBeGreaterThanOrEqual(5);
    for (const row of DEV_MATCH_DECK_MOCKS) {
      expect(isDevMockCandidate(row)).toBe(true);
      expect(row.opportunity_id.startsWith(DEV_MOCK_OPPORTUNITY_PREFIX)).toBe(
        true
      );
      expect(row.creator_id.startsWith(DEV_MOCK_OPPORTUNITY_PREFIX)).toBe(true);
    }
    const photoCounts = DEV_MATCH_DECK_MOCKS.map(
      (r) => (r.profile_photos ?? []).length
    );
    expect(photoCounts).toContain(1);
    expect(photoCounts).toContain(2);
    expect(photoCounts).toContain(3);
    expect(DEV_MATCH_DECK_MOCKS.some((r) => !r.description)).toBe(true);
    const alexKeys = DEV_MATCH_DECK_MOCKS.filter((r) =>
      r.display_name?.includes("Alex")
    ).map(pairUpPersonKey);
    expect(new Set(alexKeys).size).toBe(1);
    expect(alexKeys.length).toBeGreaterThanOrEqual(2);
  });
});

describe("shared contracts", () => {
  it("A/Q: resolver + zero Profile fetch fields; P: Plans anonymity", () => {
    const row = baseCandidate({
      opportunity_id: "1",
      profile_photos: ["a.webp", "b.webp", "c.webp"],
    });
    const source = {
      profile_photos: row.profile_photos,
      echo_preset: row.echo_preset,
      avatar_url: row.avatar_url,
      display_name: row.display_name,
      username: row.username,
    };
    expect(resolveProfileIdentityMedia(source).photos).toHaveLength(3);
    expect(Object.keys(source)).not.toContain("user_id");
    expect({ display_name: null, username: null }.display_name).toBeNull();
  });

  it("S: source reuse unchanged", () => {
    const map = buildPeopleSourceContextMap([
      baseCandidate({ opportunity_id: "a", source_post_id: "s1" }),
      baseCandidate({ opportunity_id: "b", source_post_id: "s1" }),
    ]);
    expect(map.size).toBe(1);
    expect(getPeopleSourceContext(map, "s1")?.caption).toBe("Hike");
  });
});
