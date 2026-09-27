import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bunnyDeletesAllowDbDelete,
  canDeletePublishedPost,
  collectAttachedBunnyVideoIds,
  DELETE_PUBLISHED_POST_USER_ERROR,
  isBunnyDeleteNotFoundStatus,
  validateDeletePublishedPostRequest,
} from "./helpers.ts";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const POST = "33333333-3333-4333-8333-333333333333";

Deno.test("A/validate: accepts postId UUID", () => {
  const result = validateDeletePublishedPostRequest({ postId: POST });
  assertEquals(result.ok, true);
});

Deno.test("validate rejects missing/invalid postId", () => {
  assertEquals(validateDeletePublishedPostRequest({}).ok, false);
  assertEquals(validateDeletePublishedPostRequest({ postId: "x" }).ok, false);
});

Deno.test("I: unauthorized non-owner non-reviewer blocked", () => {
  const result = canDeletePublishedPost(
    { id: POST, author_id: OTHER },
    ACTOR,
    false,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 403);
});

Deno.test("A: owner can delete", () => {
  const result = canDeletePublishedPost(
    { id: POST, author_id: ACTOR },
    ACTOR,
    false,
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.mode, "owner");
});

Deno.test("J: reviewer admin mode for others' posts", () => {
  const result = canDeletePublishedPost(
    { id: POST, author_id: OTHER },
    ACTOR,
    true,
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.mode, "admin");
});

Deno.test("H: collects multiple bunny ids; skips empty/dupes", () => {
  const ids = collectAttachedBunnyVideoIds([
    { id: "1", bunny_video_id: "v1" },
    { id: "2", bunny_video_id: "v2" },
    { id: "3", bunny_video_id: "v1" },
    { id: "4", bunny_video_id: "  " },
    { id: "5", bunny_video_id: null },
  ]);
  assertEquals(ids, ["v1", "v2"]);
});

Deno.test("A: no videos → empty list (skip Bunny)", () => {
  assertEquals(collectAttachedBunnyVideoIds([]), []);
});

Deno.test("C/E: Bunny failure blocks DB delete", () => {
  assertEquals(bunnyDeletesAllowDbDelete([{ ok: true }, { ok: false }]), false);
  assertEquals(bunnyDeletesAllowDbDelete([{ ok: true }, { ok: true }]), true);
  assertEquals(bunnyDeletesAllowDbDelete([]), true);
});

Deno.test("D: Bunny 404/410 idempotent", () => {
  assertEquals(isBunnyDeleteNotFoundStatus(404), true);
  assertEquals(isBunnyDeleteNotFoundStatus(410), true);
  assertEquals(isBunnyDeleteNotFoundStatus(500), false);
});

Deno.test("O: user error is generic", () => {
  assertEquals(
    DELETE_PUBLISHED_POST_USER_ERROR,
    "Couldn't delete the post. Try again.",
  );
  assertEquals(DELETE_PUBLISHED_POST_USER_ERROR.includes("Bunny"), false);
});
