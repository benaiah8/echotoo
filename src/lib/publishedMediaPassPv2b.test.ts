import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PUBLISHED_HLS_BUFFER,
  __resetPublishedVideoMutePreferenceForTests,
  getPublishedVideoPreferredMuted,
  getPublishedVideoSessionUnmuted,
  setPublishedVideoSessionUnmuted,
  setPublishedVideoSoundPreferenceMuted,
} from "./publishedMedia";
import { indexForMediaKey } from "../components/PublishedMediaFullscreenViewer";
import type { PublishedMediaItem } from "./publishedMedia";
import {
  getCreateVideoMutedPreference,
  resetCreateVideoMutedPreference,
  setCreateVideoMutedPreference,
} from "./createFinalizeVideoMutePreference";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const mixed: PublishedMediaItem[] = [
  { kind: "image", key: "image:a", url: "https://cdn/a.jpg" },
  {
    kind: "video",
    key: "video:m1",
    mediaId: "m1",
    videoId: "bunny-1",
    status: "ready",
    posterUrl: "https://cdn/poster.jpg",
    width: 1080,
    height: 1920,
    durationSec: 12,
  },
  { kind: "image", key: "image:b", url: "https://cdn/b.jpg" },
];

describe("PASS PV2B — published sound preference (PV3.5)", () => {
  beforeEach(() => {
    __resetPublishedVideoMutePreferenceForTests();
    resetCreateVideoMutedPreference();
  });

  it("A/B: ready active autoplays from shared preference (prefers sound ON)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain('playIntentRef.current = "autoplay"');
    expect(player).toContain("getPublishedVideoPreferredMuted");
    expect(player).toContain("isAutoplaySoundBlockedError");
    expect(player).toContain("data-autoplay-muted={muted ? \"true\" : \"false\"}");
    expect(player).not.toContain("publishedAutoplayMustMute");
    expect(player).not.toContain("getCreateVideoMutedPreference");
    expect(getPublishedVideoPreferredMuted()).toBe(false);
  });

  it("C: autoplay rejection after muted retry leaves Play UI; no retry loop", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("autoplayRejectedRef");
    expect(player).toContain('intent === "autoplay"');
    expect(player).toContain("Do not retry autoplay in a loop");
    expect(player).toContain("setPlayPending(false)");
  });

  it("session preference is separate from Create preference", () => {
    setCreateVideoMutedPreference(false);
    expect(getCreateVideoMutedPreference()).toBe(false);
    setPublishedVideoSoundPreferenceMuted(true);
    expect(getPublishedVideoPreferredMuted()).toBe(true);
    setPublishedVideoSessionUnmuted(true);
    expect(getPublishedVideoSessionUnmuted()).toBe(true);
    expect(getPublishedVideoPreferredMuted()).toBe(false);
    expect(getCreateVideoMutedPreference()).toBe(false);
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("setPublishedVideoSoundPreferenceMuted");
    const create = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(create).toContain("getCreateVideoMutedPreference");
    expect(create).not.toContain("getPublishedVideoPreferredMuted");
  });
});

describe("PASS PV2B — inactive / background / HLS buffer", () => {
  it("D/E: inactive pauses and destroys HLS", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("tearDownPlayback");
    expect(player).toMatch(/if \(!isActive && !isWarm\) \{[\s\S]*tearDownPlayback\(\)/);
    expect(player).toContain("destroyHls");
    expect(player).toContain("video.removeAttribute(\"src\")");
  });

  it("F: document hidden pauses/destroys HLS", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("visibilitychange");
    expect(player).toContain("document.hidden");
    expect(player).toMatch(
      /if \(document\.hidden\) \{[\s\S]*tearDownPlayback\(\)/,
    );
  });

  it("G: hls.js buffer caps applied", () => {
    expect(PUBLISHED_HLS_BUFFER.maxBufferLength).toBeGreaterThanOrEqual(10);
    expect(PUBLISHED_HLS_BUFFER.maxBufferLength).toBeLessThanOrEqual(15);
    expect(PUBLISHED_HLS_BUFFER.maxMaxBufferLength).toBeGreaterThanOrEqual(20);
    expect(PUBLISHED_HLS_BUFFER.maxMaxBufferLength).toBeLessThanOrEqual(30);
  });
});

describe("PASS PV2B — fullscreen / mixed index", () => {
  it("indexForMediaKey resolves mixed keys", () => {
    expect(indexForMediaKey(mixed, "video:m1")).toBe(1);
    expect(indexForMediaKey(mixed, "image:a")).toBe(0);
  });
});
