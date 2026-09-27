/**
 * PASS 3D — scrub seek resume + Detail↔Fullscreen seek-settled handoff.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPublishedVideoCurrentTime,
  createPublishedVideoPlaybackSnapshot,
  isPublishedVideoPlaybackSnapshotForMedia,
  resolvePublishedVideoSeekPlaybackAction,
  waitForPublishedVideoSeekSettled,
} from "./publishedMedia/publishedVideoPlaybackSnapshot";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

type MockVideoOpts = {
  currentTime?: number;
  paused?: boolean;
  ended?: boolean;
  duration?: number;
  seeking?: boolean;
  readyState?: number;
  seekableStart?: number;
  seekableEnd?: number;
  /** When true, setting currentTime flips seeking and requires seeked dispatch. */
  asyncSeek?: boolean;
};

function mockVideo(partial: MockVideoOpts = {}): HTMLVideoElement & {
  __emit: (type: string) => void;
} {
  const listeners = new Map<string, Set<() => void>>();
  let currentTime = partial.currentTime ?? 0;
  let seeking = partial.seeking ?? false;
  const seekableStart = partial.seekableStart ?? 0;
  const seekableEnd = partial.seekableEnd ?? partial.duration ?? 100;
  const asyncSeek = partial.asyncSeek ?? false;

  const video = {
    paused: partial.paused ?? true,
    ended: partial.ended ?? false,
    duration: partial.duration ?? 100,
    readyState: partial.readyState ?? 1,
    seekable: {
      length: 1,
      start: () => seekableStart,
      end: () => seekableEnd,
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(v: number) {
      currentTime = v;
      if (asyncSeek) {
        seeking = true;
      }
    },
    get seeking() {
      return seeking;
    },
    set seeking(v: boolean) {
      seeking = v;
    },
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    __emit: (type: string) => {
      if (type === "seeked") seeking = false;
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
  return video as unknown as HTMLVideoElement & { __emit: (type: string) => void };
}

describe("PASS 3D — seek playback intent", () => {
  it("A: playing scrub intent → play", () => {
    expect(
      resolvePublishedVideoSeekPlaybackAction({
        capturedWantsPlaying: true,
        userPaused: false,
        userWantsPlay: true,
        ended: false,
      }),
    ).toBe("play");
  });

  it("B: paused scrub intent → pause", () => {
    expect(
      resolvePublishedVideoSeekPlaybackAction({
        capturedWantsPlaying: false,
        userPaused: false,
        userWantsPlay: false,
        ended: false,
      }),
    ).toBe("pause");
  });

  it("N: deliberate user pause wins over captured playing", () => {
    expect(
      resolvePublishedVideoSeekPlaybackAction({
        capturedWantsPlaying: true,
        userPaused: true,
        userWantsPlay: false,
        ended: false,
      }),
    ).toBe("pause");
  });

  it("F: ended media → pause (no restart via play)", () => {
    expect(
      resolvePublishedVideoSeekPlaybackAction({
        capturedWantsPlaying: true,
        userPaused: false,
        userWantsPlay: true,
        ended: true,
      }),
    ).toBe("pause");
  });
});

describe("PASS 3D — waitForPublishedVideoSeekSettled", () => {
  it("C: seek to current position settles without hanging", async () => {
    const video = mockVideo({ currentTime: 20, seeking: false });
    const result = await waitForPublishedVideoSeekSettled(video, 20);
    expect(result.ok).toBe(true);
    expect(result.appliedTime).toBe(20);
  });

  it("M: position applied before settle resolves", async () => {
    const video = mockVideo({ currentTime: 5, asyncSeek: true });
    const pending = waitForPublishedVideoSeekSettled(video, 40);
    expect(video.currentTime).toBe(40);
    expect(video.seeking).toBe(true);
    queueMicrotask(() => video.__emit("seeked"));
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.appliedTime).toBe(40);
    expect(video.seeking).toBe(false);
  });

  it("D: rapid seeks — abort leaves only latest listener path", async () => {
    const video = mockVideo({ currentTime: 0, asyncSeek: true });
    const ac1 = new AbortController();
    const first = waitForPublishedVideoSeekSettled(video, 10, ac1.signal);
    ac1.abort();
    await expect(first).resolves.toEqual({ ok: false, appliedTime: 10 });

    const second = waitForPublishedVideoSeekSettled(video, 30);
    queueMicrotask(() => video.__emit("seeked"));
    await expect(second).resolves.toEqual({ ok: true, appliedTime: 30 });
    expect(video.currentTime).toBe(30);
  });

  it("E: abort during seek cancels safely", async () => {
    const video = mockVideo({ currentTime: 0, asyncSeek: true });
    const ac = new AbortController();
    const pending = waitForPublishedVideoSeekSettled(video, 15, ac.signal);
    ac.abort();
    await expect(pending).resolves.toEqual({ ok: false, appliedTime: 15 });
  });

  it("G: clamp keeps wrong-range seeks in bounds (stale media protection via key is separate)", () => {
    const video = mockVideo({
      currentTime: 0,
      seekableStart: 0,
      seekableEnd: 50,
      duration: 120,
    });
    expect(applyPublishedVideoCurrentTime(video, 90)).toBe(50);
  });

  it("already-aborted signal does not wait for seeked", async () => {
    const video = mockVideo({ currentTime: 0, asyncSeek: true });
    const ac = new AbortController();
    ac.abort();
    await expect(
      waitForPublishedVideoSeekSettled(video, 8, ac.signal),
    ).resolves.toEqual({ ok: false, appliedTime: 8 });
  });
});

describe("PASS 3D — handoff snapshot still authoritative", () => {
  it("I/J: wantsPlaying true vs false preserved", () => {
    const playing = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 20,
      wantsPlaying: true,
      muted: false,
      generation: 1,
    });
    const paused = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 20,
      wantsPlaying: false,
      muted: true,
      generation: 2,
    });
    expect(playing?.wantsPlaying).toBe(true);
    expect(paused?.wantsPlaying).toBe(false);
    expect(paused?.muted).toBe(true);
  });

  it("G/O: wrong mediaKey / generation rejected", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 40,
      wantsPlaying: true,
      muted: false,
      generation: 7,
    });
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:b")).toBe(
      false,
    );
    expect(snap?.generation).toBe(7);
  });

  it("P: mute field preserved", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:x",
      currentTime: 1,
      wantsPlaying: true,
      muted: true,
      generation: 1,
    });
    expect(snap?.muted).toBe(true);
  });
});

