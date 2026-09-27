import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetOpenPlanRequestGroupsCacheForTests,
  getCachedOpenPlanRequestGroups,
  patchOpenPlanRequestGroupsAfterAccept,
  remainingOpenPlanAcceptPatchInputs,
  setCachedOpenPlanRequestGroups,
} from "./openPlanRequestGroupsCache";
import {
  __resetOpenPlanRequestersCacheForTests,
  getCachedOpenPlanRequesters,
  removeFromCachedOpenPlanRequesters,
  setCachedOpenPlanRequesters,
} from "./openPlanRequestersCache";
import type { OpenPlanRequestGroup } from "./people/types";

const USER = "user-host-1";
const OPP_A = "opp-a";
const OPP_B = "opp-b";

function group(partial: Partial<OpenPlanRequestGroup>): OpenPlanRequestGroup {
  return {
    opportunity_id: OPP_A,
    source_post_id: "post-1",
    plan_description: "Coffee after the show",
    source_caption: "Friday gig",
    occurs_at: "2026-09-20T12:00:00.000Z",
    occurs_time_explicit: false,
    pending_count: 3,
    latest_request_at: "2026-09-18T10:00:00.000Z",
    latest_request_id: "req-latest",
    preview_requesters: [
      { avatar_url: "https://example.test/a.jpg", profile_photos: [], echo_preset: null },
      { avatar_url: null, profile_photos: [], echo_preset: "preset:owl_01" },
    ],
    ...partial,
  };
}

describe("openPlanRequestGroupsCache patches", () => {
  beforeEach(() => {
    __resetOpenPlanRequestGroupsCacheForTests();
    __resetOpenPlanRequestersCacheForTests();
  });

  it("keeps one summary row per opportunity_id", () => {
    setCachedOpenPlanRequestGroups(USER, {
      groups: [group({ pending_count: 2 }), group({ opportunity_id: OPP_B })],
      has_more: false,
      next_cursor: null,
    });
    const cached = getCachedOpenPlanRequestGroups(USER);
    expect(cached?.groups).toHaveLength(2);
    expect(cached?.groups.map((g) => g.opportunity_id)).toEqual([OPP_A, OPP_B]);
  });

  it("decrements pending_count and replaces previews for that plan only", () => {
    setCachedOpenPlanRequestGroups(USER, {
      groups: [
        group({ pending_count: 3 }),
        group({ opportunity_id: OPP_B, pending_count: 4 }),
      ],
      has_more: false,
      next_cursor: null,
    });
    const remaining = [
      {
        avatar_url: "https://example.test/b.jpg",
        profile_photos: ["https://example.test/b.jpg"],
        echo_preset: null,
      },
      {
        avatar_url: null,
        profile_photos: [],
        echo_preset: "preset:owl_07",
      },
    ];
    patchOpenPlanRequestGroupsAfterAccept(USER, OPP_A, {
      remainingPreviews: remaining,
      remainingLatest: { at: "2026-09-18T09:00:00.000Z", id: "req-older" },
      acceptedWasLatest: true,
    });
    const cached = getCachedOpenPlanRequestGroups(USER);
    expect(cached?.groups).toHaveLength(2);
    const a = cached?.groups.find((g) => g.opportunity_id === OPP_A);
    const b = cached?.groups.find((g) => g.opportunity_id === OPP_B);
    expect(a?.pending_count).toBe(2);
    expect(a?.preview_requesters).toEqual(remaining);
    expect(a?.latest_request_id).toBe("req-older");
    expect(b?.pending_count).toBe(4);
  });

  it("removes the summary when the last requester is accepted", () => {
    setCachedOpenPlanRequestGroups(USER, {
      groups: [
        group({ pending_count: 1 }),
        group({ opportunity_id: OPP_B, pending_count: 2 }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchOpenPlanRequestGroupsAfterAccept(USER, OPP_A, {
      remainingPreviews: [],
      remainingLatest: null,
      acceptedWasLatest: true,
    });
    const cached = getCachedOpenPlanRequestGroups(USER);
    expect(cached?.groups).toHaveLength(1);
    expect(cached?.groups[0]?.opportunity_id).toBe(OPP_B);
  });

  it("invalidates instead of inventing previews when remaining slots are incomplete", () => {
    setCachedOpenPlanRequestGroups(USER, {
      groups: [group({ pending_count: 4 })],
      has_more: false,
      next_cursor: null,
    });
    patchOpenPlanRequestGroupsAfterAccept(USER, OPP_A, {
      remainingPreviews: [
        { avatar_url: null, profile_photos: [], echo_preset: null },
      ],
      remainingLatest: { at: "2026-09-18T09:00:00.000Z", id: "req-older" },
      acceptedWasLatest: true,
    });
    expect(getCachedOpenPlanRequestGroups(USER)).toBeUndefined();
  });

  it("removes the plan on plan_unavailable without touching other summaries", () => {
    setCachedOpenPlanRequestGroups(USER, {
      groups: [
        group({ pending_count: 3 }),
        group({ opportunity_id: OPP_B, pending_count: 1 }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchOpenPlanRequestGroupsAfterAccept(USER, OPP_A, {
      remainingPreviews: null,
      remainingLatest: null,
      acceptedWasLatest: false,
      removePlan: true,
    });
    const cached = getCachedOpenPlanRequestGroups(USER);
    expect(cached?.groups).toHaveLength(1);
    expect(cached?.groups[0]?.opportunity_id).toBe(OPP_B);
  });

  it("remainingOpenPlanAcceptPatchInputs refuses incomplete two-slot previews", () => {
    const remaining = [
      {
        request_id: "req-2",
        requested_at: "2026-09-18T09:00:00.000Z",
        display_name: null,
        avatar_url: null,
        profile_photos: [],
        echo_preset: null,
        bio: null,
      },
    ];
    expect(remainingOpenPlanAcceptPatchInputs(remaining, 3).remainingPreviews).toBeNull();
    expect(
      remainingOpenPlanAcceptPatchInputs(remaining, 1).remainingPreviews
    ).toHaveLength(1);
  });

  it("drops an accepted requester from the opportunity-scoped cache only", () => {
    setCachedOpenPlanRequesters(USER, OPP_A, {
      requests: [
        {
          request_id: "req-1",
          requested_at: "2026-09-18T10:00:00.000Z",
          display_name: "Visible Ada",
          profile_open_key: "ada",
          avatar_url: null,
          profile_photos: [],
          echo_preset: null,
          bio: null,
        },
        {
          request_id: "req-2",
          requested_at: "2026-09-18T09:00:00.000Z",
          display_name: null,
          profile_open_key: null,
          avatar_url: null,
          profile_photos: [],
          echo_preset: null,
          bio: null,
        },
      ],
      has_more: true,
      next_cursor: "cursor-a",
    });
    setCachedOpenPlanRequesters(USER, OPP_B, {
      requests: [
        {
          request_id: "req-other",
          requested_at: "2026-09-18T10:00:00.000Z",
          display_name: null,
          profile_open_key: null,
          avatar_url: null,
          profile_photos: [],
          echo_preset: null,
          bio: null,
        },
      ],
      has_more: false,
      next_cursor: null,
    });
    removeFromCachedOpenPlanRequesters(USER, OPP_A, "req-1");
    expect(
      getCachedOpenPlanRequesters(USER, OPP_A)?.requests.map((r) => r.request_id)
    ).toEqual(["req-2"]);
    expect(
      getCachedOpenPlanRequesters(USER, OPP_B)?.requests.map((r) => r.request_id)
    ).toEqual(["req-other"]);
  });
});
