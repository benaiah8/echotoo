/**
 * Structural contract for Open Plan / Group Up expired-source visibility.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261117120000_open_plan_group_up_hide_expired_sources.sql";
const DUO_MIGRATION =
  "supabase/migrations/20261116120000_duo_hide_expired_sources.sql";
const RECURRING_MIGRATION =
  "supabase/migrations/20261114120000_recurring_hangout_expiration.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("open plan / group up hide expired sources migration", () => {
  const raw = read(MIGRATION);
  const body = sqlBody(raw);

  const openEligAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.open_plan_source_is_eligible("
  );
  const groupEligAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.group_up_source_is_eligible("
  );
  const getOneAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_my_open_plan_for_source("
  );
  const getBatchAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_my_open_plans_for_sources("
  );
  const listOpAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.list_open_plan_candidates("
  );
  const listGuGroupsAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.list_my_group_up_request_groups("
  );
  const listGuReqAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.list_my_group_up_requests("
  );

  const openElig = body.slice(openEligAt, groupEligAt);
  const groupElig = body.slice(groupEligAt, getOneAt);
  const getOne = body.slice(getOneAt, getBatchAt);
  const getBatch = body.slice(getBatchAt, listOpAt);
  const listOp = body.slice(listOpAt, listGuGroupsAt);
  const listGuGroups = body.slice(listGuGroupsAt, listGuReqAt);
  const listGuReq = body.slice(listGuReqAt);

  it("is a post-Duo local migration and does not edit the Duo file", () => {
    expect(MIGRATION).toContain("20261117120000");
    expect(read(DUO_MIGRATION)).toContain("list_pair_up_candidates");
    expect(body).not.toContain("people_source_is_eligible");
    expect(body).not.toContain("list_pair_up_candidates");
    expect(body).not.toContain("list_discover_pair_up_candidates");
    expect(body).not.toContain("list_my_group_up_memberships");
  });

  it("replaces only OP/GU eligibility + discovery/pending/active-indicator reads", () => {
    expect(openEligAt).toBeGreaterThanOrEqual(0);
    expect(groupEligAt).toBeGreaterThan(openEligAt);
    expect(getOneAt).toBeGreaterThan(groupEligAt);
    expect(getBatchAt).toBeGreaterThan(getOneAt);
    expect(listOpAt).toBeGreaterThan(getBatchAt);
    expect(listGuGroupsAt).toBeGreaterThan(listOpAt);
    expect(listGuReqAt).toBeGreaterThan(listGuGroupsAt);
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(7);
    expect(body).not.toContain("DROP FUNCTION");
    expect(body).not.toContain("CASCADE");
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.(accept_|decline_|withdraw_|request_open_plan|request_group_up|create_open_plan|create_group_up)/
    );
  });

  it("reuses post_recurrence_series_is_open for recurring windows", () => {
    expect(read(RECURRING_MIGRATION)).toContain(
      "CREATE OR REPLACE FUNCTION public.post_recurrence_series_is_open("
    );
    expect(openElig).toContain("public.post_recurrence_series_is_open(p.recurrence_ends_on)");
    expect(groupElig).toContain("public.post_recurrence_series_is_open(p.recurrence_ends_on)");
    expect(body).not.toContain(
      "CREATE OR REPLACE FUNCTION public.post_recurrence_series_is_open("
    );
  });

  it("past one-time dated experiences require a future Addis selected_dates day", () => {
    for (const slice of [openElig, groupElig]) {
      expect(slice).toContain(
        "((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date"
      );
      expect(slice).toContain(
        ">= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date"
      );
      expect(slice).toContain("COALESCE(p.is_recurring, false) = false");
    }
    // Completed dated path is not an experience type short-circuit.
    expect(groupElig).not.toMatch(
      /p\.type = 'experience'\s*\n\s*OR \(/
    );
  });

  it("undated experiences keep empty-selected_dates pass-through", () => {
    expect(openElig).toContain("NOT EXISTS (");
    expect(openElig).toContain(
      "COALESCE(p.selected_dates, '[]'::jsonb)"
    );
    expect(groupElig).toContain("p.type = 'experience'");
    expect(groupElig).toContain("NOT EXISTS (");
  });

  it("recurring eligibility still requires weekday codes + open series", () => {
    expect(openElig).toContain("COALESCE(p.is_recurring, false) = true");
    expect(openElig).toContain("'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'");
    expect(groupElig).toContain("p.type = 'hangout'");
    expect(groupElig).toContain("COALESCE(p.is_recurring, false) = true");
  });

  it("Open Plan discovery and active indicators call open_plan_source_is_eligible", () => {
    expect(listOp).toContain("public.open_plan_source_is_eligible(o.source_post_id)");
    expect(listOp).toContain("o.discoverable_until > now()");
    expect(listOp).toContain("o.occurs_at > now()");
    expect(getOne).toContain("public.open_plan_source_is_eligible(o.source_post_id)");
    expect(getBatch).toContain("public.open_plan_source_is_eligible(o.source_post_id)");
  });

  it("Group Up pending host lists gate on eligibility + opportunity window", () => {
    for (const slice of [listGuGroups, listGuReq]) {
      expect(slice).toContain("o.discoverable_until > now()");
      expect(slice).toContain("(o.occurs_at IS NULL OR o.occurs_at > now())");
      expect(slice).toContain(
        "public.group_up_source_is_eligible(o.source_post_id)"
      );
    }
  });
});

describe("frontend caches remain replace-on-revalidate (no OP/GU cache redesign)", () => {
  it("Open Plan and Group Up deck hooks still replace first page on soft revalidate", () => {
    const openPlan = read("src/hooks/useOpenPlanCandidates.ts");
    const groupUp = read("src/hooks/useGroupUpCandidates.ts");
    expect(openPlan).toContain(
      "setCandidates(uniqueByOpportunityId(page.candidates))"
    );
    expect(groupUp).toContain("mergeGroupUpBrowseAndMemberships(");
    expect(groupUp).toContain("setCandidates(mergedCandidates)");
    expect(groupUp).toContain("listMyGroupUpMemberships");
  });
});
