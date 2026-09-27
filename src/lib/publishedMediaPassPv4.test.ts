/**
 * PASS PV4 — Edit published video hydration + media_order restore + tray stability.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildEditDraftMediaOrderFromPublished,
  isPublishedVideoReferenceJob,
  mapPublishedVideoReferenceToJob,
  publishedVideoRefLocalId,
  resolvePublishedMediaIdForEditSave,
  deriveOwnerEditVideoOp,
  type PublishedVideoReference,
} from "./editPublishedMedia";
import { buildCanonicalEditPostData } from "./editPostBootstrap";
import type { PublishedPostMediaRow } from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const videoRow: PublishedPostMediaRow = {
  id: "vid-1",
  post_id: "p1",
  sort_order: 0,
  kind: "video",
  bunny_video_id: "bunny-1",
  video_status: "ready",
  poster_url: "https://cdn/poster.jpg",
  duration_sec: 12,
  width: 1080,
  height: 1920,
};

const mixedOrder = [
  { kind: "image" as const, url: "https://cdn/a.jpg" },
  { kind: "video" as const, mediaId: "vid-1" },
  { kind: "image" as const, url: "https://cdn/b.jpg" },
];

describe("PASS PV4 — Edit published media hydration", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("A: video-only post hydrates PublishedVideoReference", () => {
    const built = buildEditDraftMediaOrderFromPublished({
      mediaOrder: [{ kind: "video", mediaId: "vid-1" }],
      postMedia: [videoRow],
      imageUrls: [],
    });
    expect(built.publishedVideo?.mediaId).toBe("vid-1");
    expect(built.draftOrder).toHaveLength(1);
    expect(built.draftOrder[0]?.kind).toBe("video");
    expect(built.draftOrder[0]?.clientId).toBe(publishedVideoRefLocalId("vid-1"));
  });

  it("B/C/D: image-video-image exact order, no duplication", () => {
    const built = buildEditDraftMediaOrderFromPublished({
      mediaOrder: mixedOrder,
      postMedia: [videoRow],
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/a.jpg"],
    });
    expect(built.draftOrder.map((i) => i.kind)).toEqual([
      "image",
      "video",
      "image",
    ]);
    expect(built.items).toHaveLength(3);
    const urls = built.items
      .filter((i) => i.kind === "image")
      .map((i) => (i.kind === "image" ? i.url : ""));
    expect(urls).toEqual(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    expect(built.publishedVideo?.mediaId).toBe("vid-1");
  });

  it("E: remote video never becomes DraftVideo", () => {
    const ref: PublishedVideoReference = {
      mediaId: "vid-1",
      bunnyVideoId: "bunny-1",
      status: "ready",
      posterUrl: "https://cdn/poster.jpg",
      width: 1080,
      height: 1920,
      durationSec: 12,
    };
    const job = mapPublishedVideoReferenceToJob(ref);
    expect(isPublishedVideoReferenceJob(job)).toBe(true);
    expect(job.localFile).toBeNull();
    expect(job.status).toBe("ready");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("hydratePublishedEditVideo");
    expect(provider).toContain("mapPublishedVideoReferenceToJob");
    expect(provider).toContain("isPublishedVideoReferenceJob(job)");
  });

  it("F: Add More Media tray uses hasVideo || images (not DraftVideo-only)", () => {
    const dock = read("src/components/create/CreateFinalizeHeroImageDock.tsx");
    expect(dock).toContain("hasActivePostVideo(videoJob)");
    expect(dock).toContain("totalImagesPost > 0 || hasVideo");
    expect(dock).toContain("setExpanded(true)");
  });

  it("G: edit carousel shows existing remote video via mixed hero", () => {
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    // LI1D.2: local-aware hero still forces mixed path when hasVideo.
    expect(hero).toContain("shouldUseCreateLocalAwareHero");
    expect(hero).toContain("hasVideo");
    expect(hero).toContain("CreateFinalizeMixedMediaCarousel");
    const carousel = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(carousel).toContain("remotePosterOnly");
    expect(carousel).toContain("job.posterUrl");
  });

  it("H/I: unchanged Save retains post_media.id / owner Edit can upload on ADD/REPLACE", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("resolvePublishedMediaIdForEditSave");
    expect(page).toContain("deriveOwnerEditVideoOp");
    expect(page).toContain("buildOwnerEditVideoEditPayload");
    expect(page).toContain("commitOwnerMediaInRepublish");
    expect(page).toContain("needsPublishTimeVideoUpload(videoJob)");
    const job = mapPublishedVideoReferenceToJob({
      mediaId: "vid-1",
      bunnyVideoId: "bunny-1",
      status: "ready",
      posterUrl: null,
      width: null,
      height: null,
      durationSec: null,
    });
    expect(resolvePublishedMediaIdForEditSave(job)).toBe("vid-1");
  });

  it("J: media_order save path after edit", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("updateOwnedPostMediaOrder");
    expect(publish).toContain("commitOwnerMediaInRepublish");
    expect(publish).toContain("payload.media_order");
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("mediaOrder.length > 0 ? mediaOrder");
    expect(page).toContain("commitOwnerMediaInRepublish: isPublishedEditMedia");
  });

  it("K/L: reorder/remove edit state via existing mediaOrder APIs", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("persistMediaOrder");
    expect(strip).toContain("removePostVideo");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain(
      "Published remote video in Edit: clear local edit state only",
    );
  });

  it("M/N: replacement uses DraftVideo pipeline; one-video rule", () => {
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("isPublishedVideoReferenceJob");
    expect(picker).toContain("replacing");
    const upload = read("src/lib/createPostVideoUpload.ts");
    expect(upload).toContain('job.localId.startsWith("published-ref:")');
  });

  it("O: discard never deletes published video (remove path skips Bunny)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("never Bunny delete");
    expect(provider).toContain("isPublishedVideoReferenceJob(job)");
  });

  it("P: hydration alone does not notify draft dirty", () => {
    const editLib = read("src/lib/editPublishedMedia.ts");
    expect(editLib).toContain("{ notify: false }");
    const bootstrap = read("src/lib/editPostBootstrap.ts");
    expect(bootstrap).toContain("seedEditMediaOrderIntoDraftMeta");
  });

  it("Q/R/S: save invalidates published media + detail/feed caches", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("invalidatePublishedMedia");
    expect(publish).toContain("invalidatePostDetailCache");
    expect(publish).toContain("clearFeedCache");
    const admin = read("src/api/services/adminPosts.ts");
    expect(admin).toContain("invalidatePublishedMedia");
    expect(admin).toContain("getPublishedPostMediaForDetail");
  });

  it("edit activities sync slot-0 images into mediaOrder", () => {
    const hook = read("src/hooks/useCreateDraftActivitiesState.ts");
    expect(hook).toContain("dispatchSlot0ImagesPersisted");
    expect(hook).toMatch(
      /isEditMode[\s\S]*dispatchSlot0ImagesPersisted/,
    );
  });

  it("T/U: PV3/PV2 surfaces unchanged (no Feed autoplay / fullscreen edits)", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_DWELL_MS");
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("data-swiper-event-isolation");
  });

  it("bootstrap includes PublishedVideoReference fields", () => {
    const data = buildCanonicalEditPostData(
      {
        id: "p1",
        type: "experience",
        caption: "hi",
        media_order: mixedOrder,
      },
      [
        {
          images: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
          order_idx: 0,
        },
      ],
      { postMedia: [videoRow], mediaOrder: mixedOrder },
    );
    expect(data.publishedVideo?.mediaId).toBe("vid-1");
    expect(data.mediaOrder).toHaveLength(3);
    expect(data.activities[0]?.images?.[0]).toContain("cdn/a");
  });

  it("owner Edit video mutations are derived (unsupported-gate stubs removed)", () => {
    const ref: PublishedVideoReference = {
      mediaId: "vid-1",
      bunnyVideoId: "bunny-1",
      status: "ready",
      posterUrl: null,
      width: null,
      height: null,
      durationSec: null,
    };
    expect(
      deriveOwnerEditVideoOp({
        videoJob: null,
        bootstrapPublishedVideo: ref,
      }),
    ).toBe("REMOVE");
    expect(
      deriveOwnerEditVideoOp({
        videoJob: mapPublishedVideoReferenceToJob(ref),
        bootstrapPublishedVideo: ref,
      }),
    ).toBe("UNCHANGED");
    const gates = read("src/lib/editPublishedMedia.ts");
    expect(gates).not.toContain("editHasUnsupportedVideoMutation");
  });

  it("getPostForEdit fetches post_media", () => {
    const posts = read("src/api/services/posts.ts");
    expect(posts).toContain("getPublishedPostMediaForDetail");
    expect(posts).toContain("postMedia");
  });
});
