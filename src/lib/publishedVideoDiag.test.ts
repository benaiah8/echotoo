/**
 * DEV-only published video diagnostic helpers (observational logging).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  logPublishedVideoStateTransition,
  nextPublishedVideoPlayerInstanceId,
  publishedVideoPlayErrorName,
  __resetPublishedVideoStateLogForTests,
} from "./publishedMedia/publishedVideoStateLog";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("published video DEV diagnostics", () => {
  beforeEach(() => {
    __resetPublishedVideoStateLogForTests();
  });

  it("allocates opaque player instance ids", () => {
    expect(nextPublishedVideoPlayerInstanceId()).toBe("vp-1");
    expect(nextPublishedVideoPlayerInstanceId()).toBe("vp-2");
  });

  it("classifies play() rejection names without messages", () => {
    expect(publishedVideoPlayErrorName({ name: "AbortError" })).toBe(
      "AbortError",
    );
    expect(publishedVideoPlayErrorName({ name: "NotAllowedError" })).toBe(
      "NotAllowedError",
    );
    expect(publishedVideoPlayErrorName("x")).toBe("unknown");
  });

  it("dedupes identical transitions", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPublishedVideoStateTransition("media-event", {
      playerId: "vp-1",
      mediaEvent: "waiting",
      readyState: 2,
      videoPaused: true,
    });
    logPublishedVideoStateTransition("media-event", {
      playerId: "vp-1",
      mediaEvent: "waiting",
      readyState: 2,
      videoPaused: true,
    });
    logPublishedVideoStateTransition("media-event", {
      playerId: "vp-1",
      mediaEvent: "playing",
      readyState: 4,
      videoPaused: false,
    });
    const events = info.mock.calls.map(
      (call) => (call[1] as { event?: string; mediaEvent?: string }).mediaEvent,
    );
    expect(events.filter((e) => e === "waiting")).toHaveLength(1);
    expect(events.filter((e) => e === "playing")).toHaveLength(1);
    info.mockRestore();
  });

  it("player and restore remain DEV-gated and observational", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const restore = read(
      "src/lib/publishedMedia/publishedVideoHandoffRestore.ts",
    );
    const log = read("src/lib/publishedMedia/publishedVideoStateLog.ts");
    expect(log).toContain('console.info("[echotoo video state]"');
    expect(log).toContain("if (!import.meta.env.DEV) return");
    expect(player).toContain("player-mount");
    expect(player).toContain("hls-attach-start");
    expect(player).toContain("hls-manifest");
    expect(player).toContain("hls-attach-timeout");
    expect(player).toContain("play-attempt");
    expect(player).toContain("play-result");
    expect(player).toContain("handoff-received");
    expect(player).toContain("handoff-latched");
    expect(player).toContain("unexpected-teardown");
    expect(player).toContain("media-event");
    expect(player).toContain('"waiting"');
    expect(player).toContain('"stalled"');
    expect(player).toContain('"seeked"');
    expect(player).not.toMatch(
      /const types = \[[^\]]*timeupdate/,
    );
    expect(restore).toContain("handoff-restore-start");
    expect(restore).toContain("handoff-seek-settled");
    expect(restore).toContain("handoff-restore-result");
  });
});
