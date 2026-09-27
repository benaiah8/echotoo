/**
 * PASS PV3.8.7 — remove published double-tap seek; simplify gestures.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VIDEO_LONG_PRESS_MS } from "./createFinalizeVideoGestures";
import { PUBLISHED_HOLD_CANCEL_PX } from "./publishedMedia/usePublishedVideoSurfaceGestures";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.8.7 — published gestures without double-tap", () => {
  it("A–G: reveal-first when chrome hidden; toggle when visible; no double-tap path", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("Reveal-first");
    expect(hook).toContain("surface-tap-reveal-only");
    expect(hook).toContain("chromeVisible");
    expect(hook).toContain("onRequestManualPause()");
    expect(hook).toContain("onRequestManualPlay()");
    expect(hook).not.toContain("pendingPauseTimer");
    expect(hook).not.toContain("lastTapRef");
    expect(hook).not.toContain("armDoubleTapWindow");
    expect(hook).not.toContain("ensurePlayingAfterDoubleTap");
    expect(hook).not.toContain("isDoubleTap");
    expect(hook).not.toContain("computeDoubleTapSeekTime");
    expect(hook).not.toContain("VIDEO_DOUBLE_TAP_WINDOW_MS");
    expect(hook).not.toContain("double-tap-");
    expect(hook).not.toContain("onClearUserPausedForDoubleTap");
    expect(hook).not.toContain("onDoubleTapWindowChange");
  });

  it("H–K: left/center/right are ordinary Play/Pause (zone logged only)", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("zoneFromClientX");
    expect(hook).toContain("surface-tap");
    expect(hook).not.toContain("seekByDirection");
    expect(hook).not.toContain("wasPlayingBeforeToggle");
  });

  it("L–Q: hold 2× anywhere; release/cancel does not toggle", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("armHold()");
    expect(hook).toContain("hold-armed");
    expect(hook).toContain("hold-active");
    expect(hook).toContain("hold-release");
    expect(hook).toContain("must NOT also toggle Play/Pause");
    expect(VIDEO_LONG_PRESS_MS).toBe(450);
    expect(PUBLISHED_HOLD_CANCEL_PX).toBe(10);
  });

  it("R–S: swipe cancels tap/hold", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain('gesture.kind === "slide"');
    expect(hook).toContain("swiper-gesture");
  });

  it("T–V: mute/expand/scrub + center visual-only", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("data-published-video-center-affordance");
    expect(player).toContain('centerPlayHit = "pointer-events-none"');
    expect(player).toContain("data-video-scrubber");
    expect(player).not.toContain("doubleTapWindowPending");
    expect(player).not.toContain("onClearUserPausedForDoubleTap");
    expect(player).not.toContain("data-double-tap-pending");
  });

  it("W–Y / AK–AL: true pause + visibility preserved", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(player).toContain("Media first — keep active ownership");
    expect(player).toContain("manual-paused-active");
    expect(surface).toContain("visibility-below-active-exit");
    expect(surface).toContain("evaluatePublishedListVideoVisibilityPolicy");
    expect(surface).toContain("mark user-paused only — keep active ownership");
  });

  it("Z–AE: list surfaces share lifecycle; Search blocks Home", () => {
    const home = read("src/pages/HomePage.tsx");
    const post = read("src/components/Post.tsx");
    expect(post).toContain("PublishedMediaSurface");
    expect(home).toContain(
      "isVisible={isHomeVisible && !homePostSearchActive}",
    );
    expect(home).toContain("home-posts-search-");
    expect(
      read("src/sections/profile/OwnProfilePostsSection.tsx"),
    ).toContain("slideshowHostVisible");
    expect(
      read("src/sections/profile/OtherProfilePostsSection.tsx"),
    ).toContain("slideshowHostVisible");
  });

  it("AM: Create double-tap helpers remain for Create only", () => {
    const createGestures = read("src/lib/createFinalizeVideoGestures.ts");
    const createPlayer = read(
      "src/components/create/CreateFinalizeVideoPlayer.tsx",
    );
    expect(createGestures).toContain("VIDEO_DOUBLE_TAP_WINDOW_MS");
    expect(createGestures).toContain("isDoubleTap");
    expect(createPlayer).toContain("lastTapRef");
  });
});
