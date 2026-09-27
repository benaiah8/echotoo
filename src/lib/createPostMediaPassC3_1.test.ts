import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampCreateHeroPaginationIndex,
  createHeroPaginationDotCount,
  shouldShowCreateHeroPagination,
} from "./createFinalizeHeroPagination";
import { remapHeroIndexAfterMediaMove } from "./createFinalizeHeroMedia";
import {
  VIDEO_PLAYBACK_RATE_FAST,
  VIDEO_SEEK_DELTA_SEC,
  applyPointerCancelToPendingVideoTap,
  applyPointerLeaveToPendingVideoTap,
  classifyHeroPointerGesture,
  computeDoubleTapSeekTime,
  resolveVideoPointerUp,
  shouldAbortPendingVideoTapOnPointerCancel,
  shouldAbortPendingVideoTapOnPointerLeave,
  shouldCommitVideoTapGestures,
  type PendingVideoTapState,
} from "./createFinalizeVideoGestures";
import { MIXED_HERO_SWIPE_NO_SELECTOR } from "./createFinalizeMixedMedia";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const idleTap: PendingVideoTapState = {
  singleTapScheduled: true,
  lastTap: { time: 1, zone: "center" },
  holdArmed: false,
  holdActive: false,
};

describe("PASS C3.1 — video pointer lifecycle", () => {
  it("A: clean video tap resolves to play/pause", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "center",
        lastTap: null,
        now: 1000,
      }),
    ).toEqual({ action: "playpause" });
  });

  it("B: pointerleave after pointerup does not cancel valid tap", () => {
    expect(shouldAbortPendingVideoTapOnPointerLeave()).toBe(false);
    expect(applyPointerLeaveToPendingVideoTap(idleTap)).toEqual(idleTap);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).not.toContain("onPointerLeave");
  });

  it("C: pointercancel does cancel tap", () => {
    expect(shouldAbortPendingVideoTapOnPointerCancel()).toBe(true);
    expect(applyPointerCancelToPendingVideoTap(idleTap)).toEqual({
      singleTapScheduled: false,
      lastTap: null,
      holdArmed: false,
      holdActive: false,
    });
  });

  it("D: double-tap left seeks -3 sec", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "left",
        lastTap: { time: 1000, zone: "left" },
        now: 1200,
      }),
    ).toEqual({ action: "seek", direction: "back" });
    expect(computeDoubleTapSeekTime("back", 10, 30)).toBe(7);
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
  });

  it("E: double-tap right seeks +3 sec", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "right",
        lastTap: { time: 1000, zone: "right" },
        now: 1200,
      }),
    ).toEqual({ action: "seek", direction: "forward" });
    expect(computeDoubleTapSeekTime("forward", 10, 30)).toBe(13);
  });

  it("F/G/H: horizontal swipe cancels tap, double-tap, and pending hold", () => {
    expect(classifyHeroPointerGesture(12, 1)).toBe("slide");
    expect(shouldCommitVideoTapGestures("slide")).toBe(false);
    expect(
      resolveVideoPointerUp({
        kind: "slide",
        holdActive: false,
        zone: "center",
        lastTap: { time: 1, zone: "center" },
        now: 50,
      }),
    ).toEqual({ action: "none" });
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain('gesture.kind = "slide"');
    expect(player).toContain("cancelPendingVideoGestures()");
  });

  it("I: stationary hold enters 2x", () => {
    expect(VIDEO_PLAYBACK_RATE_FAST).toBe(2);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("el.playbackRate = VIDEO_PLAYBACK_RATE_FAST");
  });

  it("J: release restores 1x", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: true,
        zone: "left",
        lastTap: null,
        now: 2000,
      }),
    ).toEqual({ action: "end-hold" });
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("endLongPress()");
    expect(player).toContain("el.playbackRate = 1");
  });

  it("K: inactive video restores 1x", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("if (!isActiveHero || dockBlocksPlayback)");
    expect(player).toContain("pauseVideo()");
    expect(player).toContain("if (el.playbackRate !== 1) el.playbackRate = 1");
  });

  it("L/M: scrubber and mute/fullscreen do not swipe carousel", () => {
    expect(MIXED_HERO_SWIPE_NO_SELECTOR).toContain("[data-video-control]");
    const mixed = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(mixed).toContain("touchStartPreventDefault={false}");
    expect(mixed).toContain("preventClicks={false}");
    expect(mixed).toContain("preventClicksPropagation={false}");
    expect(mixed).toContain("noSwipingSelector={MIXED_HERO_SWIPE_NO_SELECTOR}");
  });
});

describe("PASS C3.1 — external pagination dots", () => {
  it("N: 1 media → no dots", () => {
    expect(shouldShowCreateHeroPagination(1)).toBe(false);
    expect(createHeroPaginationDotCount(1)).toBe(0);
  });

  it("O: 3 media → 3 dots", () => {
    expect(createHeroPaginationDotCount(3)).toBe(3);
  });

  it("P: 7 media → 7 dots", () => {
    expect(createHeroPaginationDotCount(7)).toBe(7);
    expect(createHeroPaginationDotCount(10)).toBe(10);
  });

  it("Q/R: active dot follows slider and thumbnail index", () => {
    expect(clampCreateHeroPaginationIndex(2, 4)).toBe(2);
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("CreateFinalizeHeroPaginationDots");
    expect(page).toContain("activeIndex={finalizeHeroSlideIndex}");
    expect(page).toContain("count={mediaOrder.length}");
  });

  it("S: active dot follows stable item after reorder", () => {
    expect(remapHeroIndexAfterMediaMove(1, 1, 0)).toBe(0);
    expect(clampCreateHeroPaginationIndex(0, 3)).toBe(0);
  });

  it("T: dots render outside hero shell", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("data-create-hero-pagination-slot");
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).not.toContain("CreateFinalizeHeroPaginationDots");
    expect(hero).toContain("overflow-hidden rounded-2xl");
    const slotIdx = body.indexOf("data-create-hero-pagination-slot");
    const frameClose = body.lastIndexOf("data-media-control");
    expect(slotIdx).toBeGreaterThan(frameClose);
  });

  it("U: image-only Create uses external dots without duplicate internal dots", () => {
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("showDots={false}");
  });

  it("V: Feed/Post Detail MediaCarousel default dot behavior unchanged", () => {
    const carousel = read("src/components/MediaCarousel.tsx");
    expect(carousel).toContain("showDots = true");
    const post = read("src/components/Post.tsx");
    expect(post).not.toContain("showDots={false}");
    const detail = read("src/components/detail/PostDetailBody.tsx");
    expect(detail).not.toMatch(/<MediaCarousel[\s\S]*showDots=\{false\}/);
  });

  it("W: no Bunny request from gestures/dots", () => {
    const dots = read(
      "src/components/create/CreateFinalizeHeroPaginationDots.tsx",
    );
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(dots).not.toContain("bunny-upload-init");
    expect(player).not.toContain("bunny-upload-init");
  });
});
