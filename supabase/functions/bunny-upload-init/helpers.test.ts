import {
  ALLOWED_VIDEO_MIME_TYPES,
  buildBunnyVideoTitle,
  buildMediaBucketPublicUrl,
  buildSuccessResponse,
  computeAuthorizationExpire,
  computeTusAuthorizationSignature,
  isActiveUnattachedCapExceeded,
  isUploadRequiredForVideoStatus,
  isValidUuid,
  MAX_VIDEO_FILE_BYTES,
  resolveExistingSlotAction,
  resolveOwnedPostUploadInitGate,
  responseContainsSecret,
  RETIRED_UNATTACHED_SORT_ORDER,
  TUS_AUTH_TTL_SECONDS,
  validatePosterStoragePath,
  validateUploadInitRequest,
} from "./helpers.ts";

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";

Deno.test("validateUploadInitRequest rejects invalid UUID", () => {
  const result = validateUploadInitRequest({
    publishPostId: "not-a-uuid",
    fileName: "clip.mp4",
    fileSize: 1024,
    mimeType: "video/mp4",
  });
  if (result.ok) throw new Error("expected validation failure");
  if (result.status !== 400) throw new Error(`expected 400, got ${result.status}`);
});

Deno.test("validateUploadInitRequest rejects non-video MIME", () => {
  const result = validateUploadInitRequest({
    publishPostId: TEST_UUID,
    fileName: "clip.txt",
    fileSize: 1024,
    mimeType: "text/plain",
  });
  if (result.ok) throw new Error("expected validation failure");
  if (result.error !== "Unsupported mimeType") {
    throw new Error(`unexpected error: ${result.error}`);
  }
});

Deno.test("validateUploadInitRequest rejects files over 200MB", () => {
  const result = validateUploadInitRequest({
    publishPostId: TEST_UUID,
    fileName: "big.mp4",
    fileSize: MAX_VIDEO_FILE_BYTES + 1,
    mimeType: "video/mp4",
  });
  if (result.ok) throw new Error("expected validation failure");
  if (result.status !== 400) throw new Error(`expected 400, got ${result.status}`);
});

Deno.test("validateUploadInitRequest accepts allowed video MIME types", () => {
  for (const mimeType of ALLOWED_VIDEO_MIME_TYPES) {
    const result = validateUploadInitRequest({
      publishPostId: TEST_UUID,
      fileName: "clip.mp4",
      fileSize: 1024,
      mimeType,
    });
    if (!result.ok) {
      throw new Error(`expected success for ${mimeType}`);
    }
  }
});

Deno.test("resolveExistingSlotAction reuses upload for pending and uploading", () => {
  for (const status of ["pending", "uploading"] as const) {
    const action = resolveExistingSlotAction(status);
    if (action?.kind !== "reuse_upload") {
      throw new Error(`expected reuse_upload for ${status}`);
    }
  }
});

Deno.test("resolveExistingSlotAction skips upload for processing and ready", () => {
  for (const status of ["processing", "ready"] as const) {
    const action = resolveExistingSlotAction(status);
    if (action?.kind !== "reuse_no_upload") {
      throw new Error(`expected reuse_no_upload for ${status}`);
    }
  }
});

Deno.test("isUploadRequiredForVideoStatus matches upload contract", () => {
  if (!isUploadRequiredForVideoStatus("pending")) {
    throw new Error("expected pending to require upload");
  }
  if (!isUploadRequiredForVideoStatus("uploading")) {
    throw new Error("expected uploading to require upload");
  }
  if (isUploadRequiredForVideoStatus("processing")) {
    throw new Error("expected processing to skip upload");
  }
  if (isUploadRequiredForVideoStatus("ready")) {
    throw new Error("expected ready to skip upload");
  }
});

