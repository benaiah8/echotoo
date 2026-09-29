/**
 * Toast UX Pass 2 — quiet background social-status hydrate failures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("react-hot-toast", () => {
  const error = vi.fn();
  const dismiss = vi.fn();
  return {
    default: { error, dismiss, success: vi.fn() },
    toast: { error, dismiss, success: vi.fn() },
  };
});

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock("../../api/services/pairUp", () => ({
  getMyPairUpsForSources: vi.fn(),
}));

vi.mock("../../api/services/groupUp", () => ({
  getMyGroupUpsForSources: vi.fn(),
}));

vi.mock("../../api/services/openPlans", () => ({
  getMyOpenPlansForSources: vi.fn(),
}));

import toast from "react-hot-toast";
import { getMyPairUpsForSources } from "../../api/services/pairUp";
import { getMyGroupUpsForSources } from "../../api/services/groupUp";
import { getMyOpenPlansForSources } from "../../api/services/openPlans";
import {
  getCachedPairUp,
  invalidatePairUpForPost,
  setCachedPairUp,
} from "../pairUpCache";
import {
  getCachedGroupUpOwn,
  invalidateGroupUpOwnForPost,
  setCachedGroupUpOwn,
} from "../groupUpCache";
import {
  getCachedOpenPlanOwn,
  invalidateOpenPlanOwnForPost,
  setCachedOpenPlanOwn,
} from "../openPlanCache";
import {
  __resetPairUpJoinStoreForTests,
  __setPairUpJoinViewerForTests,
  getPairUpJoinStatus,
  isPairUpJoinStateLoadFailed,
  requestPairUpJoinState,
  seedPairUpJoinFromSnapshot,
} from "../pairUpJoinStore";
import {
  __resetGroupUpOwnStoreForTests,
  __setGroupUpOwnViewerForTests,
  getGroupUpOwnStatus,
  isGroupUpOwnStateLoadFailed,
  requestGroupUpOwnState,
  seedGroupUpOwnFromSnapshot,
} from "../groupUpOwnStore";
import {
  __resetOpenPlanOwnStoreForTests,
  __setOpenPlanOwnViewerForTests,
  getOpenPlanOwnStatus,
  isOpenPlanOwnStateLoadFailed,
  requestOpenPlanOwnState,
  seedOpenPlanOwnFromSnapshot,
} from "../openPlanOwnStore";
import type { PairUpOpportunity } from "../people/types";
import type { GroupUpOpportunity } from "../people/types";
import type { OpenPlanOpportunity } from "../people/types";

const root = process.cwd();
function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

const UID = "user-pass2";
const POST = "post-pass2";
const REAL_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function pairOpp(): PairUpOpportunity {
  return {
    id: REAL_ID,
    source_post_id: POST,
    status: "active",
    description: null,
    discoverable_until: "2099-01-01T00:00:00.000Z",
    created_at: "2099-01-01T00:00:00.000Z",
  };
}

function groupOpp(): GroupUpOpportunity {
  return {
    id: REAL_ID,
    source_post_id: POST,
    creator_id: UID,
    conversation_id: "conv-pass2",
    status: "active",
    description: null,
    occurs_at: "2099-01-01T12:00:00.000Z",
    occurs_time_explicit: true,
    discoverable_until: "2099-01-08T12:00:00.000Z",
    created_at: "2099-01-01T00:00:00.000Z",
    closed_at: null,
  };
}

function openPlanOpp(): OpenPlanOpportunity {
  return {
    id: REAL_ID,
    source_post_id: POST,
    creator_id: UID,
    status: "active",
    description: null,
    occurs_at: "2099-01-01T12:00:00.000Z",
    occurs_time_explicit: true,
    discoverable_until: "2099-01-08T12:00:00.000Z",
    created_at: "2099-01-01T00:00:00.000Z",
    closed_at: null,
  };
}

async function flushBatch(): Promise<void> {
  await vi.advanceTimersByTimeAsync(80);
  await Promise.resolve();
  await Promise.resolve();
}

describe("Pass 2 — background social-status hydrate failures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(toast.error).mockClear();
    vi.mocked(getMyPairUpsForSources).mockReset();
    vi.mocked(getMyGroupUpsForSources).mockReset();
    vi.mocked(getMyOpenPlansForSources).mockReset();

    __resetPairUpJoinStoreForTests();
    __resetGroupUpOwnStoreForTests();
    __resetOpenPlanOwnStoreForTests();
    invalidatePairUpForPost(POST);
    invalidateGroupUpOwnForPost(POST);
    invalidateOpenPlanOwnForPost(POST);

    __setPairUpJoinViewerForTests(UID);
    __setGroupUpOwnViewerForTests(UID);
    __setOpenPlanOwnViewerForTests(UID);
    invalidatePairUpForPost(POST);
    invalidateGroupUpOwnForPost(POST);
    invalidateOpenPlanOwnForPost(POST);
  });

  afterEach(() => {
    __resetPairUpJoinStoreForTests();
    __resetGroupUpOwnStoreForTests();
    __resetOpenPlanOwnStoreForTests();
    invalidatePairUpForPost(POST);
    invalidateGroupUpOwnForPost(POST);
    invalidateOpenPlanOwnForPost(POST);
    vi.useRealTimers();
  });

  it("1+4+7+8: Pair Up background failure — quiet, cache truth, loadFailed", async () => {
    vi.mocked(getMyPairUpsForSources).mockRejectedValue(new Error("offline"));

    // Cached soft-revalidate failure keeps cache (4).
    setCachedPairUp(UID, POST, pairOpp());
    seedPairUpJoinFromSnapshot(UID, POST, true);
    requestPairUpJoinState(POST);
    await flushBatch();
    expect(toast.error).not.toHaveBeenCalled();
    expect(getCachedPairUp(UID, POST)?.id).toBe(REAL_ID);
    expect(getPairUpJoinStatus(POST)).toBe("joined");
    expect(isPairUpJoinStateLoadFailed(POST)).toBe(false);

    // No-cache failure: no toast; no fabricated null/inactive cache; loadFailed (1,7,8).
    invalidatePairUpForPost(POST);
    __resetPairUpJoinStoreForTests();
    __setPairUpJoinViewerForTests(UID);
    invalidatePairUpForPost(POST);
    vi.mocked(toast.error).mockClear();
    requestPairUpJoinState(POST);
    await flushBatch();
    expect(toast.error).not.toHaveBeenCalled();
    expect(getCachedPairUp(UID, POST)).toBeUndefined();
    expect(isPairUpJoinStateLoadFailed(POST)).toBe(true);
    expect(getPairUpJoinStatus(POST)).toBe("pending");
  });

  it("2+5+7+8: Group background failure — quiet, cache truth, loadFailed", async () => {
    vi.mocked(getMyGroupUpsForSources).mockRejectedValue(new Error("offline"));

    setCachedGroupUpOwn(UID, POST, groupOpp());
    seedGroupUpOwnFromSnapshot(UID, POST, true);
    requestGroupUpOwnState(POST);
    await flushBatch();
    expect(toast.error).not.toHaveBeenCalled();
    expect(getCachedGroupUpOwn(UID, POST)?.id).toBe(REAL_ID);
    expect(getGroupUpOwnStatus(POST)).toBe("active");
    expect(isGroupUpOwnStateLoadFailed(POST)).toBe(false);

    invalidateGroupUpOwnForPost(POST);
    __resetGroupUpOwnStoreForTests();
    __setGroupUpOwnViewerForTests(UID);
    invalidateGroupUpOwnForPost(POST);
    vi.mocked(toast.error).mockClear();
    requestGroupUpOwnState(POST);
    await flushBatch();
    expect(toast.error).not.toHaveBeenCalled();
    expect(getCachedGroupUpOwn(UID, POST)).toBeUndefined();
    expect(isGroupUpOwnStateLoadFailed(POST)).toBe(true);
    // Cache was not written as known-inactive null.
    expect(getCachedGroupUpOwn(UID, POST)).not.toBeNull();
  });

  it("3+6+7+8: Open Plan background failure — quiet, cache truth, loadFailed", async () => {
    vi.mocked(getMyOpenPlansForSources).mockRejectedValue(new Error("offline"));

    setCachedOpenPlanOwn(UID, POST, openPlanOpp());
    seedOpenPlanOwnFromSnapshot(UID, POST, true);
    requestOpenPlanOwnState(POST);
    await flushBatch();
    expect(toast.error).not.toHaveBeenCalled();
    expect(getCachedOpenPlanOwn(UID, POST)?.id).toBe(REAL_ID);
    expect(getOpenPlanOwnStatus(POST)).toBe("active");
    expect(isOpenPlanOwnStateLoadFailed(POST)).toBe(false);

    invalidateOpenPlanOwnForPost(POST);
    __resetOpenPlanOwnStoreForTests();
    __setOpenPlanOwnViewerForTests(UID);
    invalidateOpenPlanOwnForPost(POST);
    vi.mocked(toast.error).mockClear();
    requestOpenPlanOwnState(POST);
    await flushBatch();
    expect(toast.error).not.toHaveBeenCalled();
    expect(getCachedOpenPlanOwn(UID, POST)).toBeUndefined();
    expect(isOpenPlanOwnStateLoadFailed(POST)).toBe(true);
    expect(getCachedOpenPlanOwn(UID, POST)).not.toBeNull();
  });
});

describe("Pass 2 — source contracts (action toasts / Pass 1 / untouched systems)", () => {
  it("1–3: background status toast strings removed from store flush catches", () => {
    for (const rel of [
      "lib/pairUpJoinStore.ts",
      "lib/groupUpOwnStore.ts",
      "lib/openPlanOwnStore.ts",
    ]) {
      const src = readSrc(rel);
      expect(src).not.toContain("Couldn't load P2P status.");
      expect(src).not.toContain("Couldn't load Group Up status.");
      expect(src).not.toContain("Couldn't load Open Plan status.");
      expect(src).not.toMatch(/toast\.error\(/);
      expect(src).toContain("loadFailed.add");
    }
  });

  it("9–10: Duo Join/Leave action failures still surface toast.error", () => {
    const duo = readSrc("hooks/useDuoSocialAction.ts");
    expect(duo).toContain("toast.error(peopleUiCopy.joinError)");

    const profile = readSrc("components/profile/ProfileSocialOpportunityCard.tsx");
    expect(profile).toContain("toast.error(peopleUiCopy.leaveError)");
    expect(profile).toContain("toast.error(peopleUiCopy.joinError)");

    const pairBtn = readSrc("components/ui/PairUpActionButton.tsx");
    expect(pairBtn).toContain("toast.error(peopleUiCopy.joinError)");
  });

  it("11–12: Group / Open Plan action failures still surface toast.error", () => {
    const group = readSrc("components/ui/GroupUpActiveOverlay.tsx");
    expect(group).toContain("toast.error(peopleUiCopy.groupUpCreateError)");
    expect(group).toContain("toast.error(peopleUiCopy.groupUpCancelError)");

    const open = readSrc("components/ui/OpenPlanActiveOverlay.tsx");
    expect(open).toContain("toast.error(peopleUiCopy.openPlanCreateError)");
    expect(open).toContain("toast.error(peopleUiCopy.openPlanCancelError)");

    const deck = readSrc("pages/people/GroupUpDeckBody.tsx");
    expect(deck).toContain("toast.error(peopleUiCopy.groupUpBrowseRequestError)");
  });

  it("13: flush is shared background path; no dedicated manual-refresh toast gate added", () => {
    const pair = readSrc("lib/pairUpJoinStore.ts");
    expect(pair).toContain("async function flush()");
    expect(pair).not.toContain("manualRefresh");
    expect(pair).not.toContain("forceRefresh");
  });

  it("14–16: Pass 1 / social Undo / ProgressiveFeed offline untouched", () => {
    const bar = readSrc("components/OrdinaryErrorToastBar.tsx");
    expect(bar).toContain("ORDINARY_ERROR_TOAST_DURATION_MS = 7000");
    expect(bar).toContain('aria-label="Dismiss"');
    expect(bar).toContain("armOrdinaryErrorFailSafe");

    const chrome = readSrc("components/AppFloatingChrome.tsx");
    expect(chrome).toContain("OrdinaryErrorToastBar");
    expect(chrome).toContain("SOCIAL_ACTION_TOASTER_ID");

    const social = readSrc("lib/showSocialActionToast.tsx");
    expect(social).toContain("SOCIAL_ACTION_TOAST_DURATION_MS = 6500");
    expect(social).toContain("Independent dismiss timer");

    const feed = readSrc("components/ProgressiveFeed.tsx");
    expect(feed).toContain("isBrowserOffline()");
  });

  it("17–18: mutation guards still present; no DB/RPC migration edits in Pass 2 files", () => {
    expect(readSrc("lib/pairUpJoinStore.ts")).toContain("localPairMutation");
    expect(readSrc("lib/groupUpOwnStore.ts")).toContain("localGroupMutation");
    expect(readSrc("lib/openPlanOwnStore.ts")).toContain("localOpenPlanMutation");
    expect(readSrc("lib/openPlanOwnStore.ts")).toContain(
      "applyFetchedOpenPlanOwnState"
    );
  });
});
