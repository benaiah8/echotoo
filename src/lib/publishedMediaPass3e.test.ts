/**
 * PASS 3E — Feed ↔ Detail playback snapshot handoff (video-only Home Feed).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublishedVideoPlaybackSnapshot,
  isPublishedVideoPlaybackSnapshotForMedia,
} from "./publishedMedia/publishedVideoPlaybackSnapshot";
import {
  __resetPublishedVideoFeedDetailHandoffForTests,
  consumePublishedVideoFeedDetailHandoff,
  invalidatePublishedVideoFeedDetailHandoff,
  nextPublishedVideoFeedDetailHandoffGeneration,
  peekPublishedVideoFeedDetailHandoff,
  setPublishedVideoFeedDetailHandoff,
} from "./publishedMedia/publishedVideoFeedDetailHandoff";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

beforeEach(() => {
  __resetPublishedVideoFeedDetailHandoffForTests();
});

describe("PASS 3E — ephemeral handoff store", () => {
  it("A/B: stores playing vs paused to-detail snapshots", () => {
    const playing = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 20,
      wantsPlaying: true,
      muted: false,
      generation: nextPublishedVideoFeedDetailHandoffGeneration(),
    })!;
    setPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      snapshot: playing,
      direction: "to-detail",
      origin: "feed",
      sessionId: playing.generation,
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
      })?.wantsPlaying,
    ).toBe(true);
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
      })?.currentTime,
    ).toBe(20);

    const paused = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 20,
      wantsPlaying: false,
      muted: true,
      generation: nextPublishedVideoFeedDetailHandoffGeneration(),
    })!;
    setPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      snapshot: paused,
      direction: "to-detail",
      origin: "feed",
      sessionId: paused.generation,
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
      })?.wantsPlaying,
    ).toBe(false);
  });

  it("E/O: wrong postId or mediaKey rejects handoff", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 10,
      wantsPlaying: true,
      muted: false,
      generation: 1,
    })!;
    setPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      snapshot: snap,
      direction: "to-detail",
      origin: "feed",
      sessionId: snap.generation,
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-2",
        mediaKey: "video:a",
        direction: "to-detail",
      }),
    ).toBeNull();
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:b",
        direction: "to-detail",
      }),
    ).toBeNull();
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:b")).toBe(
      false,
    );
  });

  it("N: latest write wins; consume clears slot", () => {
    const first = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 5,
      wantsPlaying: true,
      muted: false,
      generation: 1,
    })!;
    const second = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 45,
      wantsPlaying: false,
      muted: false,
      generation: 2,
    })!;
    setPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      snapshot: first,
      direction: "to-feed",
      origin: "feed",
      sessionId: first.generation,
    });
    setPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      snapshot: second,
      direction: "to-feed",
      origin: "feed",
      sessionId: second.generation,
    });
    const consumed = consumePublishedVideoFeedDetailHandoff({
      postId: "post-1",
      mediaKey: "video:a",
      direction: "to-feed",
    });
    expect(consumed?.currentTime).toBe(45);
    expect(consumed?.wantsPlaying).toBe(false);
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
      }),
    ).toBeNull();
  });

  it("direction mismatch does not peek", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 1,
      wantsPlaying: true,
      muted: false,
      generation: 1,
    })!;
    setPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      snapshot: snap,
      direction: "to-detail",
      origin: "feed",
      sessionId: snap.generation,
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
      }),
    ).toBeNull();
  });

  it("invalidate clears by postId", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 1,
      wantsPlaying: true,
      muted: false,
      generation: 1,
    })!;
    setPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      snapshot: snap,
      direction: "to-feed",
      origin: "feed",
      sessionId: snap.generation,
    });
    invalidatePublishedVideoFeedDetailHandoff("post-1");
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
      }),
    ).toBeNull();
  });
});

describe("PASS 3E — wiring", () => {
  it("C: Feed capture runs before releaseAll in goToDetails", () => {
    const post = read("src/components/Post.tsx");
    const captureIdx = post.indexOf("capturePublishedVideoListToDetailHandoff");
    const releaseIdx = post.indexOf("releaseAllPublishedListVideoOwnership()");
    expect(captureIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeGreaterThan(captureIdx);
    expect(post).toContain("isPublishedVideoOnly");
  });

  it("D: Detail consumes to-detail; missing snap leaves default path", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain(
      "consumePublishedVideoListToDetailHandoffIfEligible",
    );
    expect(carousel).toContain("feedEntryHandoff");
    expect(carousel).toContain("isPublishedVideoOnly(mediaItems)");
  });

  it("F: Detail↔Fullscreen Pass 3B path preserved", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("fullscreenEntryHandoff");
    expect(carousel).toContain("detailReturnHandoff");
    expect(carousel).toContain("openFullscreenAt");
    // FS return preferred over feed entry when both present.
    const detailReturnIdx = carousel.indexOf(
      "detailReturnHandoff?.mediaKey === item.key",
    );
    const feedEntryIdx = carousel.indexOf(
      "feedEntryHandoff?.mediaKey === item.key",
    );
    expect(detailReturnIdx).toBeGreaterThan(-1);
    expect(feedEntryIdx).toBeGreaterThan(detailReturnIdx);
  });

  it("G/H/I/J: Detail close captures to-feed; Feed latches pause/play", () => {
    const modal = read("src/components/PostDetailModal.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(modal).toContain("registerFeedReturnPlaybackCapture");
    expect(modal).toContain("feedReturnPlaybackCaptureRef.current?.()");
    expect(carousel).toContain("writePublishedVideoListReturnHandoff");
    expect(surface).toContain('direction: "to-feed"');
    expect(surface).toContain("setUserPausedKey(video.key)");
    expect(surface).toContain("feedReturnHandoff");
    expect(surface).toContain("peekPublishedVideoFeedDetailHandoff");
  });

  it("K/L/M/P: visibility/ownership policy unchanged; no dual play under Detail", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("detailRouteOpen");
    expect(surface).toContain("evaluatePublishedListVideoVisibilityPolicy");
    expect(surface).toContain("requestPublishedListVideoOwnership");
    expect(surface).toContain("isActive={ownsPlayback && i === index}");
    expect(surface).toContain("isWarm={ownsWarm && !ownsPlayback && i === index}");
    // Handoff does not force ownsPlayback.
    expect(surface).not.toContain("setOwnsPlayback(true);\n    setFeedReturnHandoff");
  });

  it("Q/R: Pass 3D scrub resume still present", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("captureScrubPlaybackIntent");
    expect(player).toContain("waitForPublishedVideoSeekSettled");
    expect(player).toContain("resolvePublishedVideoSeekPlaybackAction");
  });

  it("S: Pass 3C swipe-down still wired", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    const gestures = read(
      "src/lib/publishedMedia/publishedFullscreenGestures.ts",
    );
    expect(gestures).toContain("video-only-surface");
    expect(viewer).toContain("video-only-surface");
  });

  it("T: mixed still excluded; list capture is video-only", () => {
    const post = read("src/components/Post.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(post).toContain("capturePublishedVideoListToDetailHandoff");
    expect(post).toContain("isPublishedVideoOnly");
    expect(post).toContain(
      "registerFeedPlaybackCapture={registerListPlaybackCapture}",
    );
    expect(surface).toContain("feedReturnHandoff?.mediaKey === item.key");
    expect(surface).toContain('direction: "to-feed"');
    expect(surface).toContain("origin: mode");
  });
});
