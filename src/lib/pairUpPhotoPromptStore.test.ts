import { beforeEach, describe, expect, it, vi } from "vitest";
import { markPhotoPromptShown } from "./peoplePhotoPromptCadence";
import {
  isPeoplePhotoPromptBypassed,
  resetPeoplePhotoPromptSession,
} from "./peoplePhotoPromptSession";
import {
  closePairUpPhotoPrompt,
  continuePairUpPhotoPrompt,
  getPairUpPhotoPromptIntentKey,
  getPairUpPhotoPromptPendingPostId,
  isPairUpPhotoPromptOpen,
  openPairUpPhotoPrompt,
  isPostJoinPhotoPromptIntent,
  updatePairUpPhotoPromptPhotos,
} from "./pairUpPhotoPromptStore";

vi.mock("./peoplePhotoPromptCadence", () => ({
  markPhotoPromptShown: vi.fn(),
}));

const BASE_JOIN_ARGS = {
  intentKey: "join:post-a",
  profileId: "profile-1",
  userId: "user-1",
  photos: [] as string[],
};

describe("pairUpPhotoPromptStore", () => {
  beforeEach(() => {
    closePairUpPhotoPrompt();
    resetPeoplePhotoPromptSession();
    vi.mocked(markPhotoPromptShown).mockClear();
  });

  it("opens with first intent and blocks second open", () => {
    const onContinue = vi.fn();

    expect(openPairUpPhotoPrompt({ ...BASE_JOIN_ARGS, onContinue })).toBe(true);
    expect(isPairUpPhotoPromptOpen()).toBe(true);
    expect(getPairUpPhotoPromptIntentKey()).toBe("join:post-a");
    expect(getPairUpPhotoPromptPendingPostId()).toBe("post-a");

    const second = openPairUpPhotoPrompt({
      ...BASE_JOIN_ARGS,
      intentKey: "join:post-b",
      onContinue: vi.fn(),
    });
    expect(second).toBe(false);
    expect(getPairUpPhotoPromptPendingPostId()).toBe("post-a");
  });

  it("first intent wins across Group Up create and connect", () => {
    closePairUpPhotoPrompt();
    expect(
      openPairUpPhotoPrompt({
        intentKey: "group-up-create:post-a",
        profileId: "profile-1",
        userId: "user-1",
        photos: [],
        onContinue: vi.fn(),
      }),
    ).toBe(true);

    expect(
      openPairUpPhotoPrompt({
        intentKey: "connect:cand-b:my_plans",
        profileId: "profile-1",
        userId: "user-1",
        photos: [],
        onContinue: vi.fn(),
      }),
    ).toBe(false);
    expect(getPairUpPhotoPromptIntentKey()).toBe("group-up-create:post-a");
  });

  it("Continue anyway on group-up-create intent sets People-session bypass", () => {
    const onContinue = vi.fn();
    openPairUpPhotoPrompt({
      intentKey: "group-up-create:post-a",
      profileId: "profile-1",
      userId: "user-1",
      photos: ["a.jpg"],
      onContinue,
    });
    continuePairUpPhotoPrompt();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(isPeoplePhotoPromptBypassed()).toBe(true);
  });

  it("dismiss (close) fires onDismiss once; Continue does not", () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    openPairUpPhotoPrompt({
      ...BASE_JOIN_ARGS,
      intentKey: "connect:opp-1:discover",
      onContinue,
      onDismiss,
    });
    closePairUpPhotoPrompt();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();

    onDismiss.mockClear();
    openPairUpPhotoPrompt({
      ...BASE_JOIN_ARGS,
      intentKey: "connect:opp-2:discover",
      onContinue,
      onDismiss,
    });
    continuePairUpPhotoPrompt();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("close on group-up-create intent does not set bypass", () => {
    openPairUpPhotoPrompt({
      intentKey: "group-up-create:post-a",
      profileId: "profile-1",
      userId: "user-1",
      photos: [],
      onContinue: vi.fn(),
    });
    closePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("group-up-create continue with 3 photos does not set bypass", () => {
    openPairUpPhotoPrompt({
      intentKey: "group-up-create:post-a",
      profileId: "profile-1",
      userId: "user-1",
      photos: ["a.jpg", "b.jpg", "c.jpg"],
      onContinue: vi.fn(),
    });
    updatePairUpPhotoPromptPhotos(["a.jpg", "b.jpg", "c.jpg"]);
    continuePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("first intent wins across Pair Up connect and Group Up request", () => {
    closePairUpPhotoPrompt();
    expect(
      openPairUpPhotoPrompt({
        intentKey: "group-up-request:opp-a",
        profileId: "profile-1",
        userId: "user-1",
        photos: [],
        onContinue: vi.fn(),
      }),
    ).toBe(true);

    expect(
      openPairUpPhotoPrompt({
        intentKey: "connect:cand-b:my_plans",
        profileId: "profile-1",
        userId: "user-1",
        photos: [],
        onContinue: vi.fn(),
      }),
    ).toBe(false);
    expect(getPairUpPhotoPromptIntentKey()).toBe("group-up-request:opp-a");
  });

  it("close does not invoke continue", () => {
    const onContinue = vi.fn();
    openPairUpPhotoPrompt({ ...BASE_JOIN_ARGS, onContinue });
    closePairUpPhotoPrompt();
    expect(onContinue).not.toHaveBeenCalled();
    expect(isPairUpPhotoPromptOpen()).toBe(false);
  });

  it("continue invokes callback exactly once then resets", () => {
    const onContinue = vi.fn();
    openPairUpPhotoPrompt({ ...BASE_JOIN_ARGS, onContinue });
    continuePairUpPhotoPrompt();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(isPairUpPhotoPromptOpen()).toBe(false);
  });

  it("Continue anyway on connect intent sets People-session bypass", () => {
    const onContinue = vi.fn();
    openPairUpPhotoPrompt({
      intentKey: "connect:opp-1:my_plans",
      profileId: "profile-1",
      userId: "user-1",
      photos: ["a.jpg"],
      onContinue,
    });
    continuePairUpPhotoPrompt();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(isPeoplePhotoPromptBypassed()).toBe(true);
  });

  it("Continue anyway on group-up-request intent sets People-session bypass", () => {
    const onContinue = vi.fn();
    openPairUpPhotoPrompt({
      intentKey: "group-up-request:opp-1",
      profileId: "profile-1",
      userId: "user-1",
      photos: ["a.jpg"],
      onContinue,
    });
    continuePairUpPhotoPrompt();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(isPeoplePhotoPromptBypassed()).toBe(true);
  });

  it("close on connect intent does not set bypass", () => {
    openPairUpPhotoPrompt({
      intentKey: "connect:opp-1:my_plans",
      profileId: "profile-1",
      userId: "user-1",
      photos: [],
      onContinue: vi.fn(),
    });
    closePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("close on group-up-request intent does not set bypass", () => {
    openPairUpPhotoPrompt({
      intentKey: "group-up-request:opp-1",
      profileId: "profile-1",
      userId: "user-1",
      photos: [],
      onContinue: vi.fn(),
    });
    closePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("connect continue with 3 photos does not set bypass", () => {
    openPairUpPhotoPrompt({
      intentKey: "connect:opp-1:discover",
      profileId: "profile-1",
      userId: "user-1",
      photos: ["a.jpg", "b.jpg", "c.jpg"],
      onContinue: vi.fn(),
    });
    updatePairUpPhotoPromptPhotos(["a.jpg", "b.jpg", "c.jpg"]);
    continuePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("group-up-request continue with 3 photos does not set bypass", () => {
    openPairUpPhotoPrompt({
      intentKey: "group-up-request:opp-1",
      profileId: "profile-1",
      userId: "user-1",
      photos: ["a.jpg", "b.jpg", "c.jpg"],
      onContinue: vi.fn(),
    });
    updatePairUpPhotoPromptPhotos(["a.jpg", "b.jpg", "c.jpg"]);
    continuePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("join continue does not set People-session bypass", () => {
    openPairUpPhotoPrompt({ ...BASE_JOIN_ARGS, onContinue: vi.fn() });
    continuePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("production open marks cadence shown", () => {
    openPairUpPhotoPrompt({ ...BASE_JOIN_ARGS, onContinue: vi.fn() });
    expect(markPhotoPromptShown).toHaveBeenCalledWith("user-1", 0);
  });

  it("post-join enrichment intent is recognized and has no pending post join", () => {
    openPairUpPhotoPrompt({
      intentKey: "join-done:post-a",
      profileId: "profile-1",
      userId: "user-1",
      photos: ["a.jpg"],
      onContinue: vi.fn(),
    });
    expect(isPostJoinPhotoPromptIntent(getPairUpPhotoPromptIntentKey())).toBe(
      true,
    );
    expect(getPairUpPhotoPromptPendingPostId()).toBe(null);
    continuePairUpPhotoPrompt();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });
});
