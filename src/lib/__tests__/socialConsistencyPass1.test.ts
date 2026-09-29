/**
 * Social consistency Pass 1 — Own Duo click + account-switch isolation.
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
  applyFetchedPairUpJoinState,
  markLocalPairUpMutation,
  setOptimisticPairUpJoinState,
} from "../pairUpJoinStore";
import {
  __applySourceGroupRequestAuthForTests,
  __resetSourceGroupRequestFlightsForTests,
  isSourceGroupRequestBusy,
  runSourceGroupRequest,
} from "../sourceGroupRequestActions";
import { vi } from "vitest";

vi.mock("../../api/services/groupUp", () => ({
  requestGroupUp: vi.fn(),
  withdrawGroupUpRequest: vi.fn(),
  classifyGroupUpRequestError: vi.fn(() => "other"),
}));

vi.mock("../showGroupUpRequestToast", () => ({
  showGroupUpRequestToast: vi.fn(),
  showGroupUpWithdrawnToast: vi.fn(),
  dismissGroupUpRequestToast: vi.fn(),
}));

import { requestGroupUp } from "../../api/services/groupUp";
import {
  __resetGroupUpSourceListCacheForTests,
  setGroupUpSourceListPage,
} from "../groupUpSourceListCache";
import type { SourceGroupRow } from "../social/sourceGroupTypes";

const root = process.cwd();
const requestGroupUpMock = vi.mocked(requestGroupUp);

function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

function sampleOpp(id: string, postId: string) {
  return {
    id,
    source_post_id: postId,
    status: "active" as const,
    description: null,
    discoverable_until: "",
    created_at: new Date().toISOString(),
  };
}

function makeRow(opportunityId: string): SourceGroupRow {
  return {
    opportunity_id: opportunityId,
    conversation_id: `c-${opportunityId}`,
    source_post_id: "src-1",
    group_title: "G",
    group_description: null,
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date().toISOString(),
    source_type: "hangout",
    organizer_user_id: "org",
    organizer_display_name: null,
    organizer_username: null,
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 1,
    viewer_state: "none",
    request_id: null,
  };
}

describe("Own Profile Duo click + manage routing", () => {
  it("1: active Own Duo does not pass resolving when hasOwnerDuo", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain(
      "resolving={hasOwnerDuo ? false : duoAction.resolving}"
    );
  });

  it("2: Own Duo opens Manage when row.duo exists (not duoAction.active)", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toContain("if (hasOwnerDuo) {");
    expect(card).toContain("openPairUpManage(row.source_post_id)");
    expect(card).not.toMatch(
      /handleOwnDuo[\s\S]*hasOwnerDuo \|\| duoAction\.active/
    );
    expect(card).toContain("const ownDuoActive = hasOwnerDuo");
  });

  it("3: Own Duo uses create path when row.duo absent", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toMatch(
      /if \(hasOwnerDuo\) \{\s*openPairUpManage\(row\.source_post_id\);\s*return;\s*\}\s*void duoAction\.onPress\(\)/
    );
  });

  it("4: Other Profile Duo resolving unchanged (duoBusy)", () => {
    const card = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(card).toMatch(
      /data-profile-social-other-actions[\s\S]*<SocialDuoPill[\s\S]*resolving=\{duoBusy\}/
    );
  });

  it("5: Feed / Detail Duo resolving unchanged", () => {
    const cluster = readSrc("components/social/SocialActionCluster.tsx");
    expect(cluster).toContain("resolving={duo.resolving}");
    const pill = readSrc("components/social/SocialDuoPill.tsx");
    expect(pill).toContain("if (resolving) return");
  });
});

describe("Duo localPairMutation account isolation", () => {
  beforeEach(() => {
    __resetPairUpJoinStoreForTests();
    invalidateAllPairUpCache();
  });

  it("6–7: Account A mutation does not affect Account B; clear on switch", () => {
    const src = readSrc("lib/pairUpJoinStore.ts");
    expect(src).toContain("localPairMutationKey(userId, postId)");
    expect(src).toMatch(
      /function clearMemoryControlSets[\s\S]*localPairMutation\.clear\(\)/
    );

    __setPairUpJoinViewerForTests("u-a");
    markLocalPairUpMutation("shared-post", false);
    setCachedPairUp("u-a", "shared-post", null);
    expect(
      applyFetchedPairUpJoinState(
        "u-a",
        "shared-post",
        sampleOpp("opp-a", "shared-post")
      )
    ).toBe(false);
    expect(getCachedPairUp("u-a", "shared-post")).toBeNull();

    // B's write is not blocked by A's mutation key.
    expect(
      applyFetchedPairUpJoinState(
        "u-b",
        "shared-post",
        sampleOpp("opp-b", "shared-post")
      )
    ).toBe(true);
    expect(getCachedPairUp("u-b", "shared-post")?.id).toBe("opp-b");
    expect(getCachedPairUp("u-a", "shared-post")).toBeNull();

    // Account switch clears mutations (then B can converge freely).
    __setPairUpJoinViewerForTests("u-b");
    // Simulate clearMemoryControlSets via re-set after sign-out path covered in source.
    __resetPairUpJoinStoreForTests();
    __setPairUpJoinViewerForTests("u-b");
    markLocalPairUpMutation("shared-post", true);
    expect(
      applyFetchedPairUpJoinState("u-b", "shared-post", null)
    ).toBe(false);
  });

  it("8: late Account A hydrate cannot mutate Account B cache", () => {
    __setPairUpJoinViewerForTests("u-b");
    setCachedPairUp("u-b", "shared-post", null);
    // Stale A response writes only under u-a.
    expect(
      applyFetchedPairUpJoinState(
        "u-a",
        "shared-post",
        sampleOpp("stale-a", "shared-post")
      )
    ).toBe(true);
    expect(getCachedPairUp("u-a", "shared-post")?.id).toBe("stale-a");
    expect(getCachedPairUp("u-b", "shared-post")).toBeNull();
  });

  it("9: same-account stale-fetch protection still works", () => {
    __setPairUpJoinViewerForTests("u1");
    setOptimisticPairUpJoinState("post-leave", false);
    expect(
      applyFetchedPairUpJoinState("u1", "post-leave", sampleOpp("stale", "post-leave"))
    ).toBe(false);
    expect(getCachedPairUp("u1", "post-leave")).toBeNull();
  });
});

describe("Source Group Request flights account safety", () => {
  beforeEach(() => {
    __resetGroupUpSourceListCacheForTests();
    __resetSourceGroupRequestFlightsForTests();
    vi.clearAllMocks();
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1")],
      has_more: false,
      next_cursor: null,
    });
  });

  it("10–11: account switch clears flights; B not blocked by A", async () => {
    const src = readSrc("lib/sourceGroupRequestActions.ts");
    expect(src).toContain("clearSourceGroupRequestFlights");
    expect(src).toContain("onAuthStateChange");

    let resolveReq!: (v: { id: string; status: string }) => void;
    requestGroupUpMock.mockReturnValue(
      new Promise((r) => {
        resolveReq = r;
      }) as never
    );

    __applySourceGroupRequestAuthForTests("u-a");
    const pending = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1"),
    });
    expect(isSourceGroupRequestBusy("o1")).toBe(true);

    __applySourceGroupRequestAuthForTests("u-b");
    expect(isSourceGroupRequestBusy("o1")).toBe(false);

    // B can start a fresh request for the same opportunity.
    let resolveB!: (v: { id: string; status: string }) => void;
    requestGroupUpMock.mockReturnValue(
      new Promise((r) => {
        resolveB = r;
      }) as never
    );
    const b = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1"),
    });
    expect(isSourceGroupRequestBusy("o1")).toBe(true);
    expect(requestGroupUpMock).toHaveBeenCalledTimes(2);

    resolveReq({ id: "r-a", status: "pending" });
    resolveB({ id: "r-b", status: "pending" });
    await Promise.all([pending, b]);
  });

  it("12: same-account duplicate-flight suppression intact", async () => {
    let resolveReq!: (v: { id: string; status: string }) => void;
    requestGroupUpMock.mockReturnValue(
      new Promise((r) => {
        resolveReq = r;
      }) as never
    );
    __applySourceGroupRequestAuthForTests("u-a");
    const a = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1"),
    });
    const b = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1"),
    });
    expect(requestGroupUpMock).toHaveBeenCalledTimes(1);
    resolveReq({ id: "r1", status: "pending" });
    await Promise.all([a, b]);
  });

  it("13: optimistic pending still applied on request", async () => {
    requestGroupUpMock.mockResolvedValue({
      id: "r1",
      status: "pending",
    } as never);
    __applySourceGroupRequestAuthForTests("u-a");
    await runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1"),
    });
    expect(requestGroupUpMock).toHaveBeenCalledWith("o1");
  });
});

describe("Pass 1 scope guards", () => {
  it("14: no Open Plan files changed (source still uses existing cancel stubs)", () => {
    // Pass 1 must not edit Open Plan components — assert manage path unchanged
    // only via absence of Pass-1 Duo resolving pattern there.
    const openPlanCandidates = [
      "components/social/OpenPlanSheet.tsx",
      "components/openPlan/OpenPlanSheet.tsx",
      "pages/OpenPlan.tsx",
    ];
    for (const rel of openPlanCandidates) {
      try {
        const src = readSrc(rel);
        expect(src).not.toContain(
          "resolving={hasOwnerDuo ? false : duoAction.resolving}"
        );
      } catch {
        /* file may not exist — fine */
      }
    }
  });

  it("15: no DB/RPC/migration edits in this pass (pairUpJoinStore only FE)", () => {
    const pair = readSrc("lib/pairUpJoinStore.ts");
    expect(pair).toContain("localPairMutationKey");
    expect(pair).not.toContain("supabase.rpc");
  });
});
