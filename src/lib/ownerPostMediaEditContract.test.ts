/**
 * Local contract / regression tests for Edit media backend (no DB, no prod).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allocateRetiredUnattachedSortOrder,
  replaceDetachAttachOrder,
  validateVideoEditPayload,
} from "./ownerPostMediaEditContract";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MIGRATION =
  "supabase/migrations/20261015120000_owner_commit_post_media_edit.sql";
const UPLOAD_INIT = "supabase/functions/bunny-upload-init/index.ts";
const UPLOAD_HELPERS = "supabase/functions/bunny-upload-init/helpers.ts";
const FOUNDATION =
  "supabase/migrations/20260828015630_post_media_foundation.sql";
const EDIT_GATES = "src/lib/editPublishedMedia.ts";
const CREATE_ATTACH =
  "supabase/migrations/20260915120000_owner_create_post_attach_post_media.sql";

describe("ownerPostMediaEditContract (pure)", () => {
  it("validates ADD / REPLACE / REMOVE / UNCHANGED shapes", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(validateVideoEditPayload({ op: "ADD", staged_media_id: id }).ok).toBe(
      true,
    );
    expect(
      validateVideoEditPayload({
        op: "REPLACE",
        staged_media_id: id,
        expected_attached_media_id: id,
      }).ok,
    ).toBe(true);
    expect(validateVideoEditPayload({ op: "REMOVE" }).ok).toBe(true);
    expect(validateVideoEditPayload({ op: "UNCHANGED" }).ok).toBe(true);
  });

  it("rejects ADD without staging and REMOVE with staging", () => {
    expect(validateVideoEditPayload({ op: "ADD" }).ok).toBe(false);
    expect(
      validateVideoEditPayload({
        op: "REMOVE",
        staged_media_id: "550e8400-e29b-41d4-a716-446655440000",
      }).ok,
    ).toBe(false);
  });

  it("allocates retired sort away from slot 0 and occupied values", () => {
    expect(allocateRetiredUnattachedSortOrder([0, 1000])).toBe(1001);
    expect(allocateRetiredUnattachedSortOrder([])).toBe(1000);
    expect(allocateRetiredUnattachedSortOrder([1000, 1001])).toBe(1002);
  });

  it("documents detach-before-attach REPLACE order", () => {
    expect(replaceDetachAttachOrder()).toEqual([
      "detach_old_to_retired_sort",
      "attach_staging_at_sort_0",
    ]);
  });
});

describe("Edit media backend migration (source contract)", () => {
  const sql = read(MIGRATION);
  const foundation = read(FOUNDATION);
  const uploadInit = read(UPLOAD_INIT);
  const helpers = read(UPLOAD_HELPERS);
  const gates = read(EDIT_GATES);
  const createAttach = read(CREATE_ATTACH);

  it("defines apply + commit RPCs and folds into republish", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.owner_apply_post_media_edit(",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.owner_commit_post_media_edit(",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.owner_republish_post(",
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("'ADD'");
    expect(sql).toContain("'REPLACE'");
    expect(sql).toContain("'REMOVE'");
    expect(sql).toContain("'UNCHANGED'");
    expect(sql).toContain("video_edit");
    expect(sql).toContain("staged_media_id");
    expect(sql).toContain("expected_attached_media_id");
    expect(sql).toContain("Staged media is not publish-ready");
    expect(sql).toContain("processing");
    expect(sql).toContain("ready");
  });

  it("solves unattached unique index safely on REPLACE", () => {
    expect(foundation).toContain("post_media_unattached_publish_sort_uniq");
    expect(foundation).toContain("post_media_attached_post_sort_uniq");
    expect(sql).toContain("v_retired_sort := 1000");
    expect(sql).toContain("sort_order = v_retired_sort");
    // Core REPLACE path: retire former primary, then attach staging at 0.
    const normalized = sql.replace(/\r\n/g, "\n");
    const retireThenAttach = normalized.indexOf(
      "SET post_id = NULL,\n          sort_order = v_retired_sort",
    );
    const attachAfterRetire = normalized.indexOf(
      "SET post_id = p_post_id,\n          sort_order = 0",
      retireThenAttach,
    );
    expect(retireThenAttach).toBeGreaterThan(-1);
    expect(attachAfterRetire).toBeGreaterThan(retireThenAttach);
  });

  it("does not delete Bunny assets or drop historical rows", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.post_media/i);
    expect(sql).not.toContain("bunny-video-delete");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+bunny/i);
    expect(sql.toLowerCase()).toContain("does not delete bunny assets");
  });

  it("preserves Create attach trigger INSERT-only behavior", () => {
    expect(createAttach).toContain(
      "posts_attach_ready_post_media_after_insert",
    );
    expect(sql).not.toContain("attach_ready_post_media_on_post_publish");
    expect(sql).toMatch(/Does NOT change Create attach trigger or owner_create_post/i);
    // Migration must not redefine Create publish.
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.owner_create_post\s*\(/i,
    );
  });

  it("upload-init supports owned Edit staging without Create 409 gate", () => {
    expect(helpers).toContain("resolveOwnedPostUploadInitGate");
    expect(helpers).toContain("edit_staging");
    expect(uploadInit).toContain("resolveOwnedPostUploadInitGate");
    expect(uploadInit).toContain("edit staging");
    expect(uploadInit).not.toContain("Edit video is not supported yet");
    expect(uploadInit).toContain(".is(\"post_id\", null)");
    // Reviewer path prepared locally (not activated in frontend this pass).
    expect(helpers).toContain("actorIsReportReviewer");
  });

  it("owner Edit media activation wires Save (unsupported-gate stubs removed)", () => {
    expect(gates).toContain("deriveOwnerEditVideoOp");
    expect(gates).toContain("buildOwnerEditVideoEditPayload");
    expect(gates).not.toContain("editHasUnsupportedVideoMutation");
    expect(gates).not.toContain("EDIT_VIDEO_REPLACE_UNSUPPORTED_MESSAGE");
    expect(gates).not.toContain("EDIT_VIDEO_REMOVE_UNSUPPORTED_MESSAGE");
  });

  it("authorizes apply via ownership checks and grants", () => {
    expect(sql).toContain("Not authorized");
    expect(sql).toContain("Stale attached video; reload and retry");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.owner_apply_post_media_edit",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.owner_commit_post_media_edit",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.owner_republish_post",
    );
  });

  it("rejects media_order pointing at unattached video", () => {
    expect(sql).toContain("media_order references video that is not attached");
    expect(sql).toContain("REMOVE media_order must not reference a video");
    expect(sql).toContain("media_order video must match staged_media_id");
  });
});
