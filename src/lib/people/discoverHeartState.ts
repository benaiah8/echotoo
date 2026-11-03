/**
 * Session Discover Heart state. Keyed by the signed-in viewer and one
 * opportunity id. Not written to storage. Comment state is a different store.
 */
export type DiscoverHeartPhase = "idle" | "pending" | "active" | "unavailable";

type HeartRecord = {
  phase: DiscoverHeartPhase;
  expressed: boolean;
  confirmSeq: number;
};

const records = new Map<string, HeartRecord>();
const listeners = new Set<() => void>();
let viewerId: string | null = null;
let revision = 0;
let clock = 0;

function emit(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeDiscoverHeart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDiscoverHeartRevision(): number {
  return revision;
}

export function setDiscoverHeartViewer(next: string | null): void {
  if (next === viewerId) return;
  viewerId = next;
  records.clear();
  emit();
}

export function resetDiscoverHeartStateForTests(): void {
  viewerId = null;
  records.clear();
  clock = 0;
  emit();
}

function sameViewer(next: string | null): boolean {
  return Boolean(next) && next === viewerId;
}

export function readDiscoverHeartPhase(
  opportunityId: string,
  serverExpressed: boolean
): DiscoverHeartPhase {
  const record = records.get(opportunityId);
  if (!record) return serverExpressed ? "active" : "idle";
  if (record.phase === "pending" || record.phase === "unavailable") {
    return record.phase;
  }
  if (record.confirmSeq > 0) return record.expressed ? "active" : "idle";
  return serverExpressed ? "active" : "idle";
}

export function beginDiscoverHeartPending(
  nextViewerId: string,
  opportunityId: string,
  serverExpressed: boolean
): boolean {
  if (!nextViewerId || !opportunityId) return false;
  if (viewerId && viewerId !== nextViewerId) return false;
  if (!viewerId) viewerId = nextViewerId;
  const existing = records.get(opportunityId);
  if (existing?.phase === "pending" || existing?.phase === "unavailable") {
    return false;
  }
  records.set(opportunityId, {
    phase: "pending",
    expressed: existing ? existing.expressed : serverExpressed,
    confirmSeq: existing?.confirmSeq ?? 0,
  });
  emit();
  return true;
}

export function confirmDiscoverHeart(
  nextViewerId: string,
  opportunityId: string,
  expressed: boolean
): void {
  if (!nextViewerId || !opportunityId) return;
  if (viewerId && viewerId !== nextViewerId) return;
  if (!viewerId) viewerId = nextViewerId;
  clock += 1;
  records.set(opportunityId, {
    phase: expressed ? "active" : "idle",
    expressed,
    confirmSeq: clock,
  });
  emit();
}

export function cancelDiscoverHeartPending(
  nextViewerId: string,
  opportunityId: string
): void {
  if (!sameViewer(nextViewerId)) return;
  const existing = records.get(opportunityId);
  if (!existing || existing.phase !== "pending") return;
  if (existing.confirmSeq > 0) {
    records.set(opportunityId, {
      ...existing,
      phase: existing.expressed ? "active" : "idle",
    });
  } else {
    records.delete(opportunityId);
  }
  emit();
}

export function clearDiscoverHeartOpportunity(opportunityId: string): void {
  if (!records.delete(opportunityId)) return;
  emit();
}

export function markDiscoverHeartUnavailable(
  nextViewerId: string,
  opportunityId: string
): void {
  if (!sameViewer(nextViewerId) || !opportunityId) return;
  clock += 1;
  records.set(opportunityId, {
    phase: "unavailable",
    expressed: false,
    confirmSeq: clock,
  });
  emit();
}

export function startDiscoverHeartListFetch(): number {
  clock += 1;
  return clock;
}

export function discoverHeartShouldHold(
  opportunityId: string,
  fetchSeq: number
): boolean {
  const record = records.get(opportunityId);
  if (!record || record.phase === "unavailable") return false;
  if (record.phase === "pending") return true;
  return record.confirmSeq > fetchSeq;
}

export function reconcileDiscoverHeartCandidate<
  T extends {
    opportunity_id: string;
    expressed_by_me: boolean;
  },
>(row: T, fetchSeq: number): T {
  const record = records.get(row.opportunity_id);
  if (!record || record.phase === "unavailable") return row;
  if (record.phase === "pending" || record.confirmSeq > fetchSeq) {
    if (row.expressed_by_me === record.expressed) return row;
    return { ...row, expressed_by_me: record.expressed };
  }
  records.delete(row.opportunity_id);
  return row;
}
