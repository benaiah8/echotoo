import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostDetailNavigateState } from "./postDetailNavigationState";
import {
  LOCATION_ARRIVE_ATTR,
  LOCATION_SCROLL_CORRECTION_WINDOW_MS,
  LOCATION_SCROLL_DRIFT_PX,
  LOCATION_SCROLL_MAX_WAIT_MS,
  decideLocationScrollTick,
  flashLocationSectionArrival,
  isPublishedDetailHeroLayoutReady,
  prefersReducedMotion,
  shouldCorrectLocationDrift,
} from "./postDetailLocationScroll";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("scrollToLocation navigation state", () => {
  it("declares scrollToLocation separately from scrollToComments", () => {
    const withLocation: PostDetailNavigateState = {
      scrollToLocation: true,
    };
    const withComments: PostDetailNavigateState = {
      scrollToComments: true,
    };
    expect(withLocation.scrollToLocation).toBe(true);
    expect(withLocation.scrollToComments).toBeUndefined();
    expect(withComments.scrollToComments).toBe(true);
    expect(withComments.scrollToLocation).toBeUndefined();
  });

  it("exports scrollLocationSectionIntoView targeting data-location-section", () => {
    const scroll = read("src/lib/postDetailCommentsScroll.ts");
    expect(scroll).toContain("export const LOCATION_SECTION_ATTR");
    expect(scroll).toContain('LOCATION_SECTION_ATTR = "data-location-section"');
    expect(scroll).toContain("export function scrollLocationSectionIntoView");
  });

  it("Post location pin passes scrollToLocation; normal open does not", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("goToDetails({ scrollToLocation: true })");
    expect(post).toMatch(
      /PostCardCaption[\s\S]*?onOpen=\{\(\) => goToDetails\(\)\}/,
    );
    expect(post).toContain("scrollToLocation: true");
  });

  it("PostDetailModal and PostDetailBody use shared stabilized location scroll", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    const body = read("src/components/detail/PostDetailBody.tsx");
    const helper = read("src/lib/postDetailLocationScroll.ts");
    expect(helper).toContain("export function scheduleStabilizedLocationScroll");
    expect(modal).toContain("scheduleStabilizedLocationScroll");
    expect(modal).toContain("focusLocationScrollDoneRef");
    expect(modal).toContain("shouldScrollToLocationOnOpen");
    expect(modal).toContain("scheduleStabilizedLocationScroll({ isModal: true })");
    expect(body).toContain("data-location-section");
    expect(body).toContain("fullPageLocationScrollDoneRef");
    expect(body).toContain(
      "scheduleStabilizedLocationScroll({ isModal: false })",
    );
    expect(modal).toContain("handle.cancel()");
    expect(body).toContain("handle.cancel()");
  });

  it("Special Notes render above media with mt-1; caption always mt-3", () => {
    const post = read("src/components/Post.tsx");
    const notesIdx = post.indexOf("<PostV4KeyDetailsFeed");
    const mediaIdx = post.indexOf("{mediaBlock}");
    expect(notesIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeGreaterThan(notesIdx);
    expect(post).toContain('className="mt-1"');
    expect(post).toMatch(/PostCardCaption[\s\S]*?className="mt-3"/);
    expect(post).not.toContain("max-[320px]:flex-wrap");
  });

  it("PostFeedLocationPin is a soft-wash h-5 w-5 square with PiMapPin", () => {
    const meta = read("src/components/ui/PostFeedSurfaceMeta.tsx");
    expect(meta).toContain("export function PostFeedLocationPin");
    expect(meta).toContain("PiMapPin");
    expect(meta).not.toContain("PiMapPinSimpleFill");
    expect(meta).not.toContain("PiMapPinBold");
    expect(meta).toContain("inline-flex h-5 w-5");
    expect(meta).toContain("bg-black/[0.06]");
    expect(meta).toContain("app-dark:bg-white/15");
    expect(meta).toContain("border-black/12");
    expect(meta).toContain("app-dark:border-white/18");
    expect(meta).not.toContain("bg-[var(--brand)]");
    expect(meta).toContain('aria-label="View location"');
    expect(meta).toContain('className="h-3.5 w-3.5"');
  });

  it("PostFeedHeaderMeta keeps date chip separate from location square", () => {
    const meta = read("src/components/ui/PostFeedSurfaceMeta.tsx");
    const styles = read("src/lib/postScheduleLabelStyles.ts");
    expect(meta).toContain("export function PostFeedHeaderMeta");
    expect(meta).toContain("getPostScheduleLabelClasses(scheduleKind, \"feed\")");
    expect(meta).toContain("inline-flex shrink-0 items-center gap-1");
    expect(meta).toContain('scheduleKind === "posted_ago"');
    expect(meta).toContain("<PostFeedLocationPin");
    // Date before location in render order.
    const dateIdx = meta.indexOf("showEventDate ? <span");
    const locIdx = meta.indexOf("{hasLocation ? <PostFeedLocationPin");
    expect(dateIdx).toBeGreaterThan(-1);
    expect(locIdx).toBeGreaterThan(dateIdx);
    // Semantic date colors: Today green, Tomorrow blue.
    expect(styles).toContain(
      "bg-green-500/20 text-green-600 border border-green-500/30",
    );
    expect(styles).toContain(
      "bg-[var(--blue-bg)] text-[var(--blue-text)] border border-[var(--blue-border)]",
    );
    expect(styles).not.toContain("bg-amber-500/20");
  });

  it("Post header wires PostFeedHeaderMeta with scrollToLocation", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("PostFeedHeaderMeta");
    expect(post).toContain(
      "onOpenLocation={() => goToDetails({ scrollToLocation: true })}",
    );
    expect(post).toContain("items-center gap-x-1.5 pr-8");
    expect(post).toContain("border-t border-[var(--border)]");
  });
});

