/**
 * Reveal-first surface tap + Feed video expand → Detail + one-shot immersive fullscreen.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Reveal-first published video surface tap", () => {
  const hook = () =>
    read("src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts");

  it("A/B: chrome hidden → reveal only (no play/pause)", () => {
    const src = hook();
    expect(src).toContain("surface-tap-reveal-only");
    expect(src).toContain("if (!chromeVisible)");
    expect(src).toMatch(
      /if\s*\(\s*!chromeVisible\s*\)\s*\{[\s\S]*?onRevealChrome\(\);[\s\S]*?return;/,
    );
    const revealOnlyBlock = src.slice(
      src.indexOf("if (!chromeVisible)"),
      src.indexOf("if (wasPlaying)"),
    );
    expect(revealOnlyBlock).not.toContain("onRequestManualPause");
    expect(revealOnlyBlock).not.toContain("onRequestManualPlay");
  });

  it("C/D: chrome visible → existing play/pause toggle + reveal", () => {
    const src = hook();
    expect(src).toContain("onRequestManualPause()");
    expect(src).toContain("onRequestManualPlay()");
    expect(src).toContain("onRevealChrome()");
  });

  it("E–H: control exclusion unchanged (pathHitsControl + selectors)", () => {
    const src = hook();
    expect(src).toContain("pathHitsControl");
    expect(src).toContain("[data-video-control]");
    expect(src).toContain("[data-video-scrubber]");
    expect(src).toContain("control-excluded");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("data-video-control");
    expect(player).toContain("data-video-scrubber");
  });

  it("I: reveal uses existing onRevealChrome (auto-hide lifecycle)", () => {
    const src = hook();
    expect(src).toContain("onRevealChrome: () => void");
    expect(src).toMatch(/surface-tap-reveal-only[\s\S]*onRevealChrome\(\)/);
  });
});

describe("Feed direct-to-fullscreen via PostDetailNavigateState", () => {
  it("J: nav state field openImmersiveFullscreen", () => {
    const nav = read("src/lib/postDetailNavigationState.ts");
    expect(nav).toContain("openImmersiveFullscreen?: boolean");
  });

  it("J/K: Feed expand carries key + one-shot intent through goToDetails", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const post = read("src/components/Post.tsx");
    expect(surface).toContain("openImmersiveFullscreen: true");
    expect(surface).toContain("openDetailAt(item.key");
    expect(post).toContain("openImmersiveFullscreen");
    expect(post).toContain(
      "...(openImmersiveFullscreen ? { openImmersiveFullscreen: true } : {})",
    );
  });

  it("K/L/M: carousel consumes once via ref then openFullscreenAt", () => {
    const carousel = read(
      "src/components/detail/PublishedMediaCarousel.tsx",
    );
    expect(carousel).toContain("openImmersiveFullscreen");
    expect(carousel).toContain("immersiveFullscreenConsumedRef");
    expect(carousel).toContain("openFullscreenAt(targetKey)");
    expect(carousel).toContain("immersiveFullscreenConsumedRef.current = true");
    expect(carousel).toContain(
      "immersiveFullscreenConsumedRef.current = false",
    );
  });

  it("N/O: Android Back still FS-first then Detail", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("tryConsumePublishedMediaFullscreenBack");
    expect(modal).toMatch(
      /subscribeAndroidPostDetailModalBack\(\(\) => \{[\s\S]*tryConsumePublishedMediaFullscreenBack\(\)[\s\S]*playAnimatedDismissRef/,
    );
  });

  it("P: normal card/image open does not set immersive flag", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const imageTap = surface.slice(
      surface.indexOf("const openDetailForImageTap"),
      surface.indexOf("const slideCount"),
    );
    expect(imageTap).toContain("openDetailAt(item.key)");
    expect(imageTap).not.toContain("openImmersiveFullscreen");
    const post = read("src/components/Post.tsx");
    expect(post).toContain("onOpen={() => goToDetails()}");
  });

  it("Q/R: video expand targets item.key; image tap unchanged", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toMatch(
      /onRequestMixedFullscreen=\{\(\) => \{[\s\S]*openDetailAt\(item\.key,\s*\{\s*openImmersiveFullscreen:\s*true/,
    );
    expect(surface).toContain("item.kind !== \"image\"");
  });

  it("S: Detail expand still calls openFullscreenAt directly", () => {
    const carousel = read(
      "src/components/detail/PublishedMediaCarousel.tsx",
    );
    expect(carousel).toContain("openFullscreenAt(item.key)");
  });

  it("T/U: same PublishedMediaFullscreenViewer path (status-bar + Rotate)", () => {
    const carousel = read(
      "src/components/detail/PublishedMediaCarousel.tsx",
    );
    expect(carousel).toContain("PublishedMediaFullscreenViewer");
    expect(carousel).toContain("openFullscreenAt(targetKey)");
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("enterPublishedImmersiveStatusBar");
    expect(viewer).toContain("exitPublishedImmersiveStatusBar");
  });

  it("V: continuity / warm / handoff modules untouched by this wiring", () => {
    const handoff = read(
      "src/lib/publishedMedia/publishedVideoFeedDetailHandoff.ts",
    );
    expect(handoff).not.toContain("openImmersiveFullscreen");
    const coord = read(
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    );
    expect(coord).not.toContain("openImmersiveFullscreen");
  });

  it("Body passes openImmersiveFullscreen from router state", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("openImmersiveFullscreen");
    expect(body).toContain(
      "openImmersiveFullscreen={openImmersiveFullscreen}",
    );
  });
});
