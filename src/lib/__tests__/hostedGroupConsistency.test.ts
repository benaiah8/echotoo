/**
 * Hosted Group consistency — Own Profile click/count, stale hydrate, cancel identity.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedGroupUpOwn,
  invalidateGroupUpOwnForPost,
  setCachedGroupUpOwn,
} from "../groupUpCache";
import {
  __resetGroupUpOwnStoreForTests,
  __setGroupUpOwnViewerForTests,
  applyFetchedGroupUpOwnState,
  getGroupUpOwnStatus,
  isRealGroupUpOpportunityId,
  markLocalGroupUpMutation,
  setOptimisticGroupUpOwnState,
} from "../groupUpOwnStore";
import type { GroupUpOpportunity } from "../people/types";
import {
  __resetProfileSocialOpportunityCacheForTests,
  getCachedProfileSocialOpportunities,
  removeCachedProfileSocialOpportunitySide,
  setCachedProfileSocialOpportunities,
} from "../profileSocialOpportunityCache";
import type { ProfileSocialOpportunity } from "../people/types";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

function sampleOpp(
  overrides: Partial<GroupUpOpportunity> & { id: string; source_post_id: string }
): GroupUpOpportunity {
  return {
    creator_id: "u1",
    conversation_id: "conv-1",
    status: "active",
    description: null,
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: "2099-01-01T00:00:00.000Z",
    created_at: "2099-01-01T00:00:00.000Z",
    closed_at: null,
    ...overrides,
  };
}

function sampleRow(
  overrides: Partial<ProfileSocialOpportunity> = {}
): ProfileSocialOpportunity {
  return {
    source_post_id: "post-1",
    source_type: "hangout",
    source_caption: "Hang",
    source_cover_url: null,
    source_author_id: "author-1",
    source_author_profile_id: null,
    source_author_display_name: "Author",
    source_author_username: "author",
    source_author_avatar_url: null,
    source_selected_dates: null,
    source_recurrence_days: null,
    source_is_recurring: false,
    created_at: "2099-01-01T00:00:00.000Z",
    duo: null,
    group: {
      opportunity_id: "grp-1",
      group_title: "Hosted",
      occurs_at: null,
      occurs_time_explicit: null,
      viewer_group_state: "none",
      request_id: null,
    },
    ...overrides,
  };
}

describe("Own Profile Group click + count fallback (source)", () => {
  it("1–3: Own count fallback + real positive count", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("ownGroupDisplayCount");
    expect(card).toContain("groupAction.displayCount ?? 1");
    expect(card).toContain("const ownGroupActive = hasOwnerGroup");
  });

  it("4–5/7: Other Profile + Feed resolving unchanged", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("resolving={hasOwnerGroup ? false : groupAction.resolving}");
    const cluster = readSrc("components/social/SocialActionCluster.tsx");
    expect(cluster).toContain("resolving={group.resolving}");
    expect(cluster).not.toContain("hasOwnerGroup ? false");
    const hook = readSrc("hooks/useGroupSocialAction.ts");
    expect(hook).toContain("countUnknown");
    expect(hook).toContain("resolving = ownUnknown || countUnknown");
  });

  it("6: Own Group click works while count unresolved", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("resolving={hasOwnerGroup ? false : groupAction.resolving}");
    expect(card).toMatch(
      /handleOwnGroup[\s\S]*if \(hasOwnerGroup\)[\s\S]*openGroupUpManage/
    );
  });

  it("8: Profile passes known opportunity_id into manage", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("opportunityId: groupPayload?.opportunity_id ?? null");
    const store = readSrc("lib/groupUpActiveOverlayStore.ts");
    expect(store).toContain("knownOpportunityId");
    expect(store).toContain("GroupUpManageIdentityHint");
  });
});

describe("Stub id + cancel identity", () => {
  it("9: stub opportunity ids are rejected", () => {
    expect(isRealGroupUpOpportunityId("feed_snapshot")).toBe(false);
    expect(isRealGroupUpOpportunityId("optimistic")).toBe(false);
    expect(isRealGroupUpOpportunityId("persist:post-1")).toBe(false);
    expect(isRealGroupUpOpportunityId("persist-conv:post-1")).toBe(false);
    expect(isRealGroupUpOpportunityId("")).toBe(false);
    expect(isRealGroupUpOpportunityId(null)).toBe(false);
    expect(
      isRealGroupUpOpportunityId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    ).toBe(true);
  });

  it("10/cancel path: no silent !opp?.id return; stubs blocked in cancelGroupUp", () => {
    const overlay = readSrc("components/ui/GroupUpActiveOverlay.tsx");
    expect(overlay).toContain("isRealGroupUpOpportunityId");
    expect(overlay).toContain("cancelOpportunityId");
    expect(overlay).toContain("manageHydrateBusy");
    expect(overlay).not.toMatch(/if \(!opp\?\.id\) return;\s*setCancelBusy/);
    const group = readSrc("api/services/groupUp.ts");
    expect(group).toContain("isRealGroupUpOpportunityId(opportunityId)");
    expect(group).toContain('throw new Error("Invalid Group Up opportunity")');
  });
});

describe("Stale Group hydrate vs localGroupMutation", () => {
  beforeEach(() => {
    __resetGroupUpOwnStoreForTests();
    for (const id of ["post-c", "post-a", "post-m", "shared-post"]) {
      invalidateGroupUpOwnForPost(id);
    }
    __setGroupUpOwnViewerForTests("u1");
  });

  it("16: older active hydrate cannot revive successful cancel", () => {
    setOptimisticGroupUpOwnState("post-c", null);
    expect(getGroupUpOwnStatus("post-c")).toBe("idle");
    const applied = applyFetchedGroupUpOwnState(
      "u1",
      "post-c",
      sampleOpp({ id: "stale-grp", source_post_id: "post-c" })
    );
    expect(applied).toBe(false);
    expect(getCachedGroupUpOwn("u1", "post-c")).toBeNull();
  });

  it("17: older inactive hydrate cannot demote successful create", () => {
    markLocalGroupUpMutation("post-a", true);
    setCachedGroupUpOwn(
      "u1",
      "post-a",
      sampleOpp({ id: "new-grp", source_post_id: "post-a" })
    );
    const applied = applyFetchedGroupUpOwnState("u1", "post-a", null);
    expect(applied).toBe(false);
    expect(getCachedGroupUpOwn("u1", "post-a")?.id).toBe("new-grp");
  });

  it("18: later matching fetch converges", () => {
    markLocalGroupUpMutation("post-m", false);
    setCachedGroupUpOwn("u1", "post-m", null);
    expect(applyFetchedGroupUpOwnState("u1", "post-m", null)).toBe(true);
    expect(
      applyFetchedGroupUpOwnState(
        "u1",
        "post-m",
        sampleOpp({ id: "server-grp", source_post_id: "post-m" })
      )
    ).toBe(true);
    expect(getCachedGroupUpOwn("u1", "post-m")?.id).toBe("server-grp");
  });

  it("19–20: single + batch hydrate paths use applyFetchedGroupUpOwnState", () => {
    const group = readSrc("api/services/groupUp.ts");
    expect(group).toContain("applyFetchedGroupUpOwnState");
    expect(group).toContain("markLocalGroupUpMutation");
  });

  it("21: account switch clears local mutation; keys are user-scoped", () => {
    const src = readSrc("lib/groupUpOwnStore.ts");
    expect(src).toMatch(
      /function clearMemoryControlSets[\s\S]*localGroupMutation\.clear\(\)/
    );
    expect(src).toContain("localGroupMutationKey(userId, postId)");
  });

  it("7 create/cancel stamp mutations", () => {
    const group = readSrc("api/services/groupUp.ts");
    expect(group).toMatch(
      /Create Group Up failed[\s\S]*markLocalGroupUpMutation\(sourcePostId, true\)/
    );
    expect(group).toMatch(
      /markLocalGroupUpMutation\(opportunity\.source_post_id, false\)/
    );
  });
});

describe("Cancel sync + Duo+Group matrix", () => {
  beforeEach(() => {
    __resetProfileSocialOpportunityCacheForTests();
  });

  it("11–13: cancel Group side-remove; Duo preserved; group-only drops row", () => {
    setCachedProfileSocialOpportunities("me", "me", {
      opportunities: [
        sampleRow({
          source_post_id: "both",
          duo: { opportunity_id: "duo-1", viewer_duo_joined: true },
          group: {
            opportunity_id: "grp-both",
            group_title: "G",
            occurs_at: null,
            occurs_time_explicit: null,
            viewer_group_state: "none",
            request_id: null,
          },
        }),
        sampleRow({
          source_post_id: "group-only",
          duo: null,
          group: {
            opportunity_id: "grp-only",
            group_title: "G2",
            occurs_at: null,
            occurs_time_explicit: null,
            viewer_group_state: "none",
            request_id: null,
          },
        }),
      ],
    });
    removeCachedProfileSocialOpportunitySide("me", "me", {
      side: "group",
      sourcePostId: "both",
      opportunityId: "grp-both",
    });
    removeCachedProfileSocialOpportunitySide("me", "me", {
      side: "group",
      sourcePostId: "group-only",
      opportunityId: "grp-only",
    });
    const rows = getCachedProfileSocialOpportunities("me", "me")?.opportunities;
    expect(rows?.map((r) => r.source_post_id)).toEqual(["both"]);
    expect(rows?.[0]?.duo?.opportunity_id).toBe("duo-1");
    expect(rows?.[0]?.group).toBeNull();
  });

  it("14–15: cancel failure restores optimistic; revert used", () => {
    const overlay = readSrc("components/ui/GroupUpActiveOverlay.tsx");
    expect(overlay).toContain("const revert = setOptimisticGroupUpOwnState");
    expect(overlay).toContain("revert?.()");
    expect(overlay).toContain("await cancelGroupUp(cancelId)");
  });

  it("canonical cancel path unchanged", () => {
    const group = readSrc("api/services/groupUp.ts");
    expect(group).toContain("applyLocalCancelGroupPatches");
    expect(group).toContain("syncCachesAfterOwnGroupCancel");
    const patches = readSrc("lib/groupUpLocalPatches.ts");
    expect(patches).toContain("markGroupUpCountStale");
    expect(patches).not.toMatch(
      /applyLocalCancelGroupPatches[\s\S]*patchGroupUpCount\([^)]*-1/
    );
  });
});

describe("Preserve Groups New/Yours / chat / Other Request (source)", () => {
  it("24–28: cancel does not leave conversation; decks untouched contracts", () => {
    const group = readSrc("api/services/groupUp.ts");
    expect(group).not.toContain("leave_group");
    const cancelFn = group.slice(group.indexOf("export async function cancelGroupUp"));
    const cancelBody = cancelFn.slice(
      0,
      cancelFn.indexOf("export async function renewGroupUp")
    );
    expect(cancelBody).not.toContain("clearDmInboxCache");
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("ProfileGroupRequestPill");
    expect(card).toContain("requestGroupUp");
    expect(card).toContain("withdrawGroupUpRequest");
    const candidates = readSrc("hooks/useGroupUpCandidates.ts");
    expect(candidates).toContain("listGroupUpCandidates");
  });

  it("29: no DB/RPC migration edits in FE sync helpers", () => {
    const sync = readSrc("lib/ownProfileSocialSync.ts");
    expect(sync).not.toContain("supabase.rpc");
    expect(sync).not.toContain("cancel_group_up");
  });

  it("23 recreate: create stamps active mutation", () => {
    const group = readSrc("api/services/groupUp.ts");
    expect(group).toContain("markLocalGroupUpMutation(sourcePostId, true)");
  });
});

describe("Account A cannot mutate Account B via applyFetched", () => {
  beforeEach(() => {
    __resetGroupUpOwnStoreForTests();
    invalidateGroupUpOwnForPost("shared-post");
  });

  it("22: applyFetched writes under provided userId only", () => {
    __setGroupUpOwnViewerForTests("u-a");
    markLocalGroupUpMutation("shared-post", false);
    setCachedGroupUpOwn("u-a", "shared-post", null);
    // Conflicting write for A ignored.
    expect(
      applyFetchedGroupUpOwnState(
        "u-a",
        "shared-post",
        sampleOpp({ id: "opp-a", source_post_id: "shared-post" })
      )
    ).toBe(false);
    expect(getCachedGroupUpOwn("u-a", "shared-post")).toBeNull();
    // Separate account key can still receive its own write.
    expect(
      applyFetchedGroupUpOwnState(
        "u-b",
        "shared-post",
        sampleOpp({ id: "opp-b", source_post_id: "shared-post" })
      )
    ).toBe(true);
    expect(getCachedGroupUpOwn("u-b", "shared-post")?.id).toBe("opp-b");
    expect(getCachedGroupUpOwn("u-a", "shared-post")).toBeNull();
  });
});
