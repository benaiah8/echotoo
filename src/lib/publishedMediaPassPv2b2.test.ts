import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  indexForMediaKey,
  mediaOrderSignature,
} from "../components/PublishedMediaFullscreenViewer";
import type { PublishedMediaItem } from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const mixed: PublishedMediaItem[] = [
  { kind: "image", key: "image:a", url: "https://cdn/a.jpg" },
  {
    kind: "video",
    key: "video:m1",
    mediaId: "m1",
    videoId: "bunny-1",
    status: "ready",
    posterUrl: "https://cdn/poster.jpg",
    width: 1080,
    height: 1920,
    durationSec: 12,
  },
  { kind: "image", key: "image:b", url: "https://cdn/b.jpg" },
];

describe("PASS PV2B.2 — video expand + fullscreen Swiper stability", () => {
  it("A/B: Detail video expand opens mixed fullscreen on same key", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("openFullscreenAt");
    expect(carousel).toContain("onRequestMixedFullscreen={() => {");
    expect(carousel).toContain("Explicit expand — never gated by image swipe-vs-tap");
    expect(carousel).toContain("openFullscreenAt(item.key)");
    // Expand must not check gestureMovedRef
    const expandBlock = carousel.slice(
      carousel.indexOf("onRequestMixedFullscreen"),
      carousel.indexOf("onRequestMixedFullscreen") + 280,
    );
    expect(expandBlock).not.toContain("gestureMovedRef");
    expect(indexForMediaKey(mixed, "video:m1")).toBe(1);
  });

  it("image tap still uses gestureMovedRef; expand path is separate", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("openFullscreenForImageTap");
    expect(carousel).toMatch(
      /Image tap only[\s\S]*gestureMovedRef\.current/,
    );
    expect(carousel).toContain(
      "if (!enableLightbox || closingFullscreenRef.current) return;",
    );
    // Canonical openFullscreenAt must not mention gestureMovedRef in its body.
    const start = carousel.indexOf("const openFullscreenAt = useCallback");
    const end = carousel.indexOf("/** Image tap only");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(carousel.slice(start, end)).not.toContain("gestureMovedRef");
  });

  it("C–G / one-slide commit: Create-parity clamp retained", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("clampTranslateToAdjacent");
    expect(viewer).toContain("clampCarouselCommitIndex");
    expect(viewer).toContain("MIXED_HERO_SWIPE_THRESHOLD_PX");
    expect(viewer).toContain("followFinger");
    expect(viewer).toContain("resistance");
    expect(viewer).not.toContain("freeMode");
  });

  it("H/I: touchend/pointerup not stopped at overlay (Swiper completion); backdrop uses click handler", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('data-swiper-event-isolation="click-only"');
    expect(viewer).toContain("onClick={handleBackdropClick}");
    expect(viewer).not.toContain("onTouchEnd={stop");
    expect(viewer).not.toContain("onPointerUp={stop");
    expect(viewer).not.toContain("onTouchStart={stop");
    expect(viewer).not.toContain("onPointerDown={stop");
    expect(viewer).not.toContain("onTouchMove={stop");
    expect(viewer).not.toContain("onPointerMove={stop");
  });

  it("J: touchcancel resets vertical-dismiss transform/gesture", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('addEventListener("touchcancel"');
    expect(viewer).toContain("resetVerticalDismissVisual");
    expect(viewer).toContain("clearLightboxSwipeContentStyle");
    expect(viewer).toContain("Horizontal takeover");
  });

  it("K: Zoom module retained for images", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("modules={[Zoom]}");
    expect(viewer).toContain("swiper-zoom-container");
  });

  it("L/M: video activates on transition end, not mid-drag", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("onSlideChangeTransitionEnd");
    expect(viewer).toContain("committedIndex");
    expect(viewer).toContain("isActive={i === committedIndex}");
    expect(viewer).not.toContain("isActive={i === index}");
  });

  it("N: inactive teardown still in player", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("tearDownPlayback");
    expect(player).toContain("shouldTearDownIdlePublishedVideo");
    const idleBlock = player.indexOf(
      "// Idle (neither active nor warm): full tear down.",
    );
    expect(idleBlock).toBeGreaterThan(-1);
    const slice = player.slice(idleBlock, idleBlock + 900);
    expect(slice).toContain("shouldTearDownIdlePublishedVideo");
    expect(slice).toContain("tearDownPlayback()");
  });

  it("O/P: full viewport slide width", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("FULLSCREEN_SWIPER_CLASS");
    expect(viewer).toContain("min-w-full");
    expect(viewer).toContain("[&_.swiper-slide]:w-full");
    expect(viewer).toContain("[&_.swiper-slide]:min-w-full");
    expect(viewer).toContain('!min-w-full !w-full');
  });

  it("Q: status/poster patch does not slideTo via order signature", () => {
    expect(mediaOrderSignature(mixed)).toBe("image:a|video:m1|image:b");
    const patched = mixed.map((item) =>
      item.kind === "video"
        ? { ...item, posterUrl: "https://cdn/poster2.jpg", status: "ready" as const }
        : item,
    );
    expect(mediaOrderSignature(patched)).toBe(mediaOrderSignature(mixed));
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("mediaOrderSignature");
    expect(viewer).toContain("Same open target + same membership/order");
  });

  it("R/S/T: PV2B.1 parent isolation preserved", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("publishedMediaFullscreenOpen");
    expect(modal).toContain("parentSwipeGestureDisabled");
    expect(modal).toContain("tryConsumePublishedMediaFullscreenBack");
    expect(modal).toContain("armPublishedMediaFullscreenClickThroughGuard");
    expect(modal).toContain("clickThroughGuardUntilRef");
  });

  it("U: close returns Detail media key", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("closeFullscreen");
    expect(carousel).toContain("activeMediaKey");
    expect(carousel).toContain("swiper.slideTo(target, 0)");
  });

  it("V: nested scroll lock unchanged", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("useOverlayBackgroundScrollLock(open)");
    expect(viewer).not.toContain("document.body.style.overflow");
  });

  it("W/X/Y: Feed/Profile/Edit/backend untouched", () => {
    const post = read("src/components/Post.tsx");
    expect(post).not.toContain("PublishedMediaFullscreenViewer");
    const edit = read("src/lib/editPostBootstrap.ts");
    expect(edit).not.toContain("committedIndex");
    expect(edit).not.toContain("openFullscreenAt");
  });

  it("one-time swiper.update on open", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("swiper.update()");
    expect(viewer).toContain("One-time measure after open layout");
  });

  it("video vertical dismiss remains disabled for mixed; video-only allowed", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('data-vertical-dismiss={verticalDismissMode}');
    expect(viewer).toContain("activeSlideIsVideo() && !videoOnly");
    expect(viewer).toContain('"video-only"');
  });
});
