/**
 * PASS 3H — playback lifecycle recovery (teardown identity, restore abort, manual play).
 * Executable harness — not source-string assertions.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  abandonPublishedVideoHandoffForManualPlay,
  applyPublishedVideoHandoffRestore,
  createPublishedVideoPlaybackSnapshot,
  resolveHandoffRestoreAbortDisposition,
  shouldCommitDeferredPlaybackTeardown,
  shouldSuppressCompetingPlayDuringHandoff,
  shouldTearDownIdlePublishedVideo,
  __resetPublishedListVideoCoordinatorForTests,
} from "./publishedMedia";
import type { PublishedVideoPlaybackSnapshot } from "./publishedMedia/publishedVideoPlaybackSnapshot";

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

function mockVideo(partial: {
  currentTime?: number;
  paused?: boolean;
  src?: string | null;
}): HTMLVideoElement & { srcAttr: string | null } {
  const video = {
    currentTime: partial.currentTime ?? 0,
    paused: partial.paused ?? true,
    ended: false,
    duration: 100,
    readyState: 4,
    muted: false,
    seeking: false,
    srcAttr: (partial.src ?? "hls://clip") as string | null,
    currentSrc: partial.src ?? "hls://clip",
    seekable: {
      length: 1,
      start: () => 0,
      end: () => 100,
    },
    getAttribute: (name: string) =>
      name === "src" ? video.srcAttr : null,
    removeAttribute: (name: string) => {
      if (name === "src") {
        video.srcAttr = null;
        video.currentSrc = "";
        video.currentTime = 0;
      }
    },
    load: () => {},
    pause: () => {
      video.paused = true;
    },
    play: () => {
      video.paused = false;
      return Promise.resolve();
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return video as unknown as HTMLVideoElement & { srcAttr: string | null };
}

/**
 * Mirrors Pass 3H player: deferred unmount teardown, restore sessions,
 * abort keeps pending, explicit Play abandons a stuck handoff.
 */
function createLifecycleHarness() {
  const video = mockVideo({ currentTime: 20, src: "hls://clip" });
  let mounted = false;
  let restoreSession = 0;
  let pending: PublishedVideoPlaybackSnapshot | null = null;
  let restorePending = false;
  let appliedGeneration: number | null = null;
  let userPaused = false;
  let userWantsPlay = false;
  let playAttempts = 0;
  let consumeCount = 0;
  const appliedBySession: number[] = [];

  const tearDown = () => {
    video.removeAttribute("src");
    video.pause();
  };

  const runDeferredUnmountCleanup = () => {
    mounted = false;
    const stillMountedAtSchedule = () => mounted;
    return {
      remount: () => {
        mounted = true;
      },
      flush: () => {
        if (
          shouldCommitDeferredPlaybackTeardown({
            stillMounted: stillMountedAtSchedule(),
          })
        ) {
          tearDown();
        }
      },
    };
  };

  const latch = (snapshot: PublishedVideoPlaybackSnapshot) => {
    pending = snapshot;
    restorePending = true;
    userPaused = !snapshot.wantsPlaying;
    userWantsPlay = snapshot.wantsPlaying;
  };

  const startRestore = (ac: AbortController) => {
    const session = ++restoreSession;
    const snapshot = pending;
    return {
      session,
      run: async () => {
        if (!snapshot) return null;
        const result = await applyPublishedVideoHandoffRestore({
          video,
          snapshot,
          mediaKey: snapshot.mediaKey,
          signal: ac.signal,
          ensureReady: async () => Boolean(video.getAttribute("src")),
          getUserPaused: () => userPaused,
          getUserWantsPlay: () => userWantsPlay,
          play: async () => {
            if (session !== restoreSession) return "aborted";
            playAttempts += 1;
            (video as { paused: boolean }).paused = false;
            return "played";
          },
        });
        if (session !== restoreSession) {
          return { ...result, disposition: "ignore-stale" as const };
        }
        if (ac.signal.aborted || result.status === "aborted") {
          const disposition = resolveHandoffRestoreAbortDisposition({
            restoreSession: session,
            currentSession: restoreSession,
          });
          return { ...result, disposition };
        }
        if (result.consume) {
          appliedGeneration = result.generation;
          pending = null;
          restorePending = false;
          consumeCount += 1;
          appliedBySession.push(session);
        }
        return { ...result, disposition: "applied" as const };
      },
      abort: () => {
        if (restoreSession === session) restoreSession += 1;
        ac.abort();
      },
    };
  };

  const competingPlay = (explicitManualPlay = false) => {
    if (
      shouldSuppressCompetingPlayDuringHandoff({
        restorePending,
        hasPendingHandoff: Boolean(pending),
        explicitManualPlay,
      })
    ) {
      return "skipped" as const;
    }
    playAttempts += 1;
    (video as { paused: boolean }).paused = false;
    return "played" as const;
  };

  const explicitPlay = () => {
    const abandon = abandonPublishedVideoHandoffForManualPlay({
      pendingGeneration: pending?.generation ?? null,
      restorePending,
      hasPendingHandoff: Boolean(pending),
    });
    if (abandon.abandon) {
      restoreSession += 1;
      if (abandon.appliedGeneration != null) {
        appliedGeneration = abandon.appliedGeneration;
        consumeCount += 1;
      }
      pending = null;
      restorePending = false;
      userPaused = false;
      userWantsPlay = true;
    }
    return competingPlay(true);
  };

  return {
    video,
    mount: () => {
      mounted = true;
    },
    runDeferredUnmountCleanup,
    tearDown,
    latch,
    startRestore,
    competingPlay,
    explicitPlay,
    goIdle: () => {
      const idle = shouldTearDownIdlePublishedVideo({
        isActive: false,
        isWarm: false,
      });
      if (idle) tearDown();
      return idle;
    },
    get state() {
      return {
        src: video.getAttribute("src"),
        paused: video.paused,
        restorePending,
        pending,
        appliedGeneration,
        playAttempts,
        consumeCount,
        appliedBySession,
        userPaused,
        restoreSession,
      };
    },
  };
}

