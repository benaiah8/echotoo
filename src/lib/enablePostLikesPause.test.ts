import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENABLE_POST_LIKES } from "./featureFlags";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("ENABLE_POST_LIKES pause", () => {
  it("defaults to false (post likes hidden)", () => {
    expect(ENABLE_POST_LIKES).toBe(false);
  });

  it("StickyPostActions gates LikeButton on ENABLE_POST_LIKES", () => {
    const sticky = read("src/components/ui/StickyPostActions.tsx");
    expect(sticky).toContain(
      'import { ENABLE_POST_LIKES } from "../../lib/featureFlags"',
    );
    expect(sticky).toContain("ENABLE_POST_LIKES ? (");
    expect(sticky).toContain("<LikeButton");
  });

  it("Post Detail sticky path still mounts StickyPostActions", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("<StickyPostActions");
    expect(body).toContain("data-sticky-post-actions");
  });

  it("feed PostActions has no LikeButton; CommentLikeButton stays separate", () => {
    const actions = read("src/components/ui/PostActions.tsx");
    const comment = read("src/components/ui/Comment.tsx");
    expect(actions).not.toContain("LikeButton");
    expect(comment).toContain("CommentLikeButton");
  });

  it("likes service remains intact for restore", () => {
    const likes = read("src/api/services/likes.ts");
    expect(likes).toContain("export async function likePost");
    expect(likes).toContain("export async function unlikePost");
    expect(likes).toContain("export async function isPostLiked");
  });
});