describe("stabilized location scroll readiness + drift", () => {
  it("waits for target/layout readiness; no-media does not wait on hero", () => {
    expect(
      decideLocationScrollTick({
        hasTarget: false,
        heroReady: true,
        timedOut: false,
      }),
    ).toEqual({ action: "wait", reason: "no_target" });
    expect(
      decideLocationScrollTick({
        hasTarget: true,
        heroReady: false,
        timedOut: false,
      }),
    ).toEqual({ action: "wait", reason: "hero_not_ready" });
    expect(
      decideLocationScrollTick({
        hasTarget: true,
        heroReady: true,
        timedOut: false,
      }),
    ).toEqual({ action: "land", reason: "ready" });
    // No published shell → heroReady path is true for text-only posts.
    const emptyDoc = {
      querySelector: () => null,
    } as unknown as ParentNode;
    expect(isPublishedDetailHeroLayoutReady(emptyDoc)).toBe(true);
  });

  it("timeout fallback lands when target exists even if hero never ready", () => {
    expect(
      decideLocationScrollTick({
        hasTarget: true,
        heroReady: false,
        timedOut: true,
      }),
    ).toEqual({ action: "land", reason: "timeout_fallback" });
    expect(
      decideLocationScrollTick({
        hasTarget: false,
        heroReady: false,
        timedOut: true,
      }),
    ).toEqual({ action: "give_up" });
    expect(LOCATION_SCROLL_MAX_WAIT_MS).toBeGreaterThanOrEqual(800);
    expect(LOCATION_SCROLL_MAX_WAIT_MS).toBeLessThanOrEqual(1000);
  });

  it("uses published carousel data-ready as hero readiness signal", () => {
    const readyCarousel = {
      getAttribute: (k: string) => (k === "data-ready" ? "true" : null),
    };
    const notReadyCarousel = {
      getAttribute: (k: string) => (k === "data-ready" ? "false" : null),
    };
    const readyShell = {
      querySelector: (sel: string) =>
        sel.includes("carousel") ? readyCarousel : null,
    };
    const loadingShell = {
      querySelector: (sel: string) =>
        sel.includes("carousel") ? notReadyCarousel : null,
    };
    const scopeReady = {
      querySelector: (sel: string) =>
        sel.includes("media-shell") ? readyShell : null,
    } as unknown as ParentNode;
    const scopeLoading = {
      querySelector: (sel: string) =>
        sel.includes("media-shell") ? loadingShell : null,
    } as unknown as ParentNode;
    const scopeShellNoCarousel = {
      querySelector: (sel: string) =>
        sel.includes("media-shell")
          ? { querySelector: () => null }
          : null,
    } as unknown as ParentNode;

    expect(isPublishedDetailHeroLayoutReady(scopeReady)).toBe(true);
    expect(isPublishedDetailHeroLayoutReady(scopeLoading)).toBe(false);
    expect(isPublishedDetailHeroLayoutReady(scopeShellNoCarousel)).toBe(false);
  });

  it("corrects only meaningful drift and only once in the scheduled window", () => {
    expect(shouldCorrectLocationDrift(100, 110)).toBe(false);
    expect(shouldCorrectLocationDrift(100, 125)).toBe(true);
    expect(LOCATION_SCROLL_DRIFT_PX).toBe(24);
    expect(LOCATION_SCROLL_CORRECTION_WINDOW_MS).toBeGreaterThanOrEqual(400);
    expect(LOCATION_SCROLL_CORRECTION_WINDOW_MS).toBeLessThanOrEqual(600);

    const helper = read("src/lib/postDetailLocationScroll.ts");
    expect(helper).toContain("correctionUsed = true");
    expect(helper).toContain("if (cancelled || skipCorrection || correctionUsed)");
    expect(helper).toContain("behavior: \"auto\"");
    expect(helper).not.toContain("new ResizeObserver");
    // No repeated correction loop — single scheduled correction check.
    expect(helper.match(/correctionUsed = true/g)?.length).toBe(1);
  });

  it("cancels correction after user interaction and cleans up on cancel", () => {
    const helper = read("src/lib/postDetailLocationScroll.ts");
    expect(helper).toContain('events = ["pointerdown", "touchstart", "wheel"]');
    expect(helper).toContain("skipCorrection = true");
    expect(helper).toContain("if (!landed) return");
    expect(helper).toContain("detachUserListeners");
    expect(helper).toContain("clearHighlight?.()");
    expect(helper).toContain("cancelAnimationFrame");
    expect(helper).toContain("for (const id of timeoutIds) window.clearTimeout(id)");
  });
});

