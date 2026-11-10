/**
 * Profile rail Heart reads an existing Pair Up interest. Local migration only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIG =
  "supabase/migrations/20261122120000_profile_social_opportunities_viewer_duo_interested.sql";

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIG), "utf8");
}

describe("list_profile_social_opportunities viewer_duo_interested", () => {
  it("keeps the paginated signature and adds the interest flag", () => {
    const body = sql();
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities"
    );
    expect(body).toContain("p_profile_user_id uuid");
    expect(body).toContain("p_limit integer DEFAULT 8");
    expect(body).toContain("p_cursor text DEFAULT NULL");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("ASC NULLS LAST");
    expect(body).toContain(
      "DROP FUNCTION IF EXISTS public.list_profile_social_opportunities(uuid)"
    );
    expect(body).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_profile_social_opportunities(uuid, integer, text)"
    );
    expect(body).toContain("AS viewer_duo_interested");
    expect(body).toContain("'viewer_duo_interested', d.viewer_duo_interested");
    expect(body).toContain("public.social_opportunity_interests i");
    expect(body).toContain("i.to_opportunity_id = o.id");
    expect(body).toContain("mo.creator_id = v_me");
    expect(body).toContain("mo.kind = 'pair_up'");
    expect(body).toContain("mo.status = 'active'");
    expect(body).toContain("a.sort_at IS NOT DISTINCT FROM v_cursor_s");
    expect(body).toContain("a.created_at IS NOT DISTINCT FROM v_cursor_c");
    expect(body).toContain("a.source_post_id > v_cursor_i");
    expect(body).not.toContain(") > ROW(");
    expect(body).not.toMatch(/CREATE TABLE public\.social_opportunity_interests/i);
    expect(body).not.toMatch(/ALTER TABLE public\.social_opportunity_interests/i);
    expect(body).not.toMatch(/INSERT INTO public\.social_opportunity_interests/i);
    expect(body).not.toContain("post_likes");
    expect(body).not.toMatch(/INSERT INTO public\.messages/i);
    expect(body).not.toMatch(/INSERT INTO public\.group_up_requests/i);
  });
});
