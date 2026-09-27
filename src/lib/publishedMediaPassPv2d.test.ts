/**
 * Pass 2D — published fullscreen drag-dismiss, backdrop tap, thumbnail strip.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyLightboxSwipeContentStyle,
  clearLightboxSwipeContentStyle,
  lightboxSwipeBackdropRgba,
  snapBackLightboxSwipeContentStyle,
} from "./lightboxSwipeDim";
import {
  isPublishedFullscreenBackdropDismissTarget,
  isPublishedFullscreenVerticalDismissBlockedTarget,
  resolvePublishedFullscreenThumbSrc,
  shouldClosePublishedFullscreenVerticalDismiss,
} from "./publishedMedia";
import { indexForMediaKey } from "../components/PublishedMediaFullscreenViewer";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

/** Minimal Element.closest stand-in for Node vitest (no jsdom). */
class FakeEl {
  constructor(
    private attrs: Record<string, string> = {},
    private classes: string[] = [],
    private parentEl: FakeEl | null = null,
  ) {}

  closest(selector: string): FakeEl | null {
    if (this.matches(selector)) return this;
    return this.parentEl ? this.parentEl.closest(selector) : null;
  }

  matches(selector: string): boolean {
    const parts = selector.split(",").map((s) => s.trim());
    return parts.some((part) => this.matchesOne(part));
  }

  // Structural EventTarget stubs for Node vitest (no jsdom).
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }

  private matchesOne(sel: string): boolean {
    if (sel.startsWith(".") && !sel.includes("[")) {
      return sel
        .split(".")
        .filter(Boolean)
        .every((c) => this.classes.includes(c));
    }
    const attrMatch = /^\[([^\]=\s]+)(?:=(?:"([^"]*)"|([^\]]+)))?\]$/.exec(
      sel,
    );
    if (attrMatch) {
      const key = attrMatch[1]!;
      const val = attrMatch[2] ?? attrMatch[3];
      if (!(key in this.attrs)) return false;
      if (val == null) return true;
      return this.attrs[key] === val;
    }
    return false;
  }
}

/** First node is outermost ancestor; last is the event target. */
function chain(
  ...nodes: Array<{ attrs?: Record<string, string>; classes?: string[] }>
): FakeEl {
  let outer: FakeEl | null = null;
  for (const n of nodes) {
    outer = new FakeEl(n.attrs ?? {}, n.classes ?? [], outer);
  }
  return outer!;
}

function styleHost(): HTMLElement {
  const style: Record<string, string> = {};
  return { style } as unknown as HTMLElement;
}

describe("PASS 2D — vertical dismiss exclusions", () => {
  it("1: unzoomed image (zoom container / media zoom) permits dismiss", () => {
    const target = chain(
      { attrs: { "data-published-media-zoom": "" } },
      { classes: ["swiper-zoom-container"] },
      { attrs: {} },
    );
    expect(isPublishedFullscreenVerticalDismissBlockedTarget(target)).toBe(
      false,
    );
  });

  it("2: zoomed image blocks dismiss", () => {
    const target = chain({
      classes: ["swiper-zoom-container", "swiper-zoom-container-zoomed"],
    });
    expect(isPublishedFullscreenVerticalDismissBlockedTarget(target)).toBe(
      true,
    );
  });

  it("3: video player / scrubber / controls block dismiss", () => {
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        chain(
          { attrs: { "data-published-video-player": "" } },
          { attrs: {} },
        ),
      ),
    ).toBe(true);
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        chain({ attrs: { "data-video-scrubber": "" } }),
      ),
    ).toBe(true);
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        chain({ attrs: { "data-video-control": "" } }),
      ),
    ).toBe(true);
  });

  it("thumbs and close block dismiss start", () => {
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        chain(
          { attrs: { "data-published-fullscreen-thumbs": "" } },
          { attrs: {} },
        ),
      ),
    ).toBe(true);
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        chain({ attrs: { "data-lightbox-close": "" } }),
      ),
    ).toBe(true);
  });
});

