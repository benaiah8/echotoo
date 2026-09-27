/**
 * PASS 3G — video playback restoration across Feed ↔ Detail ↔ Fullscreen.
 * Focused player lifecycle harness (no jsdom) plus list/Detail store transitions.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPublishedVideoHandoffRestore,
  capturePublishedVideoListToDetailHandoff,
  classifyPublishedVideoPlayError,
  consumePublishedVideoListToDetailHandoffIfEligible,
  createPublishedVideoPlaybackSnapshot,
  evaluatePublishedListVideoVisibilityPolicy,
  getPublishedListVideoOwnerId,
  peekPublishedVideoFeedDetailHandoff,
  requestPublishedListVideoOwnership,
  resolvePublishedVideoHandoffLatchUi,
  resolvePublishedVideoHandoffPlayMute,
  resolvePublishedVideoListReturnIntent,
  resolvePublishedVideoSeekPlaybackAction,
  shouldClosePublishedFullscreenVerticalDismiss,
  shouldIgnoreTimeupdateDuringHandoffSeek,
  shouldResetAppliedHandoffGeneration,
  shouldRetryPublishedVideoPlayMuted,
  shouldSuppressCompetingPlayDuringHandoff,
  writePublishedVideoListReturnHandoff,
  __resetPublishedListVideoCoordinatorForTests,
  __resetPublishedVideoFeedDetailHandoffForTests,
} from "./publishedMedia";
import type { PublishedMediaItem } from "./publishedMedia";
import type { PublishedVideoPlaybackSnapshot } from "./publishedMedia/publishedVideoPlaybackSnapshot";

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
    {
      kind: "image",
      key: "image:1",
      url: "https://cdn.example/1.jpg",
    },
    ...videoOnlyItems(),
  ];
}

function mockVideo(partial: {
  currentTime?: number;
  paused?: boolean;
  ended?: boolean;
  duration?: number;
  readyState?: number;
  muted?: boolean;
  seeking?: boolean;
  playImpl?: () => Promise<void>;
}): HTMLVideoElement {
  const listeners = new Map<string, Set<() => void>>();
  const video = {
    currentTime: partial.currentTime ?? 0,
    paused: partial.paused ?? true,
    ended: partial.ended ?? false,
    duration: partial.duration ?? 100,
    readyState: partial.readyState ?? 1,
    muted: partial.muted ?? false,
    seeking: partial.seeking ?? false,
    seekable: {
      length: 1,
      start: () => 0,
      end: () => 100,
    },
    addEventListener: (type: string, fn: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    pause: () => {
      (video as { paused: boolean }).paused = true;
    },
    play: () => {
      if (partial.playImpl) return partial.playImpl();
      (video as { paused: boolean }).paused = false;
      return Promise.resolve();
    },
  };
  return video as unknown as HTMLVideoElement;
}

function snap(
  partial: Partial<PublishedVideoPlaybackSnapshot> & { currentTime: number },
): PublishedVideoPlaybackSnapshot {
  return createPublishedVideoPlaybackSnapshot({
    mediaKey: partial.mediaKey ?? "video:a",
    currentTime: partial.currentTime,
    wantsPlaying: partial.wantsPlaying ?? true,
    muted: partial.muted ?? false,
    generation: partial.generation ?? 1,
  })!;
}

type HarnessUi = {
  currentTime: number;
  playing: boolean;
  playPending: boolean;
  muted: boolean;
  localUserPaused: boolean;
  affordance: "play" | "pause" | "loading";
};

function affordanceFor(ui: {
  playing: boolean;
  playPending: boolean;
}): HarnessUi["affordance"] {
  if (ui.playing) return "pause";
  if (ui.playPending) return "loading";
  return "play";
}

/**
 * Mirrors Pass 3G player restore: latch → restore → consume only when done.
 * onReady/autoplay cannot call play() while the snapshot is pending.
 */
