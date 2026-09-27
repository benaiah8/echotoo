import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV2B.1 — nested fullscreen / Detail dismiss isolation", () => {
  it("A/C: mixed fullscreen stays open; video horizontal swipe does not route-dismiss", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("onSlideChange");
    expect(viewer).toContain('mode="fullscreen"');
    expect(viewer).not.toContain("navigate(");
    expect(viewer).not.toContain("playAnimatedDismiss");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("closeFullscreen");
    expect(carousel).not.toContain("navigate(");
  });

  it("B/S: inactive video tears down HLS", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("tearDownPlayback");
    expect(player).toMatch(/if \(!isActive && !isWarm\) \{[\s\S]*tearDownPlayback\(\)/);
    expect(player).toContain("destroyHls");
  });

  it("D/E/F: video controls keep ownership selectors", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("data-video-control");
    expect(player).toContain("data-video-scrubber");
    expect(player).toContain("stopPropagation");
    expect(player).toContain("setPointerCapture");
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("PUBLISHED_MEDIA_SWIPE_NO_SELECTOR");
    expect(viewer).toContain("noSwiping");
  });

  it("G: vertical dismiss disabled on active video slide (mixed)", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    const gestures = read(
      "src/lib/publishedMedia/publishedFullscreenGestures.ts",
    );
    // Mixed: still blocked. Video-only uses a separate policy (Pass 3C).
    expect(viewer).toContain('activeSlideIsVideo() && !videoOnly');
    expect(viewer).toContain('data-vertical-dismiss={verticalDismissMode}');
    expect(viewer).toContain('"video-only"');
    expect(viewer).toContain("isPublishedFullscreenVerticalDismissBlockedTarget");
    expect(gestures).toContain('"[data-published-video-player]"');
    expect(gestures).toContain('"video-only-surface"');
  });

  it("H: image vertical dismiss retained when eligible", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    const gestures = read(
      "src/lib/publishedMedia/publishedFullscreenGestures.ts",
    );
    expect(viewer).toContain("LIGHTBOX_SWIPE_VERTICAL_THRESHOLD");
    expect(viewer).toContain("shouldClosePublishedFullscreenVerticalDismiss");
    expect(viewer).toContain("swiper-zoom-container-zoomed");
    // Pass 2D: threshold close is helper-owned (default 100px).
    expect(gestures).toContain("shouldClosePublishedFullscreenVerticalDismiss");
    expect(gestures).toContain("options.thresholdPx ?? 100");
    expect(gestures).toContain(".swiper-zoom-container-zoomed");
  });

  it("I/J: first Android Back closes fullscreen only; second closes Detail", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("tryConsumePublishedMediaFullscreenBack");
    expect(modal).toContain("subscribeAndroidPostDetailModalBack");
    expect(modal).toMatch(
      /subscribeAndroidPostDetailModalBack\(\(\) => \{[\s\S]*tryConsumePublishedMediaFullscreenBack\(\)[\s\S]*playAnimatedDismissRef/,
    );
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("registerPublishedMediaFullscreenClose");
    expect(viewer).toContain("closeViewer");
    expect(viewer).not.toContain("navigate(-1)");
  });

  it("K: Escape closes fullscreen only (capture + parent consume)", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('addEventListener("keydown", handleEscape, true)');
    expect(viewer).toContain("stopPropagation");
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain('e.key !== "Escape"');
    expect(modal).toContain("tryConsumePublishedMediaFullscreenBack()");
    expect(modal).toContain('addEventListener("keydown", onKeyDown)');
  });

  it("L: click-through guard after fullscreen close", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("armPublishedMediaFullscreenClickThroughGuard");
    expect(modal).toContain("clickThroughGuardUntilRef");
    expect(modal).toContain("isClickThroughGuardActive");
    expect(modal).toContain("CLICK_THROUGH_GUARD_MS");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("armPublishedMediaFullscreenClickThroughGuard");
  });

  it("M/N: parent content + edge swipe disabled while fullscreen open", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("publishedMediaFullscreenOpen");
    expect(modal).toContain("parentSwipeGestureDisabled");
    expect(modal).toContain(
      "composerFocused || keyboardOpen || publishedMediaFullscreenOpen",
    );
    expect(modal).toContain("gestureDisabled: parentSwipeGestureDisabled");
  });

  it("O: fullscreen close preserves Detail media key", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("closeFullscreen");
    expect(carousel).toContain("activeMediaKey");
    expect(carousel).toContain("swiper.slideTo(target, 0)");
  });

  it("P/Q: nested scroll lock via existing abstraction", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("useOverlayBackgroundScrollLock(open)");
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("useOverlayBackgroundScrollLock(true)");
    expect(viewer).not.toContain("document.body.style.overflow");
    expect(modal).not.toContain("document.body.style.overflow");
  });

  it("T/U/V: Feed/Profile/Edit/backend untouched", () => {
    const post = read("src/components/Post.tsx");
    expect(post).not.toContain("PublishedMediaFullscreenViewer");
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).not.toContain("PublishedMediaFullscreenViewer");
    const edit = read("src/lib/editPostBootstrap.ts");
    expect(edit).not.toContain("PublishedMediaFullscreenViewer");
    expect(edit).not.toContain("setPublishedMediaFullscreenOpen");
  });

  it("context + isolation wiring present", () => {
    const ctx = read("src/context/PostDetailDismissContext.tsx");
    expect(ctx).toContain("setPublishedMediaFullscreenOpen");
    expect(ctx).toContain("registerPublishedMediaFullscreenClose");
    expect(ctx).toContain("armPublishedMediaFullscreenClickThroughGuard");
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    // PV2B.2: click-only isolation — do not stop touch/pointer end (Swiper document handlers).
    expect(viewer).toContain("stopClickPropagation");
    expect(viewer).toContain("onClick={stopClickPropagation}");
    expect(viewer).toContain('data-swiper-event-isolation="click-only"');
    expect(viewer).not.toContain("onTouchEnd={stop");
    expect(viewer).not.toContain("onPointerUp={stop");
  });

  it("W: handleClose still uses backgroundLocation replace (not navigate(-1))", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("backgroundLocation");
    expect(modal).toContain("replace: true");
    expect(modal).toContain("Do not use navigate(-1)");
  });
});
