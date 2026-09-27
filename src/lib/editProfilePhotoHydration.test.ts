import { describe, expect, it } from "vitest";
import { shouldApplyHydratedProfilePhotos } from "./editProfilePhotoHydration";

describe("shouldApplyHydratedProfilePhotos", () => {
  it("applies when generation is unchanged since fetch start", () => {
    expect(shouldApplyHydratedProfilePhotos(0, 0)).toBe(true);
    expect(shouldApplyHydratedProfilePhotos(3, 3)).toBe(true);
  });

  it("skips when user mutated photos after fetch started (stale [] vs local [A])", () => {
    const generationAtFetchStart = 0;
    const afterLocalAdd = 1;
    expect(
      shouldApplyHydratedProfilePhotos(generationAtFetchStart, afterLocalAdd),
    ).toBe(false);
  });

  it("skips after remove or reorder mutations", () => {
    expect(shouldApplyHydratedProfilePhotos(2, 3)).toBe(false);
    expect(shouldApplyHydratedProfilePhotos(1, 4)).toBe(false);
  });

  it("treats reset generation as a fresh session (close/reopen or profileId change)", () => {
    expect(shouldApplyHydratedProfilePhotos(0, 0)).toBe(true);
  });
});
