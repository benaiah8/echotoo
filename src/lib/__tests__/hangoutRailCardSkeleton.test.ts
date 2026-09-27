import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("HangoutRailCardSkeleton (Home Event rail)", () => {
  it("keeps four calm regions: date, social, two caption lines, two compact actions", () => {
    const src = read("src/components/skeletons/HangoutRailCardSkeleton.tsx");
    expect(src).toContain("data-hangout-rail-skeleton");
    expect(src).toContain("data-hangout-rail-skeleton-date");
    expect(src).toContain("data-hangout-rail-skeleton-social");
    expect(src).toContain("data-hangout-rail-skeleton-caption");
    expect(src).toContain("data-hangout-rail-skeleton-actions");
    expect(src).toContain('data-hangout-rail-skeleton-action="duo"');
    expect(src).toContain('data-hangout-rail-skeleton-action="group"');
    expect(src).toContain("w-[38vw]");
    expect(src).toContain("min-w-[180px]");
    expect(src).toContain("max-w-[240px]");
    expect(src).toContain("SkeletonCircle");
    expect(src).toContain("SkeletonLine");

    const captionBlock = src.slice(
      src.indexOf("data-hangout-rail-skeleton-caption"),
      src.indexOf("data-hangout-rail-skeleton-actions")
    );
    const captionLines = captionBlock.match(
      /animate-pulse/g
    );
    expect(captionLines?.length).toBe(2);

    expect(src).not.toContain("justify-between");
    expect(src).not.toContain("flex-1");
    expect(src).not.toMatch(/import\s*\{[^}]*SkeletonPill/);
    expect(src).not.toContain("<SkeletonPill");
    expect(src).not.toContain("Save");
    expect(src).not.toContain("bookmark");
    expect(src).not.toContain("Follow");
    expect(src).not.toContain("RSVP");
    expect(src).not.toContain("Post options");
    expect(src).not.toContain("<img");
    expect(src).not.toContain("getOwlLogoPath");
    expect(src).not.toContain("SocialActionCluster");
  });

  it("uses fixed compact action widths that fit inside 180px + px-3", () => {
    const src = read("src/components/skeletons/HangoutRailCardSkeleton.tsx");
    // Content width at min card: 180 - 24 (px-3) = 156. Duo 40 + gap 8 + Group 44 = 92.
    expect(src).toContain("w-10");
    expect(src).toContain("w-11");
    expect(src).toContain("shrink-0");
    expect(src).toContain("gap-2");
    expect(src).not.toMatch(/import\s*\{[^}]*SkeletonPill/);
  });

  it("is purely presentational CSS pulse (no hooks/network)", () => {
    const src = read("src/components/skeletons/HangoutRailCardSkeleton.tsx");
    expect(src).toContain("animate-pulse");
    expect(src).not.toContain("useState");
    expect(src).not.toContain("useEffect");
    expect(src).not.toContain("supabase");
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("useDuo");
    expect(src).not.toContain("useGroup");
  });

  it("remains the shared skeleton for top + Discover More rails", () => {
    const section = read("src/sections/home/HomeHangoutSection.tsx");
    expect(section).toContain("loadingComponent={<HangoutRailCardSkeleton />}");
    const home = read("src/pages/HomePage.tsx");
    const posts = read("src/sections/home/HomePostsSection.tsx");
    expect(home).toContain("HomeHangoutSection");
    expect(posts).toContain("HomeHangoutSection");
    expect(posts).toContain("Discover More");
  });
});
