/**
 * Pure helpers for edit-staging-gc (testable without Deno.serve).
 */

export const LOG_PREFIX = "[edit-staging-gc]";
export const MAX_BATCH = 10;
export const MAX_ATTEMPTS = 5;

export type EditStagingGcFinishOutcome =
  | "deleted"
  | "already_missing"
  | "retryable_failed"
  | "dead";

export type OutboxRow = {
  post_media_id: string;
  bunny_video_id: string;
  attempt_count: number;
  status: string;
};

/**
 * Dry-run is the safe default.
 * Live deletes require an explicit negative: false | 0 | off | no.
 */
export function isEditStagingGcDryRun(
  envValue: string | undefined | null,
): boolean {
  const v = (envValue ?? "").trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off" || v === "no") {
    return false;
  }
  return true;
}

export function isBunnyDeleteNotFoundStatus(status: number): boolean {
  return status === 404 || status === 410;
}

export function mapBunnyDeleteToOutcome(result: {
  ok: boolean;
  notFound?: boolean;
}): EditStagingGcFinishOutcome {
  if (result.ok) {
    return result.notFound ? "already_missing" : "deleted";
  }
  return "retryable_failed";
}

/** Cap remaining claim slots after retrying pending outbox. */
export function remainingClaimLimit(
  maxBatch: number,
  pendingRetryCount: number,
): number {
  return Math.max(0, maxBatch - Math.max(0, pendingRetryCount));
}

export function shouldRetryOutboxRow(
  row: Pick<OutboxRow, "status" | "attempt_count">,
  maxAttempts: number = MAX_ATTEMPTS,
): boolean {
  return row.status === "pending" && row.attempt_count < maxAttempts;
}

export function sanitizeGcError(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 240);
}
