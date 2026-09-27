import { describe, expect, it, vi } from "vitest";
import {
  isFinalizeMediaStripVisible,
  shouldMountFinalizeMediaDock,
} from "./createFinalizeMediaMount";
import {
  createLocalVideoPreviewUrl,
  revokeLocalVideoPreviewUrl,
} from "./createFinalizeVideoPreview";
import {
  canAddPostVideo,
  countTotalPostMedia,
  formatPostMediaCountLabel,
  imageSlotsRemaining,
  isTotalMediaAtCap,
} from "./createPostMediaSlots";
import { routeWebLibraryFiles } from "./createPostMediaRouting";
import * as postImagePipeline from "./postImagePipeline";
import { mapInitResponseToVideoJob } from "./createPostVideoUpload";

const mp4 = (name = "boot-video.mp4", size = 1024, lastModified = 1) =>
  new File(["video"], name, { type: "video/mp4", lastModified });

const jpg = (name = "photo.jpg") =>
  new File(["image"], name, { type: "image/jpeg" });

describe("video-only media manager mount", () => {
  it("mounts when 0 images + active video", () => {
    expect(
      shouldMountFinalizeMediaDock({
        composeFinalizeShell: true,
        galleryLength: 0,
        hasActiveVideo: true,
        hasOverlayCta: true,
      }),
    ).toBe(true);
  });

  it("image-only behavior unchanged when gallery has images", () => {
    expect(
      shouldMountFinalizeMediaDock({
        composeFinalizeShell: true,
        galleryLength: 2,
        hasActiveVideo: false,
        hasOverlayCta: true,
      }),
    ).toBe(true);
  });
});

describe("routeWebLibraryFiles video-first", () => {
  it("valid MP4 does not hit image classifier", () => {
    const spy = vi.spyOn(postImagePipeline, "isProbablyPostImageFile");
    const routed = routeWebLibraryFiles([mp4()], {
      hasActiveVideo: false,
      imageSlotsRemaining: 10,
    });
    expect(routed.video).not.toBeNull();
    expect(routed.images).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still routes images after video check", () => {
    const routed = routeWebLibraryFiles([jpg()], {
      hasActiveVideo: false,
      imageSlotsRemaining: 10,
    });
    expect(routed.images).toHaveLength(1);
    expect(routed.video).toBeNull();
  });
});

describe("total media count", () => {
  it("1 video only → 1/10", () => {
    expect(formatPostMediaCountLabel(0, true)).toBe("1/10");
  });

  it("1 image + 1 video → 2/10", () => {
    expect(formatPostMediaCountLabel(1, true)).toBe("2/10");
  });

  it("9 images + 1 video → 10/10", () => {
    expect(countTotalPostMedia(9, true)).toBe(10);
    expect(isTotalMediaAtCap(9, true)).toBe(true);
    expect(formatPostMediaCountLabel(9, true)).toBe("10/10");
  });
});

describe("total media cap", () => {
  it("allows 1 video + 9 images", () => {
    expect(imageSlotsRemaining(9, true)).toBe(0);
    expect(canAddPostVideo(9, false)).toBe(true);
    expect(isTotalMediaAtCap(9, true)).toBe(true);
  });

  it("blocks additional image at total 10", () => {
    expect(imageSlotsRemaining(9, true)).toBe(0);
    expect(imageSlotsRemaining(10, false)).toBe(0);
    expect(canAddPostVideo(10, false)).toBe(false);
  });
});

describe("finalize dock collapse", () => {
  it("video does not prevent collapse", () => {
    expect(isFinalizeMediaStripVisible(false)).toBe(false);
    expect(isFinalizeMediaStripVisible(true)).toBe(true);
  });

  it("collapsed state still indicates media count", () => {
    expect(formatPostMediaCountLabel(1, true)).toBe("2/10");
  });
});

describe("create video preview helpers", () => {
  it("local file object URL lifecycle", () => {
    const file = mp4();
    const job = mapInitResponseToVideoJob(
      {
        mediaId: "m",
        videoId: "v",
        libraryId: "l",
        videoStatus: "pending",
        uploadRequired: true,
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        authorizationExpire: 1,
        authorizationSignature: "sig",
      },
      file,
    );
    expect(job.localFile).toBe(file);
    const url = createLocalVideoPreviewUrl(file);
    revokeLocalVideoPreviewUrl(url);
    expect(job.status).toBe("uploading");
  });
});
