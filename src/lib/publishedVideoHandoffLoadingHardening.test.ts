/**
 * Feed↔Detail handoff capture miss + truthful loading during restore.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetPublishedVideoFeedDetailHandoffForTests,
  capturePublishedVideoListToDetailHandoff,
  consumePublishedVideoListToDetailHandoffIfEligible,
  createPublishedVideoPlaybackSnapshot,
  isPublishedVideoPlaybackSnapshotForMedia,
  peekPublishedVideoFeedDetailHandoff,
  resolvePublishedVideoAwaitingFirstFrame,
  resolveVideoPlaybackLoadingVisible,
  writePublishedVideoListReturnHandoff,
} from "./publishedMedia";
import type { PublishedMediaItem } from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function videoOnlyItems(): PublishedMediaItem[] {
  return [
    {
      key: "video:a",
      kind: "video",
      videoId: "bunny-a",
      status: "ready",
      posterUrl: null,
      width: null,
      height: null,
      durationSec: null,
      mediaId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    },
  ];
}

describe("Feed↔Detail handoff capture contract", () => {
  beforeEach(() => {
    __resetPublishedVideoFeedDetailHandoffForTests();
  });

  it("A: Feed playing at T → successful capture → Detail receives ~T", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "feed",
      items: videoOnlyItems(),
      capture: (generation) =>
        createPublishedVideoPlaybackSnapshot({
          mediaKey: "video:a",
          currentTime: 17.25,
          wantsPlaying: true,
          muted: true,
          generation,
        }),
    });
    expect(captured?.wrote).toBe(true);
    const hit = consumePublishedVideoListToDetailHandoffIfEligible({
      postId: "post-1",
      items: videoOnlyItems(),
      origin: "feed",
      sessionId: captured!.sessionId,
    });
    expect(hit.snapshot?.currentTime).toBe(17.25);
    expect(hit.snapshot?.wantsPlaying).toBe(true);
  });

  it("B/C: paused + mute transfer", () => {
    const captured = capturePublishedVideoListToDetailHandoff({
      postId: "post-1",
      origin: "feed",
      items: videoOnlyItems(),
      capture: (generation) =>
        createPublishedVideoPlaybackSnapshot({
          mediaKey: "video:a",
          currentTime: 9,
          wantsPlaying: false,
          muted: false,
          generation,
        }),
    });
    expect(captured?.wrote).toBe(true);
    const hit = consumePublishedVideoListToDetailHandoffIfEligible({
      postId: "post-1",
      items: videoOnlyItems(),
      origin: "feed",
      sessionId: captured!.sessionId,
    });
    expect(hit.snapshot?.currentTime).toBe(9);
    expect(hit.snapshot?.wantsPlaying).toBe(false);
    expect(hit.snapshot?.muted).toBe(false);
  });

  it("D: capture miss → null; Post must not pass fake session", () => {
    expect(
      capturePublishedVideoListToDetailHandoff({
        postId: "post-1",
        origin: "feed",
        items: videoOnlyItems(),
        capture: () => null,
      }),
    ).toBeNull();
    const post = read("src/components/Post.tsx");
    expect(post).toContain("captured?.wrote === true");
    expect(post).not.toMatch(
      /if \(captured\) \{\s*listPlaybackOrigin/,
    );
  });

  it("E: stale snapshot cannot restore different mediaKey", () => {
    const snap = createPublishedVideoPlaybackSnapshot({
      mediaKey: "video:a",
      currentTime: 4,
      wantsPlaying: true,
      muted: true,
      generation: 1,
    });
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:a")).toBe(
      true,
    );
    expect(isPublishedVideoPlaybackSnapshotForMedia(snap, "video:z")).toBe(
      false,
    );
  });

  it("F: Detail→Feed return restores latest Detail time", () => {
    expect(
      writePublishedVideoListReturnHandoff({
        postId: "post-1",
        origin: "feed",
        sessionId: 3,
        snapshot: createPublishedVideoPlaybackSnapshot({
          mediaKey: "video:a",
          currentTime: 41.5,
          wantsPlaying: true,
          muted: true,
          generation: 3,
        }),
      }),
    ).toBe(true);
    expect(
      peekPublishedVideoFeedDetailHandoff({
        postId: "post-1",
        mediaKey: "video:a",
        direction: "to-feed",
        origin: "feed",
      })?.currentTime,
    ).toBe(41.5);
  });

  it("S: mixed-media continuity remains deferred", () => {
    const mixed: PublishedMediaItem[] = [
      {
        key: "image:1",
        kind: "image",
        url: "https://cdn/a.jpg",
      },
      ...videoOnlyItems(),
    ];
    expect(
      capturePublishedVideoListToDetailHandoff({
        postId: "post-1",
        origin: "feed",
        items: mixed,
        capture: (g) =>
          createPublishedVideoPlaybackSnapshot({
            mediaKey: "video:a",
            currentTime: 1,
            wantsPlaying: true,
            muted: true,
            generation: g,
          }),
      }),
    ).toBeNull();
  });

  it("capture registration is stable (no timeupdate churn)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("currentTimeForCaptureRef");
    expect(player).toContain("mediaKeyForCaptureRef");
    expect(player).toContain(
      "do NOT re-register on every timeupdate",
    );
    expect(player).toContain("mediaEventSessionRef");
  });
});

describe("truthful published video loading during handoff", () => {
  it("G/H/Q: awaiting first frame + handoff seek shows spinner", () => {
    expect(
      resolvePublishedVideoAwaitingFirstFrame({
        statusReady: true,
        hasPlayableSource: true,
        mediaReady: false,
        handoffRestorePending: false,
        handoffSeekSettled: true,
      }),
    ).toBe(true);
    expect(
      resolvePublishedVideoAwaitingFirstFrame({
        statusReady: true,
        hasPlayableSource: true,
        mediaReady: true,
        handoffRestorePending: true,
        handoffSeekSettled: false,
      }),
    ).toBe(true);
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: true,
        isBuffering: false,
        isPausedWithReadyFrame: true,
      }),
    ).toBe(true);
  });

  it("I/J: ready paused / playing hides spinner", () => {
    expect(
      resolvePublishedVideoAwaitingFirstFrame({
        statusReady: true,
        hasPlayableSource: true,
        mediaReady: true,
        handoffRestorePending: false,
        handoffSeekSettled: true,
      }),
    ).toBe(false);
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: false,
        isBuffering: false,
        isPausedWithReadyFrame: true,
      }),
    ).toBe(false);
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: false,
        isBuffering: false,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(false);
  });

  it("K/L: waiting then playing", () => {
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: false,
        isBuffering: true,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(true);
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: false,
        isBuffering: false,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(false);
  });

  it("N/O: player wires source-session guards for waiting/stalled", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("mediaEventSessionRef");
    expect(player).toContain(
      "if (mediaEventSessionRef.current !== session) return",
    );
    expect(player).toContain("resolvePublishedVideoAwaitingFirstFrame");
  });

  it("P: failed / stall timeout never spin forever", () => {
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: true,
        awaitingFirstFrame: true,
        isBuffering: true,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(false);
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: true,
        isBuffering: true,
        isPausedWithReadyFrame: false,
        stallTimedOut: true,
      }),
    ).toBe(false);
  });

  it("M: buffering reset tracks source identity (key + videoId), not poster", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain(
      "useEffect(() => {\n    setIsBuffering(false);\n    setStallTimedOut(false);\n  }, [item.key, videoId]);",
    );
  });
});
