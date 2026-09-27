/**
 * Immersive fullscreen chrome for every video-containing post.
 * Independent of the removed session-host portal.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPublishedVideoContaining,
  shouldMountFullscreenPublishedVideoPlayer,
  shouldShowPublishedFullscreenMixedVideoDots,
  shouldShowPublishedFullscreenThumbStrip,
  shouldShowPublishedFullscreenTopClose,
  shouldUsePublishedImmersiveFullscreenChrome,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("published immersive fullscreen — all video counts", () => {
  it("A: video-only post uses modern fullscreen", () => {
    const items = [{ kind: "video" }];
    expect(isPublishedVideoContaining(items)).toBe(true);
    expect(
      shouldUsePublishedImmersiveFullscreenChrome({ containsVideo: true }),
    ).toBe(true);
    expect(
      shouldShowPublishedFullscreenThumbStrip({
        immersiveChrome: true,
        videoOnlyFullscreen: true,
        slideCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldShowPublishedFullscreenTopClose({
        immersiveChrome: true,
        videoOnlyFullscreen: true,
      }),
    ).toBe(true);
  });

  it("B: one video + images uses modern fullscreen", () => {
    const items = [
      { kind: "image" },
      { kind: "video" },
      { kind: "image" },
    ];
    expect(
      shouldUsePublishedImmersiveFullscreenChrome({
        containsVideo: isPublishedVideoContaining(items),
      }),
    ).toBe(true);
    expect(
      shouldShowPublishedFullscreenThumbStrip({
        immersiveChrome: true,
        videoOnlyFullscreen: false,
        slideCount: 3,
      }),
    ).toBe(false);
    expect(
      shouldShowPublishedFullscreenMixedVideoDots({
        immersiveChrome: true,
        videoOnlyFullscreen: false,
        slideCount: 3,
      }),
    ).toBe(true);
  });

  it("C: two videos use modern fullscreen", () => {
    const items = [{ kind: "video" }, { kind: "video" }];
    expect(isPublishedVideoContaining(items)).toBe(true);
    expect(
      shouldShowPublishedFullscreenThumbStrip({
        immersiveChrome: true,
        videoOnlyFullscreen: false,
        slideCount: 2,
      }),
    ).toBe(false);
    expect(
      shouldShowPublishedFullscreenTopClose({
        immersiveChrome: true,
        videoOnlyFullscreen: false,
      }),
    ).toBe(true);
    expect(
      shouldShowPublishedFullscreenMixedVideoDots({
        immersiveChrome: true,
        videoOnlyFullscreen: false,
        slideCount: 2,
      }),
    ).toBe(true);
  });

  it("D: image-only keeps thumb strip", () => {
    expect(isPublishedVideoContaining([{ kind: "image" }])).toBe(false);
    expect(
      shouldUsePublishedImmersiveFullscreenChrome({ containsVideo: false }),
    ).toBe(false);
    expect(
      shouldShowPublishedFullscreenThumbStrip({
        immersiveChrome: false,
        videoOnlyFullscreen: false,
        slideCount: 3,
      }),
    ).toBe(true);
  });

  it("E: fullscreen mounts in-tree players for video slides", () => {
    expect(
      shouldMountFullscreenPublishedVideoPlayer({ itemKind: "video" }),
    ).toBe(true);
    expect(
      shouldMountFullscreenPublishedVideoPlayer({ itemKind: "image" }),
    ).toBe(false);

    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('mode="fullscreen"');
    expect(viewer).not.toContain("persistPublishedVideoSession");
    expect(viewer).not.toContain("getPublishedVideoSessionSwipeTarget");
    expect(viewer).toContain("entryPlaybackHandoff");
  });

  it("F: production sources have no session-host flag or portal routing", () => {
    const flags = read("src/lib/featureFlags.ts");
    expect(flags).not.toContain("ENABLE_PUBLISHED_VIDEO_SESSION_HOST");
    expect(flags).not.toContain("VITE_ENABLE_PUBLISHED_VIDEO_SESSION_HOST");

    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).not.toContain("sessionHostActive");
    expect(carousel).not.toContain("persistPublishedVideoSession");
    expect(carousel).toContain("isActive={i === index && !fullscreenOpen}");

    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("sessionPresentation");
    expect(player).not.toContain("ensurePublishedVideoSessionHostLayer");

    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).not.toContain("commitPublishedVideoSessionDetailDismiss");
  });
});
