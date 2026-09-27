/**
 * PASS 3I — black-screen recovery (visual seek lock vs playback abandon).
 * Executable harness — not source-string assertions.
 */
import { describe, expect, it } from "vitest";
import {
  abandonPublishedVideoHandoffForManualPlay,
  applyPublishedVideoHandoffRestore,
  createPublishedVideoPlaybackSnapshot,
  nextHandoffVisualSeekLock,
  resolveHandoffRestoreAbortDisposition,
  resolvePublishedVideoShowVideoFrame,
  shouldCommitHandoffRestoreVisualState,
  shouldHideVideoFrameUntilHandoffSeek,
  shouldSuppressCompetingPlayDuringHandoff,
} from "./publishedMedia";
import type { HandoffVisualSeekLockState } from "./publishedMedia";
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
}): HTMLVideoElement {
  const listeners = new Map<string, Set<() => void>>();
  const video = {
    currentTime: partial.currentTime ?? 0,
    paused: partial.paused ?? true,
    ended: false,
    duration: 100,
    readyState: 4,
    muted: false,
    seeking: false,
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
      (video as { paused: boolean }).paused = false;
      return Promise.resolve();
    },
  };
  return video as unknown as HTMLVideoElement;
}

type FramePaint = {
  showVideoFrame: boolean;
  hideUntilSeek: boolean;
  opacity: "0" | "100";
};

/**
 * Mirrors Pass 3I player: playback pending and visual seek lock stay coupled,
 * and only the live restore session may mutate them.
 */
function createVisualHandoffHarness() {
  const video = mockVideo({ currentTime: 0, paused: true });
  let pending: PublishedVideoPlaybackSnapshot | null = null;
  let restorePending = false;
  let seekSettled = true;
  let restoreSession = 0;
  let appliedGeneration: number | null = null;
  let mediaReady = false;
  let currentTime = 0;
  let playing = false;
  let userPaused = false;
  let userWantsPlay = false;

  const visual = (): HandoffVisualSeekLockState => ({
    restorePending,
    seekSettled,
  });

  const commitVisual = (
    event: Parameters<typeof nextHandoffVisualSeekLock>[1],
  ) => {
    const next = nextHandoffVisualSeekLock(visual(), event);
    restorePending = next.restorePending;
    seekSettled = next.seekSettled;
  };

  const paint = (): FramePaint => {
    const showVideoFrame = resolvePublishedVideoShowVideoFrame({
      mediaReady,
      isWarm: false,
      status: "ready",
      restorePending,
      seekSettled,
      displayTime: currentTime,
    });
    const hideUntilSeek = shouldHideVideoFrameUntilHandoffSeek({
      restorePending,
      seekSettled,
      displayTime: currentTime,
    });
    return {
      showVideoFrame,
      hideUntilSeek,
      opacity: showVideoFrame ? "100" : "0",
    };
  };

  const latch = (snapshot: PublishedVideoPlaybackSnapshot) => {
    if (appliedGeneration === snapshot.generation) return;
    pending = snapshot;
    currentTime = snapshot.currentTime;
    userPaused = !snapshot.wantsPlaying;
    userWantsPlay = snapshot.wantsPlaying;
    playing = false;
    commitVisual("latch");
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
          ensureReady: async () => {
            mediaReady = true;
            return true;
          },
          getUserPaused: () => userPaused,
          getUserWantsPlay: () => userWantsPlay,
          onSeekSettled: (appliedTime) => {
            if (
              !shouldCommitHandoffRestoreVisualState({
                restoreSession: session,
                currentSession: restoreSession,
              })
            ) {
              commitVisual("stale-restore");
              return;
            }
            currentTime = appliedTime;
            commitVisual("seek-settled");
          },
          play: async () => {
            if (
              !shouldCommitHandoffRestoreVisualState({
                restoreSession: session,
                currentSession: restoreSession,
              })
            ) {
              return "aborted";
            }
            if (!pending || pending.generation !== snapshot.generation) {
              return "aborted";
            }
            (video as { paused: boolean }).paused = false;
            return "played";
          },
        });
        if (
          !shouldCommitHandoffRestoreVisualState({
            restoreSession: session,
            currentSession: restoreSession,
          })
        ) {
          commitVisual("stale-restore");
          return { ...result, disposition: "ignore-stale" as const };
        }
        if (ac.signal.aborted || result.status === "aborted") {
          const disposition = resolveHandoffRestoreAbortDisposition({
            restoreSession: session,
            currentSession: restoreSession,
          });
          commitVisual("restore-abort-keep-pending");
          return { ...result, disposition };
        }
        commitVisual("restore-terminal");
        appliedGeneration = result.generation;
        pending = null;
        if (result.status === "played") {
          playing = true;
          userPaused = false;
          userWantsPlay = true;
        } else if (result.status === "paused") {
          playing = false;
          userPaused = true;
          userWantsPlay = false;
          (video as { paused: boolean }).paused = true;
        }
        return { ...result, disposition: "applied" as const };
      },
      abort: () => {
        if (restoreSession === session) restoreSession += 1;
        ac.abort();
      },
    };
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
      }
      pending = null;
      if (abandon.releaseVisualSeekLock) {
        commitVisual("abandon-manual-play");
      }
      userPaused = false;
      userWantsPlay = true;
    }
    if (
      shouldSuppressCompetingPlayDuringHandoff({
        restorePending,
        hasPendingHandoff: Boolean(pending),
        explicitManualPlay: true,
      })
    ) {
      return "skipped" as const;
    }
    mediaReady = true;
    playing = true;
    (video as { paused: boolean }).paused = false;
    return "played" as const;
  };

  const staleVisualCommit = (
    session: number,
    event: Parameters<typeof nextHandoffVisualSeekLock>[1],
  ) => {
    if (
      shouldCommitHandoffRestoreVisualState({
        restoreSession: session,
        currentSession: restoreSession,
      })
    ) {
      commitVisual(event);
      return true;
    }
    commitVisual("stale-restore");
    return false;
  };

  return {
    video,
    latch,
    startRestore,
    explicitPlay,
    staleVisualCommit,
    paint,
    markMediaReady: () => {
      mediaReady = true;
    },
    get state() {
      return {
        ...paint(),
        restorePending,
        seekSettled,
        currentTime,
        playing,
        userPaused,
        mediaReady,
        appliedGeneration,
        restoreSession,
        videoPaused: video.paused,
      };
    },
  };
}

