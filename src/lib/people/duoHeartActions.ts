/**
 * Duo Heart press decisions. Connect and withdrawal stay on their own RPCs.
 * This module does not join or leave the Duo pool and does not write comments.
 */
import {
  extractPeopleConnectErrorFields,
  isPeopleConnectStaleEligibilityError,
} from "./peopleConnectHardening";

export type DuoMatchHeartState =
  | "none"
  | "outgoing"
  | "mutual_pending"
  | "completed";

export type DuoHeartPressKind = "connect" | "withdraw" | "complete" | "blocked";

export type DuoHeartWithdrawalResult =
  | { type: "ignored" }
  | { type: "withdrawn"; withdrawn: boolean }
  | { type: "matched-interest" }
  | { type: "discover-sourced" }
  | { type: "failed"; stale: boolean };

type Inflight = { viewerId: string; generation: number };

const inflight = new Map<string, Inflight>();
let nextGeneration = 0;

function pressKey(viewerId: string, opportunityId: string): string {
  return `${viewerId}:${opportunityId}`;
}

export function resetDuoHeartPressForTests(): void {
  inflight.clear();
  nextGeneration = 0;
}

export function duoHeartPressKind(input: {
  expressedByMe: boolean;
  matchState?: DuoMatchHeartState | null;
  completionLocked: boolean;
  pending: boolean;
}): DuoHeartPressKind {
  if (input.completionLocked || input.pending) return "blocked";
  const state =
    input.matchState ?? (input.expressedByMe ? "outgoing" : "none");
  if (state === "completed") return "blocked";
  if (state === "mutual_pending") return "complete";
  if (state === "outgoing") return "withdraw";
  if (input.expressedByMe) return "withdraw";
  return "connect";
}

export function isDuoInterestMatchedError(err: unknown): boolean {
  const { message, details, hint } = extractPeopleConnectErrorFields(err);
  return /duo interest is matched/i.test(`${message}\n${details ?? ""}\n${hint ?? ""}`);
}

export function isDuoInterestDiscoverSourcedError(err: unknown): boolean {
  const { message, details, hint } = extractPeopleConnectErrorFields(err);
  return /not a duo interest/i.test(`${message}\n${details ?? ""}\n${hint ?? ""}`);
}

export function duoHeartPressStillCurrent(input: {
  viewerId: string;
  opportunityId: string;
  generation: number;
  liveViewerId: string | null;
}): boolean {
  const row = inflight.get(pressKey(input.viewerId, input.opportunityId));
  return Boolean(
    row &&
      row.generation === input.generation &&
      input.liveViewerId === input.viewerId
  );
}

export async function runDuoHeartWithdrawal(input: {
  viewerId: string;
  liveViewerId: () => string | null;
  opportunityId: string;
  expressedByMe: boolean;
  matchState?: DuoMatchHeartState | null;
  completionLocked: boolean;
  withdraw: () => Promise<{ withdrawn: boolean }>;
  onStart?: () => void;
}): Promise<DuoHeartWithdrawalResult> {
  const kind = duoHeartPressKind({
    expressedByMe: input.expressedByMe,
    matchState: input.matchState,
    completionLocked: input.completionLocked,
    pending: false,
  });
  if (kind !== "withdraw") return { type: "ignored" };
  if (!input.viewerId || !input.opportunityId) return { type: "ignored" };

  const key = pressKey(input.viewerId, input.opportunityId);
  if (inflight.has(key)) return { type: "ignored" };
  const generation = ++nextGeneration;
  inflight.set(key, { viewerId: input.viewerId, generation });
  input.onStart?.();

  try {
    const result = await input.withdraw();
    if (
      !duoHeartPressStillCurrent({
        viewerId: input.viewerId,
        opportunityId: input.opportunityId,
        generation,
        liveViewerId: input.liveViewerId(),
      })
    ) {
      return { type: "ignored" };
    }
    return { type: "withdrawn", withdrawn: result.withdrawn };
  } catch (err) {
    if (
      !duoHeartPressStillCurrent({
        viewerId: input.viewerId,
        opportunityId: input.opportunityId,
        generation,
        liveViewerId: input.liveViewerId(),
      })
    ) {
      return { type: "ignored" };
    }
    if (isDuoInterestMatchedError(err)) return { type: "matched-interest" };
    if (isDuoInterestDiscoverSourcedError(err)) return { type: "discover-sourced" };
    return { type: "failed", stale: isPeopleConnectStaleEligibilityError(err) };
  } finally {
    const row = inflight.get(key);
    if (row?.generation === generation) inflight.delete(key);
  }
}
