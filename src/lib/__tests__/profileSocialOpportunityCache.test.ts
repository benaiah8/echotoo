import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetProfileSocialOpportunityCacheForTests,
  getCachedProfileSocialOpportunities,
  invalidateProfileSocialOpportunities,
  invalidateProfileSocialOpportunitiesForViewer,
  patchCachedProfileSocialOpportunity,
  removeCachedProfileSocialOpportunitySide,
  setCachedProfileSocialOpportunities,
} from "../profileSocialOpportunityCache";
import type { ProfileSocialOpportunity } from "../people/types";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  DISCOVER_PREF_TOAST_TOP,
  DISCOVER_PREF_TOASTER_ID,
} from "../showDiscoverPrefToast";
import { DEFAULT_SOCIAL_TOAST_BOTTOM } from "../socialOverlayLayers";
import { SOCIAL_ACTION_TOASTER_ID } from "../showSocialActionToast";

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

describe("profileSocialOpportunityCache", () => {
  beforeEach(() => {
    __resetProfileSocialOpportunityCacheForTests();
  });

  it("stores and patches Duo/Group sub-state without dropping other posts", () => {
    setCachedProfileSocialOpportunities("viewer", "owner", {
      opportunities: [
        sample(),
        sample({
          source_post_id: "post-2",
          duo: null,
          group: {
            opportunity_id: "opp-2",
            group_title: "My Group",
            occurs_at: "2099-01-02T12:00:00.000Z",
            occurs_time_explicit: true,
            viewer_group_state: "none",
            request_id: null,
          },
        }),
      ],
    });

    patchCachedProfileSocialOpportunity("viewer", "owner", "opp-2", {
      viewer_group_state: "pending",
      request_id: "req-1",
    });

    const cached = getCachedProfileSocialOpportunities("viewer", "owner");
    expect(cached?.opportunities).toHaveLength(2);
    expect(cached?.opportunities[0]?.duo?.viewer_duo_joined).toBe(false);
    expect(cached?.opportunities[1]?.group?.viewer_group_state).toBe("pending");
    expect(cached?.opportunities[1]?.group?.request_id).toBe("req-1");
  });

  it("patches Duo on a post that also carries Group without losing Group", () => {
    setCachedProfileSocialOpportunities("viewer", "owner", {
      opportunities: [
        sample({
          duo: {
            opportunity_id: "opp-duo",
            viewer_duo_joined: false,
          },
          group: {
            opportunity_id: "opp-group",
            group_title: "Hosted",
            occurs_at: null,
            occurs_time_explicit: null,
            viewer_group_state: "none",
            request_id: null,
          },
        }),
      ],
    });

    patchCachedProfileSocialOpportunity("viewer", "owner", "opp-duo", {
      viewer_duo_joined: true,
      viewer_profile_connected: true,
    });

    const row = getCachedProfileSocialOpportunities("viewer", "owner")
      ?.opportunities[0];
    expect(row?.duo?.viewer_duo_joined).toBe(true);
    expect(row?.duo?.viewer_profile_connected).toBe(true);
    expect(row?.group?.opportunity_id).toBe("opp-group");
    expect(row?.group?.viewer_group_state).toBe("none");
  });

  it("invalidates per-profile and per-viewer", () => {
    setCachedProfileSocialOpportunities("viewer", "owner-a", {
      opportunities: [sample()],
    });
    setCachedProfileSocialOpportunities("viewer", "owner-b", {
      opportunities: [
        sample({
          source_post_id: "post-b",
          duo: { opportunity_id: "opp-b", viewer_duo_joined: false },
        }),
      ],
    });

    invalidateProfileSocialOpportunities("viewer", "owner-a");
    expect(getCachedProfileSocialOpportunities("viewer", "owner-a")).toBeNull();
    expect(
      getCachedProfileSocialOpportunities("viewer", "owner-b")?.opportunities
    ).toHaveLength(1);

    invalidateProfileSocialOpportunitiesForViewer("viewer");
    expect(getCachedProfileSocialOpportunities("viewer", "owner-b")).toBeNull();
  });

  it("1–5: side-aware Duo remove keeps Group; drops row when Duo-only; preserves order", () => {
    setCachedProfileSocialOpportunities("me", "me", {
      opportunities: [
        sample({
          source_post_id: "post-a",
          duo: { opportunity_id: "duo-a", viewer_duo_joined: true },
          group: null,
        }),
        sample({
          source_post_id: "post-b",
          duo: { opportunity_id: "duo-b", viewer_duo_joined: true },
          group: {
            opportunity_id: "grp-b",
            group_title: "Keep",
            occurs_at: null,
            occurs_time_explicit: null,
            viewer_group_state: "none",
            request_id: null,
          },
        }),
        sample({
          source_post_id: "post-c",
          duo: { opportunity_id: "duo-c", viewer_duo_joined: true },
          group: null,
        }),
      ],
    });

    removeCachedProfileSocialOpportunitySide("me", "me", {
      side: "duo",
      sourcePostId: "post-a",
      opportunityId: "duo-a",
    });
    removeCachedProfileSocialOpportunitySide("me", "me", {
      side: "duo",
      sourcePostId: "post-b",
      opportunityId: "duo-b",
    });

    const rows = getCachedProfileSocialOpportunities("me", "me")?.opportunities;
    expect(rows?.map((r) => r.source_post_id)).toEqual(["post-b", "post-c"]);
    expect(rows?.[0]?.duo).toBeNull();
    expect(rows?.[0]?.group?.opportunity_id).toBe("grp-b");
    expect(rows?.[1]?.duo?.opportunity_id).toBe("duo-c");
  });

  it("6–7: Group cancel clears Group side only; retains Duo", () => {
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

    const row = getCachedProfileSocialOpportunities("me", "me")
      ?.opportunities[0];
    expect(row?.duo?.opportunity_id).toBe("duo-1");
    expect(row?.group).toBeNull();
  });
});

