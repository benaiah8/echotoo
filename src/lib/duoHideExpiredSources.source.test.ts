/**
 * Structural contract for expired Duo source visibility.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeMyPlansDeckPage } from "../hooks/usePairUpCandidates";
import type { PairUpCandidate } from "./people/types";

const MIGRATION =
  "supabase/migrations/20261116120000_duo_hide_expired_sources.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function stubCandidate(id: string): PairUpCandidate {
  return {
    opportunity_id: id,
    source_post_id: `src-${id}`,
    creator_id: "u1",
    description: null,
    discoverable_until: "2099-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    profile_id: "p1",
    display_name: "A",
    username: "a",
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
    source_caption: null,
    source_type: "hangout",
    source_created_at: null,
    source_selected_dates: null,
    source_is_recurring: false,
    source_recurrence_days: null,
    expressed_by_me: false,
    duo_match_state: "none",
    duo_commented_by_me: false,
    viewer_has_active_pair_up: true,
  };
}

describe("mergeMyPlansDeckPage soft revalidate", () => {
  it("drops prior cards omitted by the server page (no merge-tail)", () => {
    const prev = [stubCandidate("expired"), stubCandidate("keep")];
    const incoming = [stubCandidate("keep"), stubCandidate("fresh")];
    expect(mergeMyPlansDeckPage(prev, incoming).map((r) => r.opportunity_id)).toEqual([
      "keep",
      "fresh",
    ]);
  });
});

describe("duo hide expired sources migration", () => {
  const raw = read(MIGRATION);
  const body = sqlBody(raw);

  const getOneAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_my_pair_up_for_source("
  );
  const getBatchAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_my_pair_ups_for_sources("
  );
  const listAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.list_pair_up_candidates("
  );
  const discoverAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates("
  );

  const getOne = body.slice(getOneAt, getBatchAt);
  const getBatch = body.slice(getBatchAt, listAt);
  const list = body.slice(listAt, discoverAt);
  const discover = body.slice(discoverAt);

  it("replaces own-join + list decks only; leaves complete/leave/withdraw alone", () => {
    expect(getOneAt).toBeGreaterThanOrEqual(0);
    expect(getBatchAt).toBeGreaterThan(getOneAt);
    expect(listAt).toBeGreaterThan(getBatchAt);
    expect(discoverAt).toBeGreaterThan(listAt);
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(4);
    expect(body).not.toContain("DROP FUNCTION");
    expect(body).not.toContain("CASCADE");
    expect(body).not.toContain("complete_pair_up_match");
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.(leave_pair_up|join_pair_up|withdraw_duo_pair_up_interest|withdraw_discover_pair_up_interest|express_pair_up_interest)\(/
    );
    expect(raw).toContain("BLOCKER (list_pair_up_candidates)");
  });

  it("gates get_my_pair_up* on people_source_is_eligible plus discoverable_until", () => {
    expect(getOne).toContain("o.discoverable_until > now()");
    expect(getOne).toContain("public.people_source_is_eligible(o.source_post_id)");
    expect(getBatch).toContain("o.discoverable_until > now()");
    expect(getBatch).toContain("public.people_source_is_eligible(o.source_post_id)");
  });

  it("keeps My Duo interest exception only for eligible sources or mutual-pending", () => {
    expect(list).toContain("rev.from_opportunity_id = other.id");
    expect(list).toContain("rev.to_opportunity_id = o.id");
    expect(list).toContain("rev.from_opportunity_id = o.id");
    expect(list).toContain("rev.to_opportunity_id = mo.id");
    expect(list).toContain("public.people_source_is_eligible(o.source_post_id)");
    expect(list).toContain("public.people_source_is_eligible(s.source_post_id)");
    expect(list).toContain("'mutual_pending'");
    expect(list).toContain("AS duo_match_state");
  });

  it("requires people_source_is_eligible for Discover (no interest-only date bypass)", () => {
    expect(discover).toContain(
      "AND public.people_source_is_eligible(o.source_post_id)"
    );
    expect(discover).not.toContain("post_recurrence_series_is_open(p.recurrence_ends_on)");
    expect(discover).toContain("o.discoverable_until > now()");
  });
});

describe("duo hide expired soft deck wiring", () => {
  it("soft my_plans revalidate uses mergeMyPlansDeckPage replace semantics", () => {
    const hook = read("src/hooks/usePairUpCandidates.ts");
    expect(hook).toContain("mergeMyPlansDeckPage(prev, page.candidates)");
    expect(hook).toContain("return uniqueByOpportunityId(incoming)");
    expect(hook).not.toContain("const tail = prev.filter");
  });
});
