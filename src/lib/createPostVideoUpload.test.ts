import { describe, expect, it } from "vitest";
import {
  applyUploadProgressToVideoJob,
  canStartAnotherPostVideo,
  hasActivePostVideo,
  isVideoPublishBlocked,
  isVideoUploadInProgress,
  mapInitResponseToVideoJob,
  mapPostMediaRowToVideoJob,
  mapTusCompleteToVideoJob,
  shouldStartTusForInit,
} from "./createPostVideoUpload";
import type { PostMediaRow } from "./postMediaRow";

const baseRow = (overrides: Partial<PostMediaRow> = {}): PostMediaRow => ({
  id: "media-1",
  publish_post_id: "publish-1",
  owner_user_id: "user-1",
  post_id: null,
  bunny_video_id: "video-1",
  video_status: "processing",
  poster_url: null,
  ...overrides,
});

const mp4File = () =>
  new File(["video"], "clip.mp4", { type: "video/mp4" });

describe("one-video limit", () => {
  it("blocks another video while one is active", () => {
    const job = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "ready",
        uploadRequired: false,
      },
      mp4File(),
    );
    expect(hasActivePostVideo(job)).toBe(true);
    expect(canStartAnotherPostVideo(job)).toBe(false);
  });

  it("keeps occupied slot after error for visible retry/remove UI", () => {
    const job = mapPostMediaRowToVideoJob(
      baseRow({ video_status: "failed" }),
    );
    expect(hasActivePostVideo(job)).toBe(true);
    expect(canStartAnotherPostVideo(job)).toBe(true);
  });
});

describe("valid video selection → init mapping", () => {
  it("maps upload-required init to uploading job", () => {
    const job = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "pending",
        uploadRequired: true,
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        authorizationExpire: 123,
        authorizationSignature: "sig",
      },
      mp4File(),
    );
    expect(job.status).toBe("uploading");
    expect(job.mediaId).toBe("media-1");
    expect(shouldStartTusForInit({
      mediaId: "media-1",
      videoId: "video-1",
      libraryId: "lib",
      videoStatus: "pending",
      uploadRequired: true,
      tusEndpoint: "https://video.bunnycdn.com/tusupload",
      authorizationExpire: 123,
      authorizationSignature: "sig",
    })).toBe(true);
  });
});

describe("uploadRequired=false does not start TUS", () => {
  it("processing init becomes processing without TUS", () => {
    const job = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "processing",
        uploadRequired: false,
        reused: true,
      },
      mp4File(),
    );
    expect(job.status).toBe("processing");
    expect(shouldStartTusForInit({
      mediaId: "media-1",
      videoId: "video-1",
      libraryId: "lib",
      videoStatus: "processing",
      uploadRequired: false,
    })).toBe(false);
  });

  it("ready init becomes ready without TUS", () => {
    const job = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "ready",
        uploadRequired: false,
        reused: true,
      },
      mp4File(),
    );
    expect(job.status).toBe("ready");
  });
});

describe("TUS progress updates local job", () => {
  it("updates percent while uploading", () => {
    const uploading = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "pending",
        uploadRequired: true,
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        authorizationExpire: 123,
        authorizationSignature: "sig",
      },
      mp4File(),
    );
    const at42 = applyUploadProgressToVideoJob(uploading, 42);
    expect(at42.progress).toBe(42);
    expect(at42.status).toBe("uploading");
  });
});

describe("TUS completion → processing", () => {
  it("marks job processing after upload", () => {
    const uploading = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "pending",
        uploadRequired: true,
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        authorizationExpire: 123,
        authorizationSignature: "sig",
      },
      mp4File(),
    );
    const next = mapTusCompleteToVideoJob(uploading);
    expect(next.status).toBe("processing");
    expect(next.videoStatus).toBe("processing");
    expect(next.progress).toBe(100);
  });
});

describe("post_media ready / failed mapping", () => {
  it("maps ready row to ready job with poster", () => {
    const job = mapPostMediaRowToVideoJob(
      baseRow({
        video_status: "ready",
        poster_url: "https://cdn.example/poster.jpg",
      }),
    );
    expect(job.status).toBe("ready");
    expect(job.posterUrl).toBe("https://cdn.example/poster.jpg");
  });

  it("maps failed row to error job", () => {
    const job = mapPostMediaRowToVideoJob(
      baseRow({ video_status: "failed" }),
    );
    expect(job.status).toBe("error");
  });
});

describe("draft hydration does not imply second Bunny object", () => {
  it("reuses existing mediaId from post_media row", () => {
    const job = mapPostMediaRowToVideoJob(
      baseRow({ id: "existing-media", bunny_video_id: "existing-video" }),
    );
    expect(job.mediaId).toBe("existing-media");
    expect(job.videoId).toBe("existing-video");
  });
});

describe("publish gate", () => {
  it("blocks publish while uploading", () => {
    const job = mapInitResponseToVideoJob(
      {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "lib",
        videoStatus: "uploading",
        uploadRequired: true,
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        authorizationExpire: 123,
        authorizationSignature: "sig",
      },
      mp4File(),
    );
    expect(isVideoUploadInProgress(job)).toBe(true);
    expect(isVideoPublishBlocked(job)).toBe(true);
  });

  it("allows publish while processing", () => {
    const job = mapPostMediaRowToVideoJob(
      baseRow({ video_status: "processing" }),
    );
    expect(isVideoPublishBlocked(job)).toBe(false);
  });

  it("allows publish when ready", () => {
    const job = mapPostMediaRowToVideoJob(
      baseRow({ video_status: "ready" }),
    );
    expect(isVideoPublishBlocked(job)).toBe(false);
  });

  it("blocks publish when failed", () => {
    const job = mapPostMediaRowToVideoJob(
      baseRow({ video_status: "failed" }),
    );
    expect(isVideoPublishBlocked(job)).toBe(true);
  });
});

describe("image pipeline contract", () => {
  it("video helpers do not require image job shape changes", () => {
    expect(isVideoPublishBlocked(null)).toBe(false);
    expect(isVideoUploadInProgress(null)).toBe(false);
  });
});
