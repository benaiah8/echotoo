import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedViewerProfileForPhotoPrompt,
  resolveViewerProfileForPhotoPrompt,
} from "./resolveViewerProfileForPhotoPrompt";

const USER_ID = "user-cache-test";
const PROFILE_ID = "profile-cache-test";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
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

describe("getCachedViewerProfileForPhotoPrompt", () => {
  it("returns null when cache is empty", () => {
    expect(getCachedViewerProfileForPhotoPrompt(USER_ID)).toBeNull();
  });

  it("returns cached profile_photos without async fetch", () => {
    storage.set("my_profile_id", PROFILE_ID);
    storage.set(
      "profile_cache",
      JSON.stringify({
        [PROFILE_ID]: {
          id: PROFILE_ID,
          user_id: USER_ID,
          profile_photos: ["a.jpg", "b.jpg"],
          timestamp: Date.now(),
        },
      }),
    );

    const profile = getCachedViewerProfileForPhotoPrompt(USER_ID);
    expect(profile).toEqual({
      profileId: PROFILE_ID,
      userId: USER_ID,
      photos: ["a.jpg", "b.jpg"],
    });
  });

  it("resolveViewerProfileForPhotoPrompt resolves synchronously from cache", async () => {
    storage.set("my_profile_id", PROFILE_ID);
    storage.set(
      "profile_cache",
      JSON.stringify({
        [PROFILE_ID]: {
          id: PROFILE_ID,
          user_id: USER_ID,
          profile_photos: [],
          timestamp: Date.now(),
        },
      }),
    );

    await expect(resolveViewerProfileForPhotoPrompt(USER_ID)).resolves.toEqual({
      profileId: PROFILE_ID,
      userId: USER_ID,
      photos: [],
    });
  });
});
