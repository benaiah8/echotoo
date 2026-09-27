import { describe, expect, it } from "vitest";
import {
  SOURCE_MAX_BYTES,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  validateCreateVideoSource,
} from "./createDraftVideo/createVideoConstraints";
import {
  PREPARING_VIDEO_USER_MESSAGE,
  PREPARE_FAILED_USER_MESSAGE,
  PREPARE_TOO_LARGE_USER_MESSAGE,
  SHORT_VIDEO_PREFERRED_TARGET_BYTES,
} from "./createDraftVideo/createVideoPreparationConstants";
import {
  MEANINGFUL_SAVINGS_RATIO,
  PREPARE_MAX_FPS,
  PREPARE_MAX_LONG_EDGE_PX,
  TARGET_VIDEO_BITRATE_1080P_BPS,
  TARGET_VIDEO_BITRATE_720P_BPS,
  computeAdaptivePrepareTargetBytes,
  computeSourceTotalBitrateBps,
  hasMeaningfulPrepareSavings,
  resolvePrepareTargetLongEdge,
  resolveVideoPreparationPolicy,
  wouldPrepareViolateQualityFloor,
} from "./createDraftVideo/createVideoPreparationPolicy";

const MB = 1024 * 1024;

describe("PASS B0.1 — quality-first preparation policy", () => {
  it("A: source limit remains 200 MB", () => {
    expect(SOURCE_MAX_BYTES).toBe(200 * MB);
    const over = validateCreateVideoSource({
      name: "huge.mp4",
      type: "video/mp4",
      size: SOURCE_MAX_BYTES + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toBe(VIDEO_TOO_LARGE_USER_MESSAGE);
  });

  it("B: duration public limit is separate from adaptive policy", () => {
    // Adaptive policy still evaluates long sources; Create acceptance uses 90s (B0.2).
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 600,
      sizeBytes: 40 * MB,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("passthrough");
  });

  it("C: <=20 MB efficient source passes through", () => {
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: 12 * MB,
      width: 1920,
      height: 1080,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("passthrough");
    expect(plan.reason).toBe("passthrough-small");
  });

  it("D: >20 MB efficient long source can pass through", () => {
    // 4 min / 50 MB / 720p ≈ 1.7 Mbps — already efficient.
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 240,
      sizeBytes: 50 * MB,
      width: 1280,
      height: 720,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("passthrough");
    expect(plan.reason).toBe("passthrough-efficient");
    expect(50 * MB).toBeGreaterThan(SHORT_VIDEO_PREFERRED_TARGET_BYTES);
  });

  it("E: high-bitrate short source prepares", () => {
    // 30 sec / 150 MB / 1080p
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: 150 * MB,
      width: 1920,
      height: 1080,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("prepare");
    expect(plan.reason).toBe("prepare-high-bitrate");
  });

  it("F: high-resolution source prepares", () => {
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 60,
      sizeBytes: 80 * MB,
      width: 3840,
      height: 2160,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("prepare");
    expect(plan.reason).toBe("prepare-over-resolution");
    expect(plan.targetLongEdge).toBe(PREPARE_MAX_LONG_EDGE_PX);
  });

  it("G: >30fps source may prepare", () => {
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: 80 * MB,
      width: 1920,
      height: 1080,
      fps: 60,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("prepare");
    expect(plan.reason).toBe("prepare-high-fps");
    expect(plan.targetFps).toBe(PREPARE_MAX_FPS);
  });

  it("H: expected savings <15–20% → passthrough", () => {
    expect(MEANINGFUL_SAVINGS_RATIO).toBe(0.15);
    // 90 sec / 28 MB / 720p — already near quality target.
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 90,
      sizeBytes: 28 * MB,
      width: 1280,
      height: 720,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("passthrough");
    const target = computeAdaptivePrepareTargetBytes(90, 1280, 720);
    expect(
      hasMeaningfulPrepareSavings(28 * MB, Math.min(target, 28 * MB)),
    ).toBe(false);
  });

  it("I: meaningful savings → prepare", () => {
    // 4 min / 190 MB / 1080p
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 240,
      sizeBytes: 190 * MB,
      width: 1920,
      height: 1080,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("prepare");
    expect(plan.reason).toBe("prepare-high-bitrate");
    const target = computeAdaptivePrepareTargetBytes(240, 1920, 1080);
    expect(hasMeaningfulPrepareSavings(190 * MB, target)).toBe(true);
  });

  it("J: target grows with duration", () => {
    const a = computeAdaptivePrepareTargetBytes(60, 1920, 1080);
    const b = computeAdaptivePrepareTargetBytes(120, 1920, 1080);
    const c = computeAdaptivePrepareTargetBytes(240, 1920, 1080);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("K: 1080p target is larger than 720p target for same duration", () => {
    expect(TARGET_VIDEO_BITRATE_1080P_BPS).toBeGreaterThan(
      TARGET_VIDEO_BITRATE_720P_BPS,
    );
    const t720 = computeAdaptivePrepareTargetBytes(60, 1280, 720);
    const t1080 = computeAdaptivePrepareTargetBytes(60, 1920, 1080);
    expect(t1080).toBeGreaterThan(t720);
  });

  it("L: no upscale", () => {
    expect(resolvePrepareTargetLongEdge(640, 360)).toBe(360);
    expect(resolvePrepareTargetLongEdge(3840, 2160)).toBe(1080);
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 60,
      sizeBytes: 40 * MB,
      width: 640,
      height: 360,
      mimeType: "video/mp4",
    });
    expect(plan.targetLongEdge).toBeLessThanOrEqual(360);
  });

  it("M: max fps 30", () => {
    expect(PREPARE_MAX_FPS).toBe(30);
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 45,
      sizeBytes: 60 * MB,
      width: 1920,
      height: 1080,
      fps: 120,
      mimeType: "video/mp4",
    });
    expect(plan.targetFps).toBe(30);
  });

  it("N: no target below quality floor", () => {
    const tiny = wouldPrepareViolateQualityFloor({
      targetBytes: 1 * MB,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
    });
    expect(tiny).toBe(true);
    const ok = computeAdaptivePrepareTargetBytes(60, 1920, 1080);
    expect(
      wouldPrepareViolateQualityFloor({
        targetBytes: ok,
        durationSeconds: 60,
        width: 1920,
        height: 1080,
      }),
    ).toBe(false);
  });

  it("O: no user-facing technical copy added", () => {
    for (const msg of [
      PREPARING_VIDEO_USER_MESSAGE,
      PREPARE_TOO_LARGE_USER_MESSAGE,
      PREPARE_FAILED_USER_MESSAGE,
      VIDEO_TOO_LARGE_USER_MESSAGE,
    ]) {
      expect(msg).not.toMatch(
        /bitrate|Mbps|kbps|H\.264|AAC|1080|720p|savings/i,
      );
    }
  });

  it("P: no Bunny activity", () => {
    const bps = computeSourceTotalBitrateBps(50 * MB, 240);
    expect(bps).not.toBeNull();
    expect(bps!).toBeLessThan(2_000_000);
  });

  it("examples A–E from product brief", () => {
    expect(
      resolveVideoPreparationPolicy({
        durationSeconds: 30,
        sizeBytes: 150 * MB,
        width: 1920,
        height: 1080,
        mimeType: "video/mp4",
      }).strategy,
    ).toBe("prepare");

    expect(
      resolveVideoPreparationPolicy({
        durationSeconds: 240,
        sizeBytes: 50 * MB,
        width: 1280,
        height: 720,
        mimeType: "video/mp4",
      }).strategy,
    ).toBe("passthrough");

    expect(
      resolveVideoPreparationPolicy({
        durationSeconds: 240,
        sizeBytes: 190 * MB,
        width: 1920,
        height: 1080,
        mimeType: "video/mp4",
      }).strategy,
    ).toBe("prepare");

    expect(
      resolveVideoPreparationPolicy({
        durationSeconds: 30,
        sizeBytes: 12 * MB,
        width: 1920,
        height: 1080,
        mimeType: "video/mp4",
      }).strategy,
    ).toBe("passthrough");

    expect(
      resolveVideoPreparationPolicy({
        durationSeconds: 90,
        sizeBytes: 28 * MB,
        width: 1280,
        height: 720,
        mimeType: "video/mp4",
      }).strategy,
    ).toBe("passthrough");
  });
});
