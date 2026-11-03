/**
 * Structural contract for recurring hangout 30-day expiration.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261114120000_recurring_hangout_expiration.sql";
const OBSOLETE =
  "supabase/migrations/20261112120000_recurrence_ends_on.sql";
const RECOVERY =
  "supabase/migrations/20261113120000_duo_match_completion_recovery.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("recurring hangout expiration migration", () => {
  const body = sqlBody(read(MIGRATION));

  it("uses a post-recovery timestamp and retires the obsolete migration file", () => {
    expect(MIGRATION).toContain("20261114120000");
    expect(() => read(OBSOLETE)).toThrow();
    expect(read(RECOVERY)).toContain("list_pair_up_candidates");
  });

  it("adds recurrence_ends_on and revokes client writes", () => {
    expect(body).toContain(
      "ADD COLUMN IF NOT EXISTS recurrence_ends_on date NULL"
    );
    expect(body).toContain(
      "REVOKE INSERT (recurrence_ends_on), UPDATE (recurrence_ends_on)"
    );
    expect(body).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("stamps Addis today + 29 and renews only on real schedule changes", () => {
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.posts_stamp_recurrence_ends_on()"
    );
    expect(body).toContain("v_end date := v_today + 29");
    expect(body).toContain(
      "NEW.selected_dates IS DISTINCT FROM OLD.selected_dates"
    );
    expect(body).toContain(
      "NEW.is_recurring IS DISTINCT FROM OLD.is_recurring"
    );
    expect(body).toContain(
      "NEW.recurrence_days IS DISTINCT FROM OLD.recurrence_days"
    );
    expect(body).toContain("IF NOT v_schedule_changed THEN");
    expect(body).toContain("NEW.recurrence_ends_on := NULL");
    expect(body).toContain(
      "BEFORE INSERT OR UPDATE ON public.posts"
    );
  });

  it("grace-backfills existing recurring posts", () => {
    expect(body).toContain("UPDATE public.posts");
    expect(body).toContain(
      "((now() AT TIME ZONE 'Africa/Addis_Ababa')::date + 29)"
    );
    expect(body).toContain("COALESCE(is_recurring, false) = true");
  });

  it("enforces a finite inclusive window in helpers", () => {
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.post_recurrence_series_is_open("
    );
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.post_recurrence_covers_addis_day("
    );
    expect(body).toContain("p_recurrence_ends_on - 29");
    expect(body).toContain("p_day > p_recurrence_ends_on");
    const coversAt = body.indexOf(
      "CREATE OR REPLACE FUNCTION public.post_recurrence_covers_addis_day("
    );
    const covers = body.slice(coversAt, coversAt + 1800);
    expect(covers).toContain("IF p_day IS NULL OR p_recurrence_ends_on IS NULL THEN");
    expect(covers).toContain("RETURN false");
    expect(covers).not.toContain("NULL end keeps the perpetual");
    expect(body).toContain("NULL end never covers");
  });

  it("wires People, Discover, Home feed, and calendar counts", () => {
    for (const name of [
      "people_source_is_eligible",
      "group_up_source_is_eligible",
      "list_discover_pair_up_candidates",
      "get_feed_with_related_data",
      "get_home_hangout_occurrence_day_counts",
    ]) {
      expect(body).toContain(`CREATE OR REPLACE FUNCTION public.${name}`);
    }
    expect(body).toContain(
      "AND public.post_recurrence_series_is_open(p.recurrence_ends_on)"
    );
    expect(body).toContain("post_recurrence_covers_addis_day(");
    expect(body).toContain("p.type = 'experience'");
  });

  it("blocks expired recurring selected_dates bypass in Home feed and calendar", () => {
    const feedAt = body.indexOf(
      "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data"
    );
    const dayAt = body.indexOf(
      "CREATE OR REPLACE FUNCTION public.get_home_hangout_occurrence_day_counts"
    );
    expect(feedAt).toBeGreaterThanOrEqual(0);
    expect(dayAt).toBeGreaterThan(feedAt);
    const feed = body.slice(feedAt, dayAt);
    const day = body.slice(dayAt);

    // eligible_base: future selected_dates only for non-recurring hangouts
    expect(feed).toContain(
      "COALESCE(p.is_recurring, false) = false\n              AND EXISTS (\n                SELECT 1\n                FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem"
    );

    // occurrence filters: selected_dates only for experiences or non-recurring
    expect(feed).toContain("p.type <> 'hangout'");
    expect(feed).toContain(
      "OR COALESCE(p.is_recurring, false) = false"
    );
    expect(feed).toContain("post_recurrence_covers_addis_day(");

    // calendar: selected_dates day hits only when not recurring
    expect(day).toContain(
      "COALESCE(ep.is_recurring, false) = false\n        AND EXISTS (\n          SELECT 1\n          FROM jsonb_array_elements_text(COALESCE(ep.selected_dates, '[]'::jsonb)) AS sched"
    );
    expect(day).toContain(
      "COALESCE(p.is_recurring, false) = false\n          AND EXISTS (\n            SELECT 1\n            FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem"
    );
  });

  it("preserves Duo recovery RPCs and relationship withdrawals", () => {
    expect(body).not.toContain(
      "CREATE OR REPLACE FUNCTION public.list_pair_up_candidates"
    );
    expect(body).not.toContain(
      "CREATE OR REPLACE FUNCTION public.complete_pair_up_match"
    );
    expect(body).not.toContain(
      "CREATE OR REPLACE FUNCTION public.notify_duo_match_recipient"
    );
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.withdraw_duo_pair_up_interest"
    );
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.withdraw_discover_pair_up_interest"
    );
    expect(body).toContain(
      "Existing unmatched interests remain withdrawable after discoverable_until or source end"
    );
    expect(body).toContain(
      "Outgoing interests stay visible after source end"
    );
  });

  it("does not delete social relationship rows", () => {
    expect(body).not.toMatch(/DELETE FROM public\.social_opportunities/i);
    expect(body).not.toMatch(/DELETE FROM public\.conversations/i);
    expect(body).not.toMatch(/DELETE FROM public\.messages/i);
    expect(body).not.toMatch(/DELETE FROM public\.conversation_members/i);
  });

  it("terminates every CREATE FUNCTION with $function$;", () => {
    const raw = read(MIGRATION);
    const opens = (raw.match(/AS \$function\$/g) || []).length;
    const closes = (raw.match(/^\$function\$;/gm) || []).length;
    expect(opens).toBe(10);
    expect(closes).toBe(10);
    expect(raw).not.toMatch(/^\$function\$\s*$/m);
  });
});
