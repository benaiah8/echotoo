/**
 * PASS PV3.8.4 — ACTIVE + USER_PAUSED (keep ownership on manual pause).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.8.4 — keep active ownership while user-paused", () => {
  it("A–E: pause keeps ownership; no release / inactive path", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(surface).toContain("holdActiveWhileUserPaused");
    expect(surface).toContain("holdActiveByHysteresis");
    expect(surface).toContain("evaluatePublishedListVideoVisibilityPolicy");
    expect(surface).toContain("mark user-paused only — keep active ownership");
    const pauseHandler = surface.slice(
      surface.indexOf("onManualPause={() => {"),
      surface.indexOf("userPaused={userPausedKey === item.key}"),
    );
    expect(pauseHandler).toContain("setUserPausedKey(item.key)");
    expect(pauseHandler).not.toContain("releaseRef.current");
    expect(pauseHandler).not.toContain("setOwnsPlayback(false)");
    expect(player).not.toContain("softPausedRetainRef");
    expect(player).not.toContain("softIdleRetain");
    expect(player).not.toContain("retainIdleResources");
    expect(surface).not.toContain("softPausedKey");
  });

  it("F–J: pause does not stopLoad/destroy/clear/src/load; preserves time path", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const pauseStart = player.indexOf("const requestManualPause");
    const pauseEnd = player.indexOf("const requestManualPlay");
    const block = player.slice(pauseStart, pauseEnd);
    expect(block).toContain("video.pause()");
    expect(block).not.toContain(".stopLoad(");
    expect(block).not.toContain("destroyHls");
    expect(block).not.toContain('removeAttribute("src")');
    expect(block).not.toContain("video.load()");
    expect(block).not.toContain("currentTime = 0");
    expect(block).toContain("manual-paused-active");
    expect(block).toContain("pausedAt");
  });

  it("K–N: resume reuses media/HLS from same currentTime", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("resumeAt");
    expect(player).toContain("hasMedia");
    expect(player).toContain("hls-reuse");
    expect(player).toContain("manual-play-resolved");
    expect(player).toContain("Promote warm buffer limits only");
  });

  it("O/P: autoplay + foreground respect userPaused", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(player).toContain("isUserPaused");
    expect(player).toContain("localUserPaused");
    expect(player).toContain('reason: "user-paused"');
    expect(player).toContain("userPausedRef.current");
    expect(player).toContain(
      "explicit user pause survives foreground while same player stays active",
    );
    expect(surface).not.toContain("setUserPausedKey(null);\n  }, [visibilityEpoch]");
  });

  it("V/W: Detail/Fullscreen use local latch (no list ownership release)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    const fullscreen = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(player).toContain("Detail/Fullscreen have no list userPausedKey");
    expect(carousel).toContain('mode="detail"');
    expect(fullscreen).toContain('mode="fullscreen"');
    const pauseStart = player.indexOf("const requestManualPause");
    const pauseEnd = player.indexOf("const requestManualPlay");
    const block = player.slice(pauseStart, pauseEnd);
    expect(block).toContain("setLocalUserPaused(true)");
    expect(block).toContain("video.pause()");
    expect(block).not.toContain("releasePublishedListVideoOwnership");
  });

  it("Q–T: B can claim; revoke clears pause; no resume map", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("setUserPausedKey((prev) =>");
    expect(surface).toContain("requestPublishedListVideoOwnership");
    expect(surface).not.toContain("resumePosition");
    expect(surface).not.toContain("sessionStorage");
  });

  it("U–AB: gestures/sound/images/detail markers", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(player).toContain("showVideoFrame");
    expect(hook).toContain("armHold");
    expect(hook).toContain("Reveal-first");
    expect(hook).not.toContain("ensurePlayingAfterDoubleTap");
    expect(
      read("src/lib/publishedMedia/publishedVideoMutePreference.ts"),
    ).toContain("getPublishedVideoPreferredMuted");
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      'fit={singleImage ? "contain" : "cover"}',
    );
  });

  it("AC–AG: Create + LI1 markers", () => {
    expect(
      read("src/components/create/CreateFinalizeVideoPlayer.tsx"),
    ).toContain("resolveVideoPointerUp");
    expect(
      read("src/lib/publishedMedia/publishedVideoStateLog.ts"),
    ).toContain("publishedVideoMediaSnapshot");
  });
});
