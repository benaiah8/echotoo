/**
 * Session Comment state for Discover and Duo.
 * Keyed by viewer, source post, and recipient. Not written to storage.
 */
import type {
  PeopleActionConfirmedState,
  PeopleActionVisualState,
} from "../../components/people/PeopleActionStateButton";
import { supabase } from "../supabaseClient";

export type DuoCommentDomainState =
  | "unknown"
  | "idle"
  | "pending"
  | "sent"
  | "unavailable";

export type DuoCommentSnapshot = {
  state: Exclude<DuoCommentDomainState, "pending">;
  pending: boolean;
  body: string | null;
  viewerHasActivePairUp: boolean | null;
  /** This session confirmed delivery. A stale list false must not clear it. */
  confirmedBySend: boolean;
};

const EMPTY_SNAPSHOT: DuoCommentSnapshot = {
  state: "unknown",
  pending: false,
  body: null,
  viewerHasActivePairUp: null,
  confirmedBySend: false,
};

const records = new Map<string, DuoCommentSnapshot>();
const listeners = new Set<() => void>();
let viewerId: string | null = null;
let authSubscribed = false;
let viewerLocked = false;
let revision = 0;

function emit(): void {
  revision += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function duoCommentStateKey(
  viewer: string,
  sourcePostId: string,
  recipientUserId: string
): string {
  return `${viewer.trim()}\n${sourcePostId.trim()}\n${recipientUserId.trim()}`;
}

export function subscribeDuoCommentState(listener: () => void): () => void {
  ensureDuoCommentAuth();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDuoCommentSnapshot(key: string): DuoCommentSnapshot {
  if (!key) return EMPTY_SNAPSHOT;
  return records.get(key) ?? EMPTY_SNAPSHOT;
}

export function getDuoCommentRevision(): number {
  ensureDuoCommentAuth();
  return revision;
}

export function getDuoCommentViewerId(): string | null {
  ensureDuoCommentAuth();
  return viewerId;
}

export function setDuoCommentViewerForTests(next: string | null): void {
  viewerLocked = true;
  if (next === viewerId && records.size === 0) return;
  viewerId = next;
  records.clear();
  emit();
}

export function clearDuoCommentState(): void {
  if (records.size === 0) return;
  records.clear();
  emit();
}

function ensureDuoCommentAuth(): void {
  if (authSubscribed) return;
  authSubscribed = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (viewerLocked) return;
    const next = session?.user?.id ?? null;
    if (event === "SIGNED_OUT" || next !== viewerId) {
      viewerId = next;
      records.clear();
      emit();
      return;
    }
    viewerId = next;
  });
  void supabase.auth.getSession().then(({ data }) => {
    if (viewerLocked) return;
    const next = data.session?.user?.id ?? null;
    if (next === null && viewerId) return;
    if (next === viewerId) return;
    viewerId = next;
    records.clear();
    emit();
  });
}

function write(key: string, next: DuoCommentSnapshot): void {
  const prev = records.get(key);
  if (
    prev &&
    prev.state === next.state &&
    prev.pending === next.pending &&
    prev.body === next.body &&
    prev.viewerHasActivePairUp === next.viewerHasActivePairUp &&
    prev.confirmedBySend === next.confirmedBySend
  ) {
    return;
  }
  records.set(key, next);
  emit();
}

export function applyDuoCommentListFlags(input: {
  viewerId: string;
  sourcePostId: string;
  recipientUserId: string;
  commented: boolean | null;
  viewerHasActivePairUp: boolean | null;
}): void {
  const viewer = input.viewerId.trim();
  const sourcePostId = input.sourcePostId.trim();
  const recipientUserId = input.recipientUserId.trim();
  if (!viewer || !sourcePostId || !recipientUserId) return;
  if (viewerId && viewerId !== viewer) return;
  const key = duoCommentStateKey(viewer, sourcePostId, recipientUserId);
  const prev = records.get(key) ?? EMPTY_SNAPSHOT;
  let state = prev.state;
  let body = prev.body;
  const confirmedBySend = prev.confirmedBySend;
  if (input.commented === true) {
    state = "sent";
  } else if (input.commented === false && !confirmedBySend) {
    state = "idle";
    body = null;
  }
  let pool = prev.viewerHasActivePairUp;
  if (input.viewerHasActivePairUp !== null) {
    if (input.viewerHasActivePairUp === true || pool !== true) {
      pool = input.viewerHasActivePairUp;
    }
  }
  write(key, {
    state,
    pending: prev.pending,
    body,
    viewerHasActivePairUp: pool,
    confirmedBySend,
  });
}

export function setDuoCommentPending(key: string, pending: boolean): void {
  if (!key) return;
  const prev = records.get(key) ?? EMPTY_SNAPSHOT;
  write(key, { ...prev, pending });
}

export function markDuoCommentSent(key: string, body: string): void {
  const trimmed = body.trim();
  if (!key || !trimmed) return;
  const prev = records.get(key) ?? EMPTY_SNAPSHOT;
  write(key, {
    ...prev,
    state: "sent",
    pending: false,
    body: trimmed,
    confirmedBySend: true,
  });
}

export function markDuoCommentUnavailable(key: string): void {
  if (!key) return;
  const prev = records.get(key) ?? EMPTY_SNAPSHOT;
  write(key, {
    ...prev,
    state: "unavailable",
    pending: false,
    body: null,
  });
}

export function markDuoCommentIdle(key: string): void {
  if (!key) return;
  const prev = records.get(key) ?? EMPTY_SNAPSHOT;
  write(key, {
    ...prev,
    state: "idle",
    pending: false,
    body: null,
    confirmedBySend: false,
  });
}

export function markDuoCommentPoolJoined(key: string): void {
  if (!key) return;
  const prev = records.get(key) ?? EMPTY_SNAPSHOT;
  write(key, { ...prev, viewerHasActivePairUp: true });
}

export function markDuoCommentPoolNotJoined(key: string): void {
  if (!key) return;
  const prev = records.get(key) ?? EMPTY_SNAPSHOT;
  if (prev.viewerHasActivePairUp === true) return;
  write(key, { ...prev, viewerHasActivePairUp: false });
}

export function duoCommentVisual(input: {
  snapshot: DuoCommentSnapshot;
  listCommented: boolean | null;
}): {
  domain: DuoCommentDomainState;
  state: PeopleActionVisualState;
  confirmedState: PeopleActionConfirmedState;
  disabled: boolean;
} {
  const domain: DuoCommentDomainState = input.snapshot.pending
    ? "pending"
    : input.snapshot.state === "unknown"
      ? input.listCommented === true
        ? "sent"
        : input.listCommented === false
          ? "idle"
          : "unknown"
      : input.snapshot.state;
  const confirmedSent =
    input.snapshot.state === "sent" || input.listCommented === true;
  if (input.snapshot.pending) {
    return {
      domain: "pending",
      state: "pending",
      confirmedState: confirmedSent ? "active" : "idle",
      disabled: true,
    };
  }
  if (domain === "sent") {
    return {
      domain,
      state: "active",
      confirmedState: "active",
      disabled: false,
    };
  }
  if (domain === "unavailable") {
    return {
      domain,
      state: "disabled",
      confirmedState: "idle",
      disabled: true,
    };
  }
  if (domain === "unknown") {
    return {
      domain,
      state: "pending",
      confirmedState: "idle",
      disabled: true,
    };
  }
  return {
    domain,
    state: "idle",
    confirmedState: "idle",
    disabled: false,
  };
}
