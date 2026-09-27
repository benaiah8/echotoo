/**
 * Report-reviewer (Admin) Edit media frontend activation — source contracts.
 * Reuses Owner Edit lifecycle; Save routes via admin_republish_post.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOwnerEditVideoEditPayload,
  deriveOwnerEditVideoOp,
  mapPublishedVideoReferenceToJob,
  resolvePublishedMediaIdForEditSave,
} from "./editPublishedMedia";
import { mapDraftMediaOrderToPublished } from "./createDraftMediaOrder";
import type { PostVideoUploadJob } from "./createPostVideoUpload";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const FINALIZE = "src/pages/CreateFinalizePage.tsx";
const PUBLISH = "src/lib/createFlowPublish.ts";

describe("admin Edit media activation (source)", () => {
  it("A/E/V: Admin shares Owner Edit media path; gate removed; no prepare-on-select", () => {
    const page = read(FINALIZE);
    expect(page).not.toContain(
      "Video changes aren’t supported for admin edit yet. Keep the existing video.",
    );
    expect(page).toContain("const isPublishedEditMedia = isEditMode");
    expect(page).toContain("deriveOwnerEditVideoOp");
    expect(page).toContain("buildOwnerEditVideoEditPayload");
    expect(page).toContain("uploadVideoForPublish");
    // Prepare only inside Save path (edit ADD/REPLACE), not on select.
    const saveBlock = page.slice(
      page.indexOf("const isPublishedEditMedia = isEditMode"),
      page.indexOf("const { post } = await executeCreateFlowPublish"),
    );
    expect(saveBlock).toContain('editVideoOp === "ADD" || editVideoOp === "REPLACE"');
    expect(saveBlock).toContain("needsPublishTimeVideoUpload");
  });

  it("B/F/G/J/O/P: Admin Save folds video_edit + media_order into admin_republish_post", () => {
    const publish = read(PUBLISH);
    expect(publish).toContain("applyEditMediaToRepublishPayload");
    expect(publish).toContain("payload.video_edit = input.videoEdit");
    expect(publish).toContain("payload.media_order");
    // Admin branch uses buildAdminRepublishPayload which applies media fold.
    const adminBranch = publish.slice(
      publish.indexOf("if (input.isEditMode && input.editPostId && input.isAdminEdit)"),
      publish.indexOf("if (input.isEditMode && input.editPostId) {"),
    );
    expect(adminBranch).toContain("buildAdminRepublishPayload");
    expect(adminBranch).toContain("await adminRepublishPost");
    expect(adminBranch).toContain("Do NOT post-hoc updateOwnedPostMediaOrder");
    expect(adminBranch).not.toContain("await updateOwnedPostMediaOrder");
    expect(adminBranch).not.toContain('await import("./editPublishedMedia")');
  });

  it("Q: post-hoc updateOwnedPostMediaOrder is not called after Admin republish", () => {
    const publish = read(PUBLISH);
    const adminBranch = publish.slice(
      publish.indexOf("if (input.isEditMode && input.editPostId && input.isAdminEdit)"),
      publish.indexOf("if (input.isEditMode && input.editPostId) {"),
    );
    expect(adminBranch).toContain(
      "Do NOT post-hoc updateOwnedPostMediaOrder",
    );
    expect(adminBranch).not.toContain("await updateOwnedPostMediaOrder");
    expect(adminBranch).not.toContain(
      'await import("./editPublishedMedia")',
    );
  });

  it("D: UNCHANGED omits video_edit (shared helper)", () => {
    const built = buildOwnerEditVideoEditPayload({ op: "UNCHANGED" });
    expect(built.ok && built.payload).toBeNull();
  });

  it("B/F/G/J: intent + payload shapes for ADD / REPLACE / REMOVE", () => {
    const published = {
      mediaId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      bunnyVideoId: "bunny-1",
      status: "ready" as const,
      posterUrl: null,
      width: null,
      height: null,
      durationSec: null,
    };
    const publishedJob = mapPublishedVideoReferenceToJob(published);
    expect(deriveOwnerEditVideoOp({
      videoJob: publishedJob,
      bootstrapPublishedVideo: published,
    })).toBe("UNCHANGED");

    expect(deriveOwnerEditVideoOp({
      videoJob: null,
      bootstrapPublishedVideo: published,
    })).toBe("REMOVE");

    const localJob = {
      status: "local",
      localId: "draft-local-1",
      mediaId: undefined,
    } as unknown as PostVideoUploadJob;
    expect(deriveOwnerEditVideoOp({
      videoJob: localJob,
      bootstrapPublishedVideo: published,
    })).toBe("REPLACE");
    expect(deriveOwnerEditVideoOp({
      videoJob: localJob,
      bootstrapPublishedVideo: null,
    })).toBe("ADD");

    const staged = "11111111-2222-4333-8444-555555555555";
    const replace = buildOwnerEditVideoEditPayload({
      op: "REPLACE",
      stagedMediaId: staged,
      expectedAttachedMediaId: published.mediaId,
    });
    expect(replace.ok).toBe(true);
    if (replace.ok) {
      expect(replace.payload).toEqual({
        op: "REPLACE",
        staged_media_id: staged,
        expected_attached_media_id: published.mediaId,
      });
    }

    const remove = buildOwnerEditVideoEditPayload({
      op: "REMOVE",
      expectedAttachedMediaId: published.mediaId,
    });
    expect(remove.ok).toBe(true);
    if (remove.ok) {
      expect(remove.payload).toEqual({
        op: "REMOVE",
        staged_media_id: null,
        expected_attached_media_id: published.mediaId,
      });
    }

    const add = buildOwnerEditVideoEditPayload({
      op: "ADD",
      stagedMediaId: staged,
    });
    expect(add.ok).toBe(true);
    if (add.ok) {
      expect(add.payload).toEqual({
        op: "ADD",
        staged_media_id: staged,
        expected_attached_media_id: null,
      });
    }
  });

  it("N: media_order mapping for Admin payload (staged id / images-only)", () => {
    const staged = "11111111-2222-4333-8444-555555555555";
    expect(
      mapDraftMediaOrderToPublished(
        [
          { kind: "image", clientId: "i1", url: "https://cdn/a.jpg" },
          { kind: "video", clientId: "v1" },
        ],
        staged,
      ),
    ).toEqual([
      { kind: "image", url: "https://cdn/a.jpg" },
      { kind: "video", mediaId: staged },
    ]);
    expect(
      mapDraftMediaOrderToPublished(
        [{ kind: "image", clientId: "i1", url: "https://cdn/a.jpg" }],
        null,
      ),
    ).toEqual([{ kind: "image", url: "https://cdn/a.jpg" }]);
  });

  it("L/M: tray still supports remove image vs video independently", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("removePostVideo");
    expect(strip).toContain("persistMediaOrder");
  });

  it("C/I/K: Exit discard preserves published baseline (shared Edit discard)", () => {
    const tab = read("src/components/BottomTab.tsx");
    expect(tab).toContain("discardOwnerPublishedEditLocalState()");
    const drafts = read("src/lib/drafts.ts");
    expect(drafts).toContain("cleanupDraftVideoAssets");
    expect(drafts).toContain('localStorage.removeItem(EDIT_POST_DATA_KEY)');
  });

  it("S/T: Owner Create path markers and Owner RPC unchanged", () => {
    const page = read(FINALIZE);
    expect(page).toContain("if (!isEditMode)");
    expect(page).toContain("isAdminEdit: isEditMode && editData?.isAdminEdit === true");
    const publish = read(PUBLISH);
    expect(publish).toContain("ownerRepublishPost");
    expect(publish).toContain("adminRepublishPost");
    // Owner post-hoc path still exists for legacy non-atomic owner edits.
    expect(publish).toContain("updateOwnedPostMediaOrder");
  });

  it("U: normal Edit is only via existing isAdminEdit / owner entry points", () => {
    const page = read(FINALIZE);
    expect(page).toContain("isAdminEdit");
    // No new privilege bypass flags on upload.
    expect(page).not.toContain("clientIsAdmin");
    expect(page).not.toContain("forceAdminVideo");
  });

  it("W: tray remove lock still present", () => {
    const lock = read("src/lib/createFinalizeMediaRemoveGesture.ts");
    expect(lock).toContain("beginFinalizeMediaTrayRemoveTransaction");
    expect(lock).toContain("isFinalizeMediaTrayRemoveLocked");
  });

  it("R: Admin RPC failure leaves baseline — no attach before RPC; cleanup only after success", () => {
    const page = read(FINALIZE);
    const afterPublish = page.slice(
      page.indexOf("const { post } = await executeCreateFlowPublish"),
    );
    expect(afterPublish).toContain("cleanupDraftVideoAfterPublish");
    expect(afterPublish).toContain("discardOwnerPublishedEditLocalState");
    // Failure path toasts and returns without discard of published bootstrap.
    expect(page).toContain("publish failed");
  });

  it("H: REPLACE uses expected_attached from bootstrap publishedVideo", () => {
    const page = read(FINALIZE);
    expect(page).toContain(
      "expectedAttachedMediaId: bootstrapPublishedVideo?.mediaId ?? null",
    );
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

  it("Edit identity: ensureDraftPublishPostId used for published Edit (includes Admin)", () => {
    const page = read(FINALIZE);
    expect(page).toContain("if (isPublishedEditMedia)");
    expect(page).toContain("ensureDraftPublishPostId({");
    const drafts = read("src/lib/drafts.ts");
    expect(drafts).toContain("resolveOwnerEditPublishPostId");
    expect(drafts).toContain("EDIT_POST_DATA_KEY");
  });
});
