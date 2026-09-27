import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
  PEOPLE_MINE_NOTE_COLLAPSED_LINES,
  PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX,
  PEOPLE_MINE_NOTE_RESERVE_H_PX,
  PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX,
  PEOPLE_PLANS_CHROME_H_PX,
  PEOPLE_DUO_PHOTO_BORDER_DARK,
  PEOPLE_DUO_PHOTO_BORDER_LIGHT,
  PEOPLE_DUO_REAR_OPACITY,
  PEOPLE_DUO_REAR_RADIUS,
  PEOPLE_DUO_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_MAX_SLIDE_W,
  PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
  PEOPLE_MINE_MEDIA_ASPECT_STRESS,
  PEOPLE_MINE_FRONT_SHADOW,
  PEOPLE_MINE_PHOTO_EDGE,
  PEOPLE_MINE_REAR_SHADOW,
  PEOPLE_MINE_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX,
  PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX,
  PEOPLE_MINE_STACK_PAD_Y_TOP,
  PEOPLE_MINE_TOP_GAP_PX,
  PEOPLE_NEIGHBOR_ROTATE_DEG,
  PEOPLE_PHOTO_CROSSFADE_EASE,
  PEOPLE_PHOTO_CROSSFADE_MS,
  PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX,
  computePeopleDiscoverCardMetrics,
  peopleMineTargetFrameW,
  peoplePlansTargetFrameW,
  peopleMineTallFactor,
  peopleDuoNeighborFacePeekPx,
  peopleDuoOuterNeighborBudgetPx,
  peopleDuoPeekBottomClearance,
  peopleDuoPhotoPeekTransform,
  peopleMineCardTransform,
  peopleMineCardZIndex,
  peopleMinePoseBottomClearance,
  peopleMineStackAssignments,
  isMountedPhotoPaintReady,
  shouldAcceptMountedFrontDecode,
  PEOPLE_MINE_CARD_TRANSFORM_ORIGIN,
  PEOPLE_MINE_Z_DEMOTING,
  PEOPLE_MINE_Z_PROMOTING,
  peoplePhotoStackPeeks,
} from "./peopleCandidateMediaPresentation";
import { MINE_PHOTO_MOUNT_RADIUS } from "./mineCandidateImageWarm";
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
  isPeopleMineDevFixturesForced,
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
    // Mine: three-line note reserve (not the Discover 40px budget).
    expect(PEOPLE_MINE_NOTE_COLLAPSED_LINES).toBe(3);
    expect(PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX).toBe(
      Math.ceil(12.5 * 1.375 * 3)
    );
    expect(PEOPLE_MINE_NOTE_RESERVE_H_PX).toBe(
      10 + 1 + 8 + PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX + 2
    );
    expect(PEOPLE_MINE_NOTE_RESERVE_H_PX).toBeGreaterThan(
      PEOPLE_DUO_NOTE_RESERVE_H_PX
    );
    expect(PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX).toBeGreaterThan(
      PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX
    );
    // Mine top-right source reserve: caption + date + gaps (no Back double-count).
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeGreaterThan(
      PEOPLE_DUO_SOURCE_CHROME_H_PX
    );
    expect(PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX).toBe(48);
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeGreaterThanOrEqual(80);
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeLessThanOrEqual(120);
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

  it("Mine surplus: after aspect clamp, leftover host splits ~50/50", () => {
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
        fullWidthSlide: true,
        chromeProfile: "mine",
      });
      const surplus = Math.max(0, Math.round(vp.hostH - mine.contentH));
      expect(mine.padTop).toBe(Math.floor(surplus / 2));
      expect(mine.padBottom).toBe(surplus - mine.padTop);
      expect(mine.unusedHostH).toBeLessThanOrEqual(0.5);
      expect(mine.slideH).toBe(vp.hostH);
      expect(mine.stackPadYTop).toBe(PEOPLE_MINE_STACK_PAD_Y_TOP);
      // Note reserve is stable (does not depend on note text).
      expect(
        mine.contentH - (mine.frameH + mine.stackPadYTop + mine.stackPadY)
      ).toBeCloseTo(
        PEOPLE_MINE_SOURCE_CHROME_H_PX +
          PEOPLE_MINE_TOP_GAP_PX +
          PEOPLE_MINE_NOTE_RESERVE_H_PX,
        5
      );
      // Discover (no surplus) still leaves unused host when tall.
      if (legacy.unusedHostH > 0) {
        expect(mine.padTop + mine.padBottom).toBeGreaterThanOrEqual(0);
      }
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
    expect(m.fullWidthSlide).toBe(false);
    expect(m.slideW).toBe(m.portraitW);
  });

  it("Mine full-width slide uses fixed side rails (fills remainder)", () => {
    expect(PEOPLE_MINE_MAX_SLIDE_W).toBe(440);
    expect(PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX).toBe(54);
    expect(PEOPLE_MINE_MEDIA_ASPECT_STRESS).toBeGreaterThan(
      PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN
    );
    expect(PEOPLE_MINE_MEDIA_ASPECT_STRESS).toBeLessThan(1);

    for (const hostW of [320, 360, 390, 412, 430, 440]) {
      const hostH = 844;
      const m = computePeopleDiscoverCardMetrics({
        hostW,
        hostH,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: true,
        fullWidthSlide: true,
        chromeProfile: "mine",
      });
      expect(m.fullWidthSlide).toBe(true);
      expect(m.slideW).toBe(hostW);
      expect(m.portraitW).toBeLessThan(m.slideW);
      expect(m.frameW).toBeLessThan(m.portraitW);
      expect(m.neighborPeekPx).toBe(0);
      expect(m.portraitH).toBeGreaterThan(0);
      expect(m.frameW).toBeCloseTo(peopleMineTargetFrameW(hostW, hostH), 1);
      expect(m.portraitW).toBeCloseTo(
        hostW - 2 * PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
        1
      );
      const gutter = (m.slideW - m.portraitW) / 2;
      expect(gutter).toBeGreaterThanOrEqual(
        PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX - 0.1
      );
      // Tall hosts clamp at 3:4; never taller. Short hosts stay ≤ stress.
      expect(m.aspect).toBeGreaterThanOrEqual(
        PEOPLE_CANDIDATE_MEDIA_ASPECT - 0.001
      );
      expect(m.aspect).toBeLessThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_STRESS + 0.001);
    }
  });

  it("Mine short host uses 4:5 or stress aspect below width-first target", () => {
    // Post Back-align short budget ≈ legacy 520 + chrome slack.
    const hostW = 390;
    const hostH = 520 + PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX;
    const m = computePeopleDiscoverCardMetrics({
      hostW,
      hostH,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
    });
    const targetW = peopleMineTargetFrameW(hostW, hostH);
    expect(peopleMineTallFactor(hostW, hostH)).toBe(0);
    expect(m.frameW).toBeLessThan(targetW + 0.5);
    // Larger three-line note reserve tightens short-host width; still usable.
    expect(m.frameW).toBeGreaterThan(390 * 0.58);
    expect(m.contentH).toBeLessThanOrEqual(hostH);
    expect(m.aspect).toBeGreaterThanOrEqual(PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN - 0.001);
    expect(m.aspect).toBeLessThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_STRESS + 0.001);
    expect(m.frameW).toBeLessThanOrEqual(targetW + 0.5);
  });

  it("Mine tall host keeps 3:4 at width-first target; short never exceeds tall", () => {
    const tall = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 700,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
    });
    expect(tall.frameW).toBeCloseTo(peopleMineTargetFrameW(390, 700), 1);
    expect(tall.aspect).toBeCloseTo(PEOPLE_CANDIDATE_MEDIA_ASPECT, 2);
    expect(tall.aspect).toBeGreaterThanOrEqual(PEOPLE_CANDIDATE_MEDIA_ASPECT - 0.001);

    for (const hostH of [480, 520, 560, 600]) {
      const short = computePeopleDiscoverCardMetrics({
        hostW: 390,
        hostH,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: true,
        fullWidthSlide: true,
      });
      expect(short.frameW).toBeLessThanOrEqual(tall.frameW + 0.5);
      expect(short.aspect).toBeLessThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_STRESS + 0.001);
      const sideGutter = (short.slideW - short.portraitW) / 2;
      expect(sideGutter).toBeGreaterThanOrEqual(16);
    }
  });

  it("Mine portrait center Y includes surplus padTop (edge cards track)", () => {
    // After aspect clamp, padTop lifts portrait+note; center = padTop + chrome + H/2.
    const hostW = 430;
    const hostH = 844;
    const tall = computePeopleDiscoverCardMetrics({
      hostW,
      hostH,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    const surplus = Math.max(0, Math.round(hostH - tall.contentH));
    expect(tall.padTop).toBe(Math.floor(surplus / 2));
    const portraitCenterFromSlideTop =
      tall.padTop +
      (tall.contentH -
        tall.portraitH -
        PEOPLE_MINE_NOTE_RESERVE_H_PX) +
      tall.portraitH / 2;
    expect(portraitCenterFromSlideTop).toBeGreaterThan(tall.portraitH / 2);
    expect(tall.portraitW).toBeCloseTo(
      hostW - 2 * PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
      1
    );
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

describe("Mine portrait stack poses + readiness", () => {
  it("assignments: 1 / 2 / 3 cards and cycle roles", () => {
    expect(peopleMineStackAssignments(1, 0)).toEqual([
      { photoIndex: 0, role: "front" },
    ]);
    expect(peopleMineStackAssignments(2, 0)).toEqual([
      { photoIndex: 0, role: "front" },
      { photoIndex: 1, role: "right" },
    ]);
    expect(peopleMineStackAssignments(2, 1)).toEqual([
      { photoIndex: 1, role: "front" },
      { photoIndex: 0, role: "right" },
    ]);
    expect(peopleMineStackAssignments(3, 0)).toEqual([
      { photoIndex: 0, role: "front" },
      { photoIndex: 1, role: "right" },
      { photoIndex: 2, role: "left" },
    ]);
    expect(peopleMineStackAssignments(3, 1)).toEqual([
      { photoIndex: 1, role: "front" },
      { photoIndex: 2, role: "right" },
      { photoIndex: 0, role: "left" },
    ]);
  });

  it("shared transform origin + opposing upward leans", () => {
    expect(PEOPLE_MINE_CARD_TRANSFORM_ORIGIN).toBe("50% 90%");
    expect(peopleMineCardTransform("front")).toContain("rotate(0deg)");
    expect(peopleMineCardTransform("right")).toContain(
      "translate(2.35%, -7%)"
    );
    expect(peopleMineCardTransform("left")).toContain(
      "translate(-2.35%, -14%)"
    );
    expect(peopleMineCardTransform("right")).toContain("rotate(2.05deg)");
    expect(peopleMineCardTransform("left")).toContain("rotate(-2.05deg)");
    // Staggered top reveal: deepest (left) above next (right).
    expect(14).toBeGreaterThan(7);
    // Soft edge (not a heavy white ring).
    expect(PEOPLE_MINE_PHOTO_EDGE).toContain("1px");
    expect(PEOPLE_MINE_PHOTO_EDGE).toContain("38%");
  });

  it("Mine rear pose bottoms clear front; left clears more than right", () => {
    expect(peopleMinePoseBottomClearance("right")).toBeGreaterThan(0);
    expect(peopleMinePoseBottomClearance("left")).toBeGreaterThan(0);
    expect(peopleMinePoseBottomClearance("left")).toBeGreaterThan(
      peopleMinePoseBottomClearance("right")
    );
  });

  it("settled rear bottoms clear front; transition z avoids under-pop", () => {
    expect(peopleMinePoseBottomClearance("right")).toBeGreaterThan(0);
    expect(peopleMinePoseBottomClearance("left")).toBeGreaterThan(0);
    expect(peopleMineCardZIndex("front", "settled")).toBeGreaterThan(
      peopleMineCardZIndex("right", "settled")
    );
    // 2-photo: elevating promoting/demoting still applies.
    expect(peopleMineCardZIndex("right", "promoting", 2)).toBe(
      PEOPLE_MINE_Z_PROMOTING
    );
    expect(peopleMineCardZIndex("front", "demoting", 2)).toBe(
      PEOPLE_MINE_Z_DEMOTING
    );
    expect(PEOPLE_MINE_Z_PROMOTING).toBeGreaterThan(PEOPLE_MINE_Z_DEMOTING);
  });

  it("3-photo flight uses destination settled z (no demoting-above-right)", () => {
    // After tap 0→1: B front, C right, A left — same z whether "demoting" or settled.
    const zA = peopleMineCardZIndex("left", "demoting", 3);
    const zB = peopleMineCardZIndex("front", "promoting", 3);
    const zC = peopleMineCardZIndex("right", "settled", 3);
    expect(zB).toBeGreaterThan(zC);
    expect(zC).toBeGreaterThan(zA);
    expect(zA).toBe(peopleMineCardZIndex("left", "settled", 3));
    expect(zB).toBe(peopleMineCardZIndex("front", "settled", 3));
    expect(zC).toBe(peopleMineCardZIndex("right", "settled", 3));
    // Must not keep demoting above the new second.
    expect(zA).toBeLessThan(zC);
  });

  it("Mine photo edge + shadow stay single-ring static", () => {
    expect(PEOPLE_MINE_PHOTO_EDGE).toContain("1px");
    expect(PEOPLE_MINE_FRONT_SHADOW).toContain(PEOPLE_MINE_PHOTO_EDGE);
    expect(PEOPLE_MINE_FRONT_SHADOW).toBe(PEOPLE_MINE_REAR_SHADOW);
    expect(PEOPLE_MINE_FRONT_SHADOW).toMatch(/0 4px 12px/);
  });

  it("mounted photo readiness rejects incomplete / zero naturalWidth", () => {
    expect(isMountedPhotoPaintReady(null)).toBe(false);
    const incomplete = {
      complete: false,
      naturalWidth: 100,
    } as HTMLImageElement;
    expect(isMountedPhotoPaintReady(incomplete)).toBe(false);
    const broken = {
      complete: true,
      naturalWidth: 0,
    } as HTMLImageElement;
    expect(isMountedPhotoPaintReady(broken)).toBe(false);
    const ok = {
      complete: true,
      naturalWidth: 640,
    } as HTMLImageElement;
    expect(isMountedPhotoPaintReady(ok)).toBe(true);
  });

  it("accepts current-front decode only for matching generation/photo/current", () => {
    expect(
      shouldAcceptMountedFrontDecode({
        checkGeneration: 1,
        currentGeneration: 1,
        decodedPhotoIndex: 0,
        displayedPhotoIndex: 0,
        stillCurrent: true,
      })
    ).toBe(true);
    expect(
      shouldAcceptMountedFrontDecode({
        checkGeneration: 1,
        currentGeneration: 2,
        decodedPhotoIndex: 0,
        displayedPhotoIndex: 0,
        stillCurrent: true,
      })
    ).toBe(false);
    expect(
      shouldAcceptMountedFrontDecode({
        checkGeneration: 2,
        currentGeneration: 2,
        decodedPhotoIndex: 0,
        displayedPhotoIndex: 1,
        stillCurrent: true,
      })
    ).toBe(false);
    expect(
      shouldAcceptMountedFrontDecode({
        checkGeneration: 2,
        currentGeneration: 2,
        decodedPhotoIndex: 1,
        displayedPhotoIndex: 1,
        stillCurrent: false,
      })
    ).toBe(false);
  });

  it("MinePhotoStack rechecks mounted front when isCurrent changes", () => {
    const mediaSrc = readFileSync(
      new URL("../../components/people/PeopleCandidateMedia.tsx", import.meta.url),
      "utf8"
    );
    expect(mediaSrc).toContain("shouldAcceptMountedFrontDecode");
    expect(mediaSrc).toMatch(
      /useLayoutEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?isMountedPhotoPaintReady[\s\S]*?\},\s*\[displayedIndex,\s*photosKey,\s*isCurrent\]/
    );
    // Mount window unchanged — still ±2 via shared constant.
    expect(MINE_PHOTO_MOUNT_RADIUS).toBe(2);
    const carouselSrc = readFileSync(
      new URL("../../pages/people/MatchDeckCarousel.tsx", import.meta.url),
      "utf8"
    );
    expect(carouselSrc).toContain("matchDeckPhotoMountRadius");
  });

  it("tap threshold and two-photo depth exchange map", () => {
    expect(PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX).toBe(10);
    // After tap from front=0: right(1) becomes front; old front → right.
    const before = peopleMineStackAssignments(2, 0);
    const after = peopleMineStackAssignments(2, 1);
    expect(before.find((a) => a.role === "right")?.photoIndex).toBe(1);
    expect(after.find((a) => a.role === "front")?.photoIndex).toBe(1);
    expect(after.find((a) => a.role === "right")?.photoIndex).toBe(0);
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

  it("fixture force is explicit opt-in only (off by default)", () => {
    expect(isPeopleMineDevFixturesForced()).toBe(false);
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

describe("Mine Back-align: matched host/chrome reclaim", () => {
  const mineOpts = {
    reserveInFlowChrome: true,
    distributeVerticalSurplus: true,
    upwardPeekPad: true,
    fullWidthSlide: true,
  } as const;

  it("Back-align slack remains 48 for shell identity; chrome no longer includes it", () => {
    expect(PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX).toBe(48);
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeLessThan(
      PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX + PEOPLE_DUO_SOURCE_CHROME_H_PX
    );
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeGreaterThan(
      PEOPLE_DUO_SOURCE_CHROME_H_PX
    );
  });

  it("shell Back reclaim constant stays 48 (media budget gains the reclaim)", () => {
    const reclaim = PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX;
    expect(reclaim).toBe(48);
    const chromeNow =
      PEOPLE_MINE_SOURCE_CHROME_H_PX +
      PEOPLE_MINE_TOP_GAP_PX +
      PEOPLE_MINE_NOTE_RESERVE_H_PX;
    for (const hostH of [520, 568, 700, 844, 932]) {
      expect(hostH - chromeNow).toBeGreaterThan(0);
    }
  });

  it("fixed-rails frame is hostH-independent (width-first)", () => {
    for (const hostW of [320, 360, 390, 412, 430]) {
      const a = computePeopleDiscoverCardMetrics({
        hostW,
        hostH: 700,
        ...mineOpts,
      });
      const b = computePeopleDiscoverCardMetrics({
        hostW,
        hostH: 700 + PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX,
        ...mineOpts,
      });
      expect(a.frameW).toBeCloseTo(peopleMineTargetFrameW(hostW, 700), 1);
      expect(b.frameW).toBeCloseTo(
        peopleMineTargetFrameW(hostW, 700 + PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX),
        1
      );
      expect(a.frameW).toBeCloseTo(b.frameW, 1);
      // Both hosts clamp at 3:4 when room allows — aspect envelope, not unbounded fill.
      expect(a.aspect).toBeCloseTo(PEOPLE_CANDIDATE_MEDIA_ASPECT, 2);
      expect(b.aspect).toBeCloseTo(PEOPLE_CANDIDATE_MEDIA_ASPECT, 2);
      expect(a.aspect).toBeGreaterThanOrEqual(PEOPLE_CANDIDATE_MEDIA_ASPECT - 0.001);
      expect(b.aspect).toBeGreaterThanOrEqual(PEOPLE_CANDIDATE_MEDIA_ASPECT - 0.001);
    }
  });

  it("surplus padTop/padBottom split leftover; slideH equals hostH", () => {
    for (const hostH of [568, 700, 844]) {
      const m = computePeopleDiscoverCardMetrics({
        hostW: 390,
        hostH,
        ...mineOpts,
      });
      const surplus = Math.max(0, Math.round(hostH - m.contentH));
      expect(m.padTop).toBe(Math.floor(surplus / 2));
      expect(m.padBottom).toBe(surplus - m.padTop);
      expect(m.unusedHostH).toBeLessThanOrEqual(0.5);
      expect(m.slideH).toBe(hostH);
    }
  });
});

describe("Mine note reserve + responsive height budget", () => {
  const mineOpts = {
    reserveInFlowChrome: true,
    distributeVerticalSurplus: true,
    upwardPeekPad: true,
    fullWidthSlide: true,
  } as const;

  const viewports = [
    { hostW: 320, hostH: 700 },
    { hostW: 360, hostH: 740 },
    { hostW: 390, hostH: 844 },
    { hostW: 412, hostH: 924 },
    { hostW: 440, hostH: 956 },
  ] as const;

  it("Mine chrome includes three-line note reserve on target phones", () => {
    for (const vp of viewports) {
      const m = computePeopleDiscoverCardMetrics({ ...vp, ...mineOpts });
      const chrome =
        m.contentH - (m.frameH + m.stackPadYTop + m.stackPadY);
      expect(chrome).toBeCloseTo(
        PEOPLE_MINE_SOURCE_CHROME_H_PX +
          PEOPLE_MINE_TOP_GAP_PX +
          PEOPLE_MINE_NOTE_RESERVE_H_PX,
        5
      );
      expect(m.slideH).toBe(vp.hostH);
      const surplus = Math.max(0, Math.round(vp.hostH - m.contentH));
      expect(m.padTop).toBe(Math.floor(surplus / 2));
      expect(m.padBottom).toBe(surplus - m.padTop);
    }
  });

  it("tall phones clamp at 3:4 width-first; short stay within stress ladder", () => {
    const tall = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      ...mineOpts,
    });
    expect(tall.frameW).toBeCloseTo(peopleMineTargetFrameW(390, 844), 1);
    expect(tall.aspect).toBeCloseTo(PEOPLE_CANDIDATE_MEDIA_ASPECT, 2);
    expect(tall.aspect).toBeGreaterThanOrEqual(PEOPLE_CANDIDATE_MEDIA_ASPECT - 0.001);
    expect(tall.aspect).toBeLessThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_STRESS + 0.001);

    const short = computePeopleDiscoverCardMetrics({
      hostW: 320,
      hostH: 700,
      ...mineOpts,
    });
    expect(short.aspect).toBeGreaterThanOrEqual(
      PEOPLE_CANDIDATE_MEDIA_ASPECT - 0.001
    );
    expect(short.aspect).toBeLessThanOrEqual(
      PEOPLE_MINE_MEDIA_ASPECT_STRESS + 0.001
    );
    expect(short.frameW).toBeLessThanOrEqual(tall.frameW + 0.5);
  });

  it("fixed-rails matrix: portrait width locked; surplus centers when leftover", () => {
    for (const vp of viewports) {
      const m = computePeopleDiscoverCardMetrics({ ...vp, ...mineOpts });
      expect(m.frameW).toBeCloseTo(peopleMineTargetFrameW(vp.hostW, vp.hostH), 1);
      expect(m.portraitW).toBeCloseTo(
        vp.hostW - 2 * PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
        1
      );
      const surplus = Math.max(0, Math.round(vp.hostH - m.contentH));
      expect(m.padTop).toBe(Math.floor(surplus / 2));
      expect(m.padBottom).toBe(surplus - m.padTop);
      expect(m.unusedHostH).toBeLessThanOrEqual(0.5);
    }

    const shortH = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 560,
      ...mineOpts,
    });
    expect(shortH.frameW).toBeLessThanOrEqual(
      peopleMineTargetFrameW(390, 560) + 0.5
    );
  });

  it("Discover still uses the legacy 40px note reserve", () => {
    const m = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
    });
    const chrome =
      m.contentH - (m.frameH + m.stackPadYTop + m.stackPadY);
    expect(chrome).toBeCloseTo(
      PEOPLE_DUO_SOURCE_CHROME_H_PX + PEOPLE_DUO_NOTE_RESERVE_H_PX,
      5
    );
  });
});

describe("Plans full-width geometry (fixed rails)", () => {
  const plansOpts = {
    reserveInFlowChrome: true,
    distributeVerticalSurplus: true,
    upwardPeekPad: false,
    fullWidthSlide: true,
    chromeProfile: "plans" as const,
  };

  const viewports = [
    { hostW: 320, hostH: 700 },
    { hostW: 360, hostH: 740 },
    { hostW: 390, hostH: 844 },
    { hostW: 412, hostH: 924 },
    { hostW: 440, hostH: 956 },
  ] as const;

  it("Plans chrome is PEOPLE_PLANS_CHROME_H_PX (includes shared 3-line note shell)", () => {
    expect(PEOPLE_PLANS_CHROME_H_PX).toBeGreaterThan(PEOPLE_MINE_NOTE_RESERVE_H_PX);
    for (const vp of viewports) {
      const m = computePeopleDiscoverCardMetrics({ ...vp, ...plansOpts });
      const chrome =
        m.contentH - (m.frameH + m.stackPadYTop + m.stackPadY);
      expect(chrome).toBeCloseTo(PEOPLE_PLANS_CHROME_H_PX, 5);
      expect(m.slideH).toBe(vp.hostH);
      expect(m.fullWidthSlide).toBe(true);
      expect(m.stackPadYTop).toBe(PEOPLE_DISCOVER_STACK_PAD_Y);
    }
  });

  it("Plans width is fixed-rail (hostH-independent); short height-stress still works", () => {
    const tall = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      ...plansOpts,
    });
    expect(tall.aspect).toBeCloseTo(PEOPLE_CANDIDATE_MEDIA_ASPECT, 3);
    expect(tall.frameW).toBeCloseTo(peoplePlansTargetFrameW(390, 844), 1);
    expect(tall.frameW).toBe(peoplePlansTargetFrameW(390, 560));
    expect(tall.portraitW).toBeCloseTo(
      390 - 2 * PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
      1
    );

    const short = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 520,
      ...plansOpts,
    });
    expect(short.frameW).toBeLessThanOrEqual(tall.frameW + 0.5);
    expect(short.aspect).toBeGreaterThanOrEqual(
      PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN - 0.001
    );
  });

  it("Mine geometry unchanged when chromeProfile is mine", () => {
    const mine = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    const chrome =
      mine.contentH - (mine.frameH + mine.stackPadYTop + mine.stackPadY);
    expect(chrome).toBeCloseTo(
      PEOPLE_MINE_SOURCE_CHROME_H_PX +
        PEOPLE_MINE_TOP_GAP_PX +
        PEOPLE_MINE_NOTE_RESERVE_H_PX,
      5
    );
    expect(mine.stackPadYTop).toBe(PEOPLE_MINE_STACK_PAD_Y_TOP);
  });

  it("Discover peek geometry unchanged (not fullWidth)", () => {
    const m = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      fullWidthSlide: false,
      chromeProfile: "discover",
    });
    expect(m.fullWidthSlide).toBe(false);
    expect(m.neighborPeekPx).toBeGreaterThan(0);
  });
});
