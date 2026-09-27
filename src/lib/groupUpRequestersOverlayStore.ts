/**
 * Overlay store for Group Up requesters sheet.
 * Captures opening summary cursor (latest_request_at/id) immutably for mark-seen.
 */

import type { GroupUpRequestGroup } from "./people/types";

export type GroupUpRequestersOverlayOpening = {
  conversationId: string;
  opportunityId: string;
  groupTitle: string | null;
  description: string | null;
  sourcePostId: string;
  sourceType: "hangout" | "experience" | null;
  pendingCount: number;
  newCount: number;
  occursAt: string | null;
  occursTimeExplicit: boolean;
  /** Immutable for this overlay session — mark-seen uses only this. */
  capturedLatestRequestAt: string;
  capturedLatestRequestId: string;
};

type State = {
  opening: GroupUpRequestersOverlayOpening | null;
};

const EMPTY: State = { opening: null };

let state: State = { ...EMPTY };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

function setState(next: State): void {
  state = next;
  emit();
}

export function getGroupUpRequestersOverlayState(): State {
  return state;
}

export function subscribeGroupUpRequestersOverlay(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isGroupUpRequestersOverlayOpen(
  s: State = state
): boolean {
  return Boolean(s.opening);
}

export function openGroupUpRequestersOverlay(
  group: GroupUpRequestGroup
): void {
  if (!group.conversation_id || !group.latest_request_id) return;
  setState({
    opening: {
      conversationId: group.conversation_id,
      opportunityId: group.opportunity_id,
      groupTitle: group.group_title,
      description: group.description,
      sourcePostId: group.source_post_id,
      sourceType: group.source_type,
      pendingCount: group.pending_count,
      newCount: group.new_count,
      occursAt: group.occurs_at?.trim() || null,
      occursTimeExplicit: group.occurs_time_explicit !== false,
      capturedLatestRequestAt: group.latest_request_at,
      capturedLatestRequestId: group.latest_request_id,
    },
  });
}

export function closeGroupUpRequestersOverlay(): void {
  if (!state.opening) return;
  setState({ ...EMPTY });
}