describe("PASS 2D — drag transform / threshold", () => {
  it("4: horizontal intent remains carousel (viewer keeps Swiper clamps)", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("Horizontal takeover");
    expect(viewer).toContain("clampTranslateToAdjacent");
    expect(viewer).toContain("clampCarouselCommitIndex");
  });

  it("5: downward drag updates transform and opacity via helpers", () => {
    const node = styleHost();
    applyLightboxSwipeContentStyle(node, 80);
    expect(node.style.transform).toContain("translateY");
    expect(node.style.transform).toContain("scale");
    expect(Number(node.style.opacity)).toBeLessThan(1);
    expect(lightboxSwipeBackdropRgba(80)).toMatch(/^rgba\(0, 0, 0,/);
  });

  it("6: threshold release closes", () => {
    expect(
      shouldClosePublishedFullscreenVerticalDismiss({
        isVerticalSwipe: true,
        diffY: 120,
      }),
    ).toBe(true);
  });

  it("7: short drag does not close; snap-back helper restores styles", () => {
    expect(
      shouldClosePublishedFullscreenVerticalDismiss({
        isVerticalSwipe: true,
        diffY: 40,
      }),
    ).toBe(false);
    const node = styleHost();
    const overlay = styleHost();
    applyLightboxSwipeContentStyle(node, 40);
    snapBackLightboxSwipeContentStyle(node, overlay);
    expect(node.style.opacity).toBe("1");
    expect(node.style.transform).toContain("scale(1)");
  });

  it("8: cancellation cleans up styles", () => {
    const node = styleHost();
    applyLightboxSwipeContentStyle(node, 90);
    clearLightboxSwipeContentStyle(node);
    expect(node.style.opacity).toBe("");
    expect(node.style.transform).toBe("");
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('addEventListener("touchcancel"');
    expect(viewer).toContain("resetVerticalDismissVisual");
  });
});

describe("PASS 2D — backdrop tap", () => {
  it("9: empty backdrop closes", () => {
    expect(
      isPublishedFullscreenBackdropDismissTarget(
        chain({ attrs: { "data-published-media-fullscreen-viewer": "" } }),
      ),
    ).toBe(true);
  });

  it("10: media tap does not close", () => {
    expect(
      isPublishedFullscreenBackdropDismissTarget(
        chain(
          { attrs: { "data-published-media-zoom": "" } },
          { classes: ["swiper-zoom-container"] },
          { attrs: {} },
        ),
      ),
    ).toBe(false);
  });

  it("11: thumbnail tap does not close", () => {
    expect(
      isPublishedFullscreenBackdropDismissTarget(
        chain(
          { attrs: { "data-published-fullscreen-thumbs": "" } },
          { attrs: {} },
        ),
      ),
    ).toBe(false);
  });

  it("viewer wires backdrop handler + drag click suppress", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("handleBackdropClick");
    expect(viewer).toContain("suppressBackdropClickUntilRef");
    expect(viewer).toContain("isPublishedFullscreenBackdropDismissTarget");
  });
});

describe("PASS 2D — thumbnail strip", () => {
  it("12/13/14: thumbs navigate; swipe updates selection; opens at Detail key", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("FullscreenThumbStrip");
    expect(viewer).toContain("data-published-fullscreen-thumbs");
    expect(viewer).toContain("goToIndex");
    expect(viewer).toContain("activeIndex={index}");
    expect(viewer).toContain("scrollIndex={committedIndex}");
    expect(viewer).toContain("initialSlide={Math.min(startIndex");
    expect(viewer).toContain("shouldShowPublishedFullscreenMixedVideoDots");
    expect(viewer).not.toContain("data-published-fullscreen-pagination");

    const mixed = [
      { kind: "image" as const, key: "image:a", url: "https://cdn/a.jpg" },
      {
        kind: "video" as const,
        key: "video:m1",
        mediaId: "m1",
        videoId: "bunny-1",
        status: "ready" as const,
        posterUrl: "https://cdn/poster.jpg",
        width: 1080,
        height: 1920,
        durationSec: 12,
      },
      { kind: "image" as const, key: "image:b", url: "https://cdn/b.jpg" },
    ];
    expect(indexForMediaKey(mixed, "image:b")).toBe(2);
  });

  it("15: video thumbnail uses poster / fallback", () => {
    expect(
      resolvePublishedFullscreenThumbSrc({
        kind: "video",
        posterUrl: "https://cdn/p.jpg",
      }),
    ).toBe("video-poster");
    expect(
      resolvePublishedFullscreenThumbSrc({ kind: "video", posterUrl: null }),
    ).toBe("video-fallback");
    expect(
      resolvePublishedFullscreenThumbSrc({
        kind: "image",
        url: "https://cdn/a.jpg",
      }),
    ).toBe("image");
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("VideoThumbFallback");
    expect(viewer).toContain("resolvePublishedFullscreenThumbSrc");
  });

  it("16: mobile-safe thumb rail (scroll + safe area)", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("overflow-x-auto");
    expect(viewer).toContain("safe-area-bottom-layout");
    expect(viewer).toContain("scrollIntoView");
  });

  it("17: Post Detail dots remain on Detail carousel", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("PublishedMediaPagination");
    expect(carousel).toContain("data-published-media-pagination");
  });
});

describe("PASS 2D — gesture wiring source", () => {
  it("unzoomed exclusion no longer blocks zoom-container wholesale", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain(
      "isPublishedFullscreenVerticalDismissBlockedTarget",
    );
    expect(viewer).not.toContain(
      't.closest(".swiper-zoom-container") ||',
    );
    expect(viewer).not.toContain(
      't.closest("[data-published-media-zoom]")',
    );
    expect(viewer).toContain("snapBackLightboxSwipeContentStyle");
  });
});
