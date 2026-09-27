/**
 * Stale Create video consumers + false loading spinner contracts.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveVideoPlaybackLoadingVisible,
  VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS,
} from "./publishedMedia/resolveVideoPlaybackLoadingVisible";
import {
  isVideoElementLoadAborted,
  loadVideoElement,
  VideoElementLoadError,
  waitForCreatePreviewConsumerSwitch,
} from "./createDraftVideo/extractVideoPosterFrame";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Create video loading + stale consumer fixes", () => {
  it("A: player resets mediaReady only on src change (not poster)", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("Reset first-frame readiness ONLY when playable src changes");
    expect(player).toMatch(/},\s*\[src\]\s*\);/);
    expect(player).not.toMatch(/},\s*\[src,\s*poster\]\s*\);/);
  });

  it("B: playing authoritatively clears loading (mediaReady + buffering)", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("markCurrentSourceReady");
    expect(player).toContain("onPlaying={() => {");
    expect(player).toContain("markCurrentSourceReady()");
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

  it("C: ready + paused shows no spinner", () => {
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

  it("D: waiting/stalled for current src may show spinner", () => {
    expect(
      resolveVideoPlaybackLoadingVisible({
        hasPlayableSource: true,
        mediaFailed: false,
        awaitingFirstFrame: false,
        isBuffering: true,
        isPausedWithReadyFrame: false,
      }),
    ).toBe(true);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("onWaiting={onCurrentSourceWaiting}");
    expect(player).toContain("onStalled={onCurrentSourceWaiting}");
  });

  it("E: stale old-source waiting cannot affect new source (generation guard)", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("srcGenerationRef");
    expect(player).toContain("eventGen !== srcGenerationRef.current");
    expect(player).toContain("queueMicrotask");
  });

  it("F: replacement aborts old poster/probe consumer", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("abortPosterEnrichment()");
    expect(provider).toContain("beginPosterEnrichment");
    expect(provider).toContain("signal: posterSignal");
    expect(provider).toContain("isVideoElementLoadAborted");
  });

  it("G: aborted hidden video releases src/listeners", async () => {
    const ac = new AbortController();
    // Abort before start — must reject as aborted without leaving a hanging element.
    ac.abort();
    await expect(
      loadVideoElement("blob:test-aborted", { signal: ac.signal }),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(
      isVideoElementLoadAborted(
        new VideoElementLoadError("aborted", "Video load aborted"),
      ),
    ).toBe(true);
    const src = read("src/lib/createDraftVideo/extractVideoPosterFrame.ts");
    expect(src).toContain("releaseHiddenVideoElement");
    expect(src).toContain("removeAttribute(\"src\")");
    expect(src).toContain('settleErr("aborted"');
  });

  it("H: old local file deleted only after preview consumers switch", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const start = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    const waitIdx = start.indexOf("waitForCreatePreviewConsumerSwitch()");
    const deleteIdx = start.indexOf(
      "deleteDraftVideoStorageBytes(previousDraft,",
    );
    expect(waitIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(waitIdx);
    expect(start.indexOf("setVideoJob(hydrated)")).toBeLessThan(waitIdx);
  });

  it("I: new generation remains protected during old cleanup", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("protectLocalId: withPreparation.localId");
    expect(provider).toContain(
      "protectLocalReference: withPreparation.localReference",
    );
  });

  it("J: CreateFinalizeVideoTile does not mount duplicate preload video", () => {
    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).not.toContain("<video");
    expect(tile).not.toContain('preload="auto"');
    expect(tile).toContain("localPosterUrl");
    expect(tile).toContain("PiFilmStrip");
  });

  it("K: no select/replace/hydrate background prepare", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    expect(provider).toContain(
      "Publish-only prepare: do NOT start native encode after ingest/replace",
    );
    expect(provider).toContain(
      "Publish-only prepare: do NOT start Media3/AVFoundation on draft reopen",
    );
  });

  it("L: Publish prepare path unchanged", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("ensurePublishVideoPreparation");
    const gate = read(
      "src/lib/createDraftVideo/ensurePublishVideoPreparation.ts",
    );
    expect(gate).toContain("ensureDraftVideoPreparationStarted");
    expect(gate).toContain("needs_prepare start once");
  });

  it("stall watchdog remains bounded and non-primary", () => {
    expect(VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS).toBe(25_000);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS");
    expect(player).toContain("markCurrentSourceReady");
  });

  it("waitForCreatePreviewConsumerSwitch resolves via rAF double-tick", async () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(() => cb(0));
      return frames.length;
    });
    const done = waitForCreatePreviewConsumerSwitch();
    expect(frames.length).toBe(1);
    frames[0]!();
    expect(frames.length).toBe(2);
    frames[1]!();
    await done;
    vi.unstubAllGlobals();
  });
});
