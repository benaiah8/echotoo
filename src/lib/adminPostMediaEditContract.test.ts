/**
 * Local contract tests for report-reviewer Edit media backend preparation.
 * No DB apply, no production.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MIGRATION =
  "supabase/migrations/20261026120000_admin_commit_post_media_edit.sql";
const OWNER_MIGRATION =
  "supabase/migrations/20261015120000_owner_commit_post_media_edit.sql";
const UPLOAD_HELPERS = "supabase/functions/bunny-upload-init/helpers.ts";
const UPLOAD_INIT = "supabase/functions/bunny-upload-init/index.ts";
const FINALIZE = "src/pages/CreateFinalizePage.tsx";

describe("admin commit post media edit migration (source)", () => {
  const sql = read(MIGRATION);

  it("introduces shared core without granting it to authenticated", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public._apply_post_media_edit_core(",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public._apply_post_media_edit_core(uuid, uuid, jsonb, jsonb, boolean)",
    );
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\._apply_post_media_edit_core[\s\S]{0,80}TO authenticated/,
    );
  });

  it("keeps owner_apply strict author check then delegates to core", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.owner_apply_post_media_edit(",
    );
    expect(sql).toContain("IF v_author_id IS DISTINCT FROM p_actor THEN");
    expect(sql).toContain("RAISE EXCEPTION 'Not authorized'");
    expect(sql).toContain("PERFORM public._apply_post_media_edit_core(");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.owner_apply_post_media_edit(uuid, uuid, jsonb, jsonb, boolean)",
    );
  });

  it("folds optional video_edit + media_order into admin_republish_post", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_republish_post(",
    );
    expect(sql).toContain("report_reviewers");
    expect(sql).toContain("Admin permission required");
    expect(sql).toContain("v_video_edit");
    expect(sql).toContain("v_media_order_provided");
    expect(sql).toContain("p_payload ? 'video_edit'");
    expect(sql).toContain("p_payload ? 'media_order'");
    expect(sql).toContain("PERFORM public._apply_post_media_edit_core(");
    // Reviewer is staging actor — not spoofed as post author.
    expect(sql).toContain("v_actor_user_id");
    expect(sql).toContain(
      "Staging rows are owned by the reviewer actor",
    );
  });

  it("preserves admin audit + ordinary fields when media keys omitted path exists", () => {
    expect(sql).toContain("admin_post_action_audit");
    expect(sql).toContain("'edit_post'");
    expect(sql).toContain("Omitting those keys preserves prior admin republish");
  });

  it("preserves REPLACE detach-before-attach and no Bunny deletes", () => {
    expect(sql).toContain("v_retired_sort := 1000");
    expect(sql).toContain("Staged media is not unattached");
    expect(sql).toContain("Stale attached video; reload and retry");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.post_media/i);
    expect(sql.toLowerCase()).toContain("no bunny delete");
  });

  it("does not rewrite historical owner media migration file", () => {
    const owner = read(OWNER_MIGRATION);
    expect(owner).toContain("owner_apply_post_media_edit");
    // New migration is additive; historical file untouched by this suite path.
    expect(MIGRATION).not.toBe(OWNER_MIGRATION);
  });
});

describe("bunny-upload-init reviewer edit_staging (source)", () => {
  const helpers = read(UPLOAD_HELPERS);
  const index = read(UPLOAD_INIT);

  it("gate accepts report reviewer without trusting client admin boolean", () => {
    expect(helpers).toContain("actorIsReportReviewer");
    expect(helpers).toContain("actorIsReportReviewer === true");
    expect(index).toContain('from("report_reviewers")');
    expect(index).toContain(".eq(\"user_id\", userId)");
    expect(index).toContain("actorIsReportReviewer");
    expect(index).not.toContain("isAdminEdit");
    expect(index).not.toContain("clientIsAdmin");
  });

  it("still documents Create + owner staging paths", () => {
    expect(helpers).toContain('mode: "create"');
    expect(helpers).toContain('mode: "edit_staging"');
    expect(helpers).toContain("Forbidden");
  });
});

describe("Admin frontend video gate retired (activation pass)", () => {
  it("CreateFinalizePage no longer blocks admin video mutations", () => {
    const page = read(FINALIZE);
    expect(page).toContain("isAdminEdit === true");
    expect(page).not.toContain(
      "Video changes aren’t supported for admin edit yet. Keep the existing video.",
    );
    expect(page).toContain("isPublishedEditMedia");
    expect(page).toContain("commitOwnerMediaInRepublish: isPublishedEditMedia");
  });
});
