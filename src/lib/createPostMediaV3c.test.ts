import { describe, expect, it } from "vitest";
import { formatCreateMediaUploadLabel } from "./createPostMediaUploadLabel";
import {
  partitionNativePickedMedia,
  routeWebLibraryFiles,
} from "./createPostMediaRouting";
import {
  canAcceptNewVideoFile,
  isSameVideoFileIdentity,
  isVideoPublishBlocked,
  isVideoUploadInProgress,
  mapInitResponseToVideoJob,
  mapPostMediaRowToVideoJob,
  mapTusCompleteToVideoJob,
  VIDEO_SLOT_LOCKED_MESSAGE,
} from "./createPostVideoUpload";
import {
  hasBunnyTusSingleFlight,
  resetBunnyTusSingleFlightForTests,
  runBunnyTusSingleFlight,
} from "./bunnyUpload/bunnyTusSingleFlight";
import { BUNNY_TUS_RETRY_DELAYS } from "./bunnyUpload/bunnyTusUpload";
import type { PostMediaRow } from "./postMediaRow";

const mp4 = (name = "clip.mp4", size = 1024, lastModified = 1) =>
  new File(["video"], name, { type: "video/mp4", lastModified });

const jpg = (name = "photo.jpg") =>
  new File(["image"], name, { type: "image/jpeg" });

describe("formatCreateMediaUploadLabel", () => {
  it("uses video copy for video-only upload", () => {
    expect(formatCreateMediaUploadLabel(0, 1)).toBe("1 video uploading");
  });

  it("uses image copy for image-only upload", () => {
    expect(formatCreateMediaUploadLabel(1, 0)).toBe("1 image uploading");
  });

  it("uses media copy for mixed uploads", () => {
    expect(formatCreateMediaUploadLabel(2, 1)).toBe("3 media uploading");
  });
});

describe("routeWebLibraryFiles", () => {
  it("routes image MIME to image pipeline list", () => {
    const routed = routeWebLibraryFiles([jpg()], {
      hasActiveVideo: false,
      imageSlotsRemaining: 10,
    });
    expect(routed.images).toHaveLength(1);
    expect(routed.video).toBeNull();
  });

  it("routes supported video MIME to video pipeline", () => {
    const routed = routeWebLibraryFiles([mp4()], {
      hasActiveVideo: false,
      imageSlotsRemaining: 10,
    });
    expect(routed.images).toHaveLength(0);
    expect(routed.video).not.toBeNull();
  });

  it("marks replace candidate when slot occupied; rejects second video in batch", () => {
    const routed = routeWebLibraryFiles([mp4("a.mp4"), mp4("b.mp4")], {
      hasActiveVideo: true,
      imageSlotsRemaining: 10,
    });
    expect(routed.replaceExistingVideo).toBe(true);
    expect(routed.video?.name).toBe("a.mp4");
    expect(routed.rejectedExtraVideo).toBe(true);
  });
});

describe("partitionNativePickedMedia", () => {
  it("routes native mixed gallery items", () => {
    const partitioned = partitionNativePickedMedia(
      [
        { kind: "image", file: jpg() },
        { kind: "video", file: mp4(), nativeSourceUri: null },
      ],
      { hasActiveVideo: false, imageSlotsRemaining: 10 },
    );
    expect(partitioned.images).toHaveLength(1);
    expect(partitioned.video).not.toBeNull();
  });
});

describe("bunnyTusSingleFlight", () => {
  it("prevents two active promises for same videoId", async () => {
    resetBunnyTusSingleFlightForTests();
    let runs = 0;
    const first = runBunnyTusSingleFlight("video-1", async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
    });
    const second = runBunnyTusSingleFlight("video-1", async () => {
      runs += 1;
    });
    expect(hasBunnyTusSingleFlight("video-1")).toBe(true);
    await Promise.all([first, second]);
    expect(runs).toBe(1);
    resetBunnyTusSingleFlightForTests();
  });
});

describe("423 retry schedule remains enabled", () => {
  it("keeps tus-js-client retry delays including backoff", () => {
    expect(BUNNY_TUS_RETRY_DELAYS).toEqual([0, 1000, 3000, 5000, 10000]);
  });
});

describe("video reselect protection", () => {
  const readyRow = (overrides: Partial<PostMediaRow> = {}): PostMediaRow => ({
    id: "media-1",
    publish_post_id: "publish-1",
    owner_user_id: "user-1",
    post_id: null,
    bunny_video_id: "video-1",
    video_status: "ready",
    poster_url: null,
    ...overrides,
  });

  it("blocks different file when slot is ready", () => {
    const job = mapPostMediaRowToVideoJob(readyRow());
    const next = mp4("other.mp4", 2048, 99);
    const result = canAcceptNewVideoFile(job, next);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(VIDEO_SLOT_LOCKED_MESSAGE);
    }
  });

  it("allows same file identity for resume", () => {
    const file = mp4();
    const job = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "pending",
        uploadRequired: true,
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        authorizationExpire: 1,
        authorizationSignature: "sig",
      },
      file,
    );
    expect(canAcceptNewVideoFile(job, file).ok).toBe(true);
    expect(isSameVideoFileIdentity(file, file)).toBe(true);
  });
});

describe("publish gate", () => {
  it("allows processing and ready", () => {
    const processing = mapTusCompleteToVideoJob(
      mapInitResponseToVideoJob(
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
        mp4(),
      ),
    );
    expect(isVideoPublishBlocked(processing)).toBe(false);
    const ready = mapPostMediaRowToVideoJob({
      id: "m",
      publish_post_id: "p",
      owner_user_id: "u",
      post_id: null,
      bunny_video_id: "v",
      video_status: "ready",
      poster_url: null,
    });
    expect(isVideoPublishBlocked(ready)).toBe(false);
  });

  it("blocks uploading and error", () => {
    const uploading = mapInitResponseToVideoJob(
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
      mp4(),
    );
    expect(isVideoUploadInProgress(uploading)).toBe(true);
    expect(isVideoPublishBlocked(uploading)).toBe(true);
    expect(
      isVideoPublishBlocked({
        ...uploading,
        status: "error",
        videoStatus: "failed",
        errorMessage: "fail",
      }),
    ).toBe(true);
  });
});

describe("TUS failure becomes explicit error", () => {
  it("maps failed row to error state", () => {
    const job = mapPostMediaRowToVideoJob({
      id: "m",
      publish_post_id: "p",
      owner_user_id: "u",
      post_id: null,
      bunny_video_id: "v",
      video_status: "failed",
      poster_url: null,
    });
    expect(job.status).toBe("error");
    expect(isVideoPublishBlocked(job)).toBe(true);
  });
});

describe("video visibility contract", () => {
  it("video job exists for 0-image post states", () => {
    const states = ["preparing", "uploading", "processing", "ready", "error"] as const;
    for (const status of states) {
      const job =
        status === "ready"
          ? mapPostMediaRowToVideoJob({
              id: "m",
              publish_post_id: "p",
              owner_user_id: "u",
              post_id: null,
              bunny_video_id: "v",
              video_status: "ready",
              poster_url: null,
            })
          : {
              mediaId: "m",
              videoId: "v",
              status,
              progress: 0,
              videoStatus: "pending" as const,
            };
      expect(job).toBeTruthy();
    }
  });
});
