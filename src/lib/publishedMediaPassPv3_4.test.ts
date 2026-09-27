/**
 * PASS PV3.4 — Instant published video poster + processing revalidator + uncapped height.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DRAFT_VIDEO_POSTER_MAX_EDGE_PX } from "./createDraftVideo/extractVideoPosterFrame";
import {
  isOwnedPostMediaPosterStoragePath,
  VIDEO_POSTER_UPLOAD_POLICY,
} from "./createDraftVideo/publishVideoPoster";
import {
  __resetPublishedMediaCacheForTests,
  buildPublishedMediaItems,
  publishedMediaFrameStyle,
  PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
  PUBLISHED_LIST_VIDEO_DWELL_MS,
  seedPublishedMediaFromList,
  getPublishedMediaCache,
  publishedMediaViewerKey,
  computeEffectiveIntersectionRatio,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function scaleLongEdge(w: number, h: number): number {
  const longest = Math.max(w, h, 1);
  if (longest <= DRAFT_VIDEO_POSTER_MAX_EDGE_PX) return longest;
  return DRAFT_VIDEO_POSTER_MAX_EDGE_PX;
}

describe("PASS PV3.4 — poster pipeline", () => {
  it("A/B/C: Create poster reuse + 720 edge + no second system", () => {
    const extract = read("src/lib/createDraftVideo/extractVideoPosterFrame.ts");
    const publishPoster = read("src/lib/createDraftVideo/publishVideoPoster.ts");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(DRAFT_VIDEO_POSTER_MAX_EDGE_PX).toBe(720);
    expect(VIDEO_POSTER_UPLOAD_POLICY.maxEdgePx).toBe(720);
    expect(scaleLongEdge(3840, 2160)).toBe(720);
    expect(publishPoster).toContain("fetch(localPosterUrl)");
    expect(publishPoster).toContain("extractVideoPosterFrame");
    expect(publishPoster).toContain("ensurePublishVideoPoster");
    expect(provider).toContain("ensurePublishVideoPoster");
    expect(provider).toContain("posterStoragePath");
    expect(extract).toContain("image/jpeg");
    expect(extract).toContain("0.82");
  });

  it("D/E: poster Storage path user-scoped; retry reuses remote", () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      isOwnedPostMediaPosterStoragePath(`${uid}/post/abc.webp`, uid),
    ).toBe(true);
    expect(
      isOwnedPostMediaPosterStoragePath(`${uid}/post/../secret.webp`, uid),
    ).toBe(false);
    expect(
      isOwnedPostMediaPosterStoragePath(`other/post/abc.webp`, uid),
    ).toBe(false);
    const publishPoster = read("src/lib/createDraftVideo/publishVideoPoster.ts");
    expect(publishPoster).toContain("remotePosterStoragePath");
    expect(publishPoster).toContain("reusedRemote: true");
  });

  it("F/G: bunny-upload-init validates path and seeds poster_url", () => {
    const helpers = read("supabase/functions/bunny-upload-init/helpers.ts");
    const index = read("supabase/functions/bunny-upload-init/index.ts");
    expect(helpers).toContain("validatePosterStoragePath");
    expect(helpers).toContain("buildMediaBucketPublicUrl");
    expect(helpers).toContain("posterStoragePath");
    expect(index).toContain("poster_url: posterPublicUrl");
    expect(index).toContain("validatePosterStoragePath");
  });
});

describe("PASS PV3.4 — UX / cache / cleanup", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
  });

  it("H/I: processing with poster seeds cache; no processing copy", () => {
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "u1",
      mediaOrder: [{ kind: "video", mediaId: "m1" }],
      postMedia: [
        {
          id: "m1",
          post_id: "p1",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b1",
          video_status: "processing",
          poster_url: "https://cdn.example/media/u/post/p.webp",
          duration_sec: null,
          width: 1080,
          height: 1920,
        },
      ],
      source: "publish",
    });
    const entry = getPublishedMediaCache("p1", publishedMediaViewerKey("u1"));
    expect(entry?.items[0]).toMatchObject({
      kind: "video",
      status: "processing",
      posterUrl: "https://cdn.example/media/u/post/p.webp",
    });
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("Getting video ready");
    expect(player).toContain("showPoster");
  });

  it("J/K: creator cache + prepend include compact manifest", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    const prepend = read("src/lib/ownCreatedPendingPrepend.ts");
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(publish).toContain("publishedMediaSeed");
    expect(publish).toContain('source: "publish"');
    expect(prepend).toContain("media_order");
    expect(prepend).toContain("post_media");
    expect(finalize).toContain("publishedMediaSeed");
  });

  it("L: Feed RPC still returns poster_url (contract)", () => {
    const sql = read(
      "supabase/migrations/20260924120000_feed_profile_published_media_manifest.sql",
    );
    expect(sql).toContain("'poster_url', pm.poster_url");
  });

  it("M/N/O: webhook ready replaces + best-effort cleanup", () => {
    const webhook = read("supabase/functions/bunny-stream-webhook/index.ts");
    const shared = read(
      "supabase/functions/_shared/echoTooMediaPosterCleanup.ts",
    );
    expect(webhook).toContain("previousPosterUrl");
    expect(webhook).toContain("deleteEchoTooMediaPosterBestEffort");
    expect(shared).toContain("parseEchoTooMediaBucketObjectPath");
    expect(webhook).toMatch(
      /\.update\(patch\)[\s\S]*deleteEchoTooMediaPosterBestEffort/,
    );
  });

  it("P/Q: discard + published delete clean owned poster", () => {
    const discard = read("src/lib/createDraftVideo/discardCleanup.ts");
    const del = read("supabase/functions/delete-published-post/index.ts");
    expect(discard).toContain("deleteOwnedDraftVideoPosterBestEffort");
    expect(del).toContain("deleteEchoTooMediaPosterBestEffort");
    expect(del).toContain("poster_url");
  });

  it("R/S/T: single processing list poll + in-place patch", () => {
    const revalidator = read(
      "src/lib/publishedMedia/publishedProcessingListRevalidator.ts",
    );
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(revalidator).toContain("requestPublishedProcessingListOwnership");
    expect(revalidator).toContain("PUBLISHED_PROCESSING_LIST_POLL_MS");
    expect(revalidator).toContain("fetchPublishedPostMediaRowById");
    expect(revalidator).toContain("patchPublishedMediaRow");
    expect(surface).toContain("requestPublishedProcessingListOwnership");
    expect(surface).toContain('status === "processing"');
  });
});

describe("PASS PV3.4 — height + visibility + guardrails", () => {
  it("U/V/W/X/Y: video-only uncapped; missing dims + mixed capped", () => {
    const landscape = publishedMediaFrameStyle(
      buildPublishedMediaItems({
        mediaOrder: [{ kind: "video", mediaId: "m1" }],
        postMedia: [
          {
            id: "m1",
            post_id: "p",
            sort_order: 0,
            kind: "video",
            bunny_video_id: "b",
            video_status: "ready",
            poster_url: null,
            duration_sec: 1,
            width: 1920,
            height: 1080,
          },
        ],
        imageUrls: [],
      }),
      "40vh",
    );
    expect(landscape.maxHeight).toBeUndefined();
    expect(landscape.aspectRatio).toBe("1920 / 1080");

    const portrait = publishedMediaFrameStyle(
      buildPublishedMediaItems({
        mediaOrder: [{ kind: "video", mediaId: "m1" }],
        postMedia: [
          {
            id: "m1",
            post_id: "p",
            sort_order: 0,
            kind: "video",
            bunny_video_id: "b",
            video_status: "ready",
            poster_url: null,
            duration_sec: 1,
            width: 1080,
            height: 1920,
          },
        ],
        imageUrls: [],
      }),
      "40vh",
    );
    expect(portrait.maxHeight).toBeUndefined();

    const square = publishedMediaFrameStyle(
      buildPublishedMediaItems({
        mediaOrder: [{ kind: "video", mediaId: "m1" }],
        postMedia: [
          {
            id: "m1",
            post_id: "p",
            sort_order: 0,
            kind: "video",
            bunny_video_id: "b",
            video_status: "ready",
            poster_url: null,
            duration_sec: 1,
            width: 1080,
            height: 1080,
          },
        ],
        imageUrls: [],
      }),
      "40vh",
    );
    expect(square.maxHeight).toBeUndefined();

    expect(
      publishedMediaFrameStyle(
        buildPublishedMediaItems({
          mediaOrder: [{ kind: "video", mediaId: "m1" }],
          postMedia: [
            {
              id: "m1",
              post_id: "p",
              sort_order: 0,
              kind: "video",
              bunny_video_id: "b",
              video_status: "ready",
              poster_url: null,
              duration_sec: 1,
              width: null,
              height: null,
            },
          ],
          imageUrls: [],
        }),
        "40vh",
      ),
    ).toMatchObject({
      width: "100%",
      height: "auto",
      aspectRatio: expect.any(String),
      minHeight: expect.any(String),
    });
    expect(
      publishedMediaFrameStyle(
        buildPublishedMediaItems({
          mediaOrder: [{ kind: "video", mediaId: "m1" }],
          postMedia: [
            {
              id: "m1",
              post_id: "p",
              sort_order: 0,
              kind: "video",
              bunny_video_id: "b",
              video_status: "ready",
              poster_url: null,
              duration_sec: 1,
              width: null,
              height: null,
            },
          ],
          imageUrls: [],
        }),
        "40vh",
      ).maxHeight,
    ).toBeUndefined();

    const mixed = publishedMediaFrameStyle(
      buildPublishedMediaItems({
        mediaOrder: [
          { kind: "image", url: "https://cdn/a.jpg" },
          { kind: "video", mediaId: "m1" },
        ],
        postMedia: [
          {
            id: "m1",
            post_id: "p",
            sort_order: 0,
            kind: "video",
            bunny_video_id: "b",
            video_status: "ready",
            poster_url: null,
            duration_sec: 1,
            width: 1080,
            height: 1920,
          },
        ],
        imageUrls: ["https://cdn/a.jpg"],
      }),
      "40vh",
      { multiAspectRatio: 1080 / 1920 },
    );
    expect(mixed.maxHeight).toBeUndefined();
    expect(mixed.minHeight).toBe("12rem");
    expect(mixed.height).toBe("auto");
    expect(Number(mixed.aspectRatio)).toBeCloseTo(1080 / 1920, 4);
  });

  it("Z: tall portrait can reach autoplay via effective visibility", () => {
    const ratio = computeEffectiveIntersectionRatio({
      isIntersecting: true,
      intersectionRatio: 0.4,
      intersectionRect: { height: 700, width: 390 },
      boundingClientRect: { height: 1200, width: 390 },
      rootBounds: { height: 700, width: 390 },
      target: null,
      time: 0,
    } as unknown as IntersectionObserverEntry);
    expect(ratio).toBeCloseTo(1);
    expect(ratio).toBeGreaterThanOrEqual(PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO);
  });

  it("AA: PV3.1 active/warm thresholds unchanged", () => {
    expect(PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO).toBe(0.7);
    expect(PUBLISHED_LIST_VIDEO_WARM_RATIO).toBe(0.15);
    expect(PUBLISHED_LIST_VIDEO_DWELL_MS).toBe(350);
  });

  it("AB/AC/AD: LI1 / Android / IOS1 unchanged contracts", () => {
    const li1c = read("src/lib/createDraftImage/publishDraftImages.ts");
    expect(li1c).toContain("uploadSurvivingDraftImagesForPublish");
    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(publish).toContain("uploadNativeVideoToBunnyTus");
    expect(publish).toContain("posterStoragePath");
    const ios = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePlugin.swift",
    );
    expect(ios).toContain("EchoVideoPrepare");
  });

  it("AE: no schema migration for poster_url", () => {
    const foundation = read(
      "supabase/migrations/20260828015630_post_media_foundation.sql",
    );
    expect(foundation).toContain("poster_url text NULL");
    expect(read("supabase/functions/bunny-upload-init/index.ts")).not.toContain(
      "ALTER TABLE",
    );
  });
});
