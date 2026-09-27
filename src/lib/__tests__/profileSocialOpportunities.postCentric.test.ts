import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseProfileSocialOpportunity } from "../../api/services/profileSocialOpportunities";
import { PROFILE_SOCIAL_OPPORTUNITY_LIMIT } from "../../api/services/profileSocialOpportunities";

const POST_CENTRIC_MIG =
  "supabase/migrations/20261016120000_list_profile_social_opportunities_post_centric.sql";

function readSql(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("list_profile_social_opportunities post-centric (source)", () => {
  it("is a new LOCAL ONLY migration replacing only the list RPC", () => {
    const sql = readSql(POST_CENTRIC_MIG);
    expect(sql).toMatch(/^-- LOCAL ONLY/m);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities"
    );
    expect(sql).not.toContain(
      "CREATE OR REPLACE FUNCTION public.connect_profile_pair_up"
    );
  });

  it("aggregates by source_post_id before LIMIT 8 source posts", () => {
    const body = sqlBody(readSql(POST_CENTRIC_MIG));
    expect(body).toContain("post_ids AS");
    expect(body).toContain("aggregated AS");
    expect(body).toContain("FROM post_ids pid");
    expect(body).toContain("LEFT JOIN duo_rows");
    expect(body).toContain("LEFT JOIN group_rows");

    const orderIdx = body.indexOf(
      "ORDER BY a.sort_at ASC NULLS LAST"
    );
    const limitIdx = body.indexOf("LIMIT 8", orderIdx);
    expect(orderIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(orderIdx);
    // Cap is on aggregated posts, not opportunity UNION rows.
    expect(body).not.toMatch(/FROM mixed m[\s\S]*LIMIT 8/);
    expect(body).not.toContain("OFFSET");
    expect(body).not.toContain("p_limit");
  });

  it("preserves Other Profile privacy / self Discover bypass / hosted-only Groups", () => {
    const body = sqlBody(readSql(POST_CENTRIC_MIG));
    expect(body).toContain("v_is_self := (v_me = p_profile_user_id)");
    expect(body).toContain(
      "IF NOT v_is_self AND v_owner.p2p_discover_enabled IS NOT TRUE THEN"
    );
    expect(body).toMatch(
      /IF NOT v_is_self\s+AND public\.users_are_blocked_pair\(v_me, p_profile_user_id\) THEN/
    );
    expect(body).toContain("AND (v_is_self OR o.creator_id <> v_me)");
    expect(body).toContain("o.creator_id = p_profile_user_id");
    expect(body).toContain("o.kind = 'pair_up'");
    expect(body).toContain("o.kind = 'group_up'");
    expect(body).toContain("people_source_is_eligible");
    expect(body).toContain("group_up_source_is_eligible");
    // Joined-only never qualifies: no membership-based inclusion.
    expect(body).not.toContain("list_my_group_up_memberships");
    expect(body).not.toMatch(
      /FROM public\.conversation_members[\s\S]*INTO aggregated/
    );
  });

  it("emits nested duo + group payloads without top-level kind", () => {
    const body = sqlBody(readSql(POST_CENTRIC_MIG));
    const aggStart = body.indexOf("jsonb_agg(");
    const aggEnd = body.indexOf("INTO v_rows", aggStart);
    const agg = body.slice(aggStart, aggEnd);
    expect(agg).toContain("'duo'");
    expect(agg).toContain("'group'");
    expect(agg).not.toContain("'kind'");
    expect(agg).not.toContain("'conversation_id'");
    expect(agg).not.toContain("'discoverable_until'");
    expect(agg).not.toContain("'p2p_discover_enabled'");
    // Nested payload keys live in the CASE jsonb_build_object for duo/group.
    expect(body).toContain("'viewer_duo_joined'");
    expect(body).toContain("'viewer_group_state'");
    expect(body).toContain("'request_id'");
    expect(body).toContain("'occurs_at'");
  });

  it("documents post-level sort as earliest of duo/group sort_at", () => {
    const sql = readSql(POST_CENTRIC_MIG);
    expect(sql).toContain("sort_at = earliest non-null of (duo.sort_at, group.sort_at)");
    const body = sqlBody(sql);
    expect(body).toContain("ELSE LEAST(d.sort_at, g.sort_at)");
    expect(body).toContain("ELSE LEAST(d.created_at, g.created_at)");
  });
});

describe("parseProfileSocialOpportunity post-centric contract", () => {
  const baseShared = {
    source_post_id: "post-a",
    source_type: "hangout",
    source_caption: "Hang",
    source_cover_url: null,
    source_author_id: "author-1",
    source_author_profile_id: "prof-1",
    source_author_display_name: "Author",
    source_author_username: "author1",
    source_author_avatar_url: null,
    source_selected_dates: ["2099-01-01T12:00:00.000Z"],
    source_recurrence_days: null,
    source_is_recurring: false,
    created_at: "2099-01-01T00:00:00.000Z",
  };

  it("A: Duo-only post → one row with duo payload", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      duo: { opportunity_id: "duo-1", viewer_duo_joined: true },
      group: null,
    });
    expect(row).not.toBeNull();
    expect(row!.duo?.opportunity_id).toBe("duo-1");
    expect(row!.duo?.viewer_duo_joined).toBe(true);
    expect(row!.group).toBeNull();
  });

  it("B: Group-only hosted post → one row with group payload", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      duo: null,
      group: {
        opportunity_id: "grp-1",
        group_title: "Friday crew",
        occurs_at: "2099-01-05T15:00:00.000Z",
        occurs_time_explicit: true,
        viewer_group_state: "none",
        request_id: null,
      },
    });
    expect(row).not.toBeNull();
    expect(row!.duo).toBeNull();
    expect(row!.group?.opportunity_id).toBe("grp-1");
    expect(row!.group?.viewer_group_state).toBe("none");
  });

  it("C: Same post Duo + Group → ONE row with both payloads", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      duo: { opportunity_id: "duo-1", viewer_duo_joined: false },
      group: {
        opportunity_id: "grp-1",
        group_title: "Crew",
        occurs_at: null,
        occurs_time_explicit: null,
        viewer_group_state: "pending",
        request_id: "req-1",
      },
    });
    expect(row).not.toBeNull();
    expect(row!.duo?.opportunity_id).toBe("duo-1");
    expect(row!.group?.opportunity_id).toBe("grp-1");
    expect(row!.group?.viewer_group_state).toBe("pending");
    expect(row!.group?.request_id).toBe("req-1");
  });

  it("D: neither payload → absent (null)", () => {
    expect(
      parseProfileSocialOpportunity({
        ...baseShared,
        duo: null,
        group: null,
      })
    ).toBeNull();
  });

  it("H: viewer Duo/Group states survive aggregation shape", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      duo: { opportunity_id: "duo-1", viewer_duo_joined: true },
      group: {
        opportunity_id: "grp-1",
        group_title: null,
        occurs_at: null,
        occurs_time_explicit: false,
        viewer_group_state: "member",
        request_id: null,
      },
    });
    expect(row!.duo?.viewer_duo_joined).toBe(true);
    expect(row!.group?.viewer_group_state).toBe("member");
  });

  it("J: rejects legacy single-kind opportunity rows", () => {
    expect(
      parseProfileSocialOpportunity({
        kind: "duo",
        opportunity_id: "opp-1",
        source_post_id: "post-a",
        source_type: "hangout",
        source_author_id: "author-1",
        created_at: "2099-01-01T00:00:00.000Z",
        viewer_duo_joined: false,
        viewer_group_state: null,
        request_id: null,
      })
    ).toBeNull();
  });

  it("F/K: client LIMIT is source-post cap; no N+1 fetch helpers in service", () => {
    expect(PROFILE_SOCIAL_OPPORTUNITY_LIMIT).toBe(8);
    const service = readFileSync(
      resolve(process.cwd(), "src/api/services/profileSocialOpportunities.ts"),
      "utf8"
    );
    expect(service).toContain("parseProfileSocialOpportunity");
    expect(service).not.toContain("list_my_group_up_memberships");
    expect(service).not.toMatch(/for\s*\(.*opportunity.*\)\s*\{[\s\S]*supabase\.rpc/);
    expect(service).toContain("slice(0, PROFILE_SOCIAL_OPPORTUNITY_LIMIT)");
  });
});
