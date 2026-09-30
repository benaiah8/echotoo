import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { socialShelfSurfaceAllowsBleed } from "../social/socialShelfSurface";
import { socialRailBareRowClassName } from "../socialActionUi";
import { socialUiCopy } from "../social/socialUiCopy";
import { OWL_LOGO_PATH, getOwlLogoPath } from "../assets";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Home Event rail Hangout social UI polish", () => {
  it("rail shelf surface does not bleed", () => {
    expect(socialShelfSurfaceAllowsBleed("rail")).toBe(false);
    expect(socialShelfSurfaceAllowsBleed("feed")).toBe(true);
    expect(socialShelfSurfaceAllowsBleed("detail")).toBe(false);
  });

  it("Hangout mounts compact SocialActionCluster under rail surface", () => {
    const src = read("src/components/Hangout.tsx");
    expect(src).toContain('surface="rail"');
    expect(src).toContain("SocialActionCluster");
    expect(src).toContain('variant="compact"');
    expect(src).toContain('postType="hangout"');
    expect(src).toContain("data-hangout-rail-social");
    expect(src).toContain("stopPropagation");
    expect(src).not.toContain('variant="feed"');
  });

  it("does not render Save on Hangout rail cards", () => {
    const src = read("src/components/Hangout.tsx");
    expect(src).not.toContain("SaveButton");
  });

  it("does not render rating / Follow on Hangout rail cards", () => {
    const src = read("src/components/Hangout.tsx");
    expect(src).not.toContain("PostRatingChip");
    expect(src).not.toContain("PostRatingModal");
    expect(src).not.toContain("ratingEnabled");
    expect(src).not.toContain("FollowButton");
    expect(src).not.toContain("showRatingModal");
  });

  it("shows owl social-purpose row with italic Social pick (no creator avatar row)", () => {
    const src = read("src/components/Hangout.tsx");
    expect(src).toContain("data-hangout-rail-social-purpose");
    expect(src).toContain("railSocialPickLabel");
    expect(src).toContain("getOwlLogoPath");
    expect(src).toContain("italic");
    expect(src).toContain("rounded-full");
    expect(src).not.toContain("PiUsersThree");
    expect(src).not.toContain("<Avatar");
    expect(src).not.toContain("author row");
    const purposeBlock = src.slice(
      src.indexOf("data-hangout-rail-social-purpose"),
      src.indexOf("data-hangout-rail-social")
    );
    expect(purposeBlock).not.toMatch(/navigate\s*\(/);
    expect(purposeBlock).not.toMatch(/\/profile|Paths\.|authorId/);
  });

  it("reuses local owl logo path (no remote owl URL)", () => {
    expect(OWL_LOGO_PATH).toBe("/owlicon.svg");
    expect(getOwlLogoPath().startsWith("/owlicon.svg")).toBe(true);
    const src = read("src/components/Hangout.tsx");
    expect(src).not.toMatch(/https?:\/\/[^"']*owl/i);
  });

  it("keeps three-dot menu on bottom-right unchanged", () => {
    const src = read("src/components/Hangout.tsx");
    expect(src).toContain("data-hangout-rail-menu");
    expect(src).toContain('aria-label="Post options"');
    expect(src).toContain("absolute bottom-0 right-3");
    expect(src).not.toContain("absolute bottom-0 left-3");
  });

  it("Duo/Group sit near bottom with menu clearance and spread gap", () => {
    const src = read("src/components/Hangout.tsx");
    expect(src).toContain("pb-2");
    expect(src).toContain("pr-8");
    expect(src).not.toContain("h-7");
    expect(socialRailBareRowClassName()).toContain("justify-between");
    expect(socialRailBareRowClassName()).toContain("w-full");
    expect(socialRailBareRowClassName()).toContain("gap-2");
  });

  it("rail surface omits white contrast shelf plate", () => {
    const cluster = read("src/components/social/SocialActionCluster.tsx");
    expect(cluster).toContain('bareRail ? "none"');
    expect(cluster).toContain("socialRailBareRowClassName");
    expect(cluster).toContain("bareRail ? null");
  });

  it("uses temporary Social pick copy key", () => {
    expect(socialUiCopy.railSocialPickLabel).toBe("Social pick");
    const src = read("src/components/Hangout.tsx");
    expect(src).not.toContain('"Social pick"');
    expect(src).toContain("socialUiCopy.railSocialPickLabel");
  });
});
