/**
 * Owner Edit media activation — intent derivation, identity, hydrate priority,
 * Save payload wiring, Create regression guards (source + pure helpers).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOwnerEditVideoEditPayload,
  deriveOwnerEditVideoOp,
  isPublishedVideoReferenceJob,
  mapPublishedVideoReferenceToJob,
  type PublishedVideoReference,
} from "./editPublishedMedia";
import { canStartAnotherPostVideo } from "./createPostVideoUpload";
import { validateVideoEditPayload } from "./ownerPostMediaEditContract";
import { mapDraftMediaOrderToPublished } from "./createDraftMediaOrder";
import { ensureDraftPublishPostId } from "./drafts";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const EDIT_POST_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

const publishedRef: PublishedVideoReference = {
  mediaId: "b2c3d4e5-f6a7-4890-b123-456789abcdef",
  bunnyVideoId: "bunny-pub",
  status: "ready",
  posterUrl: "https://cdn/poster.jpg",
  width: 1080,
  height: 1920,
  durationSec: 12,
};

describe("owner Edit media activation", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  it("A/G/AA: Create selection path still has no bunny-upload-init / prepare on ingest", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const start = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(start).not.toContain("invokeBunnyUploadInit");
    expect(start).not.toContain("createPublishVideoUpload");
    expect(start).not.toContain("ensurePublishVideoPreparation");
  });

  it("Edit draft identity uses existing editPostData.postId", () => {
    localStorage.setItem(
      "editPostData",
      JSON.stringify({ postId: EDIT_POST_ID, type: "experience" }),
    );
    const id = ensureDraftPublishPostId({ fresh: false });
    expect(id).toBe(EDIT_POST_ID);
    const meta = JSON.parse(localStorage.getItem("draftMeta") || "{}") as {
      publishPostId?: string;
    };
    expect(meta.publishPostId).toBe(EDIT_POST_ID);
  });

  it("Create identity still mints UUID when not in Edit", () => {
    const id = ensureDraftPublishPostId({ fresh: true });
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(id).not.toBe(EDIT_POST_ID);
  });

  it("B/H/I/P: deriveOwnerEditVideoOp + payload contract", () => {
    const publishedJob = mapPublishedVideoReferenceToJob(publishedRef);
    expect(deriveOwnerEditVideoOp({
      videoJob: publishedJob,
      bootstrapPublishedVideo: publishedRef,
    })).toBe("UNCHANGED");

    expect(
      deriveOwnerEditVideoOp({
        videoJob: null,
        bootstrapPublishedVideo: publishedRef,
      }),
    ).toBe("REMOVE");

    const localJob = {
      mediaId: "draft-local",
      videoId: "draft-local",
      status: "local" as const,
      progress: 0,
      videoStatus: "pending" as const,
      localId: "local-new",
      localFile: null,
      localPreviewUrl: null,
      localPosterUrl: null,
    };
    expect(
      deriveOwnerEditVideoOp({
        videoJob: localJob,
        bootstrapPublishedVideo: publishedRef,
      }),
    ).toBe("REPLACE");
    expect(
      deriveOwnerEditVideoOp({
        videoJob: localJob,
        bootstrapPublishedVideo: null,
      }),
    ).toBe("ADD");

    const add = buildOwnerEditVideoEditPayload({
      op: "ADD",
      stagedMediaId: publishedRef.mediaId,
    });
    expect(add.ok).toBe(true);
    if (add.ok) {
      expect(add.payload).toEqual({
        op: "ADD",
        staged_media_id: publishedRef.mediaId,
        expected_attached_media_id: null,
      });
    }

    const replace = buildOwnerEditVideoEditPayload({
      op: "REPLACE",
      stagedMediaId: "c3d4e5f6-a7b8-4901-a234-56789abcdef0",
      expectedAttachedMediaId: publishedRef.mediaId,
    });
    expect(replace.ok).toBe(true);
    if (replace.ok) {
      expect(replace.payload?.op).toBe("REPLACE");
      expect(replace.payload?.staged_media_id).toBe(
        "c3d4e5f6-a7b8-4901-a234-56789abcdef0",
      );
      expect(replace.payload?.expected_attached_media_id).toBe(
        publishedRef.mediaId,
      );
    }

    const remove = buildOwnerEditVideoEditPayload({
      op: "REMOVE",
      expectedAttachedMediaId: publishedRef.mediaId,
    });
    expect(remove.ok).toBe(true);
    if (remove.ok) {
      expect(remove.payload?.op).toBe("REMOVE");
      expect(remove.payload?.staged_media_id).toBeNull();
      expect(remove.payload?.expected_attached_media_id).toBe(
        publishedRef.mediaId,
      );
    }

    const unchanged = buildOwnerEditVideoEditPayload({ op: "UNCHANGED" });
    expect(unchanged.ok).toBe(true);
    if (unchanged.ok) expect(unchanged.payload).toBeNull();
  });

  it("I: validateVideoEditPayload requires staged id for REPLACE", () => {
    const bad = validateVideoEditPayload({
      op: "REPLACE",
      expected_attached_media_id: publishedRef.mediaId,
    });
    expect(bad.ok).toBe(false);
  });

  it("M: published-ref is replaceable and not a local draft job", () => {
    const job = mapPublishedVideoReferenceToJob(publishedRef);
    expect(isPublishedVideoReferenceJob(job)).toBe(true);
    expect(canStartAnotherPostVideo(job)).toBe(true);
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("replacingLocal");
    expect(provider).toContain("isLocalDraftVideoJob(currentJob)");
    expect(provider).toContain("deleteDraftVideoStorageBytes(previousDraft");
    expect(provider).toContain("protectLocalId");
  });

  it("R: Edit hydrate prefers local DraftVideo over published baseline", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const hydrate = provider.slice(
      provider.indexOf("const hydrateVideoFromDraft"),
      provider.indexOf("useEffect(() => {\n    providerGenerationRef"),
    );
    expect(hydrate).toContain("isCreateEditModeActive()");
    const localIdx = hydrate.indexOf("hydrateLocalDraftVideo");
    const publishedIdx = hydrate.indexOf("hydratePublishedEditVideo");
    expect(localIdx).toBeGreaterThan(-1);
    expect(publishedIdx).toBeGreaterThan(localIdx);
  });

  it("U/W/X: published Edit Save includes media_order + video_edit; skips post-hoc", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("commitOwnerMediaInRepublish");
    expect(publish).toContain("video_edit");
    expect(publish).toContain("payload.media_order");
    expect(publish).toContain("!input.commitOwnerMediaInRepublish");
    expect(publish).toContain("applyEditMediaToRepublishPayload");
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("commitOwnerMediaInRepublish: isPublishedEditMedia");
    expect(page).toContain("videoEdit: isPublishedEditMedia ? editVideoEdit");
  });

  it("C/J/Q: Edit Exit uses discardOwnerPublishedEditLocalState", () => {
    const tab = read("src/components/BottomTab.tsx");
    expect(tab).toContain("discardOwnerPublishedEditLocalState()");
    const drafts = read("src/lib/drafts.ts");
    expect(drafts).toContain("cleanupDraftVideoAssets");
    expect(drafts).toContain('localStorage.removeItem(EDIT_POST_DATA_KEY)');
  });

  it("F: UNCHANGED omits video_edit payload", () => {
    const built = buildOwnerEditVideoEditPayload({ op: "UNCHANGED" });
    expect(built.ok && built.payload).toBeNull();
  });

  it("media_order mapping: ADD uses staged id; REMOVE has no video", () => {
    const staged = "d4e5f6a7-b8c9-4012-d345-6789abcdef01";
    const withVideo = mapDraftMediaOrderToPublished(
      [
        { kind: "image", clientId: "i1", url: "https://cdn/a.jpg" },
        { kind: "video", clientId: "v1" },
      ],
      staged,
    );
    expect(withVideo).toEqual([
      { kind: "image", url: "https://cdn/a.jpg" },
      { kind: "video", mediaId: staged },
    ]);
    const imagesOnly = mapDraftMediaOrderToPublished(
      [{ kind: "image", clientId: "i1", url: "https://cdn/a.jpg" }],
      null,
    );
    expect(imagesOnly).toEqual([
      { kind: "image", url: "https://cdn/a.jpg" },
    ]);
  });

  it("V: tray remove transaction lock still present", () => {
    const lock = read("src/lib/createFinalizeMediaRemoveGesture.ts");
    expect(lock).toContain("beginFinalizeMediaTrayRemoveTransaction");
    expect(lock).toContain("isFinalizeMediaTrayRemoveLocked");
  });

  it("Z: CreateFinalizePage still separates Create publish upload path", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("if (!isEditMode)");
    expect(page).toContain("uploadVideoForPublish");
    expect(page).toContain("isPublishedEditMedia");
  });

  it("picker allows replace over published-ref (library + record)", () => {
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("isPublishedVideoReferenceJob(job)");
    expect(picker).toContain(
      "isLocalDraftVideoJob(job) || isPublishedVideoReferenceJob(job)",
    );
  });
});
