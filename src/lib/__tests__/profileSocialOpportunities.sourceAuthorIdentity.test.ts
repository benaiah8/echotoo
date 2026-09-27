import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseProfileSocialOpportunity } from "../../api/services/profileSocialOpportunities";

const IDENTITY_MIG =
  "supabase/migrations/20261017120000_list_profile_social_opportunities_source_author_identity.sql";
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

describe("list_profile_social_opportunities source author identity (source)", () => {
  it("is a new LOCAL ONLY migration that does not rewrite the applied post-centric file", () => {
    const follow = readSql(IDENTITY_MIG);
    const prior = readSql(POST_CENTRIC_MIG);
    expect(follow).toMatch(/^-- LOCAL ONLY/m);
    expect(follow).toContain(
      "CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities"
    );
    expect(follow).not.toContain(
      "CREATE OR REPLACE FUNCTION public.connect_profile_pair_up"
    );
    // Prior post-centric migration remains without author identity fields.
    expect(sqlBody(prior)).not.toContain("source_author_display_name");
    expect(sqlBody(prior)).not.toContain("source_author_username");
    expect(sqlBody(prior)).not.toContain("source_author_avatar_url");
  });

  it("emits source-author identity from author_pr (posts.author_id), not profile subject", () => {
    const body = sqlBody(readSql(IDENTITY_MIG));
    expect(body).toContain(
      "author_pr.display_name AS source_author_display_name"
    );
    expect(body).toContain("author_pr.username AS source_author_username");
    expect(body).toContain("author_pr.avatar_url AS source_author_avatar_url");
    expect(body).toContain("p.author_id AS source_author_id");
    // Must not substitute p_profile_user_id into author identity columns.
    expect(body).not.toMatch(
      /source_author_display_name[\s\S]{0,80}p_profile_user_id/
    );
    expect(body).not.toContain("v_owner.display_name AS source_author");
    expect(body).not.toContain("v_owner.avatar_url AS source_author");
  });

  it("keeps post-centric aggregation, LIMIT 8, privacy, and hosted-only Groups", () => {
    const body = sqlBody(readSql(IDENTITY_MIG));
    expect(body).toContain("aggregated AS");
    expect(body).toContain("FROM aggregated a");
    expect(body).toContain("LIMIT 8");
    expect(body).toContain("v_is_self := (v_me = p_profile_user_id)");
    expect(body).toContain(
      "IF NOT v_is_self AND v_owner.p2p_discover_enabled IS NOT TRUE THEN"
    );
    expect(body).toContain("o.creator_id = p_profile_user_id");
    expect(body).toContain("people_source_is_eligible");
    expect(body).toContain("group_up_source_is_eligible");
    expect(body).toContain("users_are_blocked_pair");
    expect(body).not.toContain("list_my_group_up_memberships");
    expect(body).toContain("ELSE LEAST(d.sort_at, g.sort_at)");

    const aggStart = body.indexOf("jsonb_agg(");
    const aggEnd = body.indexOf("INTO v_rows", aggStart);
    const agg = body.slice(aggStart, aggEnd);
    expect(agg).toContain("'source_author_display_name'");
    expect(agg).toContain("'source_author_username'");
    expect(agg).toContain("'source_author_avatar_url'");
    expect(agg).toContain("'duo'");
    expect(agg).toContain("'group'");
    expect(agg).not.toContain("'kind'");
    expect(agg).not.toContain("'email'");
    expect(agg).not.toContain("'p2p_discover_enabled'");
  });
});

