import { describe, expect, it } from "vitest";
import { resolvePublishedPostImageUrls } from "./resolvePublishedPostImageUrls";

describe("resolvePublishedPostImageUrls", () => {
  it("prefers media_order image urls", () => {
    expect(
      resolvePublishedPostImageUrls({
        media_order: [{ kind: "image", url: "https://cdn.example/order.jpg" }],
        activities: [{ images: ["https://cdn.example/act.jpg"] }],
        first_image_url: "https://cdn.example/first.jpg",
      }),
    ).toEqual(["https://cdn.example/order.jpg"]);
  });

  it("falls back to activities[].images when media_order has no images", () => {
    expect(
      resolvePublishedPostImageUrls({
        media_order: null,
        activities: [
          { images: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"] },
        ],
        first_image_url: "https://cdn.example/first.jpg",
      }),
    ).toEqual(["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]);
  });

  it("falls back to first_image_url", () => {
    expect(
      resolvePublishedPostImageUrls({
        media_order: null,
        activities: [],
        first_image_url: "https://cdn.example/first.jpg",
      }),
    ).toEqual(["https://cdn.example/first.jpg"]);
  });

  it("returns [] when no sources", () => {
    expect(
      resolvePublishedPostImageUrls({
        media_order: null,
        activities: null,
        first_image_url: null,
      }),
    ).toEqual([]);
  });
});
