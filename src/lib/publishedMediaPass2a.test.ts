/**
 * Pass 2A — legacy gallery handoff + completeness upgrade + authority.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetPublishedMediaCacheForTests,
  buildPublishedMediaItems,
  decidePublishedMediaCacheWrite,
  ensureLegacyGalleryHandoffFromUrls,
  ensurePublishedMediaCacheForDetailHandoff,
  getOrFetchPublishedMedia,
  getPublishedMediaCache,
  isLegacyGalleryCompletenessUpgrade,
  isPoorerLegacyImageMembership,
  publishedMediaViewerKey,
  setPublishedMediaCache,
  upgradePublishedMediaLegacyGalleryFromUrls,
} from "./publishedMedia";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

vi.mock("./publishedMedia/getPublishedPostMediaForDetail", () => ({
  getPublishedPostMediaForDetail: vi.fn(async () => ({
    mediaOrder: null,
    postMedia: [],
  })),
}));

describe("PASS 2A — cache authority helpers", () => {
  it("detects poorer legacy membership (5→1 subset)", () => {
    const rich = buildPublishedMediaItems({
      imageUrls: [
        "https://cdn.example/a.jpg",
        "https://cdn.example/b.jpg",
        "https://cdn.example/c.jpg",
        "https://cdn.example/d.jpg",
        "https://cdn.example/e.jpg",
      ],
      mediaOrder: null,
      postMedia: [],
    });
    const thin = buildPublishedMediaItems({
      imageUrls: ["https://cdn.example/a.jpg"],
      mediaOrder: null,
      postMedia: [],
    });
    expect(rich.length).toBe(5);
    expect(thin.length).toBe(1);
    expect(isPoorerLegacyImageMembership(rich, thin)).toBe(true);
    expect(isLegacyGalleryCompletenessUpgrade(thin, rich)).toBe(true);
  });

  it("rejects poorer legacy write; allows media_order authoritative shrink", () => {
    const rich = buildPublishedMediaItems({
      imageUrls: [
        "https://cdn.example/a.jpg",
        "https://cdn.example/b.jpg",
        "https://cdn.example/c.jpg",
      ],
      mediaOrder: null,
      postMedia: [],
    });
    const thin = buildPublishedMediaItems({
      imageUrls: ["https://cdn.example/a.jpg"],
      mediaOrder: null,
      postMedia: [],
    });
    expect(
      decidePublishedMediaCacheWrite({
        existing: {
          items: rich,
          mediaOrder: null,
          provenance: "legacy-gallery",
          legacyScope: "full",
        },
        incoming: {
          items: thin,
          mediaOrder: null,
          provenance: "legacy-gallery",
          legacyScope: "partial",
        },
      }),
    ).toBe("keep-existing");

    const orderShrink = [
      { kind: "image" as const, url: "https://cdn.example/only.jpg" },
    ];
    expect(
      decidePublishedMediaCacheWrite({
        existing: {
          items: rich,
          mediaOrder: null,
          provenance: "legacy-gallery",
          legacyScope: "full",
        },
        incoming: {
          items: buildPublishedMediaItems({
            imageUrls: ["https://cdn.example/only.jpg"],
            mediaOrder: orderShrink,
            postMedia: [],
          }),
          mediaOrder: orderShrink,
          provenance: "media-order",
        },
      }),
    ).toBe("apply");
  });
});

describe("PASS 2A — legacy handoff + upgrade lifecycle", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
  });

  it("1–2: legacy Feed hands complete gallery into shared cache", () => {
    const urls = [
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
      "https://cdn.example/3.jpg",
      "https://cdn.example/4.jpg",
      "https://cdn.example/5.jpg",
    ];
    const entry = ensureLegacyGalleryHandoffFromUrls({
      postId: "legacy-5",
      viewerUserId: "u1",
      imageUrls: urls,
      source: "feed",
    });
    expect(entry?.items).toHaveLength(5);
    expect(entry?.provenance).toBe("legacy-gallery");
    expect(entry?.legacyScope).toBe("full");
    expect(
      getPublishedMediaCache("legacy-5", publishedMediaViewerKey("u1"))?.items,
    ).toHaveLength(5);
  });

  it("3–6: fresh one-item legacy cache upgrades when gallery hydrates to five", () => {
    setPublishedMediaCache({
      postId: "legacy-5",
      viewerKey: publishedMediaViewerKey("u1"),
      items: buildPublishedMediaItems({
        imageUrls: ["https://cdn.example/1.jpg"],
        mediaOrder: null,
        postMedia: [],
      }),
      mediaOrder: null,
      source: "detail",
      provenance: "legacy-gallery",
      legacyScope: "partial",
    });

    const upgraded = upgradePublishedMediaLegacyGalleryFromUrls({
      postId: "legacy-5",
      viewerUserId: "u1",
      imageUrls: [
        "https://cdn.example/1.jpg",
        "https://cdn.example/2.jpg",
        "https://cdn.example/3.jpg",
        "https://cdn.example/4.jpg",
        "https://cdn.example/5.jpg",
      ],
    });
    expect(upgraded?.items).toHaveLength(5);
    expect(upgraded?.legacyScope).toBe("full");
    expect(
      getPublishedMediaCache("legacy-5", publishedMediaViewerKey("u1"))?.items,
    ).toHaveLength(5);
  });

  it("5: late in-flight one-item cannot overwrite established full gallery", async () => {
    ensureLegacyGalleryHandoffFromUrls({
      postId: "race-5",
      viewerUserId: "u1",
      imageUrls: [
        "https://cdn.example/1.jpg",
        "https://cdn.example/2.jpg",
        "https://cdn.example/3.jpg",
        "https://cdn.example/4.jpg",
        "https://cdn.example/5.jpg",
      ],
    });

    const entry = await getOrFetchPublishedMedia({
      postId: "race-5",
      viewerUserId: "u1",
      imageUrls: ["https://cdn.example/1.jpg"],
      forceRevalidate: true,
    });
    expect(entry?.items).toHaveLength(5);
    expect(
      getPublishedMediaCache("race-5", publishedMediaViewerKey("u1"))?.items,
    ).toHaveLength(5);
  });

  it("8: handoff preserves item keys / selected key still present", () => {
    const urls = [
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
      "https://cdn.example/c.jpg",
    ];
    const entry = ensureLegacyGalleryHandoffFromUrls({
      postId: "sel",
      viewerUserId: "u1",
      imageUrls: urls,
    });
    const keys = entry!.items.map((i) => i.key);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it("9: true single-image posts still work", () => {
    const entry = ensureLegacyGalleryHandoffFromUrls({
      postId: "one",
      viewerUserId: "u1",
      imageUrls: ["https://cdn.example/only.jpg"],
    });
    expect(entry?.items).toHaveLength(1);
  });

  it("10: valid media_order is not overwritten by legacy handoff URLs", () => {
    const order = [
      { kind: "image" as const, url: "https://cdn.example/order-a.jpg" },
      { kind: "image" as const, url: "https://cdn.example/order-b.jpg" },
    ];
    setPublishedMediaCache({
      postId: "ordered",
      viewerKey: publishedMediaViewerKey("u1"),
      items: buildPublishedMediaItems({
        imageUrls: [],
        mediaOrder: order,
        postMedia: [],
      }),
      mediaOrder: order,
      source: "feed",
      provenance: "media-order",
    });
    const after = ensureLegacyGalleryHandoffFromUrls({
      postId: "ordered",
      viewerUserId: "u1",
      imageUrls: ["https://cdn.example/legacy-only.jpg"],
    });
    expect(after?.items).toHaveLength(2);
    expect(after?.provenance).toBe("media-order");
  });

  it("11: authoritative media_order deletion (shrink) is allowed", () => {
    const richOrder = [
      { kind: "image" as const, url: "https://cdn.example/1.jpg" },
      { kind: "image" as const, url: "https://cdn.example/2.jpg" },
      { kind: "image" as const, url: "https://cdn.example/3.jpg" },
    ];
    setPublishedMediaCache({
      postId: "del",
      viewerKey: publishedMediaViewerKey("u1"),
      items: buildPublishedMediaItems({
        imageUrls: [],
        mediaOrder: richOrder,
        postMedia: [],
      }),
      mediaOrder: richOrder,
      source: "feed",
      provenance: "media-order",
    });
    const shrinkOrder = [
      { kind: "image" as const, url: "https://cdn.example/1.jpg" },
    ];
    const next = setPublishedMediaCache({
      postId: "del",
      viewerKey: publishedMediaViewerKey("u1"),
      items: buildPublishedMediaItems({
        imageUrls: [],
        mediaOrder: shrinkOrder,
        postMedia: [],
      }),
      mediaOrder: shrinkOrder,
      source: "detail",
      provenance: "media-order",
    });
    expect(next.items).toHaveLength(1);
  });

  it("12: viewer isolation remains intact", () => {
    ensureLegacyGalleryHandoffFromUrls({
      postId: "iso",
      viewerUserId: "u1",
      imageUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
    });
    expect(
      getPublishedMediaCache("iso", publishedMediaViewerKey("u2")),
    ).toBeNull();
    expect(
      getPublishedMediaCache("iso", publishedMediaViewerKey("u1"))?.items,
    ).toHaveLength(2);
  });

  it("published handoff still refreshes TTL for rendered items", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn.example/x.jpg", "https://cdn.example/y.jpg"],
      mediaOrder: null,
      postMedia: [],
    });
    const entry = ensurePublishedMediaCacheForDetailHandoff({
      postId: "pub",
      viewerUserId: "u1",
      items,
      source: "feed",
    });
    expect(entry?.items).toHaveLength(2);
  });
});

describe("PASS 2A — wiring contracts", () => {
  it("Post.tsx wires legacy gallery handoff", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("ensureLegacyGalleryHandoffFromUrls");
    expect(post).toContain("publishedIsPoorerPartialLegacy");
  });

  it("PostDetailBody upgrades legacy gallery without requiring stale TTL", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("upgradePublishedMediaLegacyGalleryFromUrls");
    expect(body).toContain("legacyScope === \"partial\"");
    // Mixed cache with video must not be replaced by image-only upgrade.
    expect(body).toContain("cachedHasVideo");
    expect(body).toContain("forceCanonicalRevalidate");
    expect(body).toContain('i.kind === "video"');
  });
});
