/**
 * posts.first_image_url REST 400 fix — batch helper select contract + media resolve.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePublishedPostImageUrls } from "./resolvePublishedPostImageUrls";
import { buildPublishedMediaItems } from "./types";
import type { PublishedPostMediaRow } from "./types";

const root = process.cwd();
function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

function videoRow(
  overrides: Partial<PublishedPostMediaRow> & { id: string },
): PublishedPostMediaRow {
  return {
    post_id: "p1",
    sort_order: 0,
    kind: "video",
    bunny_video_id: "bunny-1",
    video_status: "ready",
    poster_url: null,
    duration_sec: null,
    width: null,
    height: null,
    ...overrides,
  };
}

describe("getPublishedPostMediaForDetail — posts select contract", () => {
  it("1–4: posts select is id+media_order only; post_media + activities unchanged", () => {
    const src = readSrc("lib/publishedMedia/getPublishedPostMediaForDetail.ts");
    expect(src).toContain('.from("posts")');
    expect(src).toContain('.select("id, media_order")');
    expect(src).not.toContain('.select("id, media_order, first_image_url")');
    expect(src).not.toContain("rec.first_image_url");
    expect(src).toContain('from("post_media")');
    expect(src).toContain(
      "id, post_id, sort_order, kind, bunny_video_id, video_status, poster_url, duration_sec, width, height",
    );
    expect(src).toContain('from("activities")');
    expect(src).toContain("post_id, order_idx, images");
    expect(src).toContain("first_image_url: null");
  });

  it("11: no DB/RPC/migration edits in this fix surface", () => {
    const src = readSrc("lib/publishedMedia/getPublishedPostMediaForDetail.ts");
    expect(src).not.toContain("supabase.rpc");
    expect(src).not.toContain("CREATE TABLE");
    expect(src).not.toContain("ALTER TABLE");
  });
});

describe("batch-equivalent resolve + buildPublishedMediaItems", () => {
  it("5: legacy image-only resolves from activities when posts first_image is null", () => {
    expect(
      resolvePublishedPostImageUrls({
        media_order: null,
        activities: [{ images: ["https://cdn.example/a.jpg"] }],
        first_image_url: null,
      }),
    ).toEqual(["https://cdn.example/a.jpg"]);
  });

  it("6–7: modern / mixed media_order is authoritative", () => {
    const imageUrls = resolvePublishedPostImageUrls({
      media_order: [
        { kind: "image", url: "https://cdn.example/1.jpg" },
        { kind: "video", mediaId: "vid-a" },
        { kind: "image", url: "https://cdn.example/2.jpg" },
      ],
      activities: [{ images: ["https://cdn.example/legacy.jpg"] }],
      first_image_url: null,
    });
    expect(imageUrls).toEqual([
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
    ]);

    const items = buildPublishedMediaItems({
      imageUrls,
      mediaOrder: [
        { kind: "image", url: "https://cdn.example/1.jpg" },
        { kind: "video", mediaId: "vid-a" },
        { kind: "image", url: "https://cdn.example/2.jpg" },
      ],
      postMedia: [videoRow({ id: "vid-a", bunny_video_id: "b1" })],
    });
    expect(items.map((i) => i.kind)).toEqual(["image", "video", "image"]);
    expect(items[1]).toMatchObject({ kind: "video", mediaId: "vid-a" });
  });

  it("8: video-only resolves from post_media when no images", () => {
    const imageUrls = resolvePublishedPostImageUrls({
      media_order: [{ kind: "video", mediaId: "vid-only" }],
      activities: [],
      first_image_url: null,
    });
    expect(imageUrls).toEqual([]);

    const items = buildPublishedMediaItems({
      imageUrls,
      mediaOrder: [{ kind: "video", mediaId: "vid-only" }],
      postMedia: [videoRow({ id: "vid-only", bunny_video_id: "b-only" })],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "video",
      mediaId: "vid-only",
      videoId: "b-only",
    });
  });

  it("9: shared resolver still accepts feed-seeded first_image_url", () => {
    expect(
      resolvePublishedPostImageUrls({
        media_order: null,
        activities: [],
        first_image_url: "https://cdn.example/feed-first.jpg",
      }),
    ).toEqual(["https://cdn.example/feed-first.jpg"]);
  });
});
