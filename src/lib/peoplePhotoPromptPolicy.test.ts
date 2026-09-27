import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPhotoPromptCadenceForTests,
} from "./peoplePhotoPromptCadence";
import {
  PEOPLE_PHOTO_PROMPT_ENABLED,
  PHOTO_PROMPT_INTERVAL_BY_COUNT,
  isPeopleParticipationPhotoPromptIntent,
  resolvePhotoPromptOffer,
  shouldOfferContextualPhotoPrompt,
} from "./peoplePhotoPromptPolicy";
import {
  setPeoplePhotoPromptBypass,
  resetPeoplePhotoPromptSession,
} from "./peoplePhotoPromptSession";

const USER_ID = "policy-user";
const PROFILE_ID = "policy-profile";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  resetPeoplePhotoPromptSession();
  clearPhotoPromptCadenceForTests(USER_ID);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
    key: () => null,
    length: 0,
  });
});

function seedCachedProfile(photos: string[] = []): void {
  storage.set("my_profile_id", PROFILE_ID);
  storage.set(
    "profile_cache",
    JSON.stringify({
      [PROFILE_ID]: {
        id: PROFILE_ID,
        user_id: USER_ID,
        profile_photos: photos,
        timestamp: Date.now(),
      },
    }),
  );
}

describe("PHOTO_PROMPT_INTERVAL_BY_COUNT", () => {
  it("re-exports production cadence constants", () => {
    expect(PHOTO_PROMPT_INTERVAL_BY_COUNT[0]).toBe(3);
    expect(PHOTO_PROMPT_INTERVAL_BY_COUNT[1]).toBe(5);
    expect(PHOTO_PROMPT_INTERVAL_BY_COUNT[2]).toBe(20);
  });
});

describe("isPeopleParticipationPhotoPromptIntent", () => {
  it("treats People tab intents as participation", () => {
    expect(isPeopleParticipationPhotoPromptIntent("people_connect")).toBe(true);
    expect(isPeopleParticipationPhotoPromptIntent("group_up_request")).toBe(
      true,
    );
    expect(isPeopleParticipationPhotoPromptIntent("group_up_create")).toBe(
      true,
    );
  });

  it("excludes Event/Post pair-up join enrichment", () => {
    expect(isPeopleParticipationPhotoPromptIntent("pair_up_join")).toBe(false);
  });
});

describe("shouldOfferContextualPhotoPrompt", () => {
  it("never offers at 3 photos", () => {
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "people_connect",
        photoCount: 3,
        peopleSessionBypassed: false,
      }),
    ).toBe(false);
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "pair_up_join",
        photoCount: 3,
        peopleSessionBypassed: false,
      }),
    ).toBe(false);
  });

  it("offers on first eligible 0-photo attempt", () => {
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "people_connect",
        photoCount: 0,
        peopleSessionBypassed: false,
      }),
    ).toBe(true);
  });

  it("offers on first eligible 1-photo attempt", () => {
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "group_up_request",
        photoCount: 1,
        peopleSessionBypassed: false,
      }),
    ).toBe(true);
  });

  it("seeds quietly at 2 photos then offers on interval", () => {
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "group_up_create",
        photoCount: 2,
        peopleSessionBypassed: false,
      }),
    ).toBe(false);

    for (let i = 0; i < PHOTO_PROMPT_INTERVAL_BY_COUNT[2] - 2; i += 1) {
      expect(
        shouldOfferContextualPhotoPrompt({
          userId: USER_ID,
          intent: "group_up_create",
          photoCount: 2,
          peopleSessionBypassed: false,
        }),
      ).toBe(false);
    }

    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "group_up_create",
        photoCount: 2,
        peopleSessionBypassed: false,
      }),
    ).toBe(true);
  });

  it("suppresses People participation when session bypass is active", () => {
    setPeoplePhotoPromptBypass();
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "people_connect",
        photoCount: 0,
        peopleSessionBypassed: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "group_up_request",
        photoCount: 0,
        peopleSessionBypassed: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "group_up_create",
        photoCount: 0,
        peopleSessionBypassed: true,
      }),
    ).toBe(false);
  });

  it("does not suppress Event/Post pair-up join enrichment when bypass is active", () => {
    setPeoplePhotoPromptBypass();
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "pair_up_join",
        photoCount: 0,
        peopleSessionBypassed: true,
      }),
    ).toBe(true);
  });

  it("respects disabled intent flags", () => {
    const original = PEOPLE_PHOTO_PROMPT_ENABLED.people_connect;
    PEOPLE_PHOTO_PROMPT_ENABLED.people_connect = false;
    expect(
      shouldOfferContextualPhotoPrompt({
        userId: USER_ID,
        intent: "people_connect",
        photoCount: 0,
        peopleSessionBypassed: false,
      }),
    ).toBe(false);
    PEOPLE_PHOTO_PROMPT_ENABLED.people_connect = original;
  });
});

describe("resolvePhotoPromptOffer", () => {
  it("returns null on cache miss", () => {
    expect(
      resolvePhotoPromptOffer(USER_ID, "people_connect", false),
    ).toBeNull();
  });

  it("returns profile when cache is warm and policy allows", () => {
    seedCachedProfile(["a.jpg"]);
    expect(resolvePhotoPromptOffer(USER_ID, "people_connect", false)).toEqual({
      profileId: PROFILE_ID,
      userId: USER_ID,
      photos: ["a.jpg"],
    });
  });

  it("returns null when bypass suppresses People participation", () => {
    seedCachedProfile([]);
    expect(resolvePhotoPromptOffer(USER_ID, "group_up_request", true)).toBeNull();
  });

  it("returns profile for pair_up_join even when bypass is active", () => {
    seedCachedProfile([]);
    expect(resolvePhotoPromptOffer(USER_ID, "pair_up_join", true)).toEqual({
      profileId: PROFILE_ID,
      userId: USER_ID,
      photos: [],
    });
  });
});