function createHandoffPlayerHarness(mediaKey = "video:a") {
  const video = mockVideo({ currentTime: 0, paused: true });
  let playbackHandoff: PublishedVideoPlaybackSnapshot | null = null;
  let pending: PublishedVideoPlaybackSnapshot | null = null;
  let appliedGeneration: number | null = null;
  let restorePending = false;
  let seekSettled = true;
  let consumeGeneration: number | null = null;
  let consumeCount = 0;
  let playAttempts = 0;
  let competingBlocked = 0;
  let userPaused = false;
  let userWantsPlay = false;
  const displayedTimes: number[] = [];
  let ui: HarnessUi = {
    currentTime: 0,
    playing: false,
    playPending: false,
    muted: false,
    localUserPaused: false,
    affordance: "play",
  };

  const syncUi = (next: Partial<HarnessUi>) => {
    ui = {
      ...ui,
      ...next,
      affordance: affordanceFor({
        playing: next.playing ?? ui.playing,
        playPending: next.playPending ?? ui.playPending,
      }),
    };
  };

  const latch = (snapshot: PublishedVideoPlaybackSnapshot) => {
    const latchUi = resolvePublishedVideoHandoffLatchUi(snapshot);
    playbackHandoff = snapshot;
    pending = snapshot;
    restorePending = true;
    seekSettled = false;
    userPaused = latchUi.localUserPaused;
    userWantsPlay = latchUi.playPending;
    syncUi({
      currentTime: latchUi.currentTime,
      playing: false,
      playPending: latchUi.playPending,
      muted: latchUi.muted,
      localUserPaused: latchUi.localUserPaused,
    });
    displayedTimes.push(latchUi.currentTime);
  };

  const maybeCompetingPlay = () => {
    if (
      shouldSuppressCompetingPlayDuringHandoff({
        restorePending,
        hasPendingHandoff: Boolean(pending),
      })
    ) {
      competingBlocked += 1;
      return false;
    }
    playAttempts += 1;
    return true;
  };

  const restore = async (play?: () => Promise<"played" | "rejected" | "aborted">) => {
    const snapshot = pending;
    if (!snapshot) {
      return {
        status: "superseded" as const,
        appliedTime: 0,
        generation: -1,
        consume: false,
      };
    }
    const result = await applyPublishedVideoHandoffRestore({
      video,
      snapshot,
      mediaKey,
      signal: new AbortController().signal,
      ensureReady: async () => true,
      getUserPaused: () => userPaused,
      getUserWantsPlay: () => userWantsPlay,
      onSeekSettled: (appliedTime) => {
        seekSettled = true;
        syncUi({ currentTime: appliedTime });
        displayedTimes.push(appliedTime);
      },
      play: async () => {
        playAttempts += 1;
        if (play) return play();
        (video as { paused: boolean }).paused = false;
        return "played";
      },
    });
    if (result.consume) {
      appliedGeneration = result.generation;
      pending = null;
      restorePending = false;
      playbackHandoff = null;
      consumeGeneration = result.generation;
      consumeCount += 1;
      if (result.status === "played") {
        userPaused = false;
        userWantsPlay = true;
        syncUi({
          currentTime: result.appliedTime,
          playing: true,
          playPending: false,
          localUserPaused: false,
        });
      } else if (result.status === "paused") {
        userPaused = true;
        userWantsPlay = false;
        syncUi({
          currentTime: result.appliedTime,
          playing: false,
          playPending: false,
          localUserPaused: true,
        });
      } else {
        userPaused = true;
        userWantsPlay = false;
        syncUi({
          currentTime: result.appliedTime,
          playing: false,
          playPending: false,
          localUserPaused: true,
        });
      }
    }
    return result;
  };

  return {
    video,
    latch,
    restore,
    onReady: maybeCompetingPlay,
    autoplay: maybeCompetingPlay,
    clearProp: () => {
      playbackHandoff = null;
    },
    identityChange: (nextKey: string) => {
      if (
        shouldResetAppliedHandoffGeneration({
          previousMediaKey: mediaKey,
          nextMediaKey: nextKey,
        })
      ) {
        appliedGeneration = null;
        pending = null;
        restorePending = false;
      }
    },
    timeupdate: (t: number) => {
      if (
        shouldIgnoreTimeupdateDuringHandoffSeek({
          restorePending,
          seekSettled,
          scrubbing: false,
        })
      ) {
        return false;
      }
      syncUi({ currentTime: t });
      displayedTimes.push(t);
      return true;
    },
    userPause: () => {
      userPaused = true;
      userWantsPlay = false;
      (video as { paused: boolean }).paused = true;
      syncUi({ playing: false, playPending: false, localUserPaused: true });
    },
    userPlay: () => {
      userPaused = false;
      userWantsPlay = true;
      syncUi({ playPending: true, localUserPaused: false });
    },
    get state() {
      return {
        ui,
        playbackHandoff,
        pending,
        appliedGeneration,
        restorePending,
        consumeGeneration,
        consumeCount,
        playAttempts,
        competingBlocked,
        displayedTimes: [...displayedTimes],
        videoTime: video.currentTime,
        videoPaused: video.paused,
        videoMuted: video.muted,
      };
    },
  };
}

