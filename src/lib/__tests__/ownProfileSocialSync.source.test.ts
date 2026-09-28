/**
 * Own Profile / Post Detail social sync contracts + snapshot hardening.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedPairUp,
  invalidateAllPairUpCache,
  setCachedPairUp,
} from "../pairUpCache";
import {
  __resetPairUpJoinStoreForTests,
  __setPairUpJoinViewerForTests,
  getPairUpJoinStatus,
  seedKnownActivePairUpBeforeDetail,
  seedPairUpJoinFromSnapshot,
  setOptimisticPairUpJoinState,
} from "../pairUpJoinStore";
import { invalidatePostDetailCache } from "../../api/queries/getPostById";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

describe("Own Profile + Post Detail social sync (source)", () => {
  it("4: rail collapses when empty (existing rail contract)", () => {
    const rail = readSrc("components/profile/ProfileSocialOpportunityRail.tsx");
    expect(rail).toContain("visible.length === 0");
    expect(rail).toContain("return null");
  });

  it("8–9: joined-member / Other Profile patches unchanged", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("viewer_duo_joined");
    expect(card).toContain("viewer_group_state");
    expect(card).toContain("withdrawGroupUpRequest");
    expect(card).not.toContain("removeCachedProfileSocialOpportunitySide");
    const messaging = readSrc("pages/messages/MessagesInboxPage.tsx");
    expect(messaging).toContain("Could not leave group");
  });

  it("10–12: active Duo seeds before Detail navigation", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("seedKnownActivePairUpBeforeDetail");
    expect(card).toContain("seedKnownActiveGroupUpBeforeDetail");
    expect(card).toMatch(
      /openDetail[\s\S]*seedKnownActivePairUpBeforeDetail[\s\S]*navigateToPostDetailInApp/
    );
    const overlay = readSrc("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("seedKnownActivePairUpBeforeDetail");
    expect(overlay).toContain('contentScope === "my_plans"');
  });

  it("16–19: mutation services invalidate Detail + Own rail sync", () => {
    const pair = readSrc("api/services/pairUp.ts");
    expect(pair).toContain("syncCachesAfterOwnDuoLeave");
    expect(pair).toContain("syncCachesAfterOwnDuoActivate");
    const group = readSrc("api/services/groupUp.ts");
    expect(group).toContain("syncCachesAfterOwnGroupCancel");
    expect(group).toContain("syncCachesAfterOwnGroupCreate");
    const sync = readSrc("lib/ownProfileSocialSync.ts");
    expect(sync).toContain("invalidatePostDetailCache");
    expect(sync).toContain("removeCachedProfileSocialOpportunitySide");
    expect(sync).not.toContain("listProfileSocialOpportunities");
  });

  it("21–22: no full Profile refetch; no DB/RPC edits in this change set", () => {
    const sync = readSrc("lib/ownProfileSocialSync.ts");
    expect(sync).not.toContain("profile:updated");
    expect(sync).not.toContain("getProfileByUserId");
  });
});

describe("pairUpJoinStore snapshot hardening", () => {
  beforeEach(() => {
    __resetPairUpJoinStoreForTests();
    invalidateAllPairUpCache();
    __setPairUpJoinViewerForTests("u1");
  });

  it("14: stale false cannot demote optimistic/known-active", () => {
    setOptimisticPairUpJoinState("post-1", true);
    expect(getPairUpJoinStatus("post-1")).toBe("joined");
    seedPairUpJoinFromSnapshot("u1", "post-1", false);
    expect(getPairUpJoinStatus("post-1")).toBe("joined");
    expect(getCachedPairUp("u1", "post-1")?.id).toBe("optimistic");
  });

  it("15: stale true cannot revive explicit leave", () => {
    setOptimisticPairUpJoinState("post-2", true);
    setOptimisticPairUpJoinState("post-2", false);
    expect(getPairUpJoinStatus("post-2")).toBe("idle");
    seedPairUpJoinFromSnapshot("u1", "post-2", true);
    expect(getPairUpJoinStatus("post-2")).toBe("idle");
    expect(getCachedPairUp("u1", "post-2")).toBeNull();
  });

  it("10: seedKnownActivePairUpBeforeDetail marks joined", () => {
    seedKnownActivePairUpBeforeDetail("u1", "post-3");
    expect(getPairUpJoinStatus("post-3")).toBe("joined");
  });

  it("13/16–17: Detail invalidation is post-scoped", async () => {
    const sync = await import("../ownProfileSocialSync");
    expect(sync.syncCachesAfterOwnDuoLeave.toString()).toContain(
      "invalidatePostDetailCache"
    );
    const detail = readSrc("api/queries/getPostById.ts");
    expect(detail).toContain("function invalidatePostDetailCache");
    expect(detail).toContain('const prefix = `post:${postId}:`');
    void invalidatePostDetailCache;
    void setCachedPairUp;
  });
});
