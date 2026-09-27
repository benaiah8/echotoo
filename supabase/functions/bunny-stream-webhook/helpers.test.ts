import {
  BUNNY_WEBHOOK_SIGNATURE_ALGORITHM,
  BUNNY_WEBHOOK_SIGNATURE_VERSION,
  computeBunnyWebhookSignatureHex,
  mapBunnyStatusToPostMediaStatus,
  parseBunnyWebhookPayload,
  shouldApplyStatusUpdate,
  timingSafeEqualHex,
  type BunnyWebhookSignatureVerificationInput,
  verifyBunnyWebhookSignature,
} from "./helpers.ts";

const READ_ONLY_KEY = "test-read-only-key";
const RAW_BODY =
  '{"VideoLibraryId":133,"VideoGuid":"657bb740-a71b-4529-a012-528021c31a92","Status":3}';

async function buildValidSignature(rawBody: string = RAW_BODY): Promise<string> {
  return computeBunnyWebhookSignatureHex(rawBody, READ_ONLY_KEY);
}

async function verifyWithHeaders(
  overrides: Partial<BunnyWebhookSignatureVerificationInput> = {},
): Promise<boolean> {
  const rawBody = overrides.rawBody ?? RAW_BODY;
  const signatureHeader = overrides.signatureHeader === undefined
    ? await buildValidSignature(rawBody)
    : overrides.signatureHeader;

  return verifyBunnyWebhookSignature({
    rawBody,
    versionHeader: overrides.versionHeader ?? BUNNY_WEBHOOK_SIGNATURE_VERSION,
    algorithmHeader: overrides.algorithmHeader ??
      BUNNY_WEBHOOK_SIGNATURE_ALGORITHM,
    signatureHeader,
    secret: overrides.secret ?? READ_ONLY_KEY,
  });
}

Deno.test("A: version v1 + algorithm hmac-sha256 + valid signature is valid", async () => {
  const valid = await verifyWithHeaders();
  if (!valid) throw new Error("expected valid signature");
});

Deno.test("B: missing version is invalid", async () => {
  const signature = await buildValidSignature(RAW_BODY);
  const valid = await verifyBunnyWebhookSignature({
    rawBody: RAW_BODY,
    versionHeader: null,
    algorithmHeader: BUNNY_WEBHOOK_SIGNATURE_ALGORITHM,
    signatureHeader: signature,
    secret: READ_ONLY_KEY,
  });
  if (valid) throw new Error("expected invalid signature for missing version");
});

Deno.test("C: wrong version is invalid", async () => {
  const valid = await verifyWithHeaders({ versionHeader: "v2" });
  if (valid) throw new Error("expected invalid signature for wrong version");
});

Deno.test("D: missing algorithm is invalid", async () => {
  const signature = await buildValidSignature(RAW_BODY);
  const valid = await verifyBunnyWebhookSignature({
    rawBody: RAW_BODY,
    versionHeader: BUNNY_WEBHOOK_SIGNATURE_VERSION,
    algorithmHeader: null,
    signatureHeader: signature,
    secret: READ_ONLY_KEY,
  });
  if (valid) throw new Error("expected invalid signature for missing algorithm");
});

Deno.test("E: wrong algorithm is invalid", async () => {
  const valid = await verifyWithHeaders({ algorithmHeader: "sha1" });
  if (valid) throw new Error("expected invalid signature for wrong algorithm");
});

Deno.test("F: missing signature is invalid", async () => {
  const valid = await verifyWithHeaders({ signatureHeader: null });
  if (valid) throw new Error("expected invalid signature for missing signature");
});

Deno.test("G: modified raw body is invalid", async () => {
  const signature = await buildValidSignature(RAW_BODY);
  const valid = await verifyWithHeaders({
    rawBody: `${RAW_BODY} `,
    signatureHeader: signature,
  });
  if (valid) throw new Error("expected invalid signature for modified body");
});

