import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isBunnyDeleteNotFoundStatus,
  isEditStagingGcDryRun,
  mapBunnyDeleteToOutcome,
  remainingClaimLimit,
  sanitizeGcError,
  shouldRetryOutboxRow,
} from "./helpers.ts";

Deno.test("dry-run defaults when env missing or ambiguous", () => {
  assertEquals(isEditStagingGcDryRun(undefined), true);
  assertEquals(isEditStagingGcDryRun(null), true);
  assertEquals(isEditStagingGcDryRun(""), true);
  assertEquals(isEditStagingGcDryRun("true"), true);
  assertEquals(isEditStagingGcDryRun("yes"), true);
  assertEquals(isEditStagingGcDryRun("1"), true);
  assertEquals(isEditStagingGcDryRun("maybe"), true);
});

Deno.test("live mode only when dry-run explicitly disabled", () => {
  assertEquals(isEditStagingGcDryRun("false"), false);
  assertEquals(isEditStagingGcDryRun("0"), false);
  assertEquals(isEditStagingGcDryRun("off"), false);
  assertEquals(isEditStagingGcDryRun("no"), false);
  assertEquals(isEditStagingGcDryRun(" FALSE "), false);
});

Deno.test("bunny 404/410 map to already_missing", () => {
  assertEquals(isBunnyDeleteNotFoundStatus(404), true);
  assertEquals(isBunnyDeleteNotFoundStatus(410), true);
  assertEquals(isBunnyDeleteNotFoundStatus(500), false);
  assertEquals(mapBunnyDeleteToOutcome({ ok: true, notFound: true }), "already_missing");
  assertEquals(mapBunnyDeleteToOutcome({ ok: true, notFound: false }), "deleted");
  assertEquals(mapBunnyDeleteToOutcome({ ok: false }), "retryable_failed");
});

Deno.test("remaining claim limit after pending retries", () => {
  assertEquals(remainingClaimLimit(10, 0), 10);
  assertEquals(remainingClaimLimit(10, 3), 7);
  assertEquals(remainingClaimLimit(10, 10), 0);
  assertEquals(remainingClaimLimit(10, 15), 0);
});

Deno.test("outbox retry gate respects attempt cap", () => {
  assertEquals(
    shouldRetryOutboxRow({ status: "pending", attempt_count: 0 }),
    true,
  );
  assertEquals(
    shouldRetryOutboxRow({ status: "pending", attempt_count: 4 }),
    true,
  );
  assertEquals(
    shouldRetryOutboxRow({ status: "pending", attempt_count: 5 }),
    false,
  );
  assertEquals(
    shouldRetryOutboxRow({ status: "dead", attempt_count: 1 }),
    false,
  );
});

Deno.test("sanitizeGcError truncates", () => {
  assertEquals(sanitizeGcError(null), null);
  assertEquals(sanitizeGcError("  "), null);
  assertEquals(sanitizeGcError("bunny_delete_failed"), "bunny_delete_failed");
  const long = "x".repeat(300);
  assertEquals(sanitizeGcError(long)?.length, 240);
});