describe("PASS 3H — playback lifecycle recovery", () => {
  beforeEach(() => {
    __resetPublishedListVideoCoordinatorForTests();
  });

  it("A: callback identity changes must not destroy an active player's media source", () => {
    const player = createLifecycleHarness();
    player.mount();
    expect(player.state.src).toBe("hls://clip");

    // Recreating tearDownPlayback (isActive identity) must not run unmount cleanup.
    const unusedNextTearDown = () => {
      player.tearDown();
    };
    void unusedNextTearDown;
    expect(player.state.src).toBe("hls://clip");
    expect(player.state.paused).toBe(true);

    expect(
      shouldCommitDeferredPlaybackTeardown({ stillMounted: true }),
    ).toBe(false);
  });

  it("B: Strict Mode setup/cleanup/replay must not leave restoration permanently pending", async () => {
    const player = createLifecycleHarness();
    player.mount();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 7 }));

    const first = player.startRestore(new AbortController());
    const firstDone = first.run();
    first.abort();
    const aborted = await firstDone;
    expect(aborted?.status).toBe("aborted");
    expect(aborted?.disposition).toBe("ignore-stale");
    expect(player.state.restorePending).toBe(true);
    expect(player.state.userPaused).toBe(false);

    const replay = player.startRestore(new AbortController());
    const replayed = await replay.run();
    expect(replayed?.status).toBe("played");
    expect(replayed?.disposition).toBe("applied");
    expect(player.state.restorePending).toBe(false);
    expect(player.state.appliedGeneration).toBe(7);
    expect(player.video.paused).toBe(false);

    const strict = player.runDeferredUnmountCleanup();
    strict.remount();
    strict.flush();
    expect(player.state.src).toBe("hls://clip");
  });

  it("C: aborted restoration must not permanently suppress legitimate manual playback", async () => {
    const player = createLifecycleHarness();
    player.mount();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 3 }));

    const first = player.startRestore(new AbortController());
    const firstDone = first.run();
    first.abort();
    await firstDone;

    expect(player.competingPlay(false)).toBe("skipped");
    expect(player.video.paused).toBe(true);

    const manual = player.explicitPlay();
    expect(manual).toBe("played");
    expect(player.video.paused).toBe(false);
    expect(player.state.restorePending).toBe(false);
    expect(player.state.userPaused).toBe(false);
  });

  it("D: old restoration attempts must not override newer generations", async () => {
    const player = createLifecycleHarness();
    player.mount();
    player.latch(snap({ currentTime: 8, wantsPlaying: true, generation: 1 }));
    const stale = player.startRestore(new AbortController());
    const staleDone = stale.run();

    player.latch(snap({ currentTime: 22, wantsPlaying: true, generation: 2 }));
    const fresh = player.startRestore(new AbortController());
    stale.abort();
    const staleResult = await staleDone;
    const freshResult = await fresh.run();

    expect(staleResult?.disposition).toBe("ignore-stale");
    expect(freshResult?.status).toBe("played");
    expect(player.state.appliedGeneration).toBe(2);
    expect(player.state.appliedBySession).toEqual([fresh.session]);
    expect(player.state.consumeCount).toBe(1);
  });

  it("E: genuine inactivity/unmount still releases playback resources", () => {
    const player = createLifecycleHarness();
    player.mount();
    expect(player.state.src).toBe("hls://clip");

    expect(player.goIdle()).toBe(true);
    expect(player.state.src).toBeNull();

    const active = createLifecycleHarness();
    active.mount();
    const unmount = active.runDeferredUnmountCleanup();
    unmount.flush();
    expect(active.state.src).toBeNull();
  });

  it("explicit manual play is not suppressed by a pending handoff", () => {
    expect(
      shouldSuppressCompetingPlayDuringHandoff({
        restorePending: true,
        hasPendingHandoff: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressCompetingPlayDuringHandoff({
        restorePending: true,
        hasPendingHandoff: true,
        explicitManualPlay: true,
      }),
    ).toBe(false);
  });

  it("restore-start logs snapshot and element times separately", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const video = mockVideo({ currentTime: 0, src: "hls://clip" });
    const snapshot = snap({ currentTime: 20, wantsPlaying: true, generation: 1 });
    const result = await applyPublishedVideoHandoffRestore({
      video,
      snapshot,
      mediaKey: snapshot.mediaKey,
      signal: new AbortController().signal,
      ensureReady: async () => true,
      getUserPaused: () => false,
      getUserWantsPlay: () => true,
      play: async () => {
        (video as { paused: boolean }).paused = false;
        return "played";
      },
    });
    expect(result.status).toBe("played");
    const start = info.mock.calls
      .map((call) => call[1] as { event?: string; snapshotCurrentTime?: number; elementCurrentTime?: number })
      .find((payload) => payload?.event === "handoff-restore-start");
    expect(start?.snapshotCurrentTime).toBe(20);
    expect(start?.elementCurrentTime).toBe(0);
    info.mockRestore();
  });
});
