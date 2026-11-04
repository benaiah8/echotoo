import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeProfileSocialOpportunitiesBySourcePostId,
  parseProfileSocialOpportunitiesPage,
  parseProfileSocialOpportunity,
  PROFILE_SOCIAL_OPPORTUNITY_PAGE_SIZE,
} from "../../api/services/profileSocialOpportunities";
import type { ProfileSocialOpportunity } from "../people/types";

const PAGINATION_MIG =
  "supabase/migrations/20261121120000_list_profile_social_opportunities_pagination.sql";
const IDENTITY_MIG =
  "supabase/migrations/20261017120000_list_profile_social_opportunities_source_author_identity.sql";

function readSql(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function sample(
  overrides: Partial<ProfileSocialOpportunity> = {}
): ProfileSocialOpportunity {
  return {
    source_post_id: "post-1",
    source_type: "hangout",
    source_caption: "Friday hang",
    source_cover_url: null,
    source_author_id: "author-1",
    source_author_profile_id: null,
    source_author_display_name: "Author One",
    source_author_username: "author1",
    source_author_avatar_url: null,
    source_selected_dates: null,
    source_recurrence_days: null,
    source_is_recurring: false,
    created_at: "2099-01-01T00:00:00.000Z",
    duo: { opportunity_id: "opp-1", viewer_duo_joined: false },
    group: null,
    ...overrides,
  };
}

describe("list_profile_social_opportunities pagination (source)", () => {
  it("is a new LOCAL ONLY migration that does not rewrite prior applied files", () => {
    const mig = readSql(PAGINATION_MIG);
    const prior = readSql(IDENTITY_MIG);
    expect(mig).toMatch(/^-- LOCAL ONLY/m);
    expect(mig).toContain(
      "CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities"
    );
    expect(mig).toContain("p_limit integer DEFAULT 8");
    expect(mig).toContain("p_cursor text DEFAULT NULL");
    expect(mig).toContain("DROP FUNCTION IF EXISTS public.list_profile_social_opportunities(uuid)");
    expect(sqlBody(mig)).not.toMatch(/DROP FUNCTION[\s\S]*CASCADE/);
    expect(sqlBody(mig)).not.toContain("connect_profile_pair_up");
    // Prior identity migration unchanged (still one-arg + LIMIT 8).
    expect(sqlBody(prior)).toContain("LIMIT 8");
    expect(sqlBody(prior)).not.toContain("p_cursor");
  });

  it("uses a single three-arg signature with grants and no PostgREST dual overload", () => {
    const body = sqlBody(readSql(PAGINATION_MIG));
    expect(body.replace(/\r\n/g, "\n")).toMatch(
      /list_profile_social_opportunities\(\s*p_profile_user_id uuid,\s*p_limit integer DEFAULT 8,\s*p_cursor text DEFAULT NULL\s*\)/
    );
    expect(body).toContain(
      "DROP FUNCTION IF EXISTS public.list_profile_social_opportunities(uuid)"
    );
    expect(body).toMatch(
      /REVOKE ALL ON FUNCTION public\.list_profile_social_opportunities\(uuid, integer, text\)/
    );
    expect(body).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_profile_social_opportunities\(uuid, integer, text\)/
    );
    // After drop, no remaining one-arg GRANT/COMMENT that would reintroduce ambiguity.
    expect(body).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_profile_social_opportunities\(uuid\)\s/
    );
  });

  it("preserves eligibility, self/other Discover OFF, hosted Groups, and ASC NULLS LAST keyset", () => {
    const body = sqlBody(readSql(PAGINATION_MIG));
    expect(body).toContain("aggregated AS");
    expect(body).toContain("ranked AS");
    expect(body).toContain("(a.sort_at IS NULL)::integer");
    expect(body).toContain("(a.created_at IS NULL)::integer");
    expect(body).toContain("(v_cursor_s IS NULL)::integer");
    expect(body).toContain("(v_cursor_c IS NULL)::integer");
    expect(body).toContain("ASC NULLS LAST");
    expect(body).not.toMatch(
      /ROW\(a\.sort_at, a\.created_at, a\.source_post_id\)\s*>\s*ROW\(v_cursor_s/
    );
    expect(body).toContain("LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50)");
    expect(body).toContain("'has_more'");
    expect(body).toContain("'next_cursor'");
    expect(body).toContain("v_is_self := (v_me = p_profile_user_id)");
    expect(body).toContain(
      "IF NOT v_is_self AND v_owner.p2p_discover_enabled IS NOT TRUE THEN"
    );
    expect(body).toContain("o.status = 'active'");
    expect(body).toContain("o.discoverable_until > now()");
    expect(body).toContain("people_source_is_eligible");
    expect(body).toContain("group_up_source_is_eligible");
    expect(body).toContain("DISTINCT ON (d.source_post_id)");
    expect(body).toContain("DISTINCT ON (g.source_post_id)");
    expect(body).not.toContain("list_my_group_up_memberships");
    // Hard global LIMIT 8 removed from the paginated body (page size is v_limit).
    expect(body).not.toMatch(/FROM aggregated a[\s\S]*LIMIT 8/);
    expect(body).toContain("r.ord <= v_limit");
    expect(body).toContain("r.ord = v_limit + 1");
  });

  it("keeps combined duo + group payloads on each source card", () => {
    const body = sqlBody(readSql(PAGINATION_MIG));
    const aggStart = body.indexOf("jsonb_agg(");
    const agg = body.slice(aggStart, body.indexOf("INTO v_rows", aggStart));
    expect(agg).toContain("'duo'");
    expect(agg).toContain("'group'");
    expect(agg).toContain("'source_author_display_name'");
    expect(agg).not.toContain("'kind'");
  });
});

