import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PREPARE_WATCHDOG_ABSOLUTE_MS,
  PREPARE_WATCHDOG_STALL_MS,
  PREPARE_WATCHDOG_START_MS,
  TUS_WATCHDOG_STALL_MS,
  TUS_WATCHDOG_START_MS,
  createNativeOperationWatchdog,
  isMeaningfulPrepareProgress,
  type NativeOperationWatchdogClock,
  type NativeOperationWatchdogTimeoutReason,
  type NativeOperationWatchdogVisibility,
} from "./createDraftVideo/nativeOperationWatchdog";
import {
  classifyEchoVideoUploadErrorCode,
  userFacingUploadError,
} from "./bunnyUpload/uploadNativeVideoToBunnyTus";
import { ECHO_VIDEO_PREPARE_ERROR } from "../plugins/echoVideoPrepare/errors";
import { ECHO_VIDEO_UPLOAD_ERROR } from "../plugins/echoVideoUpload/errors";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function makeFakeEnv(initialForeground = true) {
  let now = 0;
  const timers = new Map<
    number,
    { due: number; fn: () => void }
  >();
  let nextId = 1;
  let foreground = initialForeground;
  const visListeners = new Set<(fg: boolean) => void>();

  const clock: NativeOperationWatchdogClock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { due: now + Math.max(0, ms), fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (id) => {
      timers.delete(id as unknown as number);
    },
  };

  const visibility: NativeOperationWatchdogVisibility = {
    isForeground: () => foreground,
    subscribe: (listener) => {
      visListeners.add(listener);
      return () => {
        visListeners.delete(listener);
      };
    },
  };

  const advance = (ms: number) => {
    const target = now + ms;
    while (now < target) {
      let nextDue = target;
      for (const t of timers.values()) {
        if (t.due > now && t.due < nextDue) nextDue = t.due;
      }
      now = nextDue;
      const due = [...timers.entries()].filter(([, t]) => t.due <= now);
      for (const [id, t] of due) {
        timers.delete(id);
        t.fn();
      }
    }
  };

  const setForeground = (fg: boolean) => {
    if (fg === foreground) return;
    foreground = fg;
    for (const l of [...visListeners]) l(fg);
  };

  return { clock, visibility, advance, setForeground, getNow: () => now };
}

describe("isMeaningfulPrepareProgress", () => {
  it("6. rejects malformed / NaN / negative / out of range", () => {
    expect(isMeaningfulPrepareProgress(null, null)).toBe(false);
    expect(isMeaningfulPrepareProgress(undefined, null)).toBe(false);
    expect(isMeaningfulPrepareProgress(Number.NaN, null)).toBe(false);
    expect(isMeaningfulPrepareProgress(-0.1, null)).toBe(false);
    expect(isMeaningfulPrepareProgress(1.1, null)).toBe(false);
  });

  it("accepts first finite 0..1 and requires advance thereafter", () => {
    expect(isMeaningfulPrepareProgress(0, null)).toBe(true);
    expect(isMeaningfulPrepareProgress(0.2, 0.1)).toBe(true);
    expect(isMeaningfulPrepareProgress(0.1, 0.1)).toBe(false);
    expect(isMeaningfulPrepareProgress(0.05, 0.1)).toBe(false);
  });
});

