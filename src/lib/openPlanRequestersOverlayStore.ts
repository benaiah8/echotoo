/**
 * Overlay store for Open Plan requesters sheet.
 * Close fully on Accept → DM so Back does not reopen a stale list.
 */

import type { OpenPlanRequestGroup } from "./people/types";

export type OpenPlanRequestersOverlayOpening = {
  opportunityId: string;
  sourcePostId: string;
  planDescription: string | null;
  sourceCaption: string | null;
  pendingCount: number;
  occursAt: string | null;
  occursTimeExplicit: boolean;
};

type State = {
  opening: OpenPlanRequestersOverlayOpening | null;
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

export function getOpenPlanRequestersOverlayState(): State {
  return state;
}

export function subscribeOpenPlanRequestersOverlay(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isOpenPlanRequestersOverlayOpen(
  s: State = state
): boolean {
  return Boolean(s.opening);
}

export function openOpenPlanRequestersOverlay(
  group: OpenPlanRequestGroup
): void {
  if (!group.opportunity_id) return;
  setState({
    opening: {
      opportunityId: group.opportunity_id,
      sourcePostId: group.source_post_id,
      planDescription: group.plan_description,
      sourceCaption: group.source_caption,
      pendingCount: group.pending_count,
      occursAt: group.occurs_at?.trim() || null,
      occursTimeExplicit: group.occurs_time_explicit !== false,
    },
  });
}

export function closeOpenPlanRequestersOverlay(): void {
  if (!state.opening) return;
  setState({ ...EMPTY });
}