Deno.test("H: correct complete Bunny headers are valid", async () => {
  const signature = await buildValidSignature(RAW_BODY);
  const valid = await verifyBunnyWebhookSignature({
    rawBody: RAW_BODY,
    versionHeader: "v1",
    algorithmHeader: "hmac-sha256",
    signatureHeader: signature,
    secret: READ_ONLY_KEY,
  });
  if (!valid) throw new Error("expected valid signature for complete headers");
});

Deno.test("algorithm header is case-normalized", async () => {
  const signature = await buildValidSignature(RAW_BODY);
  const valid = await verifyBunnyWebhookSignature({
    rawBody: RAW_BODY,
    versionHeader: "v1",
    algorithmHeader: "HMAC-SHA256",
    signatureHeader: signature,
    secret: READ_ONLY_KEY,
  });
  if (!valid) {
    throw new Error("expected valid signature for uppercase algorithm header");
  }
});

Deno.test("wrong key fails verification", async () => {
  const signature = await buildValidSignature(RAW_BODY);
  const valid = await verifyBunnyWebhookSignature({
    rawBody: RAW_BODY,
    versionHeader: BUNNY_WEBHOOK_SIGNATURE_VERSION,
    algorithmHeader: BUNNY_WEBHOOK_SIGNATURE_ALGORITHM,
    signatureHeader: signature,
    secret: "other-key",
  });
  if (valid) throw new Error("expected invalid signature for wrong key");
});

Deno.test("signature uses exact raw body bytes", async () => {
  const compact = '{"Status":3,"VideoGuid":"abc","VideoLibraryId":1}';
  const spaced = '{"Status": 3, "VideoGuid": "abc", "VideoLibraryId": 1}';
  const sigCompact = await computeBunnyWebhookSignatureHex(compact, READ_ONLY_KEY);
  const sigSpaced = await computeBunnyWebhookSignatureHex(spaced, READ_ONLY_KEY);
  if (sigCompact === sigSpaced) {
    throw new Error("expected different signatures for different raw bodies");
  }
});

Deno.test("Finished maps to ready", () => {
  if (mapBunnyStatusToPostMediaStatus(3) !== "ready") {
    throw new Error("expected ready for Finished");
  }
});

Deno.test("Processing maps to processing", () => {
  if (mapBunnyStatusToPostMediaStatus(1) !== "processing") {
    throw new Error("expected processing for Processing");
  }
});

Deno.test("Failed maps to failed", () => {
  if (mapBunnyStatusToPostMediaStatus(5) !== "failed") {
    throw new Error("expected failed for Failed");
  }
});

Deno.test("unknown Bunny state maps to no-op", () => {
  if (mapBunnyStatusToPostMediaStatus(9) !== null) {
    throw new Error("expected null for CaptionsGenerated");
  }
  if (mapBunnyStatusToPostMediaStatus(999) !== null) {
    throw new Error("expected null for unknown status");
  }
});

Deno.test("ready cannot regress to processing", () => {
  if (shouldApplyStatusUpdate("ready", "processing")) {
    throw new Error("ready should not regress to processing");
  }
});

Deno.test("duplicate ready is safe", () => {
  if (!shouldApplyStatusUpdate("ready", "ready")) {
    throw new Error("duplicate ready should apply idempotently");
  }
});

Deno.test("parseBunnyWebhookPayload accepts Bunny casing", () => {
  const parsed = parseBunnyWebhookPayload({
    VideoLibraryId: 133,
    VideoGuid: "657bb740-a71b-4529-a012-528021c31a92",
    Status: 2,
  });
  if (!parsed.ok) throw new Error("expected parse success");
  if (parsed.payload.videoGuid !== "657bb740-a71b-4529-a012-528021c31a92") {
    throw new Error("unexpected video guid");
  }
  if (parsed.payload.status !== 2) {
    throw new Error("unexpected status");
  }
});

Deno.test("timingSafeEqualHex is constant-time shape check", () => {
  if (!timingSafeEqualHex("abc", "abc")) {
    throw new Error("expected equal hex");
  }
  if (timingSafeEqualHex("abc", "abd")) {
    throw new Error("expected unequal hex");
  }
});
