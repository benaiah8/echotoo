/**
 * Source-browse Group request / withdraw — shared mutations + in-flight guard.
 * Used by SourceGroupsOverlay card taps and Request-sent toast Undo.
 */

import {
  classifyGroupUpRequestError,
  requestGroupUp,
  withdrawGroupUpRequest,
} from "../api/services/groupUp";
import {
  invalidateGroupUpSourceList,
  patchSourceGroupViewerState,
} from "./groupUpSourceListCache";
import { patchGroupUpCount } from "./groupUpCountStore";
import {
  dismissGroupUpRequestToast,
  showGroupUpRequestToast,
  showGroupUpWithdrawnToast,
} from "./showGroupUpRequestToast";
import { socialUiCopy } from "./social/socialUiCopy";
import type { SourceGroupRow } from "./social/sourceGroupTypes";
import toast from "react-hot-toast";

export type SourceGroupRequestFlight =
  | { phase: "requesting"; undoAfter: boolean }
  | { phase: "withdrawing" };

const flights = new Map<string, SourceGroupRequestFlight>();
const listeners = new Set<() => void>();
let flightsEpoch = 0;

function emitFlights(): void {
  flightsEpoch += 1;
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/** Test / overlay reset helper. */
export function __resetSourceGroupRequestFlightsForTests(): void {
  flights.clear();
  emitFlights();
}

export function subscribeSourceGroupRequestFlights(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSourceGroupRequestFlightsEpoch(): number {
  return flightsEpoch;
}

export function getSourceGroupRequestFlight(
  opportunityId: string
): SourceGroupRequestFlight | undefined {
  return flights.get(opportunityId);
}

export function isSourceGroupRequestBusy(opportunityId: string): boolean {
  return flights.has(opportunityId);
}

type RequestCtx = {
  sourcePostId: string;
  row: SourceGroupRow;
  /** Called after a failed request when the source list should re-fetch. */
  reloadSourceList?: (sourcePostId: string) => void;
};

/**
 * Optimistic none → pending, then request_group_up.
 * If withdraw is requested before the RPC returns, withdraws once request_id exists.
 */
export async function runSourceGroupRequest(ctx: RequestCtx): Promise<void> {
  const { sourcePostId, row, reloadSourceList } = ctx;
  const id = row.opportunity_id;
  if (!sourcePostId || !id) return;
  if (flights.has(id)) return;

  flights.set(id, { phase: "requesting", undoAfter: false });
  emitFlights();
  patchSourceGroupViewerState(sourcePostId, id, {
    viewer_state: "pending",
    request_id: null,
  });

  try {
    const request = await requestGroupUp(id);
    const flight = flights.get(id);

    if (request.status === "accepted") {
      patchSourceGroupViewerState(sourcePostId, id, {
        viewer_state: "member",
        request_id: null,
      });
      dismissGroupUpRequestToast(id);
      return;
    }

    if (request.status !== "pending") {
      patchSourceGroupViewerState(sourcePostId, id, {
        viewer_state: row.viewer_state,
        request_id: row.request_id,
      });
      dismissGroupUpRequestToast(id);
      return;
    }

    patchSourceGroupViewerState(sourcePostId, id, {
      viewer_state: "pending",
      request_id: request.id,
    });

    if (flight?.phase === "requesting" && flight.undoAfter) {
      flights.delete(id);
      emitFlights();
      await runSourceGroupWithdraw({
        sourcePostId,
        opportunityId: id,
        prevRequestId: request.id,
        showRemovedToast: false,
      });
      return;
    }

    showGroupUpRequestToast(id, () => {
      void runSourceGroupWithdraw({
        sourcePostId,
        opportunityId: id,
        prevRequestId: request.id,
        showRemovedToast: false,
      });
    });
  } catch (err) {
    dismissGroupUpRequestToast(id);
    patchSourceGroupViewerState(sourcePostId, id, {
      viewer_state: row.viewer_state,
      request_id: row.request_id,
    });
    const kind = classifyGroupUpRequestError(err);
    if (kind === "unavailable" || kind === "declined") {
      invalidateGroupUpSourceList(sourcePostId);
      reloadSourceList?.(sourcePostId);
      patchGroupUpCount(sourcePostId, -1);
      toast.error(socialUiCopy.sourceGroupsUnavailableError);
    } else if (kind === "full") {
      toast.error(socialUiCopy.groupFull);
    } else {
      toast.error(socialUiCopy.sourceGroupsRequestError);
    }
  } finally {
    const f = flights.get(id);
    if (f?.phase === "requesting") {
      flights.delete(id);
      emitFlights();
    }
  }
}

type WithdrawCtx = {
  sourcePostId: string;
  opportunityId: string;
  prevRequestId: string | null;
  showRemovedToast?: boolean;
};

/**
 * Shared withdraw path — card Requested tap and toast Undo.
 * If a request is still in flight (no request_id yet), marks undoAfter instead.
 */
export async function runSourceGroupWithdraw(ctx: WithdrawCtx): Promise<void> {
  const {
    sourcePostId,
    opportunityId: id,
    prevRequestId,
    showRemovedToast = false,
  } = ctx;
  if (!sourcePostId || !id) return;

  const existing = flights.get(id);
  if (existing?.phase === "requesting") {
    existing.undoAfter = true;
    /* Optimistic UI: treat as withdrawn until request returns then withdraws. */
    patchSourceGroupViewerState(sourcePostId, id, {
      viewer_state: "none",
      request_id: null,
    });
    dismissGroupUpRequestToast(id);
    if (showRemovedToast) {
      showGroupUpWithdrawnToast(id);
    }
    emitFlights();
    return;
  }
  if (existing?.phase === "withdrawing") return;

  /* Prefer not to call withdraw without an identifier when still unknown. */
  if (!prevRequestId) {
    return;
  }

  flights.set(id, { phase: "withdrawing" });
  emitFlights();
  dismissGroupUpRequestToast(id);
  patchSourceGroupViewerState(sourcePostId, id, {
    viewer_state: "none",
    request_id: null,
  });

  try {
    await withdrawGroupUpRequest(id);
    patchSourceGroupViewerState(sourcePostId, id, {
      viewer_state: "none",
      request_id: null,
    });
    if (showRemovedToast) {
      showGroupUpWithdrawnToast(id);
    }
  } catch {
    patchSourceGroupViewerState(sourcePostId, id, {
      viewer_state: "pending",
      request_id: prevRequestId,
    });
    toast.error(socialUiCopy.sourceGroupsWithdrawError);
  } finally {
    flights.delete(id);
    emitFlights();
  }
}
