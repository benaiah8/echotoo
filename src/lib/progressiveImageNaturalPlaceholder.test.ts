/**
 * Focused: single-image natural loading placeholder reserves 1:1 when ratio unknown.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("ProgressiveImage natural loading placeholder", () => {
  const src = read("src/components/ui/ProgressiveImage.tsx");

  it("A: known ratio placeholder keeps known aspectRatio", () => {
    expect(src).toContain("knownNaturalRatio != null");
    expect(src).toContain("aspectRatio: `${knownNaturalRatio}`");
    expect(src).toContain('"known-ratio"');
  });

  it("B: unknown-ratio natural placeholder uses square 1:1 (not 4rem)", () => {
    expect(src).toContain('{ aspectRatio: "1 / 1" }');
    expect(src).toContain('"square"');
    expect(src).not.toContain('{ minHeight: "4rem" }');
  });

  it("C: loaded natural image stays intrinsic (not square-forced)", () => {
    expect(src).toContain('className="block h-auto w-full object-contain"');
    // Square only appears on the placeholder branch, not on the <img>.
    const imgIdx = src.indexOf('className="block h-auto w-full object-contain"');
    const squareNearImg = src
      .slice(imgIdx, imgIdx + 200)
      .includes('aspectRatio: "1 / 1"');
    expect(squareNearImg).toBe(false);
  });

  it("D: fill/multi path still defaults to fill + cover stage", () => {
    expect(src).toContain('layout = "fill"');
    expect(src).toContain('data-progressive-layout="fill"');
    expect(src).toMatch(/fit = "cover"/);
    expect(src).toMatch(/fillMinHeight = "200px"/);
  });
});

describe("Post legacy image shell + media invariants", () => {
  it("legacy pre-manifest shell is square and image-path only", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain(
      "!hasPublishedManifest && (imagesLoading || showImageSkeleton)",
    );
    expect(post).toContain("aspect-square w-full animate-pulse");
    expect(post).not.toMatch(
      /imagesLoading \|\| showImageSkeleton\)[\s\S]{0,200}aspect-video/,
    );
    // Published path still uses PublishedMediaSurface (video/multi untouched here).
    expect(post).toContain("PublishedMediaSurface");
    expect(post).toContain("hasPublishedManifest && publishedMediaItems");
  });

  it("E: video frame fallbacks unchanged in publishedMedia types", () => {
    const types = read("src/lib/publishedMedia/types.ts");
    expect(types).toContain('PUBLISHED_DIMLESS_VIDEO_FALLBACK_ASPECT = "16 / 9"');
    expect(types).toContain(
      'PUBLISHED_DIMLESS_VIDEO_FALLBACK_MIN_HEIGHT = "12rem"',
    );
  });

  it("F: no-media posts still require skeleton/manifest/images gate", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("hasCardMedia =");
    expect(post).toContain("hasPublishedManifest ||");
    expect(post).toContain("showImageSkeleton");
    // Media block does not render a bare square without those gates.
    const mediaStart = post.indexOf("const mediaBlock =");
    const mediaEnd = post.indexOf("const actionsBlock");
    const media = post.slice(mediaStart, mediaEnd);
    expect(media).toContain("imagesLoading || showImageSkeleton");
    expect(media).toContain("hasPublishedManifest");
  });
});
