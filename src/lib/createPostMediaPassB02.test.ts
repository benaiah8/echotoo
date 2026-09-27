import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_CREATE_VIDEO_DURATION_SECONDS,
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
  VIDEO_REQUIREMENTS_LINES,
  VIDEO_REQUIREMENTS_OPTIMIZATION_LINE,
  VIDEO_REQUIREMENTS_TITLE,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  VIDEO_TOO_LONG_USER_MESSAGE,
  isCreateVideoDurationOverLimit,
  validateCreateVideoSource,
} from "./createDraftVideo/createVideoConstraints";
import {
  INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION,
  SHORT_VIDEO_PREFERRED_TARGET_BYTES,
} from "./createDraftVideo/createVideoPreparationConstants";
import {
  computeAdaptivePrepareTargetBytes,
  resolveVideoPreparationPolicy,
} from "./createDraftVideo/createVideoPreparationPolicy";
import { ADD_VIDEO_FAILED_USER_MESSAGE } from "./createDraftVideo/localVideoAsset";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MB = 1024 * 1024;

describe("PASS B0.2 — public video limits", () => {
  it("A: exactly 90 sec accepted", () => {
    expect(MAX_CREATE_VIDEO_DURATION_SECONDS).toBe(90);
    expect(isCreateVideoDurationOverLimit(90)).toBe(false);
    expect(isCreateVideoDurationOverLimit(89.9)).toBe(false);
  });

  it("B: >90 sec rejected", () => {
    expect(isCreateVideoDurationOverLimit(90.01)).toBe(true);
    expect(isCreateVideoDurationOverLimit(91)).toBe(true);
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("isCreateVideoDurationOverLimit");
    expect(provider).toContain("showCreateVideoValidationToast");
    expect(provider).toContain('"too_long"');
  });

  it("C: correct 90-sec copy", () => {
    expect(VIDEO_TOO_LONG_USER_MESSAGE).toBe(
      "Video is too long. Maximum 90 seconds.",
    );
  });

  it("D: <=200 MB accepted by size rule", () => {
    const ok = validateCreateVideoSource({
      name: "clip.mp4",
      type: "video/mp4",
      size: 200 * MB,
    });
    expect(ok.ok).toBe(true);
  });

  it("E: >200 MB rejected", () => {
    expect(MAX_CREATE_VIDEO_SOURCE_BYTES).toBe(200 * MB);
    const over = validateCreateVideoSource({
      name: "huge.mp4",
      type: "video/mp4",
      size: 200 * MB + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("too-large");
  });

  it("F: correct 200-MB copy", () => {
    expect(VIDEO_TOO_LARGE_USER_MESSAGE).toBe(
      "Video is too large. Maximum 200 MB.",
    );
  });

  it("G: MP4 accepted", () => {
    expect(
      validateCreateVideoSource({
        name: "a.mp4",
        type: "video/mp4",
        size: 10 * MB,
      }).ok,
    ).toBe(true);
  });

  it("H: MOV accepted", () => {
    expect(
      validateCreateVideoSource({
        name: "a.mov",
        type: "video/quicktime",
        size: 10 * MB,
      }).ok,
    ).toBe(true);
  });

  it("I: unsupported native format rejected with simple copy", () => {
    const webm = validateCreateVideoSource({
      name: "a.webm",
      type: "video/webm",
      size: 10 * MB,
    });
    expect(webm.ok).toBe(false);
    if (!webm.ok) {
      expect(webm.message).toBe(VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE);
    }
    expect(VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE).toBe(
      "This video format isn't supported. Choose an MP4 or MOV video.",
    );
  });

  it("J: B0.1 adaptive preparation policy remains intact", () => {
    const efficient = resolveVideoPreparationPolicy({
      durationSeconds: 90,
      sizeBytes: 25 * MB,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
    });
    expect(efficient.strategy).toBe("passthrough");

    const heavy = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: 150 * MB,
      width: 1920,
      height: 1080,
      mimeType: "video/mp4",
    });
    expect(heavy.strategy).toBe("prepare");
  });

  it("K: 20 MB remains short-video preference only", () => {
    expect(SHORT_VIDEO_PREFERRED_TARGET_BYTES).toBe(20 * MB);
    const policy = read(
      "src/lib/createDraftVideo/createVideoPreparationConstants.ts",
    );
    expect(policy).not.toContain("PREPARED_MAX_BYTES = 20");
    expect(policy).toContain("NOT a universal prepared-output max");
  });

  it("L: internal 90-sec prepared ceiling can reach ~60 MB", () => {
    expect(INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION).toBe(60 * MB);
    const at90 = computeAdaptivePrepareTargetBytes(90, 1920, 1080);
    expect(at90).toBeLessThanOrEqual(
      INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION,
    );
    expect(at90).toBeGreaterThan(40 * MB);
  });

  it("M: no internal prepared-size values exposed in UI", () => {
    const info = read(
      "src/components/create/CreateVideoRequirementsInfo.tsx",
    );
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    for (const src of [info, sheet]) {
      expect(src).not.toMatch(/\b60 MB\b|\b20 MB\b|Mbps|1080p|H\.264/i);
      expect(src).not.toContain("INTERNAL_PREPARED");
      expect(src).not.toContain("SHORT_VIDEO_PREFERRED");
    }
  });

  it("N: info affordance opens requirements", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).toContain("CreateVideoRequirementsInfo");
    expect(sheet).toContain('data-video-requirements-info');
    expect(sheet).toContain('aria-label="Video requirements"');
    expect(sheet).toContain("setRequirementsOpen(true)");
    expect(sheet).toContain("data-add-media-title");
  });

  it("O: requirements show 90 sec / 200 MB / 4K / MP4-MOV + optimization line", () => {
    expect(VIDEO_REQUIREMENTS_TITLE).toBe("Video requirements");
    expect([...VIDEO_REQUIREMENTS_LINES]).toEqual([
      "Up to 90 seconds",
      "Up to 200 MB",
      "Up to 4K",
      "MP4 or MOV",
    ]);
    expect(VIDEO_REQUIREMENTS_OPTIMIZATION_LINE).toBe(
      "Videos may be optimized before posting.",
    );
    const info = read(
      "src/components/create/CreateVideoRequirementsInfo.tsx",
    );
    expect(info).toContain("VIDEO_REQUIREMENTS_ITEMS");
    expect(info).toContain("VIDEO_REQUIREMENTS_OPTIMIZATION_LINE");
    expect(info).not.toContain("20 MB");
    expect(info).not.toMatch(/compress/i);
  });

  it("P: failed replacement preserves existing video", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("commitMeta: false");
    expect(provider).toContain("replace-start");
    expect(provider).toContain("isCreateVideoDurationOverLimit(resolvedDuration)");
    expect(provider).toContain("deleteDraftVideoStorageBytes(draftVideo)");
    expect(provider).toContain("showCreateVideoValidationToast");
    expect(provider).toContain('"too_long"');
  });

  it("Q: no Bunny activity", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).not.toContain("invokeBunnyUploadInit");
    expect(startFn).not.toContain("createPublishVideoUpload");
    expect(ADD_VIDEO_FAILED_USER_MESSAGE).toBe(
      "Couldn't add this video. Please try again.",
    );
  });

  it("Camera.recordVideo still has no maxDuration — post-validate 90s", () => {
    const defs = read(
      "node_modules/@capacitor/camera/dist/esm/definitions.d.ts",
    );
    const recordBlock = defs.slice(
      defs.indexOf("export interface RecordVideoOptions"),
      defs.indexOf("export interface PlayVideoOptions"),
    );
    expect(recordBlock).not.toMatch(/maxDuration|maximumDuration/i);
  });
});
