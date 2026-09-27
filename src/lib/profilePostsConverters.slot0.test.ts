import { describe, expect, it } from "vitest";
import { convertSavedToFeedItem } from "./profilePostsConverters";
import type { SavedPostWithDetails } from "../api/services/savedPosts";

describe("convertSavedToFeedItem slot-0 stamp", () => {
  it("stamps slot-0 onto the existing first Saved activity without reordering images", () => {
    const saved = {
      id: "sp-1",
      post_id: "p-1",
      created_at: "2026-01-02T00:00:00Z",
      posts: {
        id: "p-1",
        caption: "saved",
        type: "hangout",
        visibility: "public",
        is_anonymous: false,
        created_at: "2026-01-01T00:00:00Z",
        author_id: "u-1",
        profiles: {
          username: "ada",
          display_name: "Ada",
          avatar_url: "",
        },
        activities: [
          {
            id: "act-1",
            images: ["https://cdn.example/a.jpg"],
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "act-2",
            images: ["https://cdn.example/b.jpg"],
            created_at: "2026-01-01T01:00:00Z",
          },
        ],
        slot0_location_name: "Bole",
        slot0_location_url: "https://maps.google.com/?q=Bole",
        slot0_key_info: [{ title: "V4KeyInfo", value: "Bring ID" }],
        latest_comment_preview: {
          id: "c-1",
          author_label: "Ada",
          text: "Looks great",
        },
      },
    } as unknown as SavedPostWithDetails;

    const item = convertSavedToFeedItem(saved);
    expect(item.activities).toHaveLength(2);
    expect(item.activities?.[0].images).toEqual(["https://cdn.example/a.jpg"]);
    expect(item.activities?.[0].location_name).toBe("Bole");
    expect(item.activities?.[0].location_url).toBe(
      "https://maps.google.com/?q=Bole",
    );
    expect(item.activities?.[0].additional_info).toEqual([
      { title: "V4KeyInfo", value: "Bring ID" },
    ]);
    expect(item.activities?.[1].images).toEqual(["https://cdn.example/b.jpg"]);
    expect(item.latest_comment_preview).toEqual({
      id: "c-1",
      author_label: "Ada",
      text: "Looks great",
    });
  });
});
