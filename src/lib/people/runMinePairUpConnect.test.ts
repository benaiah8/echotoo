import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PairUpCandidate } from "./types";

const connectDiscoverPairUp = vi.fn();
const openPairUpPhotoPrompt = vi.fn();
const resolvePhotoPromptOffer = vi.fn();
const isPeoplePhotoPromptBypassed = vi.fn(() => true);
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("../../api/services/pairUp", () => ({
  connectDiscoverPairUp: (...args: unknown[]) =>
    connectDiscoverPairUp(...args),
}));

vi.mock("../pairUpPhotoPromptStore", () => ({
  openPairUpPhotoPrompt: (...args: unknown[]) =>
    openPairUpPhotoPrompt(...args),
}));

vi.mock("../peoplePhotoPromptPolicy", () => ({
  resolvePhotoPromptOffer: (...args: unknown[]) =>
    resolvePhotoPromptOffer(...args),
}));

vi.mock("../peoplePhotoPromptSession", () => ({
  isPeoplePhotoPromptBypassed: () => isPeoplePhotoPromptBypassed(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { runMinePairUpConnect } from "./runMinePairUpConnect";

function target(
  overrides: Partial<PairUpCandidate> = {}
): PairUpCandidate {
  return {
    opportunity_id: "opp-1",
    source_post_id: "post-1",
    creator_id: "11111111-1111-1111-1111-111111111111",
    profile_id: "22222222-2222-2222-2222-222222222222",
    username: "alice",
    display_name: "Alice",
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
    description: null,
    discoverable_until: "2026-12-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    expressed_by_me: false,
    source_caption: null,
    source_type: null,
    source_created_at: null,
    source_selected_dates: null,
    source_is_recurring: null,
    source_recurrence_days: null,
    ...overrides,
  };
}

describe("runMinePairUpConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPeoplePhotoPromptBypassed.mockReturnValue(true);
    resolvePhotoPromptOffer.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("my_plans uses express, not connect_profile_pair_up", async () => {
    const express = vi.fn(async () => ({
      from_opportunity_id: "from",
      to_opportunity_id: "opp-1",
      matched: false,
    }));
    const applyUnmatchedRemoval = vi.fn();
    const beginFlight = vi.fn();
    const endFlight = vi.fn();

    await runMinePairUpConnect({
      target: target(),
      scope: "my_plans",
      host: {
        shouldAbortBeforeStart: () => false,
        isDevMock: () => false,
        ensureAuthed: () => true,
        authUserId: "user-1",
        express,
        applyUnmatchedRemoval,
        applyMatchedAndComplete: vi.fn(),
        setPinned: vi.fn(),
        setPhaseExpressing: vi.fn(),
        setPhaseIdle: vi.fn(),
        beginFlight,
        endFlight,
      },
    });

    expect(express).toHaveBeenCalledTimes(1);
    expect(express).toHaveBeenCalledWith("opp-1");
    expect(connectDiscoverPairUp).not.toHaveBeenCalled();
    expect(applyUnmatchedRemoval).toHaveBeenCalledWith("opp-1");
    expect(beginFlight).toHaveBeenCalled();
    expect(endFlight).toHaveBeenCalled();
  });

  it("matched path runs applyMatchedAndComplete", async () => {
    const express = vi.fn(async () => ({
      from_opportunity_id: "from",
      to_opportunity_id: "opp-1",
      matched: true,
    }));
    const applyMatchedAndComplete = vi.fn(async () => {});
    const applyUnmatchedRemoval = vi.fn();

    await runMinePairUpConnect({
      target: target(),
      scope: "my_plans",
      host: {
        shouldAbortBeforeStart: () => false,
        isDevMock: () => false,
        ensureAuthed: () => true,
        authUserId: "user-1",
        express,
        applyUnmatchedRemoval,
        applyMatchedAndComplete,
        setPinned: vi.fn(),
        setPhaseExpressing: vi.fn(),
        setPhaseIdle: vi.fn(),
        beginFlight: vi.fn(),
        endFlight: vi.fn(),
      },
    });

    expect(applyMatchedAndComplete).toHaveBeenCalledWith("opp-1");
    expect(applyUnmatchedRemoval).not.toHaveBeenCalled();
  });

  it("aborts when shouldAbortBeforeStart is true (no duplicate mutation)", async () => {
    const express = vi.fn();
    await runMinePairUpConnect({
      target: target(),
      scope: "my_plans",
      host: {
        shouldAbortBeforeStart: () => true,
        isDevMock: () => false,
        ensureAuthed: () => true,
        authUserId: "user-1",
        express,
        applyUnmatchedRemoval: vi.fn(),
        applyMatchedAndComplete: vi.fn(),
        setPinned: vi.fn(),
        setPhaseExpressing: vi.fn(),
        setPhaseIdle: vi.fn(),
        beginFlight: vi.fn(),
        endFlight: vi.fn(),
      },
    });
    expect(express).not.toHaveBeenCalled();
  });

  it("opens shared people_connect photo gate when not bypassed", async () => {
    isPeoplePhotoPromptBypassed.mockReturnValue(false);
    resolvePhotoPromptOffer.mockReturnValue({
      profileId: "p1",
      userId: "user-1",
      photos: [],
    });
    openPairUpPhotoPrompt.mockReturnValue(true);
    const express = vi.fn();

    await runMinePairUpConnect({
      target: target(),
      scope: "my_plans",
      host: {
        shouldAbortBeforeStart: () => false,
        isDevMock: () => false,
        ensureAuthed: () => true,
        authUserId: "user-1",
        express,
        applyUnmatchedRemoval: vi.fn(),
        applyMatchedAndComplete: vi.fn(),
        setPinned: vi.fn(),
        setPhaseExpressing: vi.fn(),
        setPhaseIdle: vi.fn(),
        beginFlight: vi.fn(),
        endFlight: vi.fn(),
      },
    });

    expect(openPairUpPhotoPrompt).toHaveBeenCalled();
    expect(openPairUpPhotoPrompt.mock.calls[0][0].intentKey).toBe(
      "connect:opp-1:my_plans"
    );
    expect(express).not.toHaveBeenCalled();
  });
});
