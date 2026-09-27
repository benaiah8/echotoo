import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveVideoPlaybackLoadingVisible,
  VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS,
} from "./publishedMedia/resolveVideoPlaybackLoadingVisible";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("resolveVideoPlaybackLoadingVisible", () => {
  it("shows while awaiting first frame with a playable source", () => {
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: true,
        isBuffering: false,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(true);
  });

  it("shows while buffering after a first frame", () => {
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: false,
        isBuffering: true,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(true);
  });

  it("never shows solely because a ready video is paused", () => {
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: false,
        isBuffering: false,
        isPausedWithReadyFrame: true,
      }),
    ).toBe(false);
  });

  it("handoff/first-frame awaiting wins over paused-ready", () => {
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

  it("hides for failed media, missing source, warm, or stall timeout", () => {
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: false,
        mediaFailed: false,
        awaitingFirstFrame: true,
        isBuffering: false,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(false);
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
        isBuffering: false,
        isPausedWithReadyFrame: false,
        isWarm: true,
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

  it("stall timeout is bounded", () => {
    expect(VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS).toBeGreaterThanOrEqual(
      10_000,
    );
    expect(VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});

describe("consistent video loading indicator wiring", () => {
  it("PublishedVideoPlayer uses shared spinner + loading rules", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("VideoPlaybackLoadingSpinner");
    expect(player).toContain("resolveVideoPlaybackLoadingVisible");
    expect(player).toContain("VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS");
    expect(player).toContain('addEventListener("waiting"');
    expect(player).toContain('addEventListener("stalled"');
    expect(player).toContain("showPlaybackLoading");
  });

  it("CreateFinalizeVideoPlayer uses shared spinner; ingest stays separate", () => {
    const createPlayer = read(
      "src/components/create/CreateFinalizeVideoPlayer.tsx",
    );
    expect(createPlayer).toContain("VideoPlaybackLoadingSpinner");
    expect(createPlayer).toContain("resolveVideoPlaybackLoadingVisible");
    expect(createPlayer).toContain("onWaiting");
    expect(createPlayer).not.toContain("localVideoIngestPending");
    expect(createPlayer).not.toContain("PreviewUploadOverlayPill");

    const pill = read("src/components/ui/PreviewUploadOverlayPill.tsx");
    expect(pill).toContain("videoAddingCount");
    expect(pill).toContain("animate-spin");
  });

  it("shared spinner is centered and theme-visible on dark surfaces", () => {
    const spinner = read("src/components/ui/VideoPlaybackLoadingSpinner.tsx");
    expect(spinner).toContain("data-video-playback-loading");
    expect(spinner).toContain("animate-spin");
    expect(spinner).toContain("border-white/35");
    expect(spinner).toContain("border-t-white");
    expect(spinner).toContain("items-center justify-center");
  });

  it("Edit media helpers and backend wiring remain (unsupported-gate stubs removed)", () => {
    const gates = read("src/lib/editPublishedMedia.ts");
    expect(gates).toContain("deriveOwnerEditVideoOp");
    expect(gates).toContain("buildOwnerEditVideoEditPayload");
    expect(gates).not.toContain("editHasUnsupportedVideoMutation");
    expect(gates).not.toContain("EDIT_VIDEO_REPLACE_UNSUPPORTED_MESSAGE");
  });
});
