import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Open Plan grouped data layer", () => {
  it("wraps the deployed grouped RPCs with cache-first first-page loading", () => {
    const src = read("src/api/services/openPlans.ts");
    expect(src).toContain("list_my_open_plan_request_groups");
    expect(src).toContain("list_open_plan_requesters");
    expect(src).toContain("getCachedOpenPlanRequestGroups");
    expect(src).toContain("getCachedOpenPlanRequesters");
    expect(src).toContain("requestManager.execute");
    expect(src).toContain("p_limit: limit");
    expect(src).toContain("p_cursor: cursor");
    expect(src).toContain("p_opportunity_id: opportunityId");
    expect(src).toContain("p_identity_visible_to_host: identityVisible");
    expect(src).toContain("identityVisibleToHost");
    expect(src).toContain("accept_open_plan_request");
    expect(src).toContain("patchOpenPlanRequestGroupsAfterAccept");
    expect(src).toContain("removeFromCachedOpenPlanRequesters");
    expect(src).not.toContain("channel(");
    expect(src).not.toContain("setInterval");
  });

  it("dedupes summaries by opportunity_id and requesters by request_id", () => {
    const groups = read("src/hooks/useOpenPlanRequestGroups.ts");
    const requesters = read("src/hooks/useOpenPlanRequesters.ts");
    expect(groups).toContain("uniqueByOpportunityId");
    expect(groups).toContain("seen.has(row.opportunity_id)");
    expect(groups).not.toContain("seen.has(row.source_post_id)");
    expect(groups).toContain("limit ?? 20");
    expect(groups).toContain("void revalidate(true)");
    expect(groups).not.toContain("void revalidate(false)");
    expect(requesters).toContain("uniqueByRequestId");
    expect(requesters).toContain("opportunityId");
    expect(requesters).toContain("}, [opportunityId]");
    expect(requesters).not.toContain("conversationId");
    expect(requesters).toContain("void revalidate(true)");
    expect(requesters).not.toContain("void revalidate(false)");
  });
});