Deno.test("buildSuccessResponse omits TUS credentials for ready", () => {
  const body = buildSuccessResponse({
    mediaId: TEST_UUID,
    videoId: "bunny-guid",
    libraryId: "12345",
    videoStatus: "ready",
    reused: true,
  });
  if (body.uploadRequired !== false) {
    throw new Error("expected uploadRequired false");
  }
  if (body.tusEndpoint || body.authorizationExpire || body.authorizationSignature) {
    throw new Error("expected no TUS credentials");
  }
});

Deno.test("buildSuccessResponse omits TUS credentials for processing", () => {
  const body = buildSuccessResponse({
    mediaId: TEST_UUID,
    videoId: "bunny-guid",
    libraryId: "12345",
    videoStatus: "processing",
    reused: true,
  });
  if (body.uploadRequired !== false) {
    throw new Error("expected uploadRequired false");
  }
  if (body.tusEndpoint || body.authorizationExpire || body.authorizationSignature) {
    throw new Error("expected no TUS credentials");
  }
});

Deno.test("buildSuccessResponse includes TUS credentials for pending", () => {
  const body = buildSuccessResponse({
    mediaId: TEST_UUID,
    videoId: "bunny-guid",
    libraryId: "12345",
    videoStatus: "pending",
    reused: false,
    authorizationExpire: 1700000000,
    authorizationSignature: "abc123",
  });
  if (body.uploadRequired !== true) {
    throw new Error("expected uploadRequired true");
  }
  if (!body.tusEndpoint || body.authorizationExpire !== 1700000000) {
    throw new Error("expected TUS credentials");
  }
});

Deno.test("buildSuccessResponse includes TUS credentials for uploading", () => {
  const body = buildSuccessResponse({
    mediaId: TEST_UUID,
    videoId: "bunny-guid",
    libraryId: "12345",
    videoStatus: "uploading",
    reused: true,
    authorizationExpire: 1700000000,
    authorizationSignature: "abc123",
  });
  if (body.uploadRequired !== true) {
    throw new Error("expected uploadRequired true");
  }
  if (!body.tusEndpoint) {
    throw new Error("expected TUS credentials");
  }
});

Deno.test("resolveExistingSlotAction rejects failed slot", () => {
  const action = resolveExistingSlotAction("failed");
  if (action?.kind !== "reject_failed") {
    throw new Error("expected reject_failed");
  }
});

Deno.test("isActiveUnattachedCapExceeded enforces MVP cap of 3", () => {
  if (!isActiveUnattachedCapExceeded(3)) {
    throw new Error("expected cap exceeded at 3");
  }
  if (isActiveUnattachedCapExceeded(2)) {
    throw new Error("expected cap not exceeded at 2");
  }
});