describe("ownProfileSocialSync", () => {
  beforeEach(() => {
    __resetProfileSocialOpportunityCacheForTests();
  });

  it("20: activate invalidates Own Profile rail without fabricating rows", async () => {
    const { syncCachesAfterOwnDuoActivate } = await import(
      "../ownProfileSocialSync"
    );
    setCachedProfileSocialOpportunities("me", "me", {
      opportunities: [sample()],
    });
    syncCachesAfterOwnDuoActivate("me", "post-new");
    expect(getCachedProfileSocialOpportunities("me", "me")).toBeNull();
  });
});

describe("People discoverability copy", () => {
  it("uses People discoverability title and mentions Duo + hosted Groups", () => {
    expect(peopleUiCopy.profileDiscoverTitle).toBe("People discoverability");
    expect(peopleUiCopy.profileDiscoverBody.toLowerCase()).toContain("duo");
    expect(peopleUiCopy.profileDiscoverBody.toLowerCase()).toContain("group");
    expect(peopleUiCopy.profileDiscoverBody.toLowerCase()).toContain("profile");
  });

  it("Discover enable toast copy is reversible (no locked Profile redirect)", () => {
    expect(peopleUiCopy.discoverToggleOnSuccess).toBe("Discover turned on");
    expect(peopleUiCopy.discoverToggleOffSuccess).toBe("Discover turned off");
    expect(peopleUiCopy.discoverToggleTurnOff).toBe("Turn off");
    expect(peopleUiCopy).not.toHaveProperty("discoverLockedGoSettings");
    expect(peopleUiCopy).not.toHaveProperty("discoverLockedTurnOn");
  });
});

describe("People Discover status toast position", () => {
  it("uses a dedicated top toaster below safe-area (not bottom social-action)", () => {
    expect(DISCOVER_PREF_TOASTER_ID).toBe("discover-pref");
    expect(DISCOVER_PREF_TOASTER_ID).not.toBe(SOCIAL_ACTION_TOASTER_ID);
    expect(DISCOVER_PREF_TOAST_TOP).toBe(
      "calc(16px + env(safe-area-inset-top, 0px))"
    );
    expect(DEFAULT_SOCIAL_TOAST_BOTTOM).toContain(
      "var(--safe-area-bottom-layout"
    );
  });
});
