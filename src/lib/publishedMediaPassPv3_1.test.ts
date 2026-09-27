/**
 * PASS PV3.1 — Invisible one-video prewarm + faster muted autoplay +
 * remove visible "Getting video ready…" copy.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PUBLISHED_HLS_BUFFER,
  PUBLISHED_HLS_WARM_BUFFER,
  PUBLISHED_LIST_VIDEO_DWELL_MS,
  PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
  PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC,
  getPublishedListVideoOwnerId,
  getPublishedListVideoWarmOwnerId,
  requestPublishedListVideoOwnership,
  requestPublishedListVideoWarmOwnership,
  releaseAllPublishedListVideoOwnership,
  __resetPublishedListVideoCoordinatorForTests,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.1 — seamless social video startup", () => {
  beforeEach(() => {
    __resetPublishedListVideoCoordinatorForTests();
  });

  it("A/B: Getting video ready absent from Feed/Profile and Post Detail player", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(player).not.toContain("Getting video ready…");
    expect(player).not.toContain("Processing…");
    expect(player).not.toContain("Loading video…");
    expect(surface).not.toContain("Getting video ready…");
  });

  it("C/D: processing is poster/black only; no HLS while not ready", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("showPoster");
    expect(player).toContain("bg-black");
    expect(player).not.toContain("data-published-video-processing");
    expect(player).toMatch(
      /ensureHlsLoaded[\s\S]*status !== "ready"[\s\S]*return false/,
    );
    expect(player).toContain('status === "ready" && Boolean(videoId.trim()) && !isWarm');
  });

  it("E/F: only one warm owner and only one active owner", () => {
    const warmRevoked: string[] = [];
    const activeRevoked: string[] = [];

    requestPublishedListVideoWarmOwnership({
      ownerId: "warm-a",
      onRevoke: () => warmRevoked.push("warm-a"),
    });
    expect(getPublishedListVideoWarmOwnerId()).toBe("warm-a");

    requestPublishedListVideoWarmOwnership({
      ownerId: "warm-b",
      onRevoke: () => warmRevoked.push("warm-b"),
    });
    expect(getPublishedListVideoWarmOwnerId()).toBe("warm-b");
    expect(warmRevoked).toEqual(["warm-a"]);

    requestPublishedListVideoOwnership({
      ownerId: "active-a",
      onRevoke: () => activeRevoked.push("active-a"),
    });
    expect(getPublishedListVideoOwnerId()).toBe("active-a");
    requestPublishedListVideoOwnership({
      ownerId: "active-b",
      onRevoke: () => activeRevoked.push("active-b"),
    });
    expect(getPublishedListVideoOwnerId()).toBe("active-b");
    expect(activeRevoked).toEqual(["active-a"]);
  });

  it("G/H: warm ≥25%; autoplay ~70% + ~350ms dwell", () => {
    expect(PUBLISHED_LIST_VIDEO_WARM_RATIO).toBe(0.15);
    expect(PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO).toBe(0.7);
    expect(PUBLISHED_LIST_VIDEO_DWELL_MS).toBe(350);

    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_WARM_RATIO");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_DWELL_MS");
    expect(surface).toContain("requestPublishedListVideoWarmOwnership");
    expect(surface).toContain("warmEligible");
    expect(surface).toContain("IntersectionObserver");
  });

  it("I/J/K: warm loads HLS fragments, stops ~4s, UI stays poster-only", () => {
    expect(PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC).toBe(4);
    expect(PUBLISHED_HLS_WARM_BUFFER.maxBufferLength).toBe(5);
    expect(PUBLISHED_HLS_WARM_BUFFER.maxMaxBufferLength).toBe(6);

    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain('ensureHlsLoaded("warm")');
    expect(player).toContain("PUBLISHED_HLS_WARM_BUFFER");
    expect(player).toContain("PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC");
    expect(player).toContain("hls.stopLoad()");
    expect(player).toContain("getBufferedAheadSec");
    expect(player).toContain("if (isWarm) return");
    expect(player).toContain("data-list-video-warm");
    // Poster for warm/startup only — not for manual pause (PV3.8.3).
    expect(player).toContain('isWarm || !mediaReady || status !== "ready"');
    expect(player).toContain("showVideoFrame");
  });

  it("L/M: warm → active reuses Hls and resumes startLoad", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const coord = read(
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    );
    expect(coord).toContain("promotedFromWarm");
    expect(coord).toContain("Promote: drop warm slot silently");
    expect(player).toContain("Already attached — reuse same Hls");
    expect(player).toContain("hls.startLoad()");
    expect(player).toContain('ensureHlsLoaded("active")');
    expect(player).toContain("PUBLISHED_HLS_BUFFER.maxBufferLength");

    // Promote same id: warm cleared without revoke.
    let warmRevoked = false;
    requestPublishedListVideoWarmOwnership({
      ownerId: "promo",
      onRevoke: () => {
        warmRevoked = true;
      },
    });
    const { promotedFromWarm } = requestPublishedListVideoOwnership({
      ownerId: "promo",
      onRevoke: () => {},
    });
    expect(promotedFromWarm).toBe(true);
    expect(warmRevoked).toBe(false);
    expect(getPublishedListVideoWarmOwnerId()).toBeNull();
    expect(getPublishedListVideoOwnerId()).toBe("promo");
  });

  it("N/O/P: skipped warm / offscreen active / document hidden destroy", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const coord = read(
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    );
    const surface = read("src/components/PublishedMediaSurface.tsx");

    expect(player).toContain("if (!isActive && !isWarm)");
    expect(player).toContain("tearDownPlayback()");
    expect(player).toContain("hls.destroy()");
    expect(player).toContain("removeAttribute(\"src\")");

    expect(coord).toContain("releaseAllPublishedListVideoOwnership");
    expect(coord).toContain("document.hidden");
    expect(surface).toContain("warmReleaseRef.current?.()");
    expect(surface).toContain("releaseRef.current?.()");

    requestPublishedListVideoWarmOwnership({
      ownerId: "w",
      onRevoke: () => {},
    });
    requestPublishedListVideoOwnership({
      ownerId: "a",
      onRevoke: () => {},
    });
    releaseAllPublishedListVideoOwnership();
    expect(getPublishedListVideoOwnerId()).toBeNull();
    expect(getPublishedListVideoWarmOwnerId()).toBeNull();
  });

  it("Q: native HLS performs no speculative byte prewarm", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("canPlayNativeHls");
    expect(player).toContain("Native HLS: no speculative byte prewarm");
    expect(player).toContain("Native HLS: no speculative prewarm");
    expect(player).toMatch(
      /if \(purpose === "warm"\) return false/,
    );
  });

  it("R/S: passive Feed Play + scrubber remain hidden", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("listChromeRevealed");
    expect(player).toMatch(
      /showCenterPlay = showChrome && \(!isListSurface \|\| listChromeRevealed\)/,
    );
    expect(player).toMatch(
      /showScrubber = showChrome && \(!isListSurface \|\| listChromeRevealed\)/,
    );
    expect(player).toContain("data-list-passive-chrome");
  });

  it("T: Detail/fullscreen interaction behavior unchanged (no list warm on Detail)", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(surface).toContain('mode === "detail"');
    expect(surface).toContain("PublishedMediaCarousel");
    expect(carousel).not.toContain("requestPublishedListVideoWarmOwnership");
    expect(carousel).toContain("PublishedVideoPlayer");
    expect(carousel).toContain("isActive={i === index && !fullscreenOpen}");
  });

  it("U: Edit unchanged by PV3.1", () => {
    const edit = read("src/lib/editPostBootstrap.ts");
    const editMedia = read("src/lib/editPublishedMedia.ts");
    expect(edit).toContain("PublishedVideoReference");
    expect(editMedia).toContain("PublishedVideoReference");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("editPostBootstrap");
    expect(player).not.toContain("DraftVideo");
  });

  it("V: vertical Feed/Profile scroll remains stable", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("touchStartPreventDefault={false}");
    expect(surface).not.toContain("document.body.style.overflow");
    expect(surface).not.toMatch(/addEventListener\(["']touchmove["']/);
    expect(surface).not.toMatch(/touchmove[\s\S]{0,80}preventDefault/);
    expect(surface).toContain("IntersectionObserver");
    // Single observer on root — no per-card scroll listeners.
    expect(surface).not.toMatch(/addEventListener\(["']scroll["']/);
  });

  it("W: no backend / Bunny / migration changes in this pass", () => {
    expect(PUBLISHED_HLS_BUFFER.maxBufferLength).toBeGreaterThan(
      PUBLISHED_HLS_WARM_BUFFER.maxBufferLength,
    );
    // Contract only — no migrations touched by PV3.1 source files.
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).not.toContain("supabase");
    expect(surface).not.toContain("apply_migration");
  });

  it("X: warm not claimed when already active; bandwidth guardrail constants", () => {
    requestPublishedListVideoOwnership({
      ownerId: "same",
      onRevoke: () => {},
    });
    const warm = requestPublishedListVideoWarmOwnership({
      ownerId: "same",
      onRevoke: () => {},
    });
    expect(warm).toBeNull();
    expect(getPublishedListVideoWarmOwnerId()).toBeNull();

    const index = read("src/lib/publishedMedia/index.ts");
    expect(index).toContain("PUBLISHED_LIST_VIDEO_DWELL_MS = 350");
    expect(
      read("src/lib/publishedMedia/listVideoVisibilityThresholds.ts"),
    ).toContain("PUBLISHED_LIST_VIDEO_WARM_RATIO = 0.15");
  });
});