beforeEach(() => {
  __resetPublishedVideoFeedDetailHandoffForTests();
  __resetPublishedListVideoCoordinatorForTests();
});

describe("PASS 3G — Feed → Detail restoration", () => {
  it("1: Feed playing at 20s → Detail restores 20s, playing", async () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "feed",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 20, wantsPlaying: true, muted: false, generation }),
    });
    expect(captured?.wrote).toBe(true);
    const firstPaint = consumePublishedVideoListToDetailHandoffIfEligible({
      postId: "post-1",
      items: videoOnlyItems(),
      origin: "feed",
      sessionId: captured!.sessionId,
    });
    expect(firstPaint.attempted).toBe(true);
    expect(firstPaint.snapshot?.currentTime).toBe(20);
    expect(firstPaint.snapshot?.wantsPlaying).toBe(true);

    const player = createHandoffPlayerHarness();
    player.latch(firstPaint.snapshot!);
    expect(player.state.ui.currentTime).toBe(20);
    expect(player.state.ui.playing).toBe(false);
    expect(player.state.ui.affordance).toBe("loading");

    const result = await player.restore();
    expect(result.status).toBe("played");
    expect(result.consume).toBe(true);
    expect(player.state.ui.currentTime).toBe(20);
    expect(player.state.videoTime).toBe(20);
    expect(player.state.ui.playing).toBe(true);
    expect(player.state.videoPaused).toBe(false);
    expect(player.state.ui.affordance).toBe("pause");
  });

  it("2: Feed paused at 20s → Detail restores 20s, paused", async () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "feed",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 20, wantsPlaying: false, generation }),
    });
    const firstPaint = consumePublishedVideoListToDetailHandoffIfEligible({
      postId: "post-1",
      items: videoOnlyItems(),
      origin: "feed",
      sessionId: captured!.sessionId,
    });
    const player = createHandoffPlayerHarness();
    player.latch(firstPaint.snapshot!);
    expect(player.state.ui.currentTime).toBe(20);
    expect(player.state.ui.localUserPaused).toBe(true);
    expect(player.state.ui.affordance).toBe("play");

    const result = await player.restore();
    expect(result.status).toBe("paused");
    expect(player.state.ui.currentTime).toBe(20);
    expect(player.state.ui.playing).toBe(false);
    expect(player.state.videoPaused).toBe(true);
    expect(player.state.ui.affordance).toBe("play");
  });
});