Deno.test("computeTusAuthorizationSignature uses libraryId + apiKey + expire + videoId", async () => {
  const libraryId = "12345";
  const apiKey = "secret-api-key";
  const expire = 1700000000;
  const videoId = "bunny-guid-abc";

  const signature = await computeTusAuthorizationSignature(
    libraryId,
    apiKey,
    expire,
    videoId,
  );

  const expectedPayload = `${libraryId}${apiKey}${expire}${videoId}`;
  const expectedHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(expectedPayload),
  );
  const expectedHex = Array.from(new Uint8Array(expectedHash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (signature !== expectedHex) {
    throw new Error("signature ordering mismatch");
  }
});

Deno.test("buildSuccessResponse never includes Bunny API key", () => {
  const apiKey = "super-secret-bunny-key";
  const body = buildSuccessResponse({
    mediaId: TEST_UUID,
    videoId: "bunny-guid",
    libraryId: "12345",
    videoStatus: "pending",
    reused: false,
    authorizationExpire: computeAuthorizationExpire(),
    authorizationSignature: "abc123",
  });
  if (responseContainsSecret(body, apiKey)) {
    throw new Error("response leaked api key");
  }
  const serialized = JSON.stringify(body);
  if (serialized.includes(apiKey)) {
    throw new Error("serialized response leaked api key");
  }
});

Deno.test("computeAuthorizationExpire is ~6 hours ahead", () => {
  const now = 1_700_000_000_000;
  const expire = computeAuthorizationExpire(now);
  if (expire !== Math.floor(now / 1000) + TUS_AUTH_TTL_SECONDS) {
    throw new Error("unexpected authorization expire");
  }
});

Deno.test("buildBunnyVideoTitle is deterministic and non-sensitive", () => {
  const title = buildBunnyVideoTitle(TEST_UUID);
  if (title !== `echotoo-${TEST_UUID}`) {
    throw new Error("unexpected bunny title");
  }
});

Deno.test("isValidUuid accepts canonical UUID", () => {
  if (!isValidUuid(TEST_UUID)) {
    throw new Error("expected valid uuid");
  }
});

Deno.test("validatePosterStoragePath accepts owner post image path", () => {
  const ok = validatePosterStoragePath(
    `${TEST_UUID}/post/abc-video-poster.webp`,
    TEST_UUID,
  );
  if (!ok.ok || ok.path !== `${TEST_UUID}/post/abc-video-poster.webp`) {
    throw new Error("expected valid poster path");
  }
  const badOwner = validatePosterStoragePath(
    `${TEST_UUID}/post/abc.webp`,
    "11111111-1111-4111-8111-111111111111",
  );
  if (badOwner.ok) throw new Error("expected ownership rejection");
  const traversal = validatePosterStoragePath(
    `${TEST_UUID}/post/../evil.webp`,
    TEST_UUID,
  );
  if (traversal.ok) throw new Error("expected traversal rejection");
  const url = buildMediaBucketPublicUrl(
    "https://example.supabase.co",
    `${TEST_UUID}/post/abc.webp`,
  );
  if (!url.includes("/storage/v1/object/public/media/")) {
    throw new Error("unexpected public url");
  }
});

Deno.test("resolveOwnedPostUploadInitGate allows Create when post missing", () => {
  const gate = resolveOwnedPostUploadInitGate({
    postExists: false,
    authorId: null,
    actorUserId: TEST_UUID,
  });
  if (!gate.ok || gate.mode !== "create") {
    throw new Error("expected create mode");
  }
});

Deno.test("resolveOwnedPostUploadInitGate allows Edit staging for owner", () => {
  const gate = resolveOwnedPostUploadInitGate({
    postExists: true,
    authorId: TEST_UUID,
    actorUserId: TEST_UUID,
  });
  if (!gate.ok || gate.mode !== "edit_staging") {
    throw new Error("expected edit_staging mode");
  }
});

Deno.test("resolveOwnedPostUploadInitGate forbids unrelated non-owner", () => {
  const gate = resolveOwnedPostUploadInitGate({
    postExists: true,
    authorId: "11111111-1111-4111-8111-111111111111",
    actorUserId: TEST_UUID,
  });
  if (gate.ok || gate.status !== 403) {
    throw new Error("expected 403 Forbidden");
  }
});

Deno.test("resolveOwnedPostUploadInitGate allows report reviewer edit_staging", () => {
  const gate = resolveOwnedPostUploadInitGate({
    postExists: true,
    authorId: "11111111-1111-4111-8111-111111111111",
    actorUserId: TEST_UUID,
    actorIsReportReviewer: true,
  });
  if (!gate.ok || gate.mode !== "edit_staging") {
    throw new Error("expected edit_staging for report reviewer");
  }
});

Deno.test("resolveOwnedPostUploadInitGate ignores false reviewer flag for non-owner", () => {
  const gate = resolveOwnedPostUploadInitGate({
    postExists: true,
    authorId: "11111111-1111-4111-8111-111111111111",
    actorUserId: TEST_UUID,
    actorIsReportReviewer: false,
  });
  if (gate.ok || gate.status !== 403) {
    throw new Error("expected 403 when reviewer flag false");
  }
});

Deno.test("RETIRED_UNATTACHED_SORT_ORDER stays clear of video slot 0", () => {
  if (RETIRED_UNATTACHED_SORT_ORDER < 1000) {
    throw new Error("expected retired sort start >= 1000");
  }
});