describe("parseProfileSocialOpportunity source author identity", () => {
  const baseShared = {
    source_post_id: "post-a",
    source_type: "hangout" as const,
    source_caption: "Hang",
    source_cover_url: null,
    source_author_profile_id: "prof-1",
    source_selected_dates: ["2099-01-01T12:00:00.000Z"],
    source_recurrence_days: null,
    source_is_recurring: false,
    created_at: "2099-01-01T00:00:00.000Z",
  };

  it("A: source author = profile subject → correct identity returned", () => {
    const subjectId = "subject-user";
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      source_author_id: subjectId,
      source_author_display_name: "Subject Name",
      source_author_username: "subject",
      source_author_avatar_url: "https://cdn.example/subject.jpg",
      duo: { opportunity_id: "duo-1", viewer_duo_joined: false },
      group: null,
    });
    expect(row!.source_author_id).toBe(subjectId);
    expect(row!.source_author_display_name).toBe("Subject Name");
    expect(row!.source_author_username).toBe("subject");
    expect(row!.source_author_avatar_url).toBe(
      "https://cdn.example/subject.jpg"
    );
  });

  it("B: source author != profile subject → AUTHOR identity, not owner", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      source_author_id: "other-author",
      source_author_display_name: "Other Author",
      source_author_username: "other_author",
      source_author_avatar_url: "https://cdn.example/other.jpg",
      duo: { opportunity_id: "duo-1", viewer_duo_joined: true },
      group: null,
    });
    expect(row!.source_author_id).toBe("other-author");
    expect(row!.source_author_display_name).toBe("Other Author");
    expect(row!.source_author_username).toBe("other_author");
    expect(row!.source_author_display_name).not.toBe("Profile Owner");
  });

  it("C: Duo-only row retains identity", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      source_author_id: "author-1",
      source_author_display_name: "Ada",
      source_author_username: "ada",
      source_author_avatar_url: null,
      duo: { opportunity_id: "duo-1", viewer_duo_joined: false },
      group: null,
    });
    expect(row!.duo).not.toBeNull();
    expect(row!.group).toBeNull();
    expect(row!.source_author_display_name).toBe("Ada");
    expect(row!.source_author_username).toBe("ada");
  });

  it("D: Group-only row retains identity", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      source_author_id: "author-1",
      source_author_display_name: "Ada",
      source_author_username: null,
      source_author_avatar_url: "https://cdn.example/ada.jpg",
      duo: null,
      group: {
        opportunity_id: "grp-1",
        group_title: "Crew",
        occurs_at: null,
        occurs_time_explicit: null,
        viewer_group_state: "none",
        request_id: null,
      },
    });
    expect(row!.duo).toBeNull();
    expect(row!.group?.opportunity_id).toBe("grp-1");
    expect(row!.source_author_display_name).toBe("Ada");
    expect(row!.source_author_avatar_url).toBe("https://cdn.example/ada.jpg");
  });

  it("E: Duo + Group same post retains one shared identity", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      source_author_id: "author-1",
      source_author_display_name: "Shared Author",
      source_author_username: "shared",
      source_author_avatar_url: null,
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
    expect(row!.duo).not.toBeNull();
    expect(row!.group).not.toBeNull();
    expect(row!.source_author_display_name).toBe("Shared Author");
    expect(row!.source_author_username).toBe("shared");
  });

  it("H: nullable username/avatar parse safely", () => {
    const row = parseProfileSocialOpportunity({
      ...baseShared,
      source_author_id: "author-1",
      source_author_display_name: null,
      source_author_username: null,
      source_author_avatar_url: null,
      duo: { opportunity_id: "duo-1", viewer_duo_joined: false },
      group: null,
    });
    expect(row).not.toBeNull();
    expect(row!.source_author_display_name).toBeNull();
    expect(row!.source_author_username).toBeNull();
    expect(row!.source_author_avatar_url).toBeNull();
  });

  it("G: no N+1 author fetch helpers in service", () => {
    const service = readFileSync(
      resolve(process.cwd(), "src/api/services/profileSocialOpportunities.ts"),
      "utf8"
    );
    expect(service).toContain("source_author_display_name");
    expect(service).toContain("source_author_username");
    expect(service).toContain("source_author_avatar_url");
    expect(service).not.toContain("getProfileByUserId");
    expect(service).not.toContain("inspectCachedProfileByUserId");
    expect(service).not.toContain("getCachedAvatar");
    expect(service).not.toMatch(
      /for\s*\(.*source_author.*\)\s*\{[\s\S]*supabase/
    );
  });
});
