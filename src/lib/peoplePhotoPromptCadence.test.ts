import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPhotoPromptCadenceForTests,
  markPhotoPromptShown,
  PHOTO_PROMPT_INTERVAL_BY_COUNT,
  shouldShowContextualPhotoPrompt,
} from "./peoplePhotoPromptCadence";

const USER_A = "user-a";
const USER_B = "user-b";

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
  clearPhotoPromptCadenceForTests(USER_A);
  clearPhotoPromptCadenceForTests(USER_B);
});

describe("PHOTO_PROMPT_INTERVAL_BY_COUNT", () => {
  it("centralizes cadence constants", () => {
    expect(PHOTO_PROMPT_INTERVAL_BY_COUNT[0]).toBe(3);
    expect(PHOTO_PROMPT_INTERVAL_BY_COUNT[1]).toBe(5);
    expect(PHOTO_PROMPT_INTERVAL_BY_COUNT[2]).toBe(20);
  });
});

describe("shouldShowContextualPhotoPrompt", () => {
  it("3 photos → never", () => {
    expect(shouldShowContextualPhotoPrompt(USER_A, 3)).toBe(false);
    expect(shouldShowContextualPhotoPrompt(USER_A, 5)).toBe(false);
  });

  it("0 photos → first qualifying attempt shows immediately", () => {
    expect(shouldShowContextualPhotoPrompt(USER_A, 0)).toBe(true);
  });

  it("0 photos → interval after prompt shown", () => {
    expect(shouldShowContextualPhotoPrompt(USER_A, 0)).toBe(true);
    markPhotoPromptShown(USER_A, 0);
    expect(shouldShowContextualPhotoPrompt(USER_A, 0)).toBe(false);
    expect(shouldShowContextualPhotoPrompt(USER_A, 0)).toBe(false);
    expect(shouldShowContextualPhotoPrompt(USER_A, 0)).toBe(true);
  });

  it("1 photo → first attempt may show, then interval", () => {
    expect(shouldShowContextualPhotoPrompt(USER_A, 1)).toBe(true);
    markPhotoPromptShown(USER_A, 1);
    for (let i = 0; i < 4; i++) {
      expect(shouldShowContextualPhotoPrompt(USER_A, 1)).toBe(false);
    }
    expect(shouldShowContextualPhotoPrompt(USER_A, 1)).toBe(true);
  });

  it("2 photos → seeds quietly then rare interval", () => {
    expect(shouldShowContextualPhotoPrompt(USER_A, 2)).toBe(false);
    for (let i = 0; i < 18; i++) {
      expect(shouldShowContextualPhotoPrompt(USER_A, 2)).toBe(false);
    }
    expect(shouldShowContextualPhotoPrompt(USER_A, 2)).toBe(true);
  });

  it("tier change resets interval behavior", () => {
    markPhotoPromptShown(USER_A, 0);
    expect(shouldShowContextualPhotoPrompt(USER_A, 1)).toBe(true);
  });

  it("user A/B independent", () => {
    expect(shouldShowContextualPhotoPrompt(USER_A, 0)).toBe(true);
    markPhotoPromptShown(USER_A, 0);
    expect(shouldShowContextualPhotoPrompt(USER_A, 0)).toBe(false);
    expect(shouldShowContextualPhotoPrompt(USER_B, 0)).toBe(true);
  });

  it("corrupt storage → safe defaults, no throw", () => {
    const userId = "user-corrupt";
    storage.set(
      `echotoo_people_photo_prompt_cadence_v1_${userId}`,
      "not-json",
    );
    expect(shouldShowContextualPhotoPrompt(userId, 0)).toBe(true);
  });
});
