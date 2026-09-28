/**
 * Static contract checks for people_deck_seen final pre-apply hardening.
 * Does not apply or execute against production.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_PAIR_UP_SEEN_CAP,
  PEOPLE_PAIR_UP_SEEN_TTL_MS,
} from "./people/peoplePairUpSeenHistory";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("people_deck_seen final production hardening", () => {
  const migration = read(
    "../supabase/migrations/20260928140000_people_deck_seen.sql"
  );
  const rollback = read(
    "../supabase/rollbacks/20260928140000_people_deck_seen.sql"
  );

  const markBody = migration.slice(
    migration.indexOf("CREATE FUNCTION public.mark_people_deck_seen"),
    migration.indexOf(
      "REVOKE ALL ON FUNCTION public.mark_people_deck_seen"
    )
  );

  it("1: repeated mark inside 14 days does NOT update seen_at", () => {
    expect(markBody).toContain("DO UPDATE");
    expect(markBody).toContain("SET seen_at = EXCLUDED.seen_at");
    expect(markBody).toContain(
      "WHERE public.people_deck_seen.seen_at < now() - interval '14 days'"
    );
    // Active-window conflicts are filtered out by the WHERE (no unconditional update).
    expect(markBody).not.toContain("DO NOTHING");
  });

  it("2–3: expired row older than 14 days CAN refresh; then visible to get", () => {
    expect(markBody).toContain(
      "WHERE public.people_deck_seen.seen_at < now() - interval '14 days'"
    );
    expect(migration).toMatch(
      /get_people_deck_seen[\s\S]*seen_at >= now\(\) - interval '14 days'/
    );
  });

  it("4: new row inserts normally", () => {
    expect(markBody).toContain(
      "INSERT INTO public.people_deck_seen (user_id, scope, item_id, seen_at)"
    );
    expect(markBody).toContain("SELECT DISTINCT v_uid, v_scope, x.id, now()");
  });

  it("5–7: >50 rejects; ≤50 accepts; null/dupes do not count toward 50", () => {
    expect(migration).not.toContain("p_item_ids[1:50]");
    expect(markBody).toContain("SELECT DISTINCT u AS id");
    expect(markBody).toContain("FROM unnest(p_item_ids) AS u");
    expect(markBody).toContain("WHERE u IS NOT NULL");
    expect(markBody).toContain("IF v_distinct > 50 THEN");
    expect(markBody).toContain("RAISE EXCEPTION");
    expect(markBody).toContain("at most 50 distinct item ids");
    expect(markBody).toContain("FROM unnest(p_item_ids) AS x(id)");
    expect(markBody).toContain("WHERE x.id IS NOT NULL");
  });

  it("8: read TTL remains 14 days", () => {
    expect(PEOPLE_PAIR_UP_SEEN_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(migration).toContain("interval '14 days'");
  });

  it("9: read / local cap remains 1000", () => {
    expect(PEOPLE_PAIR_UP_SEEN_CAP).toBe(1000);
    expect(migration).toContain("LIMIT 1000");
    expect(migration).not.toContain("LIMIT 300");
  });

  it("10: scopes unchanged; Groups Yours absent", () => {
    expect(migration).toContain(
      "scope IN ('my_plans', 'discover', 'open_plans', 'groups_new')"
    );
    expect(migration).toContain(
      "v_scope NOT IN ('my_plans', 'discover', 'open_plans', 'groups_new')"
    );
    expect(migration).not.toContain("groups_yours");
    expect(rollback).not.toContain("groups_yours");
  });

  it("11–15: strict CREATE TABLE / INDEX / FUNCTION; no OR REPLACE / IF NOT EXISTS", () => {
    expect(migration).toContain("CREATE TABLE public.people_deck_seen");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS");
    expect(migration).toContain(
      "CREATE INDEX people_deck_seen_user_scope_seen_at_idx"
    );
    expect(migration).not.toContain("CREATE INDEX IF NOT EXISTS");
    expect(migration).toContain("CREATE FUNCTION public.get_people_deck_seen");
    expect(migration).toContain("CREATE FUNCTION public.mark_people_deck_seen");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION");
  });

  it("16: candidate RPCs untouched", () => {
    expect(migration).not.toContain("list_pair_up_candidates");
    expect(migration).not.toContain("list_discover_pair_up_candidates");
    expect(migration).not.toContain("list_open_plan_candidates");
    expect(migration).not.toContain("list_group_up_candidates");
  });

  it("17: security unchanged; rollback only drops introduced objects", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.people_deck_seen FROM PUBLIC, anon, authenticated"
    );
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*people_deck_seen/);
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO public, pg_temp");
    expect(migration).toContain("auth.uid()");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_people_deck_seen\(text\)\s+TO authenticated, service_role/
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.mark_people_deck_seen\(text, uuid\[\]\)\s+TO authenticated, service_role/
    );
    expect(migration).not.toMatch(/GRANT .* ON TABLE public\.people_deck_seen/);

    expect(rollback).toContain(
      "DROP FUNCTION IF EXISTS public.mark_people_deck_seen(text, uuid[])"
    );
    expect(rollback).toContain(
      "DROP FUNCTION IF EXISTS public.get_people_deck_seen(text)"
    );
    expect(rollback).toContain("DROP TABLE IF EXISTS public.people_deck_seen");
    expect(rollback).not.toContain("list_pair_up");
    expect(rollback).not.toContain("social_opportunities");
  });

  it("18: production untouched (prepare-only markers)", () => {
    expect(migration).toContain("LOCAL ONLY");
    expect(migration).toContain(
      "do not apply to production until explicitly approved"
    );
  });

  it("mark return uses ROW_COUNT after INSERT/ON CONFLICT DO UPDATE", () => {
    expect(markBody).toContain("GET DIAGNOSTICS v_affected = ROW_COUNT");
    expect(markBody).toContain("RETURN v_affected");
  });

  it("comments describe first-seen within active 14-day window", () => {
    expect(migration).toContain("First-seen within the active 14-day window");
    expect(migration).toContain("active 14-day window");
  });
});