describe("PASS 3G — Detail ↔ Fullscreen restoration", () => {
  it("3: Detail playing → Fullscreen continues playing", async () => {
    const player = createHandoffPlayerHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 2 }));
    const result = await player.restore();
    expect(result.status).toBe("played");
    expect(player.state.ui.playing).toBe(true);
    expect(player.state.videoTime).toBe(20);
  });

  it("4: Detail paused → Fullscreen remains paused", async () => {
    const player = createHandoffPlayerHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: false, generation: 2 }));
    const result = await player.restore();
    expect(result.status).toBe("paused");
    expect(player.state.ui.playing).toBe(false);
    expect(player.state.videoPaused).toBe(true);
  });

  it("5: Fullscreen playing → Detail continues playing", async () => {
    const fs = createHandoffPlayerHarness();
    fs.latch(snap({ currentTime: 21, wantsPlaying: true, generation: 3 }));
    await fs.restore();
    const returning = snap({
      currentTime: fs.state.videoTime,
      wantsPlaying: true,
      generation: 4,
    });
    const detail = createHandoffPlayerHarness();
    detail.latch(returning);
    const result = await detail.restore();
    expect(result.status).toBe("played");
    expect(detail.state.ui.currentTime).toBe(21);
    expect(detail.state.ui.playing).toBe(true);
  });

  it("6: Fullscreen paused → Detail remains paused", async () => {
    const returning = snap({
      currentTime: 22,
      wantsPlaying: false,
      generation: 5,
    });
    const detail = createHandoffPlayerHarness();
    detail.latch(returning);
    const result = await detail.restore();
    expect(result.status).toBe("paused");
    expect(detail.state.ui.playing).toBe(false);
    expect(detail.state.ui.currentTime).toBe(22);
  });

  it("7: Latest Fullscreen time returns to Feed", () => {
    writePublishedVideoListReturnHandoff({
      postId: "post-1",
      origin: "feed",
      sessionId: 9,
      snapshot: snap({ currentTime: 33.5, wantsPlaying: true, generation: 9 }),
    });
    const peeked = peekPublishedVideoFeedDetailHandoff({
      postId: "post-1",
      mediaKey: "video:a",
      direction: "to-feed",
      origin: "feed",
      sessionId: 9,
    });
    expect(peeked?.currentTime).toBe(33.5);
    expect(peeked?.wantsPlaying).toBe(true);
    expect(
      resolvePublishedVideoListReturnIntent({ wantsPlaying: true }),
    ).toEqual({ userPaused: false, clearManualForce: false });
  });
});

describe("PASS 3G — Profile parity + handoff lifecycle", () => {
  it("8: Profile uses the same restoration pipeline", async () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "profile",
      items: videoOnlyItems(),
      capture: (generation) =>
        snap({ currentTime: 18, wantsPlaying: true, generation }),
    });
    const firstPaint = consumePublishedVideoListToDetailHandoffIfEligible({
      postId: "post-1",
      items: videoOnlyItems(),
      origin: "profile",
      sessionId: captured!.sessionId,
    });
    expect(firstPaint.snapshot?.currentTime).toBe(18);
    const player = createHandoffPlayerHarness();
    player.latch(firstPaint.snapshot!);
    const result = await player.restore();
    expect(result.status).toBe("played");
    expect(player.state.ui.currentTime).toBe(18);
  });

  it("9: Handoff is not cleared before restoration finishes", async () => {
    let releasePlay: (() => void) | null = null;
    const playGate = new Promise<"played">((resolve) => {
      releasePlay = () => resolve("played");
    });
    const player = createHandoffPlayerHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 7 }));
    const restoring = player.restore(async () => playGate);
    player.clearProp();
    expect(
      shouldResetAppliedHandoffGeneration({
        previousMediaKey: "video:a",
        nextMediaKey: "video:a",
      }),
    ).toBe(false);
    expect(player.state.pending?.generation).toBe(7);
    expect(player.state.consumeCount).toBe(0);
    releasePlay!();
    const result = await restoring;
    expect(result.status).toBe("played");
    expect(result.consume).toBe(true);
    expect(player.state.consumeCount).toBe(1);
    expect(player.state.pending).toBeNull();
  });

  it("10: onReady/autoplay cannot compete with handoff play", async () => {
    const player = createHandoffPlayerHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 1 }));
    expect(player.onReady()).toBe(false);
    expect(player.autoplay()).toBe(false);
    await player.restore();
    expect(player.state.competingBlocked).toBe(2);
    expect(player.state.playAttempts).toBe(1);
  });
});

