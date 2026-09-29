/**
 * Open Plan consistency Pass 2 — identity, mutation guard, cancel UX.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedOpenPlanOwn,
  invalidateOpenPlanOwnForPost,
  setCachedOpenPlanOwn,
} from "../openPlanCache";
import {
  __resetOpenPlanOwnStoreForTests,
  __setOpenPlanOwnViewerForTests,
  applyFetchedOpenPlanOwnState,
  isRealOpenPlanOpportunityId,
  markLocalOpenPlanMutation,
  seedOpenPlanOwnFromSnapshot,
  setOptimisticOpenPlanOwnState,
} from "../openPlanOwnStore";
import {
  __applyOpenPlanOverlayAuthForTests,
  __resetOpenPlanActiveOverlayForTests,
  getOpenPlanActiveOverlayState,
  openOpenPlanManage,
} from "../openPlanActiveOverlayStore";
import type { OpenPlanOpportunity } from "../people/types";

vi.mock("../showOpenPlanJoinToast", () => ({
  dismissOpenPlanJoinToast: vi.fn(),
}));

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

function sampleOpp(
  overrides: Partial<OpenPlanOpportunity> & {
    id: string;
    source_post_id: string;
  }
): OpenPlanOpportunity {
  return {
    creator_id: "u1",
    status: "active",
    description: null,
    occurs_at: "2099-01-01T12:00:00.000Z",
    occurs_time_explicit: true,
    discoverable_until: "2099-01-08T12:00:00.000Z",
    created_at: new Date().toISOString(),
    closed_at: null,
    ...overrides,
  };
}

describe("Open Plan identity", () => {
  it("1–4: rejects stubs; accepts real UUID", () => {
    expect(isRealOpenPlanOpportunityId("feed_snapshot")).toBe(false);
    expect(isRealOpenPlanOpportunityId("persist:post-1")).toBe(false);
    expect(isRealOpenPlanOpportunityId("optimistic")).toBe(false);
    expect(isRealOpenPlanOpportunityId("")).toBe(false);
    expect(isRealOpenPlanOpportunityId(null)).toBe(false);
    expect(
      isRealOpenPlanOpportunityId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    ).toBe(true);
  });

  it("5: persist:* is not fully hydrated (seed may refresh stubs)", () => {
    const src = readSrc("lib/openPlanOwnStore.ts");
    expect(src).toMatch(
      /function isHydratedOpenPlan[\s\S]*isRealOpenPlanOpportunityId/
    );
    __resetOpenPlanOwnStoreForTests();
    invalidateOpenPlanOwnForPost("p1");
    __setOpenPlanOwnViewerForTests("u1");
    setCachedOpenPlanOwn(
      "u1",
      "p1",
      sampleOpp({
        id: "persist:p1",
        source_post_id: "p1",
        creator_id: "u1",
      })
    );
    // Stub is not hydrated → seed can write feed_snapshot for continuity.
    seedOpenPlanOwnFromSnapshot("u1", "p1", true);
    expect(getCachedOpenPlanOwn("u1", "p1")?.id).toBe("feed_snapshot");
  });

  it("6: cancelOpenPlan rejects stub ids before RPC", () => {
    const svc = readSrc("api/services/openPlans.ts");
    expect(svc).toContain("isRealOpenPlanOpportunityId(opportunityId)");
    expect(svc).toMatch(
      /if \(!isRealOpenPlanOpportunityId\(opportunityId\)\)[\s\S]*throw new Error\("Missing opportunity"\)/
    );
  });
});

describe("Open Plan stale races + mutation guard", () => {
  beforeEach(() => {
    __resetOpenPlanOwnStoreForTests();
    invalidateOpenPlanOwnForPost("shared");
    invalidateOpenPlanOwnForPost("post-create");
    invalidateOpenPlanOwnForPost("post-cancel");
    invalidateOpenPlanOwnForPost("post-recreate");
    invalidateOpenPlanOwnForPost("post-conv");
    invalidateOpenPlanOwnForPost("post-expire");
    __setOpenPlanOwnViewerForTests("u1");
  });

  it("7: old inactive fetch cannot undo successful create", () => {
    const created = sampleOpp({
      id: "opp-new",
      source_post_id: "post-create",
    });
    setCachedOpenPlanOwn("u1", "post-create", created);
    markLocalOpenPlanMutation("post-create", true);
    expect(
      applyFetchedOpenPlanOwnState("u1", "post-create", null)
    ).toBe(false);
    expect(getCachedOpenPlanOwn("u1", "post-create")?.id).toBe("opp-new");
  });

  it("8: old active fetch cannot revive successful cancel", () => {
    setCachedOpenPlanOwn("u1", "post-cancel", null);
    markLocalOpenPlanMutation("post-cancel", false);
    expect(
      applyFetchedOpenPlanOwnState(
        "u1",
        "post-cancel",
        sampleOpp({ id: "stale-active", source_post_id: "post-cancel" })
      )
    ).toBe(false);
    expect(getCachedOpenPlanOwn("u1", "post-cancel")).toBeNull();
  });

  it("9: old pre-recreate response cannot replace newly recreated plan", () => {
    const recreated = sampleOpp({
      id: "opp-recreated",
      source_post_id: "post-recreate",
    });
    setCachedOpenPlanOwn("u1", "post-recreate", recreated);
    markLocalOpenPlanMutation("post-recreate", true);
    // Older null from cancel-era batch.
    expect(
      applyFetchedOpenPlanOwnState("u1", "post-recreate", null)
    ).toBe(false);
    // Older active from previous opportunity.
    expect(
      applyFetchedOpenPlanOwnState(
        "u1",
        "post-recreate",
        sampleOpp({ id: "opp-old", source_post_id: "post-recreate" })
      )
    ).toBe(false);
    expect(getCachedOpenPlanOwn("u1", "post-recreate")?.id).toBe(
      "opp-recreated"
    );
    // Matching recreate id converges.
    expect(
      applyFetchedOpenPlanOwnState("u1", "post-recreate", recreated)
    ).toBe(true);
    expect(getCachedOpenPlanOwn("u1", "post-recreate")?.id).toBe(
      "opp-recreated"
    );
  });

  it("10–11: single + batch hydrate paths use applyFetchedOpenPlanOwnState", () => {
    const svc = readSrc("api/services/openPlans.ts");
    expect(svc).toContain("applyFetchedOpenPlanOwnState");
    expect(svc.match(/applyFetchedOpenPlanOwnState/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svc).toContain("markLocalOpenPlanMutation(sourcePostId, true)");
    expect(svc).toContain("markLocalOpenPlanMutation(opportunity.source_post_id, false)");
  });

  it("12: later matching server fetch converges and clears mutation", () => {
    markLocalOpenPlanMutation("post-conv", false);
    setCachedOpenPlanOwn("u1", "post-conv", null);
    expect(applyFetchedOpenPlanOwnState("u1", "post-conv", null)).toBe(true);
    expect(
      applyFetchedOpenPlanOwnState(
        "u1",
        "post-conv",
        sampleOpp({ id: "server-opp", source_post_id: "post-conv" })
      )
    ).toBe(true);
    expect(getCachedOpenPlanOwn("u1", "post-conv")?.id).toBe("server-opp");
  });

  it("13: expiration/null hydrate works without local mutation", () => {
    setCachedOpenPlanOwn(
      "u1",
      "post-expire",
      sampleOpp({ id: "opp-exp", source_post_id: "post-expire" })
    );
    expect(applyFetchedOpenPlanOwnState("u1", "post-expire", null)).toBe(true);
    expect(getCachedOpenPlanOwn("u1", "post-expire")).toBeNull();
  });
});

describe("Open Plan cancel UX (source)", () => {
  it("14–22: manage cancel identity + non-optimistic contracts", () => {
    const overlay = readSrc("components/ui/OpenPlanActiveOverlay.tsx");
    expect(overlay).toContain("isRealOpenPlanOpportunityId");
    expect(overlay).toContain("getMyOpenPlansForSources");
    expect(overlay).toContain("requestOpenPlanOwnState");
    expect(overlay).toContain("Non-optimistic");
    expect(overlay).not.toMatch(
      /handleCancelConfirm[\s\S]*setOptimisticOpenPlanOwnState/
    );
    expect(overlay).toMatch(
      /if \(!cancelId \|\| !isRealOpenPlanOpportunityId\(cancelId\)\)/
    );
    expect(overlay).toContain("toast.error(peopleUiCopy.openPlanCancelError)");
    expect(overlay).not.toMatch(
      /if \(!opportunity\?\.id \|\| cancelBusy\) return;/
    );
    // Failed cancel: catch toast, finally clear busy — no success close in catch.
    expect(overlay).toMatch(
      /await cancelOpenPlan\(cancelId\);[\s\S]*catch \{[\s\S]*toast\.error\(peopleUiCopy\.openPlanCancelError\);[\s\S]*finally \{[\s\S]*setCancelBusy\(false\)/
    );
  });
});

describe("Open Plan account / regression", () => {
  beforeEach(() => {
    __resetOpenPlanOwnStoreForTests();
    __resetOpenPlanActiveOverlayForTests();
    invalidateOpenPlanOwnForPost("shared-post");
  });

  it("23–25: mutation user-scoped; A hydrate cannot mutate B", () => {
    const src = readSrc("lib/openPlanOwnStore.ts");
    expect(src).toContain("localOpenPlanMutationKey(userId, postId)");
    expect(src).toMatch(
      /function clearMemoryControlSets[\s\S]*localOpenPlanMutation\.clear\(\)/
    );

    __setOpenPlanOwnViewerForTests("u-a");
    markLocalOpenPlanMutation("shared-post", false);
    setCachedOpenPlanOwn("u-a", "shared-post", null);
    expect(
      applyFetchedOpenPlanOwnState(
        "u-a",
        "shared-post",
        sampleOpp({ id: "opp-a", source_post_id: "shared-post", creator_id: "u-a" })
      )
    ).toBe(false);
    expect(
      applyFetchedOpenPlanOwnState(
        "u-b",
        "shared-post",
        sampleOpp({ id: "opp-b", source_post_id: "shared-post", creator_id: "u-b" })
      )
    ).toBe(true);
    expect(getCachedOpenPlanOwn("u-b", "shared-post")?.id).toBe("opp-b");
    expect(getCachedOpenPlanOwn("u-a", "shared-post")).toBeNull();
  });

  it("24: account switch clears mutation via clearMemoryControlSets", () => {
    const src = readSrc("lib/openPlanOwnStore.ts");
    expect(src).toMatch(
      /function clearMemoryControlSets[\s\S]*localOpenPlanMutation\.clear\(\)/
    );
  });

  it("26: account switch closes Open Plan overlay", () => {
    __applyOpenPlanOverlayAuthForTests("u-a");
    openOpenPlanManage("post-x");
    expect(getOpenPlanActiveOverlayState().mode).toBe("manage");
    __applyOpenPlanOverlayAuthForTests("u-b");
    expect(getOpenPlanActiveOverlayState().postId).toBeNull();
    expect(getOpenPlanActiveOverlayState().mode).toBeNull();
  });

  it("27: People Plans candidate cache/order untouched", () => {
    const hook = readSrc("hooks/useOpenPlanCandidates.ts");
    expect(hook).toContain("listOpenPlanCandidates");
    // Pass 2 must not rewrite Plans deck ordering / seen.
    expect(hook).not.toContain("applyFetchedOpenPlanOwnState");
    expect(hook).not.toContain("localOpenPlanMutation");
  });

  it("28: Feed snapshot semantics unchanged", () => {
    const seed = readSrc("lib/seedSocialActionsFromFeed.ts");
    expect(seed).toContain('postType === "experience"');
    expect(seed).toContain("seedOpenPlanOwnFromSnapshot");
    expect(seed).toContain("duo_own_active");
    expect(seed).toContain('postType === "hangout"');
    expect(seed).toContain("seedPairUpJoinFromSnapshot");
  });

  it("29–30: Pair/Group and DB not in this pass's Open Plan contracts", () => {
    const pair = readSrc("lib/pairUpJoinStore.ts");
    expect(pair).not.toContain("applyFetchedOpenPlanOwnState");
    const group = readSrc("lib/groupUpOwnStore.ts");
    expect(group).not.toContain("applyFetchedOpenPlanOwnState");
    const own = readSrc("lib/openPlanOwnStore.ts");
    expect(own).not.toContain("supabase.rpc");
  });
});

describe("Toast Undo still uses real id path", () => {
  it("toast Undo cancel path unchanged semantically", () => {
    const toast = readSrc("lib/showOpenPlanJoinToast.tsx");
    expect(toast).toContain("cancelOpenPlan(opportunityId)");
    expect(toast).toContain("setOptimisticOpenPlanOwnState(postId, null)");
  });

  it("optimistic toast leave still stamps via setOptimistic", () => {
    __resetOpenPlanOwnStoreForTests();
    invalidateOpenPlanOwnForPost("toast-post");
    __setOpenPlanOwnViewerForTests("u1");
    setCachedOpenPlanOwn(
      "u1",
      "toast-post",
      sampleOpp({ id: "opp-toast", source_post_id: "toast-post" })
    );
    const revert = setOptimisticOpenPlanOwnState("toast-post", null);
    expect(getCachedOpenPlanOwn("u1", "toast-post")).toBeNull();
    expect(
      applyFetchedOpenPlanOwnState(
        "u1",
        "toast-post",
        sampleOpp({ id: "stale", source_post_id: "toast-post" })
      )
    ).toBe(false);
    revert?.();
    expect(getCachedOpenPlanOwn("u1", "toast-post")?.id).toBe("opp-toast");
  });
});
