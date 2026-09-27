import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELETE_PUBLISHED_POST_USER_ERROR,
  parseDeletePublishedPostResponse,
} from "./deletePublishedPost/invokeDeletePublishedPost";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS D1 — published post delete + Bunny cleanup", () => {
  it("K: client no longer directly deletes published posts first", () => {
    const posts = read("src/api/services/posts.ts");
    const deleteFn = posts.slice(
      posts.indexOf("export async function deletePost"),
      posts.indexOf("export async function getPostForEdit"),
    );
    expect(deleteFn).toContain("invokeDeletePublishedPost");
    expect(deleteFn).not.toMatch(/\.from\(["']posts["']\)\s*\.delete/);
    const invoke = read(
      "src/lib/deletePublishedPost/invokeDeletePublishedPost.ts",
    );
    expect(invoke).toContain('"delete-published-post"');
  });

  it("J: adminDeletePost routes through Edge", () => {
    const admin = read("src/api/services/adminPosts.ts");
    const start = admin.indexOf("export async function adminDeletePost");
    const end = admin.indexOf("export async function adminGetPostForEdit");
    const fn = admin.slice(start, end > start ? end : undefined);
    expect(fn).toContain("invokeDeletePublishedPost");
    expect(fn).not.toContain('rpc("admin_delete_post"');
  });

  it("C: Edge deletes Bunny before DB", () => {
    const index = read(
      "supabase/functions/delete-published-post/index.ts",
    );
    const bunnyIdx = index.indexOf("stage=bunny");
    const dbIdx = index.indexOf("stage=db_delete");
    expect(bunnyIdx).toBeGreaterThan(-1);
    expect(dbIdx).toBeGreaterThan(bunnyIdx);
    expect(index).toContain("deleteBunnyVideo");
    expect(index).toContain("admin_delete_post");
  });

  it("E: Bunny hard failure returns before DB delete", () => {
    const index = read(
      "supabase/functions/delete-published-post/index.ts",
    );
    expect(index).toContain("stage=bunny_failed");
    expect(index).toContain("502");
  });

  it("G: cascade documented via posts delete (not manual post_media)", () => {
    const index = read(
      "supabase/functions/delete-published-post/index.ts",
    );
    // Does not manually delete post_media; relies on posts delete + CASCADE.
    expect(index).not.toMatch(/\.from\(["']post_media["']\)\s*\.delete/);
  });

  it("M: draft bunny-video-delete unchanged + still rejects attached", () => {
    const helpers = read(
      "supabase/functions/bunny-video-delete/helpers.ts",
    );
    expect(helpers).toContain("Published media cannot be removed here");
    expect(helpers).toContain("post_id != null");
    const draftClient = read(
      "src/lib/bunnyUpload/invokeBunnyVideoDelete.ts",
    );
    expect(draftClient).toContain("bunny-video-delete");
  });

  it("N: no Bunny secret on client", () => {
    const client = read(
      "src/lib/deletePublishedPost/invokeDeletePublishedPost.ts",
    );
    const posts = read("src/api/services/posts.ts");
    expect(client).not.toContain("BUNNY_STREAM_API_KEY");
    expect(posts).not.toContain("BUNNY_STREAM_API_KEY");
    expect(client).not.toContain("AccessKey");
  });

  it("O: generic user failure copy", () => {
    expect(DELETE_PUBLISHED_POST_USER_ERROR).toBe(
      "Couldn't delete the post. Try again.",
    );
    const menu = read("src/components/ui/PostMenu.tsx");
    const hangout = read("src/components/Hangout.tsx");
    expect(menu).toContain("Couldn't delete the post. Try again.");
    expect(hangout).toContain("Couldn't delete the post. Try again.");
  });

  it("L: in-flight delete guarded", () => {
    const menu = read("src/components/ui/PostMenu.tsx");
    const hangout = read("src/components/Hangout.tsx");
    expect(menu).toContain("if (isDeleting) return");
    expect(hangout).toContain("if (isDeleting) return");
  });

  it("parses success / alreadyGone responses", () => {
    expect(
      parseDeletePublishedPostResponse({
        ok: true,
        deleted: true,
        postId: "33333333-3333-4333-8333-333333333333",
        authorId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({ ok: true, deleted: true });

    expect(
      parseDeletePublishedPostResponse({
        ok: true,
        deleted: true,
        postId: "33333333-3333-4333-8333-333333333333",
        authorId: null,
        alreadyGone: true,
      })?.alreadyGone,
    ).toBe(true);

    expect(parseDeletePublishedPostResponse({ ok: false })).toBeNull();
  });

  it("config registers function", () => {
    const config = read("supabase/config.toml");
    expect(config).toContain("[functions.delete-published-post]");
    expect(config).toContain("verify_jwt = false");
  });
});
