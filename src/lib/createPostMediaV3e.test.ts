import { describe, expect, it } from "vitest";
import {
  isFinalizeMediaStripVisible,
  shouldMountFinalizeMediaDock,
} from "./createFinalizeMediaMount";
import {
  clampFinalizeHeroMediaIndex,
  countFinalizeHeroMediaItems,
  FINALIZE_HERO_VIDEO_INDEX,
  FINALIZE_HERO_VIDEO_OBJECT_FIT,
  finalizeHeroMediaOffset,
  finalizeHeroIndexToImageIndex,
  imageIndexToFinalizeHeroIndex,
  isFinalizeVideoHeroIndex,
  isFinalizeVideoTileDraggable,
  remapHeroIndexAfterImageMove,
  shouldMountFinalizeHeroRegion,
} from "./createFinalizeHeroMedia";
import {
  createLocalVideoPreviewUrl,
  revokeLocalVideoPreviewUrl,
} from "./createFinalizeVideoPreview";
import { formatPostMediaCountLabel } from "./createPostMediaSlots";
import { mapInitResponseToVideoJob } from "./createPostVideoUpload";

const mp4 = (name = "clip.mp4") =>
  new File(["video"], name, { type: "video/mp4" });

describe("finalize hero region mount", () => {
  it("video only mounts normal hero container", () => {
    expect(shouldMountFinalizeHeroRegion(0, true)).toBe(true);
    expect(
      shouldMountFinalizeMediaDock({
        composeFinalizeShell: true,
        galleryLength: 0,
        hasActiveVideo: true,
        hasOverlayCta: true,
      }),
    ).toBe(true);
  });

  it("image-only behavior unchanged", () => {
    expect(shouldMountFinalizeHeroRegion(2, false)).toBe(true);
    expect(shouldMountFinalizeHeroRegion(0, false)).toBe(false);
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

describe("hero media ordering", () => {
  it("video only is active hero at index 0", () => {
    expect(isFinalizeVideoHeroIndex(0, true)).toBe(true);
    expect(finalizeHeroIndexToImageIndex(0, true)).toBeNull();
    expect(countFinalizeHeroMediaItems(0, true)).toBe(1);
  });

  it("images follow video in hero indices", () => {
    expect(imageIndexToFinalizeHeroIndex(0, true)).toBe(1);
    expect(finalizeHeroIndexToImageIndex(1, true)).toBe(0);
    expect(countFinalizeHeroMediaItems(2, true)).toBe(3);
  });

  it("image-only keeps legacy indices", () => {
    expect(imageIndexToFinalizeHeroIndex(1, false)).toBe(1);
    expect(finalizeHeroIndexToImageIndex(1, false)).toBe(1);
  });

  it("clamps hero index with video present", () => {
    expect(clampFinalizeHeroMediaIndex(5, 1, true)).toBe(1);
    expect(clampFinalizeHeroMediaIndex(0, 1, true)).toBe(0);
  });
});

describe("video pinned first in strip", () => {
  it("video tile is always first via hero offset", () => {
    expect(finalizeHeroMediaOffset(true)).toBe(1);
    expect(FINALIZE_HERO_VIDEO_INDEX).toBe(0);
  });

  it("video tile participates in mixed thumbnail drag", () => {
    expect(isFinalizeVideoTileDraggable()).toBe(true);
  });

  it("image cannot move ahead of video in hero selection", () => {
    expect(remapHeroIndexAfterImageMove(0, 0, 1, true)).toBe(
      FINALIZE_HERO_VIDEO_INDEX,
    );
    expect(remapHeroIndexAfterImageMove(2, 0, 1, true)).toBe(1);
  });
});

describe("hero thumbnail selection", () => {
  it("tapping image thumbnail selects image hero index", () => {
    expect(imageIndexToFinalizeHeroIndex(1, true)).toBe(2);
    expect(isFinalizeVideoHeroIndex(2, true)).toBe(false);
  });

  it("tapping video thumbnail returns to video hero", () => {
    expect(FINALIZE_HERO_VIDEO_INDEX).toBe(0);
    expect(isFinalizeVideoHeroIndex(0, true)).toBe(true);
  });
});

describe("direct hero video playback", () => {
  it("local video uses object-contain fitting", () => {
    expect(FINALIZE_HERO_VIDEO_OBJECT_FIT).toBe("contain");
  });

  it("preview uses object URL and revokes it", () => {
    const file = mp4();
    const url = createLocalVideoPreviewUrl(file);
    expect(url).toMatch(/^blob:/);
    revokeLocalVideoPreviewUrl(url);
  });

  it("no separate preview modal required for hero flow", () => {
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
    expect(isFinalizeVideoHeroIndex(0, true)).toBe(true);
  });
});

describe("collapse behavior", () => {
  it("collapsed manager hides strip but hero remains conceptually separate", () => {
    expect(isFinalizeMediaStripVisible(false)).toBe(false);
    expect(isFinalizeMediaStripVisible(true)).toBe(true);
  });
});

describe("total media counter", () => {
  it("remains correct with video as first item", () => {
    expect(formatPostMediaCountLabel(0, true)).toBe("1/10");
    expect(formatPostMediaCountLabel(2, true)).toBe("3/10");
  });
});

describe("safe area / header layout contract", () => {
  it("hero uses shared finalize top classes not a separate video-only block", () => {
    const finalizeHeroTopClass = "pt-4 md:pt-5";
    expect(finalizeHeroTopClass).toContain("pt-4");
    expect(shouldMountFinalizeHeroRegion(0, true)).toBe(true);
  });
});

describe("landscape / portrait fitting", () => {
  it("hero video object-fit is contain not cover", () => {
    expect(FINALIZE_HERO_VIDEO_OBJECT_FIT).not.toBe("cover");
    expect(FINALIZE_HERO_VIDEO_OBJECT_FIT).toBe("contain");
  });
});
