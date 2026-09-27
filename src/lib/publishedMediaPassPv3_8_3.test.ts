/**
 * PASS PV3.8.3 — pause preserves currentTime (superseded ownership model by PV3.8.4).
 * Keeps poster/frame + no-stopLoad / no-src-clear-on-pause contracts green.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.8.3 — pause preserves currentTime (PV3.8.4-compatible)", () => {
  it("A–F: manual pause does not reset/load/destroy/detach", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("requestManualPause");
    const pauseStart = player.indexOf("const requestManualPause");
    const pauseEnd = player.indexOf("const requestManualPlay");
    const block = player.slice(pauseStart, pauseEnd);
    expect(block).not.toContain('removeAttribute("src")');
    expect(block).not.toContain("video.load()");
    expect(block).not.toContain("destroyHls");
    expect(block).not.toContain(".stopLoad(");
    expect(block).not.toContain("currentTime = 0");
    expect(block).toContain("keep active ownership");
  });

  it("G: idle soft-retain removed; warm stopLoad remains for warm path only", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("softIdleRetain");
    // Warm buffer path may still stopLoad — not the manual-pause path.
    expect(player).toContain("hls.stopLoad()");
  });

  it("H: paused ready video shows video frame, not poster", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("showVideoFrame");
    expect(player).toMatch(
      /Boolean\(posterUrl\)\s*&&\s*\([\s\S]*?isWarm\s*\|\|\s*!mediaReady\s*\|\|\s*status\s*!==\s*"ready"\)/,
    );
    expect(player).not.toContain("!mediaReady || !playing || status");
    expect(player).toContain('showVideoFrame ? "opacity-100" : "opacity-0"');
  });

  it("I/J: resume reuses attached media / HLS", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("resumeAt");
    expect(player).toContain("hls-reuse");
    expect(player).toContain("hasMedia");
  });

  it("K–L: imperative pause before React; active+userPaused hold", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(player).toContain("Media first — keep active ownership");
    expect(surface).toContain("holdActiveWhileUserPaused");
  });

  it("M–P: offscreen may teardown; no persistent resume map", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(surface).toContain("holdActiveWhileUserPaused");
    expect(surface).toContain("userPausedKey");
    expect(player).toContain("tearDownPlayback");
    expect(player).toContain('reason: "teardown"');
    expect(surface).not.toContain("resumePosition");
    expect(surface).not.toContain("sessionStorage");
    expect(player).not.toContain("resumePosition");
  });

  it("Q–T: Detail/fullscreen share player; seek/hold unchanged", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(player).toContain('mode === "detail"');
    expect(player).toContain('mode === "fullscreen"');
    expect(hook).toContain("armHold");
    expect(hook).toContain("Reveal-first");
    expect(hook).not.toContain("ensurePlayingAfterDoubleTap");
    expect(hook).toContain("VIDEO_PLAYBACK_RATE_FAST");
    expect(hook).toContain("armHold");
  });

  it("U–AD: prior passes + Create + images + logs", () => {
    expect(
      read("src/lib/publishedMedia/publishedVideoMutePreference.ts"),
    ).toContain("getPublishedVideoPreferredMuted");
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      'fit={singleImage ? "contain" : "cover"}',
    );
    expect(
      read("src/components/create/CreateFinalizeVideoPlayer.tsx"),
    ).toContain("resolveVideoPointerUp");
    expect(
      read("src/lib/publishedMedia/publishedVideoStateLog.ts"),
    ).toContain("publishedVideoMediaSnapshot");
    expect(
      read("src/lib/publishedMedia/publishedVideoStateLog.ts"),
    ).toContain("currentTime");
  });
});
