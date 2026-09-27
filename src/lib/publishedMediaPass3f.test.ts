/**
 * PASS 3F — Profile ↔ Detail playback snapshot handoff (video-only list).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublishedVideoPlaybackSnapshot } from "./publishedMedia/publishedVideoPlaybackSnapshot";
import {
  __resetPublishedVideoFeedDetailHandoffForTests,
  capturePublishedVideoListToDetailHandoff,
  consumePublishedVideoFeedDetailHandoff,
  invalidatePublishedVideoFeedDetailHandoff,
  latchPublishedListHandoffOrigin,
  peekPublishedVideoFeedDetailHandoff,
  peekPublishedVideoFeedDetailHandoffEntry,
  releaseAllPublishedListVideoOwnership,
  resolvePublishedListHandoffOrigin,
  resolvePublishedVideoListReturnIntent,
  shouldCapturePublishedVideoListDetailHandoff,
  writePublishedVideoListReturnHandoff,
} from "./publishedMedia";
import { evaluatePublishedListVideoVisibilityPolicy } from "./publishedMedia/listVideoVisibilityPolicy";
import { getPublishedListVideoOwnerId } from "./publishedMedia/publishedListVideoCoordinator";
import type { PublishedMediaItem } from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function videoOnlyItems(): PublishedMediaItem[] {
  return [
    {
      kind: "video",
      key: "video:a",
      mediaId: "m1",
      videoId: "v1",
      status: "ready",
      posterUrl: null,
      width: 720,
      height: 1280,
      durationSec: 60,
    },
  ];
}

function mixedItems(): PublishedMediaItem[] {
  return [
    { kind: "image", key: "image:1", url: "https://example.com/1.jpg" },
    ...videoOnlyItems(),
  ];
}

function snap(partial: {
  currentTime: number;
  wantsPlaying: boolean;
  generation?: number;
  mediaKey?: string;
  muted?: boolean;
}) {
  return createPublishedVideoPlaybackSnapshot({
    mediaKey: partial.mediaKey ?? "video:a",
    currentTime: partial.currentTime,
    wantsPlaying: partial.wantsPlaying,
    muted: partial.muted ?? false,
    generation: partial.generation ?? 1,
  })!;
}

beforeEach(() => {
  __resetPublishedVideoFeedDetailHandoffForTests();
  releaseAllPublishedListVideoOwnership();
});

describe("PASS 3F — Profile / Feed capture (A–D, J, Q)", () => {
  it("A: Own Profile playing → Detail snapshot captured", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 20, wantsPlaying: true, generation }),
    });
    expect(captured?.wrote).toBe(true);
    const stored = peekPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      mediaKey: "video:a",
      direction: "to-detail",
      origin: "profile",
      sessionId: captured!.sessionId,
    });
    expect(stored?.currentTime).toBe(20);
    expect(stored?.wantsPlaying).toBe(true);
  });

  it("B: Own Profile paused → Detail paused intent captured", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 20, wantsPlaying: false, generation }),
    });
    expect(captured?.wrote).toBe(true);
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
      })?.wantsPlaying,
    ).toBe(false);
  });

  it("C: Other Profile playing → Detail snapshot captured", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-other",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 8, wantsPlaying: true, generation }),
    });
    expect(captured?.wrote).toBe(true);
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-other",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
      })?.currentTime,
    ).toBe(8);
  });

  it("D: capture occurs before ownership release (helper does not release)", () => {
    let captureCalls = 0;
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) => {
        captureCalls += 1;
        expect(getPublishedListVideoOwnerId()).toBeNull();
        return snap({ currentTime: 12, wantsPlaying: true, generation });
      },
    });
    expect(captureCalls).toBe(1);
    expect(captured?.wrote).toBe(true);
    const post = read("src/components/Post.tsx");
    const captureIdx = post.indexOf("capturePublishedVideoListToDetailHandoff");
    const releaseIdx = post.indexOf("releaseAllPublishedListVideoOwnership()");
    expect(captureIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeGreaterThan(captureIdx);
  });

  it("J: Home Feed handoff remains functional", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "feed",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 33, wantsPlaying: true, generation }),
    });
    expect(captured?.wrote).toBe(true);
    const consumed = consumePublishedVideoFeedDetailHandoff({
      postId: "post-1",
      mediaKey: "video:a",
      direction: "to-detail",
      origin: "feed",
      sessionId: captured!.sessionId,
    });
    expect(consumed?.currentTime).toBe(33);
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "feed",
      }),
    ).toBeNull();
  });

  it("Q: missing live snapshot does not write and returns null (no fake session)", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: () => null,
    });
    expect(captured).toBeNull();
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
      }),
    ).toBeNull();
  });

  it("mixed media is not captured", () => {
    expect(
      shouldCapturePublishedVideoListDetailHandoff({
        origin: "profile",
        items: mixedItems(),
      }),
    ).toBe(false);
    expect(
      capturePublishedVideoListToDetailHandoff({
        postId: "post-1",
        origin: "profile",
        items: mixedItems(),
        capture: () => snap({ currentTime: 1, wantsPlaying: true }),
      }),
    ).toBeNull();
  });
});

describe("PASS 3F — Detail → Profile return (E–I)", () => {
  it("E/F/G: return writes latest time and pause/play intent", () => {
    const sessionId = 7;
    expect(
      writePublishedVideoListReturnHandoff({
        postId: "post-1",
        origin: "profile",
        sessionId,
        snapshot: snap({
          currentTime: 41,
          wantsPlaying: false,
          generation: sessionId,
        }),
      }),
    ).toBe(true);
    const paused = peekPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      mediaKey: "video:a",
      direction: "to-feed",
      origin: "profile",
    });
    expect(paused?.currentTime).toBe(41);
    expect(paused?.wantsPlaying).toBe(false);
    expect(resolvePublishedVideoListReturnIntent({ wantsPlaying: false })).toEqual(
      { userPaused: true, clearManualForce: true },
    );

    expect(
      writePublishedVideoListReturnHandoff({
        postId: "post-1",
        origin: "profile",
        sessionId,
        snapshot: snap({
          currentTime: 44,
          wantsPlaying: true,
          generation: sessionId,
        }),
      }),
    ).toBe(true);
    const playing = peekPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      mediaKey: "video:a",
      direction: "to-feed",
      origin: "profile",
    });
    expect(playing?.currentTime).toBe(44);
    expect(playing?.wantsPlaying).toBe(true);
    expect(resolvePublishedVideoListReturnIntent({ wantsPlaying: true })).toEqual(
      { userPaused: false, clearManualForce: false },
    );
  });

  it("H: playing return does not become autoplay-eligible without visibility", () => {
    const policy = evaluatePublishedListVideoVisibilityPolicy({
      effectiveRatio: 0.9,
      dwellOk: true,
      visibilityOk: false,
      readyActiveVideo: true,
      userPaused: false,
      ownsPlayback: false,
      manualForce: false,
    });
    expect(policy.autoplayEligible).toBe(false);
    expect(policy.shouldOwnActive).toBe(false);
  });

  it("I: offscreen Profile does not autoplay even with playing intent", () => {
    const policy = evaluatePublishedListVideoVisibilityPolicy({
      effectiveRatio: 0.1,
      dwellOk: false,
      visibilityOk: true,
      readyActiveVideo: true,
      userPaused: false,
      ownsPlayback: false,
      manualForce: false,
    });
    expect(policy.autoplayEligible).toBe(false);
    expect(policy.shouldOwnActive).toBe(false);
    expect(policy.warmEligible).toBe(false);
  });
});

describe("PASS 3F — origin / session isolation (K–P)", () => {
  it("K: Profile-origin return cannot be consumed by a Home Feed card", () => {
    writePublishedVideoListReturnHandoff({
      postId: "post-1",
      origin: "profile",
      sessionId: 3,
      snapshot: snap({ currentTime: 20, wantsPlaying: true, generation: 3 }),
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
        origin: "feed",
      }),
    ).toBeNull();
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
        origin: "profile",
      })?.currentTime,
    ).toBe(20);
  });

  it("L: Home-origin return cannot be consumed by Profile", () => {
    writePublishedVideoListReturnHandoff({
      postId: "post-1",
      origin: "feed",
      sessionId: 4,
      snapshot: snap({ currentTime: 15, wantsPlaying: true, generation: 4 }),
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
        origin: "profile",
      }),
    ).toBeNull();
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
        origin: "feed",
      })?.currentTime,
    ).toBe(15);
  });

  it("M: wrong postId/mediaKey rejected", () => {
    capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 9, wantsPlaying: true, generation }),
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-2",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
      }),
    ).toBeNull();
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:b",
        direction: "to-detail",
        origin: "profile",
      }),
    ).toBeNull();
  });

  it("N: stale navigation generation rejected", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 11, wantsPlaying: true, generation }),
    });
    expect(
      consumePublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
        sessionId: captured!.sessionId + 99,
      }),
    ).toBeNull();
    expect(
      peekPublishedVideoFeedDetailHandoffEntry({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
        sessionId: captured!.sessionId,
      })?.sessionId,
    ).toBe(captured!.sessionId);
  });

  it("O: Profile pathname changing to Detail does not change origin", () => {
    expect(
      resolvePublishedListHandoffOrigin({
        explicit: "profile",
        pathname: "/experience/abc",
      }),
    ).toBe("profile");
    expect(
      latchPublishedListHandoffOrigin(null, "profile", "/u/jane"),
    ).toBe("profile");
    expect(
      latchPublishedListHandoffOrigin("profile", undefined, "/experience/abc"),
    ).toBe("profile");
    expect(
      latchPublishedListHandoffOrigin("feed", undefined, "/experience/abc"),
    ).toBe("feed");
    expect(
      resolvePublishedListHandoffOrigin({ pathname: "/experience/abc" }),
    ).toBe("feed");
  });

  it("P: unmount of an unrelated card cannot erase an active handoff", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 18, wantsPlaying: true, generation }),
    });
    invalidatePublishedVideoFeedDetailHandoff({
      postId: "post-1",
      origin: "feed",
      direction: "to-feed",
    });
    invalidatePublishedVideoFeedDetailHandoff({
      postId: "post-other",
      origin: "profile",
      direction: "to-feed",
    });
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
        sessionId: captured!.sessionId,
      })?.currentTime,
    ).toBe(18);
  });
});

describe("PASS 3F — ownership / regression wiring (R–S)", () => {
  it("R: handoff never forces ownsPlayback; list+Detail dual-play still gated", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("detailRouteOpen");
    expect(surface).toContain("isActive={ownsPlayback && i === index}");
    expect(surface).not.toContain(
      "setOwnsPlayback(true);\n    setFeedReturnHandoff",
    );
    releaseAllPublishedListVideoOwnership();
    expect(getPublishedListVideoOwnerId()).toBeNull();
  });

  it("S: Pass 3C swipe-down behavior remains unchanged", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    const gestures = read(
      "src/lib/publishedMedia/publishedFullscreenGestures.ts",
    );
    expect(gestures).toContain("video-only-surface");
    expect(viewer).toContain("video-only-surface");
    expect(viewer).toContain("data-published-fullscreen-top-close");
  });

  it("callers pass explicit origin; Detail consume requires session", () => {
    const home = read("src/sections/home/HomePostsSection.tsx");
    const own = read("src/sections/profile/OwnProfilePostsSection.tsx");
    const other = read("src/sections/profile/OtherProfilePostsSection.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    const post = read("src/components/Post.tsx");
    expect(home).toContain('publishedListOrigin="feed"');
    expect(own).toContain('publishedListOrigin="profile"');
    expect(other).toContain('publishedListOrigin="profile"');
    expect(post).toContain("latchPublishedListHandoffOrigin");
    expect(carousel).toContain("listPlaybackHandoffSessionId");
    expect(carousel).toContain("listPlaybackOrigin");
    expect(carousel).toContain(
      "!isPublishedVideoListHandoffOrigin(listPlaybackOrigin)",
    );
  });

  it("direct nav without session does not consume leftover", () => {
    capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 5, wantsPlaying: true, generation }),
    });
    // Missing origin/session (direct URL) — leftover stays until a matching consume.
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-detail",
        origin: "profile",
      })?.currentTime,
    ).toBe(5);
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("listPlaybackHandoffSessionId == null");
  });
});
