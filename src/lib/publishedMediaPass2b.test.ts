/**
 * Pass 2B — stable-list frame lock for legacy Feed MediaCarousel.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPublishedMediaItems,
  isPublishedMediaMembershipExpansion,
  publishedMediaMembershipSignature,
  PUBLISHED_MULTI_PROVISIONAL_ASPECT,
  resolvePublishedMultiMediaFrame,
} from "./publishedMedia";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function imageItems(urls: string[]) {
  return buildPublishedMediaItems({
    imageUrls: urls,
    mediaOrder: null,
    postMedia: [],
  });
}

describe("PASS 2B — wiring", () => {
  it("1: legacy Feed MediaCarousel uses stable-list", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain('framePolicy="stable-list"');
    expect(post).toContain("expectedMediaCount");
    const carousel = read("src/components/MediaCarousel.tsx");
    expect(carousel).toContain("framePolicy");
    expect(carousel).toContain("policy: framePolicy");
    expect(carousel).toContain("forceMulti: forceMultiFrame");
  });

  it("2: PublishedMediaSurface remains stable-list", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain('policy: "stable-list"');
  });

  it("9: Detail carousel uses stable-list (Pass 2C)", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain('policy: "stable-list"');
    const detail = read("src/components/detail/PostDetailBody.tsx");
    expect(detail).not.toMatch(/<MediaCarousel[\s\S]{0,200}framePolicy=/);
  });

  it("10: Create Finalize does not pass stable-list", () => {
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).not.toContain("framePolicy");
    expect(hero).not.toContain("stable-list");
  });

  it("11: Pass 2A legacy handoff wiring intact", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("ensureLegacyGalleryHandoffFromUrls");
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("upgradePublishedMediaLegacyGalleryFromUrls");
  });
});

describe("PASS 2B — frame lock behavior", () => {
  it("3: known video dims establish that ratio immediately", () => {
    const items = [
      {
        kind: "video" as const,
        key: "video:1",
        mediaId: "m1",
        videoId: "v1",
        status: "ready" as const,
        posterUrl: null,
        width: 1920,
        height: 1080,
        durationSec: 10,
      },
      ...imageItems(["https://cdn.example/a.jpg"]),
    ];
    const resolved = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [],
    });
    expect(resolved.aspectRatio).toBeCloseTo(1920 / 1080, 5);
    expect(resolved.source).toBe("video");
    expect(resolved.style.aspectRatio).toBeTruthy();
  });

  it("4: unknown dims use deterministic provisional 1:1", () => {
    const items = imageItems([
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
    ]);
    const resolved = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [],
    });
    expect(resolved.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);
    expect(resolved.source).toBe("provisional");
  });

  it("5: late samples do not change a committed stable-list frame", () => {
    const items = imageItems([
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
      "https://cdn.example/3.jpg",
    ]);
    const locked = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [],
      committedAspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
    });
    expect(locked.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);
    expect(locked.source).toBe("committed");

    const withLateSamples = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 1600, height: 900 },
        { key: items[1]!.key, width: 900, height: 1600 },
        { key: items[2]!.key, width: 1200, height: 800 },
      ],
      committedAspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
    });
    expect(withLateSamples.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);

    // Default (no commit) WOULD move off provisional once all sampled:
    const defaultMedian = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 1600, height: 900 },
        { key: items[1]!.key, width: 900, height: 1600 },
        { key: items[2]!.key, width: 1200, height: 800 },
      ],
    });
    expect(defaultMedian.aspectRatio).not.toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);
  });

  it("6: five-image membership keeps committed frame style", () => {
    const items = imageItems(
      [1, 2, 3, 4, 5].map((n) => `https://cdn.example/${n}.jpg`),
    );
    const locked = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [],
      committedAspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
    });
    expect(locked.style.aspectRatio).toBe(
      String(PUBLISHED_MULTI_PROVISIONAL_ASPECT),
    );
    expect(locked.style.height).toBe("auto");
    expect(locked.style.width).toBe("100%");
  });

  it("7: mixed image/video locks to video ratio (stable-list ignores image samples)", () => {
    const items = [
      ...imageItems(["https://cdn.example/a.jpg"]),
      {
        kind: "video" as const,
        key: "video:mix",
        mediaId: "m2",
        videoId: "v2",
        status: "ready" as const,
        posterUrl: null,
        width: 1080,
        height: 1920,
        durationSec: 8,
      },
    ];
    const first = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [],
    });
    expect(first.aspectRatio).toBeCloseTo(1080 / 1920, 5);
    const afterSamples = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 2000, height: 1000 },
      ],
      committedAspectRatio: first.aspectRatio,
    });
    expect(afterSamples.aspectRatio).toBe(first.aspectRatio);
  });

  it("8: single-image resolve path is not multi", () => {
    const items = imageItems(["https://cdn.example/only.jpg"]);
    // Hook returns null for length<=1; resolver is for multi only.
    expect(items).toHaveLength(1);
    const hookSrc = read("src/lib/publishedMedia/usePublishedMultiMediaFrame.ts");
    expect(hookSrc).toContain("items.length <= 1");
    expect(hookSrc).toContain('policy === "stable-list"');
  });

  it("membership expansion preserves lock across 1→N hydration", () => {
    const thin = imageItems(["https://cdn.example/1.jpg"]);
    const full = imageItems([
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
      "https://cdn.example/3.jpg",
    ]);
    const prev = publishedMediaMembershipSignature(thin);
    const next = publishedMediaMembershipSignature(full);
    expect(isPublishedMediaMembershipExpansion(prev, next)).toBe(true);
    expect(isPublishedMediaMembershipExpansion(next, prev)).toBe(false);
  });

  it("MediaCarousel reserves multi frame via expectedMediaCount", () => {
    const carousel = read("src/components/MediaCarousel.tsx");
    expect(carousel).toContain("forceMultiFrame");
    expect(carousel).toContain("expectedCount > 1");
    expect(carousel).toContain("singleImageNatural = slideCount === 1 && !forceMultiFrame");
  });
});
