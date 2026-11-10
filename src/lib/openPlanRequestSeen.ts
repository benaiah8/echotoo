/**
 * Device-local Open Plan seen cursors.
 * The list API has pending_count and latest request cursors, and no new_count.
 * The first loaded snapshot is the baseline so an existing backlog is not "new".
 * A later cursor on that device is unseen until the Requests tab marks it seen.
 */
import { useSyncExternalStore } from "react";
import {
  isRequestCursorAfter,
  type GroupUpRequestCursor,
} from "./groupUpRequestCursor";
import type { OpenPlanRequestGroup } from "./people/types";

const KEY_PREFIX = "echotoo_open_plan_request_seen_v1:";

type Stored = {
  baselined: boolean;
  cursors: Record<string, GroupUpRequestCursor>;
};

const listeners = new Set<() => void>();
let revision = 0;

function emit(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOpenPlanSeenRevision(): number {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0
  );
}

function empty(): Stored {
  return { baselined: false, cursors: {} };
}

function keyFor(userId: string): string {
  return KEY_PREFIX + userId.trim();
}

function read(userId: string): Stored {
  const id = userId.trim();
  if (!id) return empty();
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const cursors: Record<string, GroupUpRequestCursor> = {};
    if (parsed.cursors && typeof parsed.cursors === "object") {
      for (const [opp, cursor] of Object.entries(parsed.cursors)) {
        if (!cursor || typeof cursor !== "object") continue;
        const at = (cursor as GroupUpRequestCursor).at;
        const cid = (cursor as GroupUpRequestCursor).id;
        if (typeof at === "string" && typeof cid === "string" && at && cid) {
          cursors[opp] = { at, id: cid };
        }
      }
    }
    return { baselined: parsed.baselined === true, cursors };
  } catch {
    return empty();
  }
}

function write(userId: string, stored: Stored): void {
  const id = userId.trim();
  if (!id) return;
  try {
    localStorage.setItem(keyFor(id), JSON.stringify(stored));
  } catch {
    /* ignore quota */
  }
  emit();
}

function latestOf(group: OpenPlanRequestGroup): GroupUpRequestCursor | null {
  const at = group.latest_request_at?.trim() ?? "";
  const id = group.latest_request_id?.trim() ?? "";
  const opp = group.opportunity_id?.trim() ?? "";
  if (!at || !id || !opp) return null;
  return { at, id };
}

export function openPlanPendingCount(groups: OpenPlanRequestGroup[]): number {
  let sum = 0;
  for (const group of groups) {
    sum += Math.max(0, Math.floor(group.pending_count || 0));
  }
  return sum;
}

/** Groups whose latest request is newer than this device's seen cursor. */
export function openPlanUnseenCount(
  userId: string,
  groups: OpenPlanRequestGroup[]
): number {
  const stored = read(userId);
  if (!stored.baselined) return 0;
  let count = 0;
  for (const group of groups) {
    if (Math.max(0, Math.floor(group.pending_count || 0)) <= 0) continue;
    const latest = latestOf(group);
    if (!latest) continue;
    const seen = stored.cursors[group.opportunity_id];
    if (!seen || isRequestCursorAfter(latest, seen)) count += 1;
  }
  return count;
}

export type OpenPlanFetchStatus = "idle" | "success" | "error";

/**
 * A snapshot may update state only when it succeeded for the user who is
 * still signed in. A switched account or a failed fetch returns null.
 */
export function acceptOpenPlanSnapshot<T>(input: {
  requestUserId: string;
  currentUserId: string | null;
  status: OpenPlanFetchStatus;
  groups: T[];
}): { userId: string; groups: T[] } | null {
  const requestUserId = input.requestUserId.trim();
  const currentUserId = input.currentUserId?.trim() ?? "";
  if (!requestUserId || !currentUserId || requestUserId !== currentUserId) {
    return null;
  }
  if (input.status !== "success") return null;
  return { userId: requestUserId, groups: input.groups };
}

/**
 * Baseline or mark-seen only for a successful snapshot owned by the viewer.
 * A failed or idle load does not write. Another user's groups are ignored.
 */
export function applyOpenPlanSeenForViewer(input: {
  viewerUserId: string;
  snapshotUserId: string | null;
  fetchStatus: OpenPlanFetchStatus;
  requestsTabOpen: boolean;
  groups: OpenPlanRequestGroup[];
}): void {
  const viewerUserId = input.viewerUserId.trim();
  const snapshotUserId = input.snapshotUserId?.trim() ?? "";
  if (!viewerUserId || snapshotUserId !== viewerUserId) return;
  if (input.fetchStatus !== "success") return;
  if (input.requestsTabOpen) {
    markOpenPlanRequestsSeen(viewerUserId, input.groups);
    return;
  }
  baselineOpenPlanRequestsIfNeeded(viewerUserId, input.groups);
}

/** Record the current page once. Does not move an existing baseline forward. */
export function baselineOpenPlanRequestsIfNeeded(
  userId: string,
  groups: OpenPlanRequestGroup[]
): void {
  const stored = read(userId);
  if (stored.baselined) return;
  const cursors = { ...stored.cursors };
  for (const group of groups) {
    const latest = latestOf(group);
    if (!latest) continue;
    cursors[group.opportunity_id] = latest;
  }
  write(userId, { baselined: true, cursors });
}

/** Requests tab is open: advance seen cursors to the loaded latest requests. */
export function markOpenPlanRequestsSeen(
  userId: string,
  groups: OpenPlanRequestGroup[]
): void {
  const stored = read(userId);
  const cursors = { ...stored.cursors };
  let changed = !stored.baselined;
  for (const group of groups) {
    const latest = latestOf(group);
    if (!latest) continue;
    const prev = cursors[group.opportunity_id];
    if (!prev || isRequestCursorAfter(latest, prev)) {
      cursors[group.opportunity_id] = latest;
      changed = true;
    }
  }
  if (!changed) return;
  write(userId, { baselined: true, cursors });
}