describe("nativeOperationWatchdog core", () => {
  it("1. start timeout fires with no activity", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 60_000,
      stallTimeoutMs: 300_000,
      absoluteTimeoutMs: null,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    env.advance(59_999);
    expect(reasons).toEqual([]);
    env.advance(1);
    expect(reasons).toEqual(["start"]);
    wd.dispose();
  });

  it("3. activity before start timeout prevents start fire", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 60_000,
      stallTimeoutMs: 300_000,
      absoluteTimeoutMs: null,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    env.advance(30_000);
    wd.markActivity();
    env.advance(60_000);
    expect(reasons).toEqual([]);
    wd.dispose();
  });

  it("4/5. advancing progress resets stall; duplicate mark without time does not double-fire", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 1_000,
      stallTimeoutMs: 10_000,
      absoluteTimeoutMs: null,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    wd.markActivity();
    env.advance(9_000);
    wd.markProgress(); // reset stall
    env.advance(9_000);
    expect(reasons).toEqual([]);
    env.advance(1_000);
    expect(reasons).toEqual(["stall"]);
    wd.markProgress(); // after fire — ignored
    expect(reasons).toEqual(["stall"]);
    wd.dispose();
  });

  it("7/8. dispose cancels pending timeout (terminal path)", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 5_000,
      stallTimeoutMs: 5_000,
      absoluteTimeoutMs: null,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    wd.dispose();
    env.advance(20_000);
    expect(reasons).toEqual([]);
  });

  it("11. onTimeout fires exactly once", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 1_000,
      stallTimeoutMs: 1_000,
      absoluteTimeoutMs: 1_000,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    env.advance(1_000);
    expect(reasons.length).toBe(1);
    env.advance(10_000);
    expect(reasons.length).toBe(1);
    wd.dispose();
  });

  it("12. background duration does not trigger timeout", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 10_000,
      stallTimeoutMs: 10_000,
      absoluteTimeoutMs: null,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    env.advance(5_000);
    env.setForeground(false);
    env.advance(60_000);
    expect(reasons).toEqual([]);
    env.setForeground(true);
    // Fresh stall; start remaining ~5s still
    env.advance(4_999);
    expect(reasons).toEqual([]);
    env.advance(1);
    expect(reasons).toEqual(["start"]);
    wd.dispose();
  });

  it("13. foreground resumes with fresh stall window", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 1_000,
      stallTimeoutMs: 10_000,
      absoluteTimeoutMs: null,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    wd.markActivity();
    env.advance(8_000);
    env.setForeground(false);
    env.advance(50_000);
    env.setForeground(true);
    // Fresh 10s stall — would have stalled if remainder carried
    env.advance(9_000);
    expect(reasons).toEqual([]);
    env.advance(1_000);
    expect(reasons).toEqual(["stall"]);
    wd.dispose();
  });

  it("14. absolute prepare cap counts foreground only", () => {
    const env = makeFakeEnv(true);
    const reasons: NativeOperationWatchdogTimeoutReason[] = [];
    const wd = createNativeOperationWatchdog({
      startTimeoutMs: 60_000,
      stallTimeoutMs: 300_000,
      absoluteTimeoutMs: 20_000,
      onTimeout: (r) => reasons.push(r),
      clock: env.clock,
      visibility: env.visibility,
    });
    wd.markAccepted();
    wd.markActivity();
    env.advance(10_000);
    env.setForeground(false);
    env.advance(100_000);
    env.setForeground(true);
    env.advance(9_999);
    expect(reasons).toEqual([]);
    env.advance(1);
    expect(reasons).toEqual(["absolute"]);
    wd.dispose();
  });
});

describe("R1 prepare wiring (source)", () => {
  it("wires prepare_timeout, cancel, watchdog constants, prepare_failed path", () => {
    const prepare = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    const errors = read("src/plugins/echoVideoPrepare/errors.ts");

    expect(errors).toContain('prepare_timeout: "prepare_timeout"');
    expect(ECHO_VIDEO_PREPARE_ERROR.prepare_timeout).toBe("prepare_timeout");

    expect(prepare).toContain("createNativeOperationWatchdog");
    expect(prepare).toContain("PREPARE_WATCHDOG_START_MS");
    expect(prepare).toContain("PREPARE_WATCHDOG_STALL_MS");
    expect(prepare).toContain("PREPARE_WATCHDOG_ABSOLUTE_MS");
    expect(prepare).toContain("isMeaningfulPrepareProgress");
    expect(prepare).toContain("ECHO_VIDEO_PREPARE_ERROR.prepare_timeout");
    expect(prepare).toContain("cancelPreparation");
    expect(prepare).toContain("watchdog.markAccepted");
    expect(prepare).toContain("watchdog.markActivity");
    expect(prepare).toContain("watchdog.dispose");

    expect(PREPARE_WATCHDOG_START_MS).toBe(60_000);
    expect(PREPARE_WATCHDOG_STALL_MS).toBe(5 * 60_000);
    expect(PREPARE_WATCHDOG_ABSOLUTE_MS).toBe(20 * 60_000);

    // 9/10: failed outcomes (incl. prepare_timeout) persist via markPrepareFailed;
    // controller writes result + clears activeJob in finally.
    expect(prepare).toContain("markPrepareFailed(draft, outcome.code)");
    expect(controller).toContain("writeDraftMetaIfCurrentGeneration(result.draftVideo)");
    expect(controller).toContain("activeJob = null");
    expect(controller).toContain("startingLocalIds.delete");
  });

  it("2. timeout path cancels native prepare", () => {
    const prepare = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    expect(prepare).toMatch(
      /onTimeout:[\s\S]*cancelPreparation\(\{\s*jobId\s*\}\)[\s\S]*prepare_timeout/,
    );
  });
});