describe("location arrival highlight", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("flashes highlight only via helper; reduced motion uses static attr", () => {
    vi.useFakeTimers();
    const timeoutIds: number[] = [];
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void, ms?: number) => {
        const id = globalThis.setTimeout(fn, ms) as unknown as number;
        timeoutIds.push(id);
        return id;
      },
      clearTimeout: (id: number) => globalThis.clearTimeout(id),
      matchMedia: () => ({ matches: false }),
    });

    const classes = new Set<string>();
    const attrs: Record<string, string> = {};
    const el = {
      classList: {
        add: (...c: string[]) => c.forEach((x) => classes.add(x)),
        remove: (...c: string[]) => c.forEach((x) => classes.delete(x)),
      },
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
      removeAttribute: (k: string) => {
        delete attrs[k];
      },
    } as unknown as HTMLElement;

    const clear = flashLocationSectionArrival(el, {
      reducedMotion: true,
      durationMs: 1000,
    });
    expect(attrs[LOCATION_ARRIVE_ATTR]).toBe("static");
    expect(classes.has("ring-1")).toBe(true);
    expect(classes.has("duration-1000")).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(attrs[LOCATION_ARRIVE_ATTR]).toBeUndefined();
    clear();

    const clear2 = flashLocationSectionArrival(el, {
      reducedMotion: false,
      durationMs: 1000,
    });
    expect(attrs[LOCATION_ARRIVE_ATTR]).toBe("pulse");
    expect(classes.has("duration-1000")).toBe(true);
    clear2();
  });

  it("prefersReducedMotion reads matchMedia", () => {
    expect(
      prefersReducedMotion(
        ((() => ({ matches: true })) as unknown) as typeof window.matchMedia,
      ),
    ).toBe(true);
    expect(
      prefersReducedMotion(
        ((() => ({ matches: false })) as unknown) as typeof window.matchMedia,
      ),
    ).toBe(false);
  });

  it("highlight is wired only for scrollToLocation paths; comments unchanged", () => {
    const helper = read("src/lib/postDetailLocationScroll.ts");
    const modal = read("src/components/PostDetailModal.tsx");
    const body = read("src/components/detail/PostDetailBody.tsx");
    const post = read("src/components/Post.tsx");

    expect(helper).toContain("flashLocationSectionArrival");
    expect(helper).toContain("LOCATION_ARRIVE_ATTR");
    expect(modal).toContain("scheduleStabilizedLocationScroll");
    expect(modal).toContain("scrollCommentsSectionIntoView");
    expect(modal).toContain('behavior: "smooth"');
    expect(body).not.toContain("flashLocationSectionArrival(");
    expect(post).toContain("goToDetails({ scrollToComments: true })");
    expect(post).toContain(
      "onOpenLocation={() => goToDetails({ scrollToLocation: true })}",
    );
    expect(post).toContain("onOpen={() => goToDetails()}");
  });
});

describe("global scroll lock untouched by location stabilization", () => {
  it("does not modify body/html overflow or overlay scroll lock helpers", () => {
    const helper = read("src/lib/postDetailLocationScroll.ts");
    expect(helper).not.toContain("document.body");
    expect(helper).not.toContain("document.documentElement");
    expect(helper).not.toContain("overflow");
    expect(helper).not.toContain("useOverlayBackgroundScrollLock");
    expect(helper).not.toContain("scrollLock");
  });
});
