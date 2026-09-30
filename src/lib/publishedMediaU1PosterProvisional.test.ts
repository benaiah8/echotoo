import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isPublishedVideoProcessingStatus,
  mergePublishedVideoDimensions,
  posterProvisionalDimensionsAlreadyApplied,
  preservePublishedVideoMetadataAcrossItems,
  publishedMediaFrameStyle,
  shouldApplyPosterProvisionalVideoDimensions,
  type PublishedMediaItem,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function videoItem(
  partial: Partial<Extract<PublishedMediaItem, { kind: "video" }>> & {
    mediaId?: string;
  } = {},
): Extract<PublishedMediaItem, { kind: "video" }> {
  const mediaId = partial.mediaId ?? "m1";
  return {
    kind: "video",
    key: `video:${mediaId}`,
    mediaId,
    videoId: partial.videoId ?? "vid",
    status: partial.status ?? "processing",
    posterUrl: partial.posterUrl ?? "https://cdn.example/poster.jpg",
    width: partial.width ?? null,
    height: partial.height ?? null,
    durationSec: partial.durationSec ?? null,
  };
}

describe("U1 poster provisional video dimensions", () => {
  it("1. processing + null DB dims can adopt valid poster natural dims", () => {
    expect(
      shouldApplyPosterProvisionalVideoDimensions({
        status: "processing",
        videoWidth: null,
        videoHeight: null,
        naturalWidth: 1080,
        naturalHeight: 1920,
      }),
    ).toBe(true);
    const style = publishedMediaFrameStyle(
      [videoItem({ width: 1080, height: 1920, status: "processing" })],
      "50vh",
    );
    expect(style.aspectRatio).toBe("1080 / 1920");
  });

  it("2. invalid/zero natural dimensions are ignored", () => {
    expect(
      shouldApplyPosterProvisionalVideoDimensions({
        status: "processing",
        videoWidth: null,
        videoHeight: null,
        naturalWidth: 0,
        naturalHeight: 1920,
      }),
    ).toBe(false);
    expect(
      shouldApplyPosterProvisionalVideoDimensions({
        status: "uploading",
        videoWidth: null,
        videoHeight: null,
        naturalWidth: -1,
        naturalHeight: 100,
      }),
    ).toBe(false);
  });

  it("3. existing positive video dimensions are not replaced by poster dims", () => {
    expect(
      shouldApplyPosterProvisionalVideoDimensions({
        status: "processing",
        videoWidth: 1280,
        videoHeight: 720,
        naturalWidth: 1080,
        naturalHeight: 1920,
      }),
    ).toBe(false);
  });

  it("4. provisional poster dims survive parent item sync with null dims", () => {
    const existing = [videoItem({ width: 1080, height: 1920 })];
    const incoming = [videoItem({ width: null, height: null })];
    const merged = preservePublishedVideoMetadataAcrossItems(
      existing,
      incoming,
    );
    expect(merged[0]).toMatchObject({
      kind: "video",
      width: 1080,
      height: 1920,
    });
  });

  it("5. incoming positive DB dimensions replace provisional dims", () => {
    const existing = [
      videoItem({ width: 1080, height: 1920, status: "processing" }),
    ];
    const incoming = [
      videoItem({ width: 720, height: 1280, status: "ready" }),
    ];
    const merged = preservePublishedVideoMetadataAcrossItems(
      existing,
      incoming,
    );
    expect(merged[0]).toMatchObject({
      status: "ready",
      width: 720,
      height: 1280,
    });
    expect(
      mergePublishedVideoDimensions({
        existingWidth: 1080,
        existingHeight: 1920,
        incomingWidth: 720,
        incomingHeight: 1280,
      }),
    ).toEqual({ width: 720, height: 1280 });
  });

  it("6–8. pending/uploading/processing are processing statuses", () => {
    expect(isPublishedVideoProcessingStatus("pending")).toBe(true);
    expect(isPublishedVideoProcessingStatus("uploading")).toBe(true);
    expect(isPublishedVideoProcessingStatus("processing")).toBe(true);
  });

  it("9. ready is not a processing status", () => {
    expect(isPublishedVideoProcessingStatus("ready")).toBe(false);
    expect(
      shouldApplyPosterProvisionalVideoDimensions({
        status: "ready",
        videoWidth: null,
        videoHeight: null,
        naturalWidth: 1080,
        naturalHeight: 1920,
      }),
    ).toBe(false);
  });

  it("10. failed is not a processing status (unavailable path stays separate)", () => {
    expect(isPublishedVideoProcessingStatus("failed")).toBe(false);
  });

  it("avoids duplicate provisional updates when dims already match poster", () => {
    expect(
      posterProvisionalDimensionsAlreadyApplied({
        videoWidth: 1080,
        videoHeight: 1920,
        naturalWidth: 1080,
        naturalHeight: 1920,
      }),
    ).toBe(true);
  });
});

describe("U1 PublishedVideoPlayer processing indicator wiring", () => {
  it("6–10: processing label for pending/uploading/processing; not ready; failed keeps unavailable", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("Processing video…");
    expect(player).toContain("data-published-video-processing");
    expect(player).toContain("showProcessingLabel");
    expect(player).toContain("Video unavailable");
    expect(player).toContain("shouldApplyPosterProvisionalVideoDimensions");
    expect(player).toContain("img.complete");
    expect(player).toContain("applyPosterProvisionalDimensions");
    expect(player).toMatch(
      /const canPlay =\s*status === "ready" && Boolean\(videoId\.trim\(\)\) && !isWarm/,
    );
  });

  it("11. ready video playback eligibility unchanged (status === ready gate)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toMatch(
      /ensureHlsLoaded[\s\S]*status !== "ready"[\s\S]*return false/,
    );
    expect(player).toContain('preload="none"');
  });

  it("12. media_order untouched; preserve helper used on surfaces", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(surface).toContain("preservePublishedVideoMetadataAcrossItems");
    expect(carousel).toContain("preservePublishedVideoMetadataAcrossItems");
    expect(surface).not.toMatch(/media_order\s*=/);
    expect(carousel).not.toMatch(/media_order\s*=/);
  });

  it("13. Feed visibility / RPC code untouched by U1", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).not.toContain("post_has_nonready_attached_video");
    expect(surface).not.toContain("can_view_post");
    expect(surface).not.toContain("get_feed_with_related_data");
  });
});
