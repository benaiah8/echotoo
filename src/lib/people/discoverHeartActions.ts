/**
 * Discover Heart press outcomes. Connect and withdrawal stay on their own RPCs.
 * This module does not join or leave the Duo pool and does not write comments.
 */
import {
  extractPeopleConnectErrorFields,
  isPeopleConnectStaleEligibilityError,
} from "./peopleConnectHardening";
import {
  beginDiscoverHeartPending,
  cancelDiscoverHeartPending,
  clearDiscoverHeartOpportunity,
  confirmDiscoverHeart,
  readDiscoverHeartPhase,
} from "./discoverHeartState";

export type DiscoverHeartConnectStatus =
  | "matched"
  | "open"
  | "failed"
  | "aborted"
  | "ignored";

export type DiscoverHeartActionResult =
  | { type: "ignored" }
  | { type: "connected" }
  | { type: "matched" }
  | { type: "withdrawn"; withdrawn: boolean }
  | { type: "matched-interest" }
  | { type: "failed"; stale: boolean };

export function isDiscoverInterestMatchedError(err: unknown): boolean {
  const { message, details, hint } = extractPeopleConnectErrorFields(err);
  return /discover interest is matched/i.test(
    `${message}\n${details ?? ""}\n${hint ?? ""}`
  );
}

export async function runDiscoverHeartAction(input: {
  viewerId: string;
  opportunityId: string;
  serverExpressed: boolean;
  connect: () => Promise<DiscoverHeartConnectStatus>;
  withdraw: () => Promise<{ withdrawn: boolean }>;
}): Promise<DiscoverHeartActionResult> {
  const phase = readDiscoverHeartPhase(
    input.opportunityId,
    input.serverExpressed
  );
  if (phase === "pending" || phase === "unavailable") return { type: "ignored" };
  if (!input.viewerId || !input.opportunityId) return { type: "ignored" };

  const started = beginDiscoverHeartPending(
    input.viewerId,
    input.opportunityId,
    input.serverExpressed
  );
  if (!started) return { type: "ignored" };

  if (phase === "active") {
    try {
      const result = await input.withdraw();
      confirmDiscoverHeart(input.viewerId, input.opportunityId, false);
      return { type: "withdrawn", withdrawn: result.withdrawn };
    } catch (err) {
      cancelDiscoverHeartPending(input.viewerId, input.opportunityId);
      if (isDiscoverInterestMatchedError(err)) {
        return { type: "matched-interest" };
      }
      return {
        type: "failed",
        stale: isPeopleConnectStaleEligibilityError(err),
      };
    }
  }

  try {
    const status = await input.connect();
    if (status === "matched") {
      clearDiscoverHeartOpportunity(input.opportunityId);
      return { type: "matched" };
    }
    if (status === "open") {
      confirmDiscoverHeart(input.viewerId, input.opportunityId, true);
      return { type: "connected" };
    }
    cancelDiscoverHeartPending(input.viewerId, input.opportunityId);
    if (status === "ignored" || status === "aborted") return { type: "ignored" };
    return { type: "failed", stale: false };
  } catch {
    cancelDiscoverHeartPending(input.viewerId, input.opportunityId);
    return { type: "failed", stale: false };
  }
}
