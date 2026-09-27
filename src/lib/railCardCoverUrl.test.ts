import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRailCardCoverUrl } from "./railCardCoverUrl";
import type { FeedItem } from "../api/queries/getPublicFeed";

vi.mock("./img", () => ({
  imgUrlPublic: (path: string | null | undefined) => {
    if (!path || !String(path).trim()) return null;
    const p = String(path).trim();
    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    return `https://cdn.test/${p.replace(/^\//, "")}`;
  },
}));

function post(partial: Partial<FeedItem>): FeedItem {
  return {
    id: "p1",
    type: "hangout",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    author_id: "u1",
    ...partial,
  } as FeedItem;
}

describe("getRailCardCoverUrl", () => {
  it("image only → returns image", () => {
    const url = getRailCardCoverUrl(
      post({
        media_order: [{ kind: "image", url: "user/a.jpg" }],
      }),
    );
    expect(url).toBe("https://cdn.test/user/a.jpg");
  });

  it("video only → returns null/undefined", () => {
    const url = getRailCardCoverUrl(
      post({
        media_order: [
          {
            kind: "video",
            mediaId: "m1",
            poster_url: "https://cdn.test/poster.jpg",
          },
        ],
        first_image_url: "https://cdn.test/poster.jpg",
        post_media: [
          {
            id: "m1",
            bunny_video_id: "bunny1",
            poster_url: "https://cdn.test/poster.jpg",
            kind: "video",
          },
        ],
      }),
    );
    expect(url).toBeUndefined();
  });

  it("image + video → returns image (not video)", () => {
    const url = getRailCardCoverUrl(
      post({
        media_order: [
          { kind: "video", mediaId: "m1" },
          { kind: "image", url: "user/cover.jpg" },
          { kind: "image", url: "user/later.jpg" },
        ],
      }),
    );
    expect(url).toBe("https://cdn.test/user/cover.jpg");
  });

  it("video poster is ignored", () => {
    const poster = "https://cdn.test/video-poster.jpg";
    const url = getRailCardCoverUrl(
      post({
        media_order: [
          {
            kind: "video",
            mediaId: "m1",
            url: poster,
            poster_url: poster,
            posterUrl: poster,
          },
        ],
        first_image_url: poster,
      }),
    );
    expect(url).toBeUndefined();
  });

  it("falls back to first_image_url when media_order is absent", () => {
    const url = getRailCardCoverUrl(
      post({ first_image_url: "user/legacy.jpg" }),
    );
    expect(url).toBe("https://cdn.test/user/legacy.jpg");
  });

  it("falls back to activity images when media_order is absent", () => {
    const url = getRailCardCoverUrl(
      post({
        activities: [
          {
            title: null,
            images: ["user/act.jpg"],
            order_idx: 0,
          },
        ],
      }),
    );
    expect(url).toBe("https://cdn.test/user/act.jpg");
  });
});

describe("Hangout Feed rail type chip", () => {
  it("does not render PostTypeMetaChip", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/Hangout.tsx"),
      "utf8",
    );
    expect(src).not.toContain("PostTypeMetaChip");
    expect(src).not.toContain("PostFeedSurfaceMeta");
  });
});