describe("PASS 3I — black-screen recovery", () => {
  it("A: aborted handoff → explicit Play releases the visual seek lock", async () => {
    const player = createVisualHandoffHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 4 }));
    player.markMediaReady();
    expect(player.state.opacity).toBe("0");
    expect(player.state.hideUntilSeek).toBe(true);

    const first = player.startRestore(new AbortController());
    const firstDone = first.run();
    first.abort();
    await firstDone;

    expect(player.state.restorePending).toBe(true);
    expect(player.state.seekSettled).toBe(false);
    expect(player.state.opacity).toBe("0");

    expect(player.explicitPlay()).toBe("played");
    expect(player.state.restorePending).toBe(false);
    expect(player.state.seekSettled).toBe(true);
    expect(player.state.hideUntilSeek).toBe(false);
    expect(player.state.opacity).toBe("100");
  });

  it("B: recovered manual playback becomes visible (audio path can paint)", async () => {
    const player = createVisualHandoffHarness();
    player.latch(snap({ currentTime: 18.5, wantsPlaying: true, generation: 2 }));
    const restore = player.startRestore(new AbortController());
    const pending = restore.run();
    restore.abort();
    await pending;

    expect(player.explicitPlay()).toBe("played");
    expect(player.state.videoPaused).toBe(false);
    expect(player.state.playing).toBe(true);
    expect(player.state.showVideoFrame).toBe(true);
    expect(player.state.opacity).toBe("100");
  });

  it("C: legitimate pending seek still hides the incorrect initial frame", () => {
    const player = createVisualHandoffHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 1 }));
    player.markMediaReady();
    expect(player.state.currentTime).toBe(20);
    expect(player.state.seekSettled).toBe(false);
    expect(player.state.restorePending).toBe(true);
    expect(player.state.hideUntilSeek).toBe(true);
    expect(player.state.showVideoFrame).toBe(false);
    expect(player.state.opacity).toBe("0");
  });

  it("D: stale restore cannot re-hide a recovered player", async () => {
    const player = createVisualHandoffHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 8 }));
    const stale = player.startRestore(new AbortController());
    const staleDone = stale.run();
    stale.abort();
    await staleDone;

    const staleSession = stale.session;
    expect(player.explicitPlay()).toBe("played");
    expect(player.state.opacity).toBe("100");

    expect(player.staleVisualCommit(staleSession, "latch")).toBe(false);
    expect(player.state.opacity).toBe("100");
    expect(player.state.seekSettled).toBe(true);
    expect(player.state.restorePending).toBe(false);

    expect(player.staleVisualCommit(staleSession, "restore-abort-keep-pending")).toBe(
      false,
    );
    expect(player.state.opacity).toBe("100");
  });

  it("E: paused intent remains paused after restore", async () => {
    const player = createVisualHandoffHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: false, generation: 5 }));
    const result = await player.startRestore(new AbortController()).run();
    expect(result?.status).toBe("paused");
    expect(player.state.playing).toBe(false);
    expect(player.state.userPaused).toBe(true);
    expect(player.state.videoPaused).toBe(true);
    expect(player.state.currentTime).toBe(20);
    expect(player.state.showVideoFrame).toBe(true);
  });

  it("F: successful restore reveals the correct settled frame", async () => {
    const player = createVisualHandoffHarness();
    player.latch(snap({ currentTime: 20, wantsPlaying: true, generation: 6 }));
    player.markMediaReady();
    expect(player.state.opacity).toBe("0");

    const result = await player.startRestore(new AbortController()).run();
    expect(result?.status).toBe("played");
    expect(player.state.currentTime).toBe(20);
    expect(player.state.playing).toBe(true);
    expect(player.state.videoPaused).toBe(false);
    expect(player.state.restorePending).toBe(false);
    expect(player.state.seekSettled).toBe(true);
    expect(player.state.showVideoFrame).toBe(true);
    expect(player.state.opacity).toBe("100");
  });

  it("unreadiness still hides the element even after visual-lock release", () => {
    expect(
      resolvePublishedVideoShowVideoFrame({
        mediaReady: false,
        isWarm: false,
        status: "ready",
        restorePending: false,
        seekSettled: true,
        displayTime: 20,
      }),
    ).toBe(false);
    expect(
      resolvePublishedVideoShowVideoFrame({
        mediaReady: true,
        isWarm: true,
        status: "ready",
        restorePending: false,
        seekSettled: true,
        displayTime: 20,
      }),
    ).toBe(false);
  });
});
