/**
 * PASS 3B — Detail ↔ fullscreen video playback continuity.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPublishedVideoCurrentTime,
  capturePublishedVideoPlaybackFromElement,
  clampPublishedVideoSeekTime,
  createPublishedVideoPlaybackSnapshot,
  isPublishedVideoPlaybackSnapshotForMedia,
  waitForPublishedVideoCanSeek,
} from "./publishedMedia/publishedVideoPlaybackSnapshot";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function mockVideo(partial: {
  currentTime?: number;
  paused?: boolean;
  ended?: boolean;
  duration?: number;
  readyState?: number;
  seekableStart?: number;
  seekableEnd?: number;
}): HTMLVideoElement {
  const seekableStart = partial.seekableStart ?? 0;
  const seekableEnd = partial.seekableEnd ?? partial.duration ?? 100;
  const hasSeekable = seekableEnd > seekableStart;
  const video = {
    currentTime: partial.currentTime ?? 0,
    paused: partial.paused ?? true,
    ended: partial.ended ?? false,
    duration: partial.duration ?? 100,
    readyState: partial.readyState ?? 1,
    seekable: hasSeekable
      ? {
          length: 1,
          start: () => seekableStart,
          end: () => seekableEnd,
        }
      : { length: 0, start: () => 0, end: () => 0 },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return video as unknown as HTMLVideoElement;
}

describe("PASS 3B — playback snapshot helpers", () => {
  it("1/2: paused vs playing intent captured", () => {
    const paused = capturePublishedVideoPlaybackFromElement({
      mediaKey: "video:a",
      video: mockVideo({ currentTime: 25, paused: true }),
      wantsPlaying: false,
      muted: false,
      generation: 1,
    });
    expect(paused?.wantsPlaying).toBe(false);
    expect(paused?.currentTime).toBe(25);

    const playing = capturePublishedVideoPlaybackFromElement({
      mediaKey: "video:a",
      video: mockVideo({ currentTime: 25, paused: false }),
      wantsPlaying: true,
      muted: true,
      generation: 2,
    });
    expect(playing?.wantsPlaying).toBe(true);
    expect(playing?.muted).toBe(true);
  });

  it("3: position transferred in snapshot", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 40.5,
      wantsPlaying: true,
      muted: false,
      generation: 3,
    });
    expect(snap?.currentTime).toBe(40.5);
  });

  it("7: mute preserved in snapshot both directions", () => {
    const muted = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 1,
      wantsPlaying: false,
      muted: true,
      generation: 1,
    });
    const unmuted = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 1,
      wantsPlaying: true,
      muted: false,
      generation: 2,
    });
    expect(muted?.muted).toBe(true);
    expect(unmuted?.muted).toBe(false);
  });

  it("10: HLS seek clamped to seekable range", () => {
    const video = mockVideo({
      seekableStart: 0,
      seekableEnd: 30,
      duration: 120,
    });
    expect(clampPublishedVideoSeekTime(video, 25)).toBe(25);
    expect(clampPublishedVideoSeekTime(video, 90)).toBe(30);
    expect(clampPublishedVideoSeekTime(video, -5)).toBe(0);
  });

  it("10b: applyPublishedVideoCurrentTime writes clamped time", () => {
    const video = mockVideo({
      currentTime: 0,
      seekableStart: 0,
      seekableEnd: 50,
    });
    const applied = applyPublishedVideoCurrentTime(video, 12);
    expect(applied).toBe(12);
    expect(video.currentTime).toBe(12);
  });

  it("12/13: mediaKey + generation reject stale / wrong media", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 10,
      wantsPlaying: true,
      muted: false,
      generation: 5,
    });
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:a")).toBe(
      true,
    );
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:b")).toBe(
      false,
    );
    expect(isPublishedVideoPlaybackSnapshotForMedia(null, "video:a")).toBe(
      false,
    );
    expect(snap?.generation).toBe(5);
  });

  it("9: waitForPublishedVideoCanSeek resolves when metadata ready", async () => {
    const video = mockVideo({ readyState: 1, seekableEnd: 10 });
    await expect(waitForPublishedVideoCanSeek(video)).resolves.toBe(true);
  });

  it("9b: waitForPublishedVideoCanSeek aborts", async () => {
    const video = mockVideo({
      readyState: 0,
      seekableStart: 0,
      seekableEnd: 0,
    });
    // Force empty seekable
    Object.defineProperty(video, "seekable", {
      value: { length: 0, start: () => 0, end: () => 0 },
    });
    Object.defineProperty(video, "readyState", { value: 0 });
    const ac = new AbortController();
    ac.abort();
    await expect(waitForPublishedVideoCanSeek(video, ac.signal)).resolves.toBe(
      false,
    );
  });
});

describe("PASS 3B — wiring (Detail ↔ fullscreen)", () => {
  it("1–6/8/14: player + carousel + viewer handoff wiring", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");

    expect(player).toContain("playbackHandoff");
    expect(player).toContain("registerPlaybackCapture");
    expect(player).toContain("applyPublishedVideoHandoffRestore");
    expect(player).toContain("handoffRestorePendingRef");
    expect(player).toContain("waitForPublishedVideoSeekSettled");
    // Autoplay must not override paused / pending handoff.
    expect(player).toContain(
      "handoffRestorePendingRef.current || pendingHandoffRef.current",
    );

    expect(carousel).toContain("detailPlaybackCaptureRef");
    expect(carousel).toContain("fullscreenEntryHandoff");
    expect(carousel).toContain("detailReturnHandoff");
    expect(carousel).toContain(
      "Capture Detail playback BEFORE isActive flips false",
    );
    expect(carousel).toContain("entryPlaybackHandoff={fullscreenEntryHandoff}");

    expect(viewer).toContain("entryPlaybackHandoff");
    expect(viewer).toContain("fsPlaybackCaptureRef");
    expect(viewer).toContain("Capture FS playback before unmount");
    expect(viewer).toContain("onCloseRef.current(");
  });

  it("14: Detail inactive while fullscreen open (no dual playback)", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("isActive={i === index && !fullscreenOpen}");
  });

  it("15: image fullscreen path unchanged (no required video handoff)", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("openFullscreenForImageTap");
    expect(carousel).toContain('item.kind !== "image"');
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    // Gestures: video-only dismiss (3C); mixed video still gated.
    expect(viewer).toContain("data-lightbox-close");
    expect(viewer).toContain("activeSlideIsVideo() && !videoOnly");
  });

  it("11: failed play handled in handoff restore path", () => {
    const restore = read(
      "src/lib/publishedMedia/publishedVideoHandoffRestore.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(restore).toContain('return fail("failed"');
    expect(player).toContain("fromHandoff: true");
    expect(player).toContain("setLocalUserPaused(true)");
  });
});
