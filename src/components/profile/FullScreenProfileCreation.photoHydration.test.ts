import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(): string {
  return readFileSync(
    join(process.cwd(), "src/components/profile/FullScreenProfileCreation.tsx"),
    "utf8",
  );
}

describe("FullScreenProfileCreation photo hydration guard", () => {
  it("captures generation at fetch start and gates photo apply", () => {
    const code = src();
    expect(code).toContain("photoMutationGenerationRef");
    expect(code).toContain("generationAtFetchStart");
    expect(code).toContain("shouldApplyHydratedProfilePhotos");
    expect(code).toContain("applyProfileRow(data, { applyPhotos })");
    expect(code).toContain("options?: { applyPhotos?: boolean }");
    expect(code).toMatch(/if \(applyPhotos\) \{\s*setProfilePhotos\(photos\);/);
  });

  it("bumps generation on identity publish, reorder, remove, and replace", () => {
    const code = src();
    expect(code).toContain("bumpPhotoMutationGeneration()");
    expect(code).toMatch(
      /Optimistic parent order[\s\S]*?bumpPhotoMutationGeneration\(\);[\s\S]*?setProfilePhotos\(next\)/,
    );
    expect(code).toMatch(
      /Guard open-fetch hydration before any await[\s\S]*?bumpPhotoMutationGeneration\(\)/,
    );
    expect(code).toMatch(
      /Guard open-fetch hydration once the photo array is about to change[\s\S]*?bumpPhotoMutationGeneration\(\)/,
    );
  });

  it("resets generation when editor closes, profileId changes, or effect cleans up", () => {
    const code = src();
    expect(code).toMatch(
      /photoMutationGenerationRef\.current = 0;\s*if \(!open\)/,
    );
    expect(code).toContain("}, [open, profileId]);");
    expect(code).toMatch(
      /return \(\) => \{[\s\S]*?photoMutationGenerationRef\.current = 0/,
    );
  });

  it("keeps web file-input click synchronous from Add tap", () => {
    const code = src();
    const openAdd = code.match(
      /const openAddPhotosPicker = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(openAdd).toBeTruthy();
    expect(openAdd).toContain("avatarFileInputRef.current?.click()");
    expect(openAdd).not.toContain("setTimeout");
    expect(openAdd).not.toContain("requestAnimationFrame");
    expect(code).toMatch(/accept=["']image\/\*["']/);
    expect(code).toMatch(/\bmultiple\b/);
  });

  it("Edit Profile acquisition uses editProfileAcquisition above editProfile", () => {
    const code = src();
    expect(code).toContain(
      "portalClassName={SOCIAL_OVERLAY_LAYER.editProfileAcquisition}",
    );
    expect(code).not.toContain('portalClassName="z-[130]"');
  });
});
