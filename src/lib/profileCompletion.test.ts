import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_BIO_PREFIX,
  deriveProfileCompletion,
  hasPublicSocialLink,
  isMeaningfulProfileBio,
} from "./profileCompletion";

describe("isMeaningfulProfileBio", () => {
  it("rejects empty / whitespace", () => {
    expect(isMeaningfulProfileBio(null)).toBe(false);
    expect(isMeaningfulProfileBio("")).toBe(false);
    expect(isMeaningfulProfileBio("   ")).toBe(false);
  });

  it("rejects legacy default bio (with or without emoji)", () => {
    expect(isMeaningfulProfileBio(DEFAULT_PROFILE_BIO_PREFIX)).toBe(false);
    expect(isMeaningfulProfileBio("I'm too lazy to write a bio 😅")).toBe(
      false,
    );
    expect(
      isMeaningfulProfileBio("I'm too lazy to write a bio 😅 and more"),
    ).toBe(false);
  });

  it("accepts a real bio", () => {
    expect(isMeaningfulProfileBio("Coffee + bikes")).toBe(true);
  });
});

describe("hasPublicSocialLink", () => {
  it("is true when any platform is set", () => {
    expect(hasPublicSocialLink({ instagram_url: "@x" })).toBe(true);
    expect(hasPublicSocialLink({ tiktok_url: "https://tiktok.com/@x" })).toBe(
      true,
    );
    expect(hasPublicSocialLink({ telegram_url: "t.me/x" })).toBe(true);
  });

  it("is false when all empty", () => {
    expect(
      hasPublicSocialLink({
        instagram_url: null,
        tiktok_url: "  ",
        telegram_url: undefined,
      }),
    ).toBe(false);
  });
});

describe("deriveProfileCompletion", () => {
  it("A: 0 photos + empty bio → 0%", () => {
    const c = deriveProfileCompletion({
      profile_photos: [],
      bio: null,
    });
    expect(c.percent).toBe(0);
    expect(c.complete).toBe(false);
    expect(c.hasPhotos).toBe(false);
    expect(c.hasBio).toBe(false);
    expect(c.missingCore).toEqual(["photos", "bio"]);
  });

  it("B: 1 photo + empty bio → 50%", () => {
    const c = deriveProfileCompletion({
      profile_photos: ["user/avatar/a.webp"],
      bio: "",
    });
    expect(c.percent).toBe(50);
    expect(c.hasPhotos).toBe(true);
    expect(c.hasBio).toBe(false);
    expect(c.complete).toBe(false);
  });

  it("C: 0 photos + bio → 50%", () => {
    const c = deriveProfileCompletion({
      profile_photos: [],
      bio: "Hello there",
    });
    expect(c.percent).toBe(50);
    expect(c.hasPhotos).toBe(false);
    expect(c.hasBio).toBe(true);
  });

  it("D: 1 photo + bio → 100%", () => {
    const c = deriveProfileCompletion({
      profile_photos: ["user/avatar/a.webp"],
      bio: "Hello",
    });
    expect(c.percent).toBe(100);
    expect(c.complete).toBe(true);
    expect(c.missingCore).toEqual([]);
  });

  it("E: 3 photos + bio → still 100%", () => {
    const c = deriveProfileCompletion({
      profile_photos: ["a", "b", "c"],
      bio: "Hello",
    });
    expect(c.percent).toBe(100);
    expect(c.complete).toBe(true);
  });

  it("F: Google HTTPS avatar + no profile_photos → photo incomplete", () => {
    const c = deriveProfileCompletion({
      profile_photos: [],
      bio: "Meaningful bio",
      // avatar_url intentionally omitted from input — must not affect result
    });
    expect(c.hasPhotos).toBe(false);
    expect(c.hasBio).toBe(true);
    expect(c.percent).toBe(50);
  });

  it("G: Echo preset alone does not count as photos", () => {
    const c = deriveProfileCompletion({
      profile_photos: [],
      bio: null,
    });
    expect(c.hasPhotos).toBe(false);
    expect(c.percent).toBe(0);
  });

  it("H: default lazy bio → incomplete", () => {
    const c = deriveProfileCompletion({
      profile_photos: ["user/avatar/a.webp"],
      bio: "I'm too lazy to write a bio 😅",
    });
    expect(c.hasBio).toBe(false);
    expect(c.percent).toBe(50);
  });

  it("I: whitespace bio → incomplete", () => {
    const c = deriveProfileCompletion({
      profile_photos: ["user/avatar/a.webp"],
      bio: "   \n\t  ",
    });
    expect(c.hasBio).toBe(false);
    expect(c.percent).toBe(50);
  });

  it("J: social absent → can still reach 100%", () => {
    const c = deriveProfileCompletion({
      profile_photos: ["user/avatar/a.webp"],
      bio: "Hi",
      instagram_url: null,
      tiktok_url: null,
      telegram_url: null,
    });
    expect(c.hasSocial).toBe(false);
    expect(c.complete).toBe(true);
    expect(c.percent).toBe(100);
  });

  it("K: DOB/gender absent → no effect (not in input)", () => {
    const c = deriveProfileCompletion({
      profile_photos: ["p"],
      bio: "Bio",
    });
    expect(c.complete).toBe(true);
  });

  it("social present is reported but optional", () => {
    const c = deriveProfileCompletion({
      profile_photos: [],
      bio: null,
      instagram_url: "https://instagram.com/x",
    });
    expect(c.hasSocial).toBe(true);
    expect(c.percent).toBe(0);
  });
});
