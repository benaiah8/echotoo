import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  SOURCE_MAX_BYTES,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  validateCreateVideoSource,
} from "./createDraftVideo/createVideoConstraints";
import {
  PREPARING_VIDEO_USER_MESSAGE,
  PREPARE_FAILED_USER_MESSAGE,
  PREPARE_TOO_LARGE_USER_MESSAGE,
  PREPARE_UNSUPPORTED_USER_MESSAGE,
  SHORT_VIDEO_PREFERRED_TARGET_BYTES,
} from "./createDraftVideo/createVideoPreparationConstants";
import {
  PREPARE_MAX_FPS,
  PREPARE_MAX_LONG_EDGE_PX,
  computeAdaptivePrepareTargetBytes,
  resolvePrepareTargetLongEdge,
  resolveVideoPreparationPolicy,
} from "./createDraftVideo/createVideoPreparationPolicy";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MB = 1024 * 1024;

describe("PASS B0 — remove 60s hard limit (superseded by B0.2 public 90s)", () => {
  it("A: source validation still accepts size/format within public contract", () => {
    const ok = validateCreateVideoSource({
      name: "clip.mp4",
      type: "video/mp4",
      size: 15 * MB,
    });
    expect(ok.ok).toBe(true);
  });

  it("B: public duration limit is 90s (B0.2), not the old 60s copy", () => {
    const constraints = read(
      "src/lib/createDraftVideo/createVideoConstraints.ts",
    );
    expect(constraints).toContain("MAX_CREATE_VIDEO_DURATION_SECONDS = 90");
    expect(constraints).not.toContain(
      "Video is too long. Choose one under 1 minute.",
    );
  });

  it("C: efficient video can still pass through via adaptive policy", () => {
    const ok = validateCreateVideoSource({
      name: "long.mp4",
      type: "video/mp4",
      size: 25 * MB,
    });
    expect(ok.ok).toBe(true);
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 90,
      sizeBytes: 25 * MB,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("passthrough");
    expect(plan.reason).toMatch(/passthrough-/);
  });

  it("D: >200 MB still rejected", () => {
    expect(SOURCE_MAX_BYTES).toBe(200 * MB);
    expect(MAX_CREATE_VIDEO_SOURCE_BYTES).toBe(SOURCE_MAX_BYTES);
    const over = validateCreateVideoSource({
      name: "huge.mp4",
      type: "video/mp4",
      size: SOURCE_MAX_BYTES + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.message).toBe(VIDEO_TOO_LARGE_USER_MESSAGE);
    }
  });
});

