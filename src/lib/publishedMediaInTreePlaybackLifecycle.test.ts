/**
 * In-tree published video playback lifecycle (session-host portal removed).
 * Behavioral coverage for Feed ↔ Detail ↔ Fullscreen snapshot ownership.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  capturePublishedVideoPlaybackFromElement,
  createPublishedVideoPlaybackSnapshot,
  isPublishedVideoPlaybackSnapshotForMedia,
  capturePublishedVideoListToDetailHandoff,
  consumePublishedVideoListToDetailHandoffIfEligible,
  __resetPublishedVideoFeedDetailHandoffForTests,
  shouldMountFullscreenPublishedVideoPlayer,
  shouldUsePublishedImmersiveFullscreenChrome,
  isPublishedVideoContaining,
  shouldShowPublishedFullscreenThumbStrip,
  resolvePublishedFullscreenAxisLock,
  shouldClosePublishedFullscreenVerticalDismiss,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function mockVideo(partial: {
  currentTime?: number;
  paused?: boolean;
  ended?: boolean;
  duration?: number;
  muted?: boolean;
  readyState?: number;
}): HTMLVideoElement {
  const video = {
    currentTime: partial.currentTime ?? 0,
    paused: partial.paused ?? true,
    ended: partial.ended ?? false,
    duration: partial.duration ?? 100,
    muted: partial.muted ?? true,
    readyState: partial.readyState ?? 2,
    seekable: {
      length: 1,
      start: () => 0,
      end: () => partial.duration ?? 100,
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return video as unknown as HTMLVideoElement;
}

describe("in-tree published video playback lifecycle", () => {
  beforeEach(() => {
    __resetPublishedVideoFeedDetailHandoffForTests();
  });

  it("A/B: Detail uses one in-tree player architecture for single and multi video", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("<PublishedVideoPlayer");
    expect(carousel).toContain("isActive={i === index && !fullscreenOpen}");
    expect(carousel).toContain('mode="detail"');
    // Single path — no session-host branch.
    expect(carousel).not.toContain("sessionHostActive");
    expect(carousel).not.toContain("shouldKeepDetailPlayerActiveDuringFullscreen");
    expect(carousel.split("<PublishedVideoPlayer").length - 1).toBe(1);
  });

  it("C/D/E: Detail video lives inside modal transform tree (no body host)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("createPortal");
    expect(player).not.toContain("ensurePublishedVideoSessionHostLayer");
    expect(player).not.toContain("applyPublishedVideoSessionHostFollowTransform");

    const modal = read("src/components/PostDetailModal.tsx");
    expect(modal).not.toContain("commitPublishedVideoSessionDetailDismiss");
    expect(modal).not.toContain("onDismissCommitStart");
  });

  it("F: close/reopen has no persistent dismiss lock API", () => {
    const host = read(
      "src/lib/publishedMedia/publishedVideoSessionHost.ts",
    );
    expect(host).not.toContain("commitPublishedVideoSessionDetailDismiss");
    expect(host).not.toContain("isPublishedVideoSessionDetailDismissCommitted");
    expect(host).not.toContain("preparePublishedVideoSessionHostForPresentation");
    expect(host).not.toContain("detailDismissCommitted");
  });

  it("G: Feed → Detail snapshot transfer utilities gate on media key", () => {
    const videoItem = {
      kind: "video" as const,
      key: "video:a",
      mediaId: "a",
      videoId: "bunny-a",
      status: "ready" as const,
      posterUrl: null,
      width: 720,
      height: 1280,
      durationSec: 30,
    };
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "feed",
      items: [videoItem],
      initialMediaKey: "video:a",
      capture: (generation) =>
        createPublishedVideoPlaybackSnapshot({
          mediaKey: "video:a",
          currentTime: 12.5,
          wantsPlaying: true,
          muted: true,
          generation,
        }),
    });
    expect(captured?.wrote).toBe(true);

    const miss = consumePublishedVideoListToDetailHandoffIfEligible({
      postId: "post-1",
      items: [{ ...videoItem, key: "video:b", mediaId: "b" }],
      initialMediaKey: "video:b",
      origin: "feed",
      sessionId: captured?.sessionId ?? null,
    });
    expect(miss.snapshot).toBeNull();

    // Re-write after miss consumed nothing — capture again for hit path.
    __resetPublishedVideoFeedDetailHandoffForTests();
    const captured2 = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "feed",
      items: [videoItem],
      initialMediaKey: "video:a",
      capture: (generation) =>
        createPublishedVideoPlaybackSnapshot({
          mediaKey: "video:a",
          currentTime: 12.5,
          wantsPlaying: true,
          muted: true,
          generation,
        }),
    });
    const hit = consumePublishedVideoListToDetailHandoffIfEligible({
      postId: "post-1",
      items: [videoItem],
      initialMediaKey: "video:a",
      origin: "feed",
      sessionId: captured2?.sessionId ?? null,
    });
    expect(hit.snapshot?.mediaKey).toBe("video:a");
    expect(hit.snapshot?.currentTime).toBe(12.5);
    expect(hit.snapshot?.wantsPlaying).toBe(true);
  });

  it("H/I/J: Detail ↔ Fullscreen handoff preserves pause, mute, and position", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("detailPlaybackCaptureRef");
    expect(carousel).toContain("setFullscreenEntryHandoff");
    expect(carousel).toContain("setDetailReturnHandoff");
    expect(carousel).toContain("playbackHandoffGenerationRef");

    const paused = capturePublishedVideoPlaybackFromElement({
      mediaKey: "video:a",
      video: mockVideo({ currentTime: 33, paused: true, muted: false }),
      wantsPlaying: false,
      muted: false,
      generation: 7,
    });
    expect(paused?.wantsPlaying).toBe(false);
    expect(paused?.muted).toBe(false);
    expect(paused?.currentTime).toBe(33);
    expect(isPublishedVideoPlaybackSnapshotForMedia(paused, "video:a")).toBe(
      true,
    );
    expect(isPublishedVideoPlaybackSnapshotForMedia(paused, "video:other")).toBe(
      false,
    );

    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("entryPlaybackHandoff");
    expect(viewer).toContain("fsPlaybackCaptureRef");
    expect(viewer).toContain("onCloseRef.current");
  });

  it("K/M: inactive Detail releases when fullscreen opens; FS mounts own player", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("isActive={i === index && !fullscreenOpen}");
    expect(
      shouldMountFullscreenPublishedVideoPlayer({ itemKind: "video" }),
    ).toBe(true);
  });

  it("L: stale snapshot cannot apply to another post/media", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 9,
      wantsPlaying: true,
      muted: true,
      generation: 2,
    });
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:a")).toBe(true);
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:z")).toBe(
      false,
    );

    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("snap.mediaKey === mediaKey");
    expect(carousel).toContain("playbackSnapshot.mediaKey === activeMediaKey");
  });

  it("N: player exposes truthful loading/error presentation helpers", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toMatch(/loading|poster|error/i);
    expect(player).toContain("resolvePublishedVideoShowVideoFrame");
  });

  it("O: all video posts retain immersive chrome", () => {
    expect(
      shouldUsePublishedImmersiveFullscreenChrome({
        containsVideo: isPublishedVideoContaining([
          { kind: "video" },
          { kind: "video" },
        ]),
      }),
    ).toBe(true);
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("shouldUsePublishedImmersiveFullscreenChrome");
    expect(viewer).toContain("data-published-fullscreen-immersive");
  });

  it("P: image-only gallery keeps thumb strip", () => {
    expect(
      shouldShowPublishedFullscreenThumbStrip({
        immersiveChrome: false,
        videoOnlyFullscreen: false,
        slideCount: 4,
      }),
    ).toBe(true);
  });

  it("Q: fullscreen gestures remain (axis lock, vertical dismiss, escape)", () => {
    expect(
      resolvePublishedFullscreenAxisLock({
        diffX: 40,
        diffY: 5,
        thresholdPx: 12,
      }),
    ).toBe("horizontal");
    expect(
      resolvePublishedFullscreenAxisLock({
        diffX: 5,
        diffY: 40,
        thresholdPx: 12,
      }),
    ).toBe("vertical");
    expect(
      shouldClosePublishedFullscreenVerticalDismiss({
        isVerticalSwipe: true,
        diffY: 140,
      }),
    ).toBe(true);

    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain('e.key === "Escape"');
    expect(viewer).toContain("shouldClosePublishedFullscreenVerticalDismiss");
    expect(viewer).toContain("resolvePublishedFullscreenAxisLock");
  });

  it("R: no obsolete portal/session-host references in active exports", () => {
    const index = read("src/lib/publishedMedia/index.ts");
    expect(index).not.toContain("ensurePublishedVideoSessionHostLayer");
    expect(index).not.toContain("commitPublishedVideoSessionDetailDismiss");
    expect(index).not.toContain("shouldUsePublishedVideoSessionHost");
    expect(index).not.toContain("ENABLE_PUBLISHED_VIDEO_SESSION_HOST");
    expect(index).toContain("shouldMountFullscreenPublishedVideoPlayer");
    expect(index).toContain("shouldUsePublishedImmersiveFullscreenChrome");
  });
});
