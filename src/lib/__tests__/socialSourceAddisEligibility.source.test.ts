import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIG =
  "supabase/migrations/20260910120100_social_source_addis_calendar_day_eligibility.sql";
const PHOTOS =
  "supabase/migrations/20260911120000_people_candidate_profile_photos_payload.sql";

function readSql(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** Drop line comments so header notes do not trip payload/function assertions. */
function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const ADDIS_PRED =
  "((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date";
const ADDIS_TODAY = "(now() AT TIME ZONE 'Africa/Addis_Ababa')::date";
const INSTANT_GATE = "AND (btrim(elem))::timestamptz >= now()";

describe("social source Addis calendar-day migration (source)", () => {
  it("rewrites only the three live date gates to Addis full-day", () => {
    const sql = readSql(MIG);
    const body = sqlBody(sql);
    expect(body).toContain("CREATE OR REPLACE FUNCTION public.people_source_is_eligible");
    expect(body).toContain("CREATE OR REPLACE FUNCTION public.group_up_source_is_eligible");
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates"
    );
    expect(body).toContain("STABLE SECURITY DEFINER");
    expect(body).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(body).toContain(ADDIS_PRED);
    expect(body).toContain(ADDIS_TODAY);
    expect(body).not.toContain(INSTANT_GATE);
    // safety clauses retained
    expect(body).toContain("can_view_post");
    expect(body).toContain("users_are_blocked_pair");
    expect(body).toContain("p.visibility = 'public'");
    // no Group opportunity scheduling function rewrites
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_group_up/
    );
    expect(body).not.toMatch(/\bp_occurs_at\b/);
    expect(body).not.toMatch(/\bREVOKE\b/);
    expect(body).not.toMatch(/\bGRANT EXECUTE\b/);
    expect(body).not.toMatch(/\bCOMMENT ON FUNCTION\b/);
    // no photos payload in production-targeted migration
    expect(body).not.toContain("profile_photos");
    expect(sql).toMatch(/^-- LOCAL ONLY/m);
  });

  it("held photos Discover eligibility uses Addis + non-empty/recurrence rules", () => {
    const sql = readSql(PHOTOS);
    expect(sql).toContain("profile_photos");
    expect(sql).toContain(ADDIS_PRED);
    expect(sql).toContain(ADDIS_TODAY);
    expect(sql).not.toContain(INSTANT_GATE);
    expect(sql).not.toContain(
      "OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0"
    );
    expect(sql).toMatch(
      /COALESCE\(p\.is_recurring, false\) = true\s+AND EXISTS/
    );
  });
});
