/**
 * Final Own Duo active-state + stale Pair Up fetch + People Back fail-safe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCachedPairUp,
  invalidateAllPairUpCache,
  setCachedPairUp,
} from "../pairUpCache";
import {
  __resetPairUpJoinStoreForTests,
  __setPairUpJoinViewerForTests,
  applyFetchedPairUpJoinState,
  getPairUpJoinStatus,
  markLocalPairUpMutation,
  setOptimisticPairUpJoinState,
} from "../pairUpJoinStore";
import {
  __getMineCandidateProfileOpenCountForTests,
  notifyMineCandidateProfileClosed,
  notifyMineCandidateProfileOpened,
  releaseMineCandidateProfileBackOwnership,
  resetMineCandidateProfileBackGuard,
  shouldSuppressUnderlyingBackForMineCandidateProfile,
} from "../people/mineCandidateProfileOverlayBackGuard";
import type { ProfileSocialOpportunity } from "../people/types";
import {
  __resetProfileSocialOpportunityCacheForTests,
  getCachedProfileSocialOpportunities,
  removeCachedProfileSocialOpportunitySide,
  setCachedProfileSocialOpportunities,
} from "../profileSocialOpportunityCache";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
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
    source_selected_dates: ["2099-01-01T12:00:00.000Z"],
    source_recurrence_days: null,
    source_is_recurring: false,
    created_at: "2099-01-01T00:00:00.000Z",
    duo: {
      opportunity_id: "opp-1",
      viewer_duo_joined: false,
    },
    group: null,
    ...overrides,
  };
}

describe("Own Profile Duo/Group active derivation (source)", () => {
  it("Own active = hasOwnerDuo/hasOwnerGroup only; Manage gated on payload", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("const ownDuoActive = hasOwnerDuo;");
    expect(card).toContain("const ownGroupActive = hasOwnerGroup;");
    expect(card).not.toContain(
      "const ownDuoActive = hasOwnerDuo || duoAction.active"
    );
    expect(card).not.toContain(
      "const ownGroupActive = hasOwnerGroup || groupAction.ownsActive"
    );
    expect(card).toMatch(
      /handleOwnDuo[\s\S]*if \(hasOwnerDuo\)[\s\S]*openPairUpManage/
    );
    expect(card).toMatch(
      /handleOwnGroup[\s\S]*if \(hasOwnerGroup\)[\s\S]*openGroupUpManage/
    );
    expect(card).not.toContain("hasOwnerDuo || duoAction.active");
    expect(card).not.toContain("hasOwnerGroup || groupAction.ownsActive");
  });

  it("Other Profile viewer Duo join path unchanged", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain(
      "const otherDuoActive = hasOwnerDuo ? duoJoined : false"
    );
    expect(card).toContain("viewer_duo_joined");
    expect(card).toContain("joinPairUp");
    expect(card).toContain("leavePairUp");
  });
});

describe("Own Profile mixed Duo+Group rail sides", () => {
  beforeEach(() => {
    __resetProfileSocialOpportunityCacheForTests();
  });

  it("1: Duo+Group leave Duo → row remains, Duo null, Group kept", () => {
    setCachedProfileSocialOpportunities("me", "me", {
      opportunities: [
        sample({
          source_post_id: "post-both",
          duo: { opportunity_id: "duo-1", viewer_duo_joined: true },
          group: {
            opportunity_id: "grp-1",
            group_title: "Hosted",
            occurs_at: null,
            occurs_time_explicit: null,
            viewer_group_state: "none",
            request_id: null,
          },
        }),
      ],
    });
    removeCachedProfileSocialOpportunitySide("me", "me", {
      side: "duo",
      sourcePostId: "post-both",
      opportunityId: "duo-1",
    });
    const row = getCachedProfileSocialOpportunities("me", "me")?.opportunities[0];
    expect(row?.source_post_id).toBe("post-both");
    expect(row?.duo).toBeNull();
    expect(row?.group?.opportunity_id).toBe("grp-1");
  });

  it("2: Duo+Group cancel Group → row remains, Group null, Duo kept", () => {
    setCachedProfileSocialOpportunities("me", "me", {
      opportunities: [
        sample({
          source_post_id: "post-both",
          duo: { opportunity_id: "duo-1", viewer_duo_joined: true },
          group: {
            opportunity_id: "grp-1",
            group_title: "Hosted",
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
      sourcePostId: "post-both",
      opportunityId: "grp-1",
    });
    const row = getCachedProfileSocialOpportunities("me", "me")?.opportunities[0];
    expect(row?.source_post_id).toBe("post-both");
    expect(row?.duo?.opportunity_id).toBe("duo-1");
    expect(row?.group).toBeNull();
  });

  it("3–5: final side removal drops row (rail collapses when empty)", () => {
    setCachedProfileSocialOpportunities("me", "me", {
      opportunities: [
        sample({
          source_post_id: "duo-only",
          duo: { opportunity_id: "duo-x", viewer_duo_joined: true },
          group: null,
        }),
        sample({
          source_post_id: "group-only",
          duo: null,
          group: {
            opportunity_id: "grp-x",
            group_title: "G",
            occurs_at: null,
            occurs_time_explicit: null,
            viewer_group_state: "none",
            request_id: null,
          },
        }),
      ],
    });
    removeCachedProfileSocialOpportunitySide("me", "me", {
      side: "duo",
      sourcePostId: "duo-only",
      opportunityId: "duo-x",
    });
    removeCachedProfileSocialOpportunitySide("me", "me", {
      side: "group",
      sourcePostId: "group-only",
      opportunityId: "grp-x",
    });
    expect(
      getCachedProfileSocialOpportunities("me", "me")?.opportunities ?? []
    ).toEqual([]);
    const rail = readSrc("components/profile/ProfileSocialOpportunityRail.tsx");
    expect(rail).toContain("visible.length === 0");
    expect(rail).toContain("return null");
  });
});

describe("Stale Pair Up fetch vs localPairMutation", () => {
  beforeEach(() => {
    __resetPairUpJoinStoreForTests();
    invalidateAllPairUpCache();
    __setPairUpJoinViewerForTests("u1");
  });

  it("9: explicit leave beats older active fetch write", () => {
    setOptimisticPairUpJoinState("post-leave", false);
    expect(getPairUpJoinStatus("post-leave")).toBe("idle");
    const applied = applyFetchedPairUpJoinState("u1", "post-leave", {
      id: "stale-opp",
      source_post_id: "post-leave",
      status: "active",
      description: null,
      discoverable_until: "",
      created_at: new Date().toISOString(),
    });
    expect(applied).toBe(false);
    expect(getCachedPairUp("u1", "post-leave")).toBeNull();
    expect(getPairUpJoinStatus("post-leave")).toBe("idle");
  });

  it("10: explicit activate/join beats older inactive fetch write", () => {
    setOptimisticPairUpJoinState("post-join", true);
    expect(getPairUpJoinStatus("post-join")).toBe("joined");
    const applied = applyFetchedPairUpJoinState("u1", "post-join", null);
    expect(applied).toBe(false);
    expect(getCachedPairUp("u1", "post-join")?.id).toBe("optimistic");
    expect(getPairUpJoinStatus("post-join")).toBe("joined");
  });

  it("11: later matching revalidation converges and clears mutation", () => {
    markLocalPairUpMutation("post-conv", false);
    setCachedPairUp("u1", "post-conv", null);
    const applied = applyFetchedPairUpJoinState("u1", "post-conv", null);
    expect(applied).toBe(true);
    expect(getCachedPairUp("u1", "post-conv")).toBeNull();
    const revived = applyFetchedPairUpJoinState("u1", "post-conv", {
      id: "server-opp",
      source_post_id: "post-conv",
      status: "active",
      description: null,
      discoverable_until: "",
      created_at: new Date().toISOString(),
    });
    expect(revived).toBe(true);
    expect(getCachedPairUp("u1", "post-conv")?.id).toBe("server-opp");
  });

  it("batch hydrate path uses applyFetchedPairUpJoinState", () => {
    const pair = readSrc("api/services/pairUp.ts");
    expect(pair).toContain("applyFetchedPairUpJoinState");
    expect(pair).toContain("markLocalPairUpMutation");
  });
});

describe("People Back fail-safe (source)", () => {
  it("12–16/20–21: closePeople uses bounded exit attempt + fallback", () => {
    const src = readSrc("router/PersistentTabContainer.new.tsx");
    expect(src).toContain("peopleExitAttemptRef");
    expect(src).toContain("peopleExitFallbackTimerRef");
    expect(src).toContain("clearPeopleExitAttempt");
    expect(src).toContain("navigate(-1)");
    expect(src).toContain("navigate(origin, { replace: true })");
    expect(src).toContain("400");
    expect(src).toContain("closingPeopleRef.current = false");
    expect(src).toMatch(
      /activeTab !== "people" \|\| tabsCovered[\s\S]*peopleExitAttemptRef\.current \+= 1[\s\S]*clearPeopleExitAttempt/
    );
    expect(src).toMatch(
      /return \(\) => \{[\s\S]*peopleExitAttemptRef\.current \+= 1[\s\S]*clearPeopleExitAttempt/
    );
  });

  it("17: FluidNav Back bypasses suppressClickRef", () => {
    const nav = readSrc("pages/people/PeopleFluidNav.tsx");
    expect(nav).toContain('target?.closest?.("[data-people-back]")');
    expect(nav).toContain("onClickCapture");
    expect(nav).toMatch(
      /onClickCapture[\s\S]*data-people-back[\s\S]*suppressClickRef\.current = false[\s\S]*return/
    );
  });

  it("18–19: Back does not await PTR/seen/loadMore", () => {
    const page = readSrc("pages/people/PeoplePage.tsx");
    expect(page).toContain("closePeople()");
    expect(page).not.toMatch(/await[\s\S]*closePeople/);
    const overlay = readSrc("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("onBack={onClose}");
    expect(overlay).not.toMatch(/onBack=\{async/);
  });

  it("26: no DB/RPC migration files touched by these contracts", () => {
    const sync = readSrc("lib/ownProfileSocialSync.ts");
    expect(sync).not.toContain("supabase.rpc");
    expect(sync).not.toContain("leave_pair_up");
  });
});

describe("Mine profile Android Back ownership", () => {
  beforeEach(() => {
    resetMineCandidateProfileBackGuard();
  });

  afterEach(() => {
    resetMineCandidateProfileBackGuard();
  });

  it("22–24: open/close + release cannot leave sticky openCount", () => {
    notifyMineCandidateProfileOpened();
    expect(__getMineCandidateProfileOpenCountForTests()).toBe(1);
    expect(shouldSuppressUnderlyingBackForMineCandidateProfile()).toBe(true);
    notifyMineCandidateProfileClosed();
    expect(__getMineCandidateProfileOpenCountForTests()).toBe(0);
    expect(shouldSuppressUnderlyingBackForMineCandidateProfile()).toBe(true);

    notifyMineCandidateProfileOpened();
    notifyMineCandidateProfileOpened();
    expect(__getMineCandidateProfileOpenCountForTests()).toBe(2);
    releaseMineCandidateProfileBackOwnership();
    expect(__getMineCandidateProfileOpenCountForTests()).toBe(0);

    resetMineCandidateProfileBackGuard();
    expect(shouldSuppressUnderlyingBackForMineCandidateProfile()).toBe(false);
  });

  it("People leave resets Mine guard; lightbox priority path preserved", () => {
    const page = readSrc("pages/people/PeoplePage.tsx");
    expect(page).toContain("resetMineCandidateProfileBackGuard");
    expect(page).toContain(
      "shouldSuppressUnderlyingBackForMineCandidateProfile"
    );
    expect(page).toContain(
      "shouldSuppressUnderlyingBackForMediaGalleryLightbox"
    );
    expect(page).toContain("shouldSuppressUnderlyingBackForPhotoPrompt");
    const overlay = readSrc(
      "components/people/MineCandidateProfileOverlay.tsx"
    );
    expect(overlay).toContain("releaseMineCandidateProfileBackOwnership");
    expect(overlay).toContain("notifyMineCandidateProfileOpened");
    expect(overlay).toContain("notifyMineCandidateProfileClosed");
  });
});
