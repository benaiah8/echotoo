import { describe, expect, it } from "vitest";
import {
  isPeoplePhotoPromptBypassed,
  resetPeoplePhotoPromptSession,
  setPeoplePhotoPromptBypass,
} from "./peoplePhotoPromptSession";

describe("peoplePhotoPromptSession", () => {
  it("starts without bypass", () => {
    resetPeoplePhotoPromptSession();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });

  it("sets bypass on Continue anyway path", () => {
    resetPeoplePhotoPromptSession();
    setPeoplePhotoPromptBypass();
    expect(isPeoplePhotoPromptBypassed()).toBe(true);
  });

  it("resets bypass on session reset", () => {
    setPeoplePhotoPromptBypass();
    resetPeoplePhotoPromptSession();
    expect(isPeoplePhotoPromptBypassed()).toBe(false);
  });
});