describe("PASS B0 — adaptive preparation policy", () => {
  it("E: <=20 MB suitable video chooses passthrough", () => {
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 180,
      sizeBytes: 12 * MB,
      width: 1080,
      height: 608,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("passthrough");
    expect(plan.reason).toMatch(/passthrough-/);
  });

  it("F: larger short high-bitrate video chooses prepare", () => {
    const plan = resolveVideoPreparationPolicy({
      durationSeconds: 45,
      sizeBytes: 55 * MB,
      width: 1920,
      height: 1080,
      fps: 30,
      mimeType: "video/mp4",
    });
    expect(plan.strategy).toBe("prepare");
    expect(plan.reason).toBe("prepare-high-bitrate");
    expect(plan.targetBytes).toBeLessThanOrEqual(SOURCE_MAX_BYTES);
  });

  it("G: longer video gets larger adaptive target than equivalent short", () => {
    const shortTarget = computeAdaptivePrepareTargetBytes(60, 1920, 1080);
    const longTarget = computeAdaptivePrepareTargetBytes(240, 1920, 1080);
    expect(longTarget).toBeGreaterThan(shortTarget);
    // ~30–38 MB/min at 1080p → ~30–38 MB for 1 min
    expect(shortTarget).toBeGreaterThan(25 * MB);
    expect(shortTarget).toBeLessThan(45 * MB);
  });

  it("H: adaptive target is not universally capped at 20 MB", () => {
    expect(SHORT_VIDEO_PREFERRED_TARGET_BYTES).toBe(20 * MB);
    const twoMin = computeAdaptivePrepareTargetBytes(120, 1920, 1080);
    const fourMin = computeAdaptivePrepareTargetBytes(240, 1920, 1080);
    expect(twoMin).toBeGreaterThan(SHORT_VIDEO_PREFERRED_TARGET_BYTES);
    expect(fourMin).toBeGreaterThan(twoMin);
    expect(fourMin).toBeGreaterThan(40 * MB);
    const policySrc = read(
      "src/lib/createDraftVideo/createVideoPreparationPolicy.ts",
    );
    expect(policySrc).not.toContain("PREPARED_MAX_BYTES = 20");
    expect(policySrc).not.toMatch(/\bPREPARED_MAX_BYTES\b(?!_)/);
    const constants = read(
      "src/lib/createDraftVideo/createVideoPreparationConstants.ts",
    );
    expect(constants).not.toContain("PREPARED_MAX_BYTES = 20");
    expect(constants).toContain("INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION");
  });

  it("I: policy never recommends upscale", () => {
    // 1280×720 → encode edge 720 (never upscaled to 1080).
    expect(resolvePrepareTargetLongEdge(720, 1280)).toBe(720);
    expect(resolvePrepareTargetLongEdge(640, 360)).toBe(360);
    expect(resolvePrepareTargetLongEdge(3840, 2160)).toBe(PREPARE_MAX_LONG_EDGE_PX);
    const plan = resolveVideoPreparationPolicy({
      sizeBytes: 40 * MB,
      width: 720,
      height: 480,
      durationSeconds: 90,
      mimeType: "video/mp4",
    });
    expect(plan.targetLongEdge).toBeLessThanOrEqual(720);
  });

  it("J: target fps <= 30", () => {
    expect(PREPARE_MAX_FPS).toBe(30);
    const plan = resolveVideoPreparationPolicy({
      sizeBytes: 80 * MB,
      durationSeconds: 30,
      fps: 60,
      width: 1920,
      height: 1080,
      mimeType: "video/mp4",
    });
    expect(plan.targetFps).toBeLessThanOrEqual(30);
    expect(plan.strategy).toBe("prepare");
  });

  it("K: user copy contains no technical bitrate/size details", () => {
    expect(PREPARING_VIDEO_USER_MESSAGE).toBe("Preparing video…");
    expect(PREPARE_TOO_LARGE_USER_MESSAGE).toBe(
      "Couldn't prepare the video. Try a shorter or smaller video.",
    );
    expect(PREPARE_FAILED_USER_MESSAGE).toBe(
      "Couldn't prepare the video. Try a shorter or smaller video.",
    );
    expect(PREPARE_UNSUPPORTED_USER_MESSAGE).toBe(
      "Video format not supported. Use MP4 or MOV.",
    );
    for (const msg of [
      PREPARING_VIDEO_USER_MESSAGE,
      PREPARE_TOO_LARGE_USER_MESSAGE,
      PREPARE_FAILED_USER_MESSAGE,
      PREPARE_UNSUPPORTED_USER_MESSAGE,
      VIDEO_TOO_LARGE_USER_MESSAGE,
    ]) {
      expect(msg).not.toMatch(/bitrate|Mbps|kbps|H\.264|AAC|1080|720p/i);
    }
  });

  it("L: replacement flow unchanged", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("commitMeta: !replacingLocal");
    expect(provider).toContain("deleteDraftVideoStorageBytes(previousDraft)");
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("REPLACE_VIDEO_CONFIRM_TITLE");
    expect(picker).toContain('confirmLabel="Replace"');
  });

  it("M: no Bunny activity in preparation policy", () => {
    const policy = read(
      "src/lib/createDraftVideo/createVideoPreparationPolicy.ts",
    );
    expect(policy).not.toMatch(/bunnyTus|invokeBunny|bunny-upload/i);
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).not.toContain("invokeBunnyUploadInit");
    expect(startFn).not.toContain("createPublishVideoUpload");
  });
});
