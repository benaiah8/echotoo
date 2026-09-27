import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canDeleteUnattachedCreateMedia,
  isBunnyDeleteNotFoundStatus,
  validateVideoDeleteRequest,
  type PostMediaDeleteRow,
} from "./helpers.ts";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const PUBLISH = "22222222-2222-4222-8222-222222222222";
const MEDIA = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

function row(
  overrides: Partial<PostMediaDeleteRow> = {},
): PostMediaDeleteRow {
  return {
    id: MEDIA,
    publish_post_id: PUBLISH,
    owner_user_id: ACTOR,
    post_id: null,
    bunny_video_id: "bunny-guid-1",
    ...overrides,
  };
}

Deno.test("validateVideoDeleteRequest accepts valid UUIDs", () => {
  const result = validateVideoDeleteRequest({
    publishPostId: PUBLISH,
    mediaId: MEDIA,
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.publishPostId, PUBLISH);
    assertEquals(result.data.mediaId, MEDIA);
  }
});

Deno.test("validateVideoDeleteRequest rejects invalid body", () => {
  const result = validateVideoDeleteRequest({ publishPostId: "bad" });
  assertEquals(result.ok, false);
});

Deno.test("foreign media rejected", () => {
  const result = canDeleteUnattachedCreateMedia(
    row({ owner_user_id: OTHER }),
    ACTOR,
    PUBLISH,
    MEDIA,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 403);
});

Deno.test("attached/published media rejected", () => {
  const result = canDeleteUnattachedCreateMedia(
    row({ post_id: PUBLISH }),
    ACTOR,
    PUBLISH,
    MEDIA,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 409);
});

Deno.test("unattached owned media allowed", () => {
  const result = canDeleteUnattachedCreateMedia(row(), ACTOR, PUBLISH, MEDIA);
  assertEquals(result.ok, true);
});

Deno.test("bunny 404 treated as not found", () => {
  assertEquals(isBunnyDeleteNotFoundStatus(404), true);
  assertEquals(isBunnyDeleteNotFoundStatus(410), true);
  assertEquals(isBunnyDeleteNotFoundStatus(500), false);
});