describe("profile social pagination client helpers", () => {
  it("default page size is 8", () => {
    expect(PROFILE_SOCIAL_OPPORTUNITY_PAGE_SIZE).toBe(8);
  });

  it("parsePage reads has_more/next_cursor and does not slice to 8", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      source_post_id: `post-${i}`,
      source_type: "hangout",
      source_caption: null,
      source_cover_url: null,
      source_author_id: "author-1",
      source_author_profile_id: null,
      source_author_display_name: null,
      source_author_username: null,
      source_author_avatar_url: null,
      source_selected_dates: null,
      source_recurrence_days: null,
      source_is_recurring: false,
      created_at: "2099-01-01T00:00:00.000Z",
      duo: { opportunity_id: `opp-${i}`, viewer_duo_joined: false },
      group: null,
    }));
    const page = parseProfileSocialOpportunitiesPage({
      opportunities: rows,
      has_more: true,
      next_cursor: "abc",
    });
    expect(page.opportunities).toHaveLength(10);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toBe("abc");

    const exhausted = parseProfileSocialOpportunitiesPage({
      opportunities: rows.slice(0, 3),
      has_more: true,
      next_cursor: null,
    });
    expect(exhausted.has_more).toBe(false);
    expect(exhausted.next_cursor).toBeNull();
  });

  it("merge dedupes by source_post_id preserving first-seen order", () => {
    const a = [sample({ source_post_id: "p1" }), sample({ source_post_id: "p2" })];
    const b = [
      sample({ source_post_id: "p2", duo: { opportunity_id: "dup", viewer_duo_joined: true } }),
      sample({ source_post_id: "p3" }),
    ];
    const merged = mergeProfileSocialOpportunitiesBySourcePostId(a, b);
    expect(merged.map((r) => r.source_post_id)).toEqual(["p1", "p2", "p3"]);
    expect(merged[1]?.duo?.opportunity_id).toBe("opp-1");
  });

  it("combined Duo/Group card parse is unchanged", () => {
    const row = parseProfileSocialOpportunity({
      source_post_id: "post-x",
      source_type: "hangout",
      source_caption: "Both",
      source_cover_url: null,
      source_author_id: "author-1",
      source_author_profile_id: null,
      source_author_display_name: "A",
      source_author_username: "a",
      source_author_avatar_url: null,
      source_selected_dates: null,
      source_recurrence_days: null,
      source_is_recurring: false,
      created_at: "2099-01-01T00:00:00.000Z",
      duo: { opportunity_id: "duo-1", viewer_duo_joined: false },
      group: {
        opportunity_id: "grp-1",
        group_title: "Hosted",
        occurs_at: null,
        occurs_time_explicit: null,
        viewer_group_state: "none",
        request_id: null,
      },
    });
    expect(row?.duo?.opportunity_id).toBe("duo-1");
    expect(row?.group?.opportunity_id).toBe("grp-1");
  });
});

describe("profile social pagination wiring (source)", () => {
  it("service always sends named p_limit and p_cursor (avoids overload ambiguity)", () => {
    const service = readFileSync(
      resolve(process.cwd(), "src/api/services/profileSocialOpportunities.ts"),
      "utf8"
    );
    expect(service).toContain("p_profile_user_id: profileUserId");
    expect(service).toContain("p_limit: limit");
    expect(service).toContain("p_cursor: cursor");
  });

  it("hook ignores stale generations and dedupes loadMore appends", () => {
    const hook = readFileSync(
      resolve(process.cwd(), "src/hooks/useProfileSocialOpportunities.ts"),
      "utf8"
    );
    expect(hook).toContain("requestGenRef");
    expect(hook).toContain("loadMoreInFlightRef");
    expect(hook).toContain("mergeProfileSocialOpportunitiesBySourcePostId");
    expect(hook).toContain("profileUserIdRef.current !== profileUserId");
    expect(hook).toContain("setCachedProfileSocialOpportunities");
  });

  it("rail triggers loadMore once near end and stops when hasMore is false", () => {
    const rail = readFileSync(
      resolve(
        process.cwd(),
        "src/components/profile/ProfileSocialOpportunityRail.tsx"
      ),
      "utf8"
    );
    expect(rail).toContain("if (!hasMoreRef.current || loadingMoreRef.current) return");
    expect(rail).toContain("remaining <= LOAD_MORE_THRESHOLD_PX");
    expect(rail).toContain("onScroll={maybeLoadMore}");
  });
});
