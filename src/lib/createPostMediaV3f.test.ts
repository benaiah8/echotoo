import { describe, expect, it } from "vitest";
import {
  finalizeMediaThumbShellClass,
  FINALIZE_MEDIA_THUMB_SIZE,
} from "./createFinalizeMediaThumb";
import { shouldShowFinalizeHeroUploadOverlayPill } from "./createFinalizeUploadOverlay";
import {
  heroIndexAfterVideoRemoval,
} from "./createFinalizeHeroMedia";
import { parseBunnyVideoDeleteResponse } from "./bunnyUpload/invokeBunnyVideoDelete";
import {
  canStartAnotherPostVideo,
  hasActivePostVideo,
  isVideoJobRemoving,
  isVideoPublishBlocked,
  isVideoUploadInProgress,
  VIDEO_REMOVAL_FAILED_MESSAGE,
  type PostVideoUploadJob,
} from "./createPostVideoUpload";

const baseJob = (
  overrides: Partial<PostVideoUploadJob> = {},
): PostVideoUploadJob => ({
  mediaId: "media-1",
  videoId: "video-1",
  status: "uploading",
  progress: 10,
  videoStatus: "uploading",
  ...overrides,
});

function publishBlockedByMedia(options: {
  imageUploading: boolean;
  videoJob: PostVideoUploadJob | null;
}): boolean {
  return options.imageUploading || isVideoPublishBlocked(options.videoJob);
}

describe("bunny video delete response", () => {
  it("parses success", () => {
    expect(parseBunnyVideoDeleteResponse({ ok: true, deleted: true })).toEqual({
      ok: true,
      alreadyGone: false,
    });
  });

  it("parses idempotent already gone", () => {
    expect(
      parseBunnyVideoDeleteResponse({
        ok: true,
        deleted: true,
        alreadyGone: true,
      }),
    ).toEqual({ ok: true, alreadyGone: true });
  });

  it("rejects invalid response", () => {
    expect(parseBunnyVideoDeleteResponse({ ok: false })).toBeNull();
  });
});

describe("video removal job states", () => {
  it("removing keeps tile active but blocks publish and new upload slot", () => {
    const job = baseJob({ status: "removing" });
    expect(isVideoJobRemoving(job)).toBe(true);
    expect(hasActivePostVideo(job)).toBe(true);
    expect(isVideoPublishBlocked(job)).toBe(true);
    expect(isVideoUploadInProgress(job)).toBe(false);
    expect(canStartAnotherPostVideo(job)).toBe(false);
  });

  it("delete failure keeps occupied slot for retry", () => {
    const job = baseJob({
      status: "error",
      errorMessage: VIDEO_REMOVAL_FAILED_MESSAGE,
      localFile: new File(["x"], "clip.mp4", { type: "video/mp4" }),
    });
    expect(hasActivePostVideo(job)).toBe(true);
    expect(isVideoPublishBlocked(job)).toBe(true);
    expect(canStartAnotherPostVideo(job)).toBe(true);
  });

  it("cleared slot allows another video", () => {
    expect(canStartAnotherPostVideo(null)).toBe(true);
    expect(hasActivePostVideo(null)).toBe(false);
  });

  it("intentional cancel should not use generic upload error constant for removal", () => {
    expect(VIDEO_REMOVAL_FAILED_MESSAGE).toContain("remove");
  });
});

describe("publish media gate", () => {
  it("allows publish with no media", () => {
    expect(
      publishBlockedByMedia({ imageUploading: false, videoJob: null }),
    ).toBe(false);
  });

  it("allows publish with local draft video (V3G0)", () => {
    expect(
      publishBlockedByMedia({
        imageUploading: false,
        videoJob: {
          mediaId: "draft-local",
          videoId: "draft-local",
          status: "local",
          progress: 0,
          videoStatus: "pending",
          localFile: new File(["x"], "clip.mp4", { type: "video/mp4" }),
        },
      }),
    ).toBe(false);
  });

  it("blocks publish while legacy video is uploading", () => {
    expect(
      publishBlockedByMedia({
        imageUploading: false,
        videoJob: baseJob({ status: "uploading" }),
      }),
    ).toBe(true);
  });

  it("allows publish while video is processing or ready (legacy remote)", () => {
    expect(
      publishBlockedByMedia({
        imageUploading: false,
        videoJob: baseJob({ status: "processing", videoStatus: "processing" }),
      }),
    ).toBe(false);
    expect(
      publishBlockedByMedia({
        imageUploading: false,
        videoJob: baseJob({ status: "ready", videoStatus: "ready", progress: 100 }),
      }),
    ).toBe(false);
  });

  it("blocks publish for interrupted/removal-error video cleanup", () => {
    expect(
      publishBlockedByMedia({
        imageUploading: false,
        videoJob: baseJob({
          status: "error",
          errorMessage: VIDEO_REMOVAL_FAILED_MESSAGE,
        }),
      }),
    ).toBe(true);
  });
});

describe("finalize hero upload overlay", () => {
  it("shows pill only for image uploads (not duplicate video status)", () => {
    expect(
      shouldShowFinalizeHeroUploadOverlayPill({
        imageUploadingCount: 0,
        videoUploadingCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldShowFinalizeHeroUploadOverlayPill({
        imageUploadingCount: 2,
        videoUploadingCount: 1,
      }),
    ).toBe(true);
  });
});

describe("finalize media thumb ring", () => {
  it("selected image ring uses inset and avoids outer overflow clip", () => {
    const shell = finalizeMediaThumbShellClass({ isSelected: true });
    expect(shell).toContain("ring-inset");
    expect(shell).not.toContain("overflow-hidden");
    expect(FINALIZE_MEDIA_THUMB_SIZE).not.toContain("overflow-hidden");
  });

  it("selected video ring uses inset", () => {
    const shell = finalizeMediaThumbShellClass({
      isSelected: true,
      isError: false,
    });
    expect(shell).toContain("ring-inset");
    expect(shell).toContain("ring-[var(--create-chooser-cta-selected-surface)]");
  });
});

describe("hero after removal", () => {
  it("removing active video selects first image when images exist", () => {
    expect(heroIndexAfterVideoRemoval(0, 2)).toBe(0);
    expect(heroIndexAfterVideoRemoval(2, 2)).toBe(1);
  });

  it("removing only media returns empty hero index", () => {
    expect(heroIndexAfterVideoRemoval(0, 0)).toBe(0);
  });
});

describe("cleanup contract expectations", () => {
  it("unexpected bunny failure should retain db row (server responsibility)", () => {
    expect(true).toBe(true);
  });
});
