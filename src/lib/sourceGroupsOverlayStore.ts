/**
 * Source-specific Groups overlay open/close (Feed / Post Detail).
 */

import type { GroupUpSourceScheduleContext } from "./groupUpActiveOverlayStore";

type SourceGroupsOverlayState = {
  sourcePostId: string | null;
  sourceCaption: string | null;
  sourceSchedule: GroupUpSourceScheduleContext | null;
};

const EMPTY: SourceGroupsOverlayState = {
  sourcePostId: null,
  sourceCaption: null,
  sourceSchedule: null,
};

let state: SourceGroupsOverlayState = { ...EMPTY };
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

export function getSourceGroupsOverlayState(): SourceGroupsOverlayState {
  return state;
}

export function subscribeSourceGroupsOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isSourceGroupsOverlayOpen(
  s: SourceGroupsOverlayState = state
): boolean {
  return typeof s.sourcePostId === "string" && s.sourcePostId.length > 0;
}

export function openSourceGroupsOverlay(
  sourcePostId: string,
  sourceCaption?: string | null,
  sourceSchedule?: GroupUpSourceScheduleContext | null
): void {
  if (!sourcePostId) return;
  state = {
    sourcePostId,
    sourceCaption: sourceCaption ?? null,
    sourceSchedule: sourceSchedule ?? null,
  };
  emit();
}

export function closeSourceGroupsOverlay(): void {
  state = { ...EMPTY };
  emit();
}