describe("PASS 3G — UI / mute / failure / identity", () => {
  it("11: React time matches the restored element time", async () => {
    const player = createHandoffPlayerHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 1 }));
    expect(player.state.displayedTimes[0]).toBe(20);
    player.timeupdate(0);
    expect(player.state.ui.currentTime).toBe(20);
    await player.restore();
    expect(player.state.ui.currentTime).toBe(player.state.videoTime);
    expect(player.state.ui.currentTime).toBe(20);
  });

  it("12: Play/Pause UI reflects actual playback", async () => {
    const playing = createHandoffPlayerHarness();
    playing.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 1 }));
    expect(playing.state.ui.affordance).toBe("loading");
    await playing.restore();
    expect(playing.state.ui.affordance).toBe("pause");
    expect(playing.state.videoPaused).toBe(false);

    const paused = createHandoffPlayerHarness();
    paused.latch(snap({ currentTime: 20, wantsPlaying: false, generation: 1 }));
    expect(paused.state.ui.affordance).toBe("play");
    await paused.restore();
    expect(paused.state.ui.affordance).toBe("play");
    expect(paused.state.videoPaused).toBe(true);
  });

  it("13: Snapshot mute is preserved", async () => {
    const mutePlan = resolvePublishedVideoHandoffPlayMute({
      snapshotMuted: true,
      preferredMuted: false,
    });
    expect(mutePlan.initialMuted).toBe(true);
    expect(mutePlan.allowMutedRetry).toBe(false);

    const player = createHandoffPlayerHarness();
    player.latch(
      snap({ currentTime: 8, wantsPlaying: true, muted: true, generation: 1 }),
    );
    expect(player.state.ui.muted).toBe(true);
    await player.restore();
    expect(player.state.ui.muted).toBe(true);
  });

  it("14: AbortError does not create an infinite retry loop", async () => {
    expect(
      shouldRetryPublishedVideoPlayMuted({
        errorKind: "abort",
        allowMutedRetry: true,
        alreadyRetriedMuted: false,
        currentlyMuted: false,
        retryAbort: true,
      }),
    ).toBe(true);
    expect(
      shouldRetryPublishedVideoPlayMuted({
        errorKind: "abort",
        allowMutedRetry: true,
        alreadyRetriedMuted: true,
        currentlyMuted: false,
        retryAbort: true,
      }),
    ).toBe(false);

    const player = createHandoffPlayerHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 1 }));
    const result = await player.restore(async () => "aborted");
    expect(result.status).toBe("failed");
    expect(result.consume).toBe(true);
    expect(player.state.consumeCount).toBe(1);
    expect(player.state.ui.affordance).toBe("play");
  });

  it("15: Browser play rejection leaves usable controls", async () => {
    expect(classifyPublishedVideoPlayError({ name: "NotAllowedError" })).toBe(
      "not-allowed",
    );
    const player = createHandoffPlayerHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 1 }));
    const result = await player.restore(async () => "rejected");
    expect(result.status).toBe("failed");
    expect(player.state.ui.playing).toBe(false);
    expect(player.state.ui.playPending).toBe(false);
    expect(player.state.ui.affordance).toBe("play");
    expect(player.state.ui.currentTime).toBe(20);
  });

  it("16: Stale generations never restore into another video", async () => {
    const video = mockVideo({ currentTime: 0 });
    const result = await applyPublishedVideoHandoffRestore({
      video,
      snapshot: snap({
        mediaKey: "video:a",
        currentTime: 20,
        wantsPlaying: true,
        generation: 1,
      }),
      mediaKey: "video:b",
      signal: new AbortController().signal,
      ensureReady: async () => true,
      getUserPaused: () => false,
      getUserWantsPlay: () => true,
      play: async () => "played",
    });
    expect(result.status).toBe("superseded");
    expect(result.consume).toBe(false);
    expect(video.currentTime).toBe(0);

    const player = createHandoffPlayerHarness("video:a");
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 4 }));
    player.identityChange("video:b");
    expect(player.state.pending).toBeNull();
    expect(player.state.appliedGeneration).toBeNull();
  });
});

