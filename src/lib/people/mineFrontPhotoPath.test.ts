import { describe, expect, it } from "vitest";
import {
  resolveMineFrontDisplayUrl,
  resolveMineFrontPhotoPath,
} from "./mineFrontPhotoPath";

describe("resolveMineFrontPhotoPath", () => {
  it("matches photoIndexByPersonKey selection for multi-photo profiles", () => {
    const source = {
      profile_photos: ["p0.jpg", "p1.jpg", "p2.jpg"],
    };
    expect(resolveMineFrontPhotoPath(source, 0)).toBe("p0.jpg");
    expect(resolveMineFrontPhotoPath(source, 2)).toBe("p2.jpg");
    expect(resolveMineFrontPhotoPath(source, 5)).toBe("p2.jpg");
  });

  it("resolves echo and legacy paths", () => {
    expect(
      resolveMineFrontPhotoPath(
        { echo_preset: "preset:owl_01", profile_photos: [] },
        0
      )
    ).toBe("preset:owl_01");
    expect(
      resolveMineFrontPhotoPath({ avatar_url: "legacy.jpg" }, 0)
    ).toBe("legacy.jpg");
  });

  it("returns null for empty identity", () => {
    expect(resolveMineFrontPhotoPath({}, 0)).toBeNull();
  });
});

describe("resolveMineFrontDisplayUrl", () => {
  it("uses avatarDisplayUrl for storage paths", () => {
    const url = resolveMineFrontDisplayUrl(
      { profile_photos: ["folder/photo.jpg"] },
      0
    );
    expect(url).toBeTruthy();
    expect(url).toContain("photo.jpg");
  });
});