describe("R1 TUS wiring (source)", () => {
  it("15–29: stall watchdog preserves Location; classifies upload_stalled", () => {
    const tus = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    const errors = read("src/plugins/echoVideoUpload/errors.ts");
    const publish = read("src/lib/createPublishVideoUpload.ts");

    expect(errors).toContain('upload_stalled: "upload_stalled"');
    expect(ECHO_VIDEO_UPLOAD_ERROR.upload_stalled).toBe("upload_stalled");
    expect(TUS_WATCHDOG_START_MS).toBe(90_000);
    expect(TUS_WATCHDOG_STALL_MS).toBe(12 * 60_000);

    expect(tus).toContain("createNativeOperationWatchdog");
    expect(tus).toContain("TUS_WATCHDOG_START_MS");
    expect(tus).toContain("TUS_WATCHDOG_STALL_MS");
    expect(tus).toContain("absoluteTimeoutMs: null");
    expect(tus).toContain("ECHO_VIDEO_UPLOAD_ERROR.upload_stalled");
    expect(tus).toContain("cancelVideoUpload");
    expect(tus).toContain("watchdog.markAccepted");
    expect(tus).toContain("watchdog.markActivity");
    // 23: watchdog onTimeout must not clear Location (only stale-offset path does)
    const timeoutBlock = tus.match(
      /onTimeout:\s*\(\)\s*=>\s*\{[\s\S]*?\n\s*\},/,
    )?.[0];
    expect(timeoutBlock).toBeTruthy();
    expect(timeoutBlock).not.toContain("onClearUploadUrl");
    // 24: stale-offset still clears
    expect(tus).toContain("RESUME_URL_RETRY_CODES");
    expect(tus).toContain("onClearUploadUrl?.()");
    expect(tus).toContain("tus_head_failed");

    // 21/22/25: publish path persists URL + remote ids; resume uses uploadUrl
    expect(publish).toContain("updateDraftVideoNativeTusUploadUrl");
    expect(publish).toContain("updateDraftVideoRemoteIds");
    expect(publish).toContain("uploadUrl: bytes.uploadUrl");

    // 29
    expect(classifyEchoVideoUploadErrorCode("upload_stalled")).toBe("network");
    expect(userFacingUploadError("upload_stalled")).toBe(
      userFacingUploadError("network_failed"),
    );
  });

  it("19/20. timeout invokes cancelVideoUpload with upload_stalled", () => {
    const tus = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    expect(tus).toMatch(
      /onTimeout:[\s\S]*cancelVideoUpload\(\{\s*jobId\s*\}\)[\s\S]*upload_stalled/,
    );
  });
});

describe("R1 scope audit", () => {
  it("does not touch Feed/RPC/player/U1/poster/DB", () => {
    const changed = [
      "src/lib/createDraftVideo/nativeOperationWatchdog.ts",
      "src/lib/createDraftVideo/prepareDraftVideo.ts",
      "src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts",
      "src/plugins/echoVideoPrepare/errors.ts",
      "src/plugins/echoVideoUpload/errors.ts",
    ];
    for (const rel of changed) {
      const src = read(rel);
      expect(src).not.toContain("get_feed_with_related_data");
      expect(src).not.toContain("PublishedVideoPlayer");
      expect(src).not.toContain("publishVideoPoster");
      expect(src).not.toContain("post_has_nonready_attached_video");
    }
    expect(
      read("src/lib/createDraftVideo/draftVideoPreparationController.ts"),
    ).not.toContain("get_feed_with_related_data");
  });
});

describe("R1 create UI finally still clears publishing flags", () => {
  it("CreateFinalizePage / Provider finally blocks unchanged in structure", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(page).toContain("setPublishing(false)");
    expect(page).toContain('setPublishPhase("idle")');
    expect(page).toContain("publishInFlightRef.current = false");
    expect(provider).toContain("setHeavyMediaExclusive(false)");
    expect(provider).toContain("setPublishVideoUploadProgress");
    expect(provider).toMatch(/} finally \{\s*setHeavyMediaExclusive\(false\)/);
  });
});