describe("PASS 3G — list ownership, scrub, gestures, mixed media", () => {
  it("17: Offscreen Feed/Profile never starts playing", () => {
    const offscreen = evaluatePublishedListVideoVisibilityPolicy({
      effectiveRatio: 0.1,
      dwellOk: false,
      visibilityOk: true,
      readyActiveVideo: true,
      userPaused: false,
      ownsPlayback: false,
      manualForce: false,
    });
    expect(offscreen.autoplayEligible).toBe(false);
    expect(offscreen.shouldOwnActive).toBe(false);
  });

  it("18: No simultaneous list and Detail playback", () => {
    let feedRevoked = false;
    requestPublishedListVideoOwnership({
      ownerId: "feed:post-1",
      onRevoke: () => {
        feedRevoked = true;
      },
    });
    requestPublishedListVideoOwnership({
      ownerId: "profile:post-1",
      onRevoke: () => {},
    });
    expect(feedRevoked).toBe(true);
    expect(getPublishedListVideoOwnerId()).toBe("profile:post-1");

    const hiddenUnderDetail = evaluatePublishedListVideoVisibilityPolicy({
      effectiveRatio: 0.95,
      dwellOk: true,
      visibilityOk: false,
      readyActiveVideo: true,
      userPaused: false,
      ownsPlayback: false,
      manualForce: false,
    });
    expect(hiddenUnderDetail.autoplayEligible).toBe(false);

    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("isActive={i === index && !fullscreenOpen}");
  });

  it("19: Scrubbing still preserves playback intent", () => {
    expect(
      resolvePublishedVideoSeekPlaybackAction({
        capturedWantsPlaying: true,
        userPaused: false,
        userWantsPlay: false,
        ended: false,
      }),
    ).toBe("play");
    expect(
      resolvePublishedVideoSeekPlaybackAction({
        capturedWantsPlaying: false,
        userPaused: true,
        userWantsPlay: false,
        ended: false,
      }),
    ).toBe("pause");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("captureScrubPlaybackIntent");
    expect(player).toContain("waitForPublishedVideoSeekSettled");
    expect(player).toContain("Seek must not latch as a deliberate user pause");
  });

  it("20: Pass 3C swipe-down still works", () => {
    expect(
      shouldClosePublishedFullscreenVerticalDismiss({
        isVerticalSwipe: true,
        diffY: 120,
      }),
    ).toBe(true);
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    const gestures = read(
      "src/lib/publishedMedia/publishedFullscreenGestures.ts",
    );
    expect(viewer).toContain("video-only-surface");
    expect(gestures).toContain("video-only-surface");
    expect(viewer).toContain("data-published-fullscreen-top-close");
  });

  it("21: Images and mixed carousels remain unchanged", () => {
    expect(
      consumePublishedVideoListToDetailHandoffIfEligible({
        postId: "post-1",
        items: mixedItems(),
        origin: "feed",
        sessionId: 1,
      }).attempted,
    ).toBe(false);
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("openFullscreenForImageTap");
    expect(carousel).toContain('item.kind !== "image"');
  });
});

describe("PASS 3G — wiring (restore until complete, no Feed fullscreen)", () => {
  it("player restore does not depend on playbackHandoff after latch", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("handoffEpoch");
    expect(player).toContain(
      "Do not depend on playbackHandoff — parent consume must not abort in-flight restore",
    );
    expect(player).toContain("fromHandoff: true");
    expect(player).toContain("shouldSuppressCompetingPlayDuringHandoff");
    expect(player).toContain("resolvePublishedVideoHandoffLatchUi");
  });

  it("Detail consumes list handoff on first render", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain(
      "consumePublishedVideoListToDetailHandoffIfEligible",
    );
    expect(carousel).toContain("useState<PublishedVideoPlaybackSnapshot | null>(() => {");
  });

  it("Feed expand routes to Detail with one-shot immersive fullscreen intent", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("onRequestMixedFullscreen={() => {");
    expect(surface).toContain("openImmersiveFullscreen: true");
    expect(surface).toContain("openDetailAt(item.key");
    expect(surface).not.toContain("PublishedMediaFullscreenViewer");
  });
});
