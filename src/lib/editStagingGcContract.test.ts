/**
 * Edit staging GC — local contract tests (no DB, no prod, no Bunny).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MIGRATION = "supabase/migrations/20261028120000_edit_staging_gc.sql";
const EDGE_INDEX = "supabase/functions/edit-staging-gc/index.ts";
const EDGE_HELPERS = "supabase/functions/edit-staging-gc/helpers.ts";
const EDGE_BUNNY = "supabase/functions/edit-staging-gc/bunnyApi.ts";
const CONFIG = "supabase/config.toml";

const OWNER_EDIT =
  "supabase/migrations/20261015120000_owner_commit_post_media_edit.sql";
const ADMIN_EDIT =
  "supabase/migrations/20261026120000_admin_commit_post_media_edit.sql";
const DRAFTS = "src/lib/drafts.ts";

describe("edit staging GC migration", () => {
  it("migration file exists", () => {
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true);
  });

  it("outbox schema + status check + no FK to post_media", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("CREATE TABLE public.edit_staging_gc_outbox");
    expect(sql).toContain("post_media_id uuid PRIMARY KEY");
    expect(sql).toContain("bunny_video_id text NOT NULL");
    expect(sql).toContain("attempt_count integer NOT NULL DEFAULT 0");
    expect(sql).toContain("status text NOT NULL DEFAULT 'pending'");
    expect(sql).toContain("status IN ('pending', 'dead')");
    expect(sql).not.toContain("REFERENCES public.post_media");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.edit_staging_gc_outbox FROM PUBLIC, anon, authenticated",
    );
  });

  it("claim + count + finish RPCs are SECURITY DEFINER and revoked from clients", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.claim_edit_staging_gc_batch(",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.count_edit_staging_gc_candidates()",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.finish_edit_staging_gc_item(",
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_edit_staging_gc_batch(integer)",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.count_edit_staging_gc_candidates()",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.finish_edit_staging_gc_item(uuid, text, text)",
    );
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("A/B/C/D/E/F: exact candidate predicate (and exclusions)", () => {
    const sql = read(MIGRATION);
    const claimStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_edit_staging_gc_batch",
    );
    const claimEnd = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.finish_edit_staging_gc_item",
    );
    const claim = sql.slice(claimStart, claimEnd);

    expect(claim).toContain("pm.kind = 'video'");
    expect(claim).toContain("pm.post_id IS NULL");
    expect(claim).toContain("pm.sort_order = 0");
    expect(claim).toContain("pm.created_at < now() - interval '7 days'");
    expect(claim).toContain("'pending'");
    expect(claim).toContain("'uploading'");
    expect(claim).toContain("'processing'");
    expect(claim).toContain("'ready'");
    expect(claim).toContain("'failed'");
    expect(claim).toContain("p.status = 'published'");
    expect(claim).toContain("FOR UPDATE OF pm SKIP LOCKED");
    expect(claim).toContain("LEAST(COALESCE(p_limit, 10), 25)");

    // Must not use broad "not attached" only / retired / create heuristics
    expect(claim).not.toContain("sort_order >= 1000");
    expect(claim).not.toContain("sort_order > 0");
    // Q: Create orphan = no published post — predicate requires EXISTS published
    expect(claim).toContain("EXISTS (");
    expect(claim).toMatch(/p\.status\s*=\s*'published'/);
  });

  it("count RPC shares the same candidate predicate", () => {
    const sql = read(MIGRATION);
    const countStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.count_edit_staging_gc_candidates",
    );
    const countEnd = sql.indexOf(
      "-- 4) claim_edit_staging_gc_batch",
    );
    const count = sql.slice(countStart, countEnd);
    expect(count).toContain("pm.kind = 'video'");
    expect(count).toContain("pm.post_id IS NULL");
    expect(count).toContain("pm.sort_order = 0");
    expect(count).toContain("interval '7 days'");
    expect(count).toContain("p.status = 'published'");
    expect(count).not.toMatch(/\bDELETE\b/);
    expect(count).not.toMatch(/\bUPDATE\b/);
    expect(count).not.toMatch(/\bINSERT\b/);
  });

  it("H: claim deletes post_media and inserts outbox atomically", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("DELETE FROM public.post_media pm");
    expect(sql).toContain("INSERT INTO public.edit_staging_gc_outbox");
    expect(sql).toContain("AND pm.post_id IS NULL");
    expect(sql).toContain("AND pm.sort_order = 0");
  });

  it("finish outcomes: delete/missing remove; retry then dead at 5", () => {
    const sql = read(MIGRATION);
    const finishStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.finish_edit_staging_gc_item",
    );
    const finish = sql.slice(finishStart);
    expect(finish).toContain("'deleted'");
    expect(finish).toContain("'already_missing'");
    expect(finish).toContain("'retryable_failed'");
    expect(finish).toContain("'dead'");
    expect(finish).toContain("DELETE FROM public.edit_staging_gc_outbox");
    expect(finish).toContain("attempt_count + 1");
    expect(finish).toContain("attempt_count + 1 >= 5");
    expect(finish).toContain("status = 'dead'");
  });

  it("no Bunny work inside SQL", () => {
    const sql = read(MIGRATION);
    expect(sql.toLowerCase()).not.toContain("bunnycdn");
    expect(sql.toLowerCase()).not.toContain("http");
  });
});

describe("edit-staging-gc Edge Function", () => {
  it("config.toml registers internal function", () => {
    const cfg = read(CONFIG);
    expect(cfg).toContain("[functions.edit-staging-gc]");
    expect(cfg).toContain("verify_jwt = false");
  });

  it("uses internal auth; does not invoke user-facing bunny-video-delete", () => {
    const index = read(EDGE_INDEX);
    expect(index).toContain("authorizeInternalPushRequest");
    expect(index).toContain("createServiceRoleClient");
    expect(index).not.toContain('functions.invoke("bunny-video-delete"');
    expect(index).not.toContain("/bunny-video-delete");
    expect(index).toContain("deleteBunnyVideo");
    // Comment may mention the endpoint name; executable path must use local transport.
    expect(index).toContain('from "./bunnyApi.ts"');
  });

  it("J: dry-run default — no claim / no Bunny when dry", () => {
    const helpers = read(EDGE_HELPERS);
    const index = read(EDGE_INDEX);
    expect(helpers).toContain("isEditStagingGcDryRun");
    expect(helpers).toMatch(/return true/);
    expect(index).toContain("isEditStagingGcDryRun");
    expect(index).toContain("count_edit_staging_gc_candidates");
    // Dry-run branch returns before claim
    const dryIdx = index.indexOf("if (dryRun)");
    const claimIdx = index.indexOf("claim_edit_staging_gc_batch");
    expect(dryIdx).toBeGreaterThan(0);
    expect(claimIdx).toBeGreaterThan(dryIdx);
    const dryBlock = index.slice(dryIdx, claimIdx);
    expect(dryBlock).toContain("return jsonResponse");
    expect(dryBlock).not.toContain("deleteBunnyVideo");
  });

  it("K/L/M: Bunny outcomes mapped to finish", () => {
    const helpers = read(EDGE_HELPERS);
    const index = read(EDGE_INDEX);
    expect(helpers).toContain('already_missing');
    expect(helpers).toContain("mapBunnyDeleteToOutcome");
    expect(index).toContain('"deleted"');
    expect(index).toContain('"already_missing"');
    expect(index).toContain('"retryable_failed"');
  });

  it("bunnyApi is transport-only (no Postgres)", () => {
    const bunny = read(EDGE_BUNNY);
    expect(bunny).toContain("deleteBunnyVideo");
    expect(bunny).toContain("video.bunnycdn.com/library/");
    expect(bunny).not.toContain("post_media");
    expect(bunny).not.toContain("from(");
  });

  it("aggregate logging only (no user content fields)", () => {
    const index = read(EDGE_INDEX);
    expect(index).toContain("scanned=");
    expect(index).toContain("claimed=");
    expect(index).toContain("bunny_deleted=");
    expect(index).not.toContain("caption");
    expect(index).not.toContain("email");
    expect(index).not.toContain("username");
  });

  it("processes pending outbox then claims remaining batch", () => {
    const index = read(EDGE_INDEX);
    expect(index).toContain("edit_staging_gc_outbox");
    expect(index).toContain("remainingClaimLimit");
    expect(index).toContain("claim_edit_staging_gc_batch");
    expect(index).toContain("MAX_BATCH");
  });
});

describe("edit staging GC regressions — untouched surfaces", () => {
  it("P: owner/admin Edit migration contracts untouched by GC migration", () => {
    const gc = read(MIGRATION);
    expect(gc).not.toContain(
      "CREATE OR REPLACE FUNCTION public._apply_post_media_edit_core",
    );
    expect(gc).not.toContain(
      "CREATE OR REPLACE FUNCTION public.owner_apply_post_media_edit",
    );
    expect(gc).not.toContain(
      "CREATE OR REPLACE FUNCTION public.owner_republish_post",
    );
    expect(gc).not.toContain(
      "CREATE OR REPLACE FUNCTION public.admin_republish_post",
    );

    // Source Edit migrations still define the commit path
    expect(read(OWNER_EDIT)).toContain("owner_republish_post");
    expect(read(ADMIN_EDIT)).toContain("_apply_post_media_edit_core");
  });

  it("frontend Edit Exit still local-only (no remote GC from client)", () => {
    const drafts = read(DRAFTS);
    expect(drafts).toContain("discardOwnerPublishedEditLocalState");
    expect(drafts).toContain(
      "unattached remote staging GC is a separate backend concern",
    );
    const fn = drafts.slice(
      drafts.indexOf("export function discardOwnerPublishedEditLocalState"),
      drafts.indexOf("export function discardOwnerPublishedEditLocalState") +
        2000,
    );
    expect(fn).not.toContain("bunny-video-delete");
    expect(fn).not.toContain("edit-staging-gc");
    expect(fn).not.toContain("claim_edit_staging_gc");
  });

  it("Q: Create orphan predicate absent — requires published post EXISTS", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("p.status = 'published'");
    expect(sql).not.toContain("NOT EXISTS");
    // No claim path that selects when post is missing
    expect(sql).not.toMatch(
      /claim_edit_staging_gc_batch[\s\S]*NOT EXISTS[\s\S]*FROM public\.posts/,
    );
  });
});

describe("conceptual race / concurrency contracts in SQL", () => {
  it("G: Save-before-claim protected by post_id IS NULL on DELETE", () => {
    const sql = read(MIGRATION);
    // DELETE re-checks unattached so attached rows are not removed
    expect(sql).toMatch(
      /DELETE FROM public\.post_media pm[\s\S]*AND pm\.post_id IS NULL/,
    );
  });

  it("I: SKIP LOCKED prevents overlapping claim of same row", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("FOR UPDATE OF pm SKIP LOCKED");
    expect(sql).toContain("post_media_id uuid PRIMARY KEY");
  });
});
