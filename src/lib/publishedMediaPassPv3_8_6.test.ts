/**
 * PASS PV3.8.6 — historically restored double-tap seek.
 * PV3.8.7 removes published double-tap; keep surface/lifecycle contracts green.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.8.6 — superseded double-tap; keep list lifecycle", () => {
  it("published double-tap seek removed (see PV3.8.7)", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(hook).not.toContain("armDoubleTapWindow");
    expect(hook).not.toContain("ensurePlayingAfterDoubleTap");
    expect(hook).not.toContain("double-tap-candidate-start");
    expect(player).not.toContain("doubleTapWindowPending");
    expect(player).not.toContain("onClearUserPausedForDoubleTap");
  });

  it("center remains visual/keyboard-only; mute/scrub explicit", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("data-published-video-center-affordance");
    expect(player).toContain('centerPlayHit = "pointer-events-none"');
    expect(player).toContain("data-video-scrubber");
  });

  it("hold + swipe + true pause + visibility markers", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(hook).toContain("armHold()");
    expect(hook).toContain("swiper-gesture");
    expect(surface).toContain("visibility-below-active-exit");
    expect(surface).toContain("mark user-paused only — keep active ownership");
  });

  it("Home / Search / Profile share PublishedMediaSurface lifecycle", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(read("src/components/Post.tsx")).toContain("PublishedMediaSurface");
    expect(home).toContain(
      "isVisible={isHomeVisible && !homePostSearchActive}",
    );
    expect(home).toContain("home-posts-search-");
  });
});