describe("PASS 3D — player wiring", () => {
  it("scrub captures intent and restores after seek settle", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("captureScrubPlaybackIntent");
    expect(player).toContain("scrubWantsPlayingRef");
    expect(player).toContain("scrubSeekGenerationRef");
    expect(player).toContain("waitForPublishedVideoSeekSettled");
    expect(player).toContain("resolvePublishedVideoSeekPlaybackAction");
    expect(player).toContain("commitScrubSeekToFraction");
    // Must not latch seek as manual pause.
    expect(player).toContain(
      "Seek must not latch as a deliberate user pause",
    );
  });

  it("handoff seeks settle before play; paused path skips play", () => {
    const restore = read(
      "src/lib/publishedMedia/publishedVideoHandoffRestore.ts",
    );
    const settleIdx = restore.indexOf("waitForPublishedVideoSeekSettled");
    const playIdx = restore.indexOf("await options.play()");
    expect(settleIdx).toBeGreaterThan(-1);
    expect(playIdx).toBeGreaterThan(settleIdx);
    expect(restore).toContain('action === "pause"');
    expect(restore).toContain("options.video.ended");
  });

  it("H: failed play is single-attempt (no retry loop on scrub/handoff)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const restore = read(
      "src/lib/publishedMedia/publishedVideoHandoffRestore.ts",
    );
    expect(player).toContain("single attempt — no retry loop");
    expect(restore).toContain("Never loops");
    expect(player).toContain("fromHandoff: true");
  });

  it("Q/R: Pass 3C scrubber exclusions + dismiss wiring unchanged", () => {
    const gestures = read(
      "src/lib/publishedMedia/publishedFullscreenGestures.ts",
    );
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    const surface = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(gestures).toContain("video-only-surface");
    expect(viewer).toContain("video-only-surface");
    expect(surface).toContain("data-video-scrubber");
    expect(surface).toContain("pathHitsControl");
    expect(player).toContain("data-video-scrubber");
    expect(player).toContain("setPointerCapture");
  });

  it("S: Feed list visibility policy entrypoints unchanged", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("detailRouteOpen");
    expect(surface).toContain("evaluatePublishedListVideoVisibilityPolicy");
    // Pass 3E adds Feed return playbackHandoff; seek-settle stays in the player.
    expect(surface).not.toContain("waitForPublishedVideoSeekSettled");
  });
});

describe("PASS 3D — no fake timers in settle helper", () => {
  it("does not use setTimeout", () => {
    const src = read(
      "src/lib/publishedMedia/publishedVideoPlaybackSnapshot.ts",
    );
    const settleBlock = src.slice(
      src.indexOf("waitForPublishedVideoSeekSettled"),
    );
    expect(settleBlock).not.toContain("setTimeout");
    expect(settleBlock).not.toMatch(/\bsetInterval\b/);
  });

  it("vi fake timers unused by settle (microtask path)", async () => {
    vi.useRealTimers();
    const video = mockVideo({ currentTime: 1 });
    await expect(waitForPublishedVideoSeekSettled(video, 1)).resolves.toEqual({
      ok: true,
      appliedTime: 1,
    });
  });
});
