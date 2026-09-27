/**
 * PASS 3C — video-only fullscreen drag-dismiss + top close.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyLightboxSwipeContentStyle,
  clearLightboxSwipeContentStyle,
  lightboxSwipeBackdropRgba,
  snapBackLightboxSwipeContentStyle,
  LIGHTBOX_SWIPE_VERTICAL_THRESHOLD,
} from "./lightboxSwipeDim";
import {
  __resetPublishedFullscreenDismissTapSuppressForTests,
  armPublishedFullscreenDismissTapSuppress,
  isPublishedFullscreenBackdropDismissTarget,
  isPublishedFullscreenVerticalDismissBlockedTarget,
  isPublishedFullscreenVideoOnlyItems,
  shouldClosePublishedFullscreenVerticalDismiss,
  shouldSuppressPublishedVideoSurfaceTap,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

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
    return selector
      .split(",")
      .map((s) => s.trim())
      .some((part) => this.matchesOne(part));
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
    const attrMatch = /^\[([^\]=\s]+)(?:=(?:"([^"]*)"|([^\]]+)))?\]$/.exec(sel);
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

describe("PASS 3C — video-only fullscreen dismiss policy", () => {
  beforeEach(() => {
    __resetPublishedFullscreenDismissTapSuppressForTests();
  });

  it("1: video-only items helper", () => {
    expect(
      isPublishedFullscreenVideoOnlyItems([{ kind: "video" }]),
    ).toBe(true);
    expect(
      isPublishedFullscreenVideoOnlyItems([
        { kind: "video" },
        { kind: "image" },
      ]),
    ).toBe(false);
    expect(isPublishedFullscreenVideoOnlyItems([{ kind: "image" }])).toBe(
      false,
    );
  });

  it("2/6/7: video-only-surface allows player, blocks scrubber/controls", () => {
    const surface = chain(
      { attrs: { "data-published-video-player": "" } },
      { attrs: { "data-published-video-gesture-surface": "" } },
    );
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        surface,
        "video-only-surface",
      ),
    ).toBe(false);

    const scrubber = chain(
      { attrs: { "data-published-video-player": "" } },
      { attrs: { "data-video-scrubber": "" } },
    );
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        scrubber,
        "video-only-surface",
      ),
    ).toBe(true);

    const control = chain(
      { attrs: { "data-published-video-player": "" } },
      { attrs: { "data-video-control": "" } },
    );
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        control,
        "video-only-surface",
      ),
    ).toBe(true);

    const close = chain({ attrs: { "data-lightbox-close": "" } });
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(
        close,
        "video-only-surface",
      ),
    ).toBe(true);
  });

  it("2b/3: default policy still blocks whole video player (mixed unchanged)", () => {
    const surface = chain(
      { attrs: { "data-published-video-player": "" } },
      { attrs: { "data-published-video-gesture-surface": "" } },
    );
    expect(isPublishedFullscreenVerticalDismissBlockedTarget(surface)).toBe(
      true,
    );
    expect(
      isPublishedFullscreenVerticalDismissBlockedTarget(surface, "default"),
    ).toBe(true);
  });

  it("8/9/10/12: transform / snap-back / threshold helpers", () => {
    const el = styleHost();
    const overlay = styleHost();
    applyLightboxSwipeContentStyle(el, 80);
    expect(el.style.transform).toContain("translateY");
    expect(el.style.transform).toContain("scale");
    expect(lightboxSwipeBackdropRgba(80)).toMatch(/^rgba\(0, 0, 0,/);

    expect(
      shouldClosePublishedFullscreenVerticalDismiss({
        isVerticalSwipe: true,
        diffY: 120,
      }),
    ).toBe(true);
    expect(
      shouldClosePublishedFullscreenVerticalDismiss({
        isVerticalSwipe: true,
        diffY: 40,
      }),
    ).toBe(false);

    snapBackLightboxSwipeContentStyle(el, overlay);
    expect(el.style.transition).toContain("transform");
    clearLightboxSwipeContentStyle(el);
    expect(el.style.transform).toBe("");
  });

  it("5/11: tap suppress after claimed dismiss; threshold constants", () => {
    expect(shouldSuppressPublishedVideoSurfaceTap()).toBe(false);
    armPublishedFullscreenDismissTapSuppress(500);
    expect(shouldSuppressPublishedVideoSurfaceTap()).toBe(true);
    expect(LIGHTBOX_SWIPE_VERTICAL_THRESHOLD).toBe(12);
  });

  it("20: backdrop excludes video player", () => {
    const video = chain({ attrs: { "data-published-video-player": "" } });
    expect(isPublishedFullscreenBackdropDismissTarget(video)).toBe(false);
    const empty = chain({ attrs: { "data-published-media-fullscreen-viewer": "" } });
    expect(isPublishedFullscreenBackdropDismissTarget(empty)).toBe(true);
  });
});

describe("PASS 3C — viewer wiring", () => {
  it("1/13/17/18/19: video-only dismiss + top close; mixed keeps bottom X", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("isPublishedFullscreenVideoOnlyItems");
    expect(viewer).toContain('"video-only-surface"');
    expect(viewer).toContain("armPublishedFullscreenDismissTapSuppress");
    expect(viewer).toContain("closeViewer()");
    expect(viewer).toContain('data-published-fullscreen-top-close');
    expect(viewer).toContain("videoOnlyFullscreen");
    expect(viewer).toContain("!videoOnlyFullscreen && showThumbStrip");
    // Bottom X still present for non-video-only branch.
    expect(viewer).toContain("data-lightbox-close");
    // Snapshot-safe close path retained (Pass 3B).
    expect(viewer).toContain("fsPlaybackCaptureRef");
    expect(viewer).toContain("Capture FS playback before unmount");
  });

  it("4/5: surface tap suppress wired into video gestures", () => {
    const gestures = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(gestures).toContain("shouldSuppressPublishedVideoSurfaceTap");
    expect(gestures).toContain("surface-tap-suppressed");
  });

  it("21: Escape / Back wiring retained", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('addEventListener("keydown", handleEscape, true)');
    expect(viewer).toContain("registerPublishedMediaFullscreenClose");
    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).toContain("tryConsumePublishedMediaFullscreenBack");
  });

  it("14–16: Pass 3B handoff wiring still present", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("fullscreenEntryHandoff");
    expect(carousel).toContain("detailReturnHandoff");
    expect(carousel).toContain(
      "Capture Detail playback BEFORE isActive flips false",
    );
  });
});
