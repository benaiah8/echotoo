/**
 * Single active Open Plan overlay stack: create/manage sheet → cancel confirm.
 * Feed/detail buttons open this store; only OpenPlanActiveOverlay owns drawers + Android Back.
 */

import { dismissOpenPlanJoinToast } from "./showOpenPlanJoinToast";
import { supabase } from "./supabaseClient";

export type OpenPlanOverlayMode = "create" | "manage";

type OpenPlanActiveOverlayState = {
  postId: string | null;
  mode: OpenPlanOverlayMode | null;
  cancelConfirmOpen: boolean;
};

const EMPTY: OpenPlanActiveOverlayState = {
  postId: null,
  mode: null,
  cancelConfirmOpen: false,
};

let state: OpenPlanActiveOverlayState = { ...EMPTY };
const listeners = new Set<() => void>();
/** Last confirmed auth user — closes overlay on switch / sign-out. */
let overlayViewerId: string | null | undefined;
let overlayAuthSubscribed = false;

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

function setState(next: OpenPlanActiveOverlayState): void {
  state = next;
  emit();
}

function ensureOverlayAuthSubscription(): void {
  if (overlayAuthSubscribed) return;
  overlayAuthSubscribed = true;
  supabase.auth.onAuthStateChange((event, session) => {
    const next = session?.user?.id ?? null;
    if (next) {
      if (
        typeof overlayViewerId === "string" &&
        overlayViewerId !== next
      ) {
        if (state.postId || state.mode) {
          setState({ ...EMPTY });
        }
      }
      overlayViewerId = next;
      return;
    }
    if (event === "SIGNED_OUT") {
      if (state.postId || state.mode) {
        setState({ ...EMPTY });
      }
      overlayViewerId = null;
    }
  });
}

export function getOpenPlanActiveOverlayState(): OpenPlanActiveOverlayState {
  ensureOverlayAuthSubscription();
  return state;
}

export function subscribeOpenPlanActiveOverlay(
  listener: () => void
): () => void {
  ensureOverlayAuthSubscription();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isOpenPlanActiveOverlayStackOpen(
  s: OpenPlanActiveOverlayState = state
): boolean {
  return Boolean(s.postId && s.mode);
}

export function openOpenPlanCreate(postId: string): void {
  if (!postId) return;
  ensureOverlayAuthSubscription();
  /* Parity with Pair Up: opening the sheet dismisses the create-success toast. */
  dismissOpenPlanJoinToast(postId);
  setState({
    postId,
    mode: "create",
    cancelConfirmOpen: false,
  });
}

export function openOpenPlanManage(postId: string): void {
  if (!postId) return;
  ensureOverlayAuthSubscription();
  dismissOpenPlanJoinToast(postId);
  setState({
    postId,
    mode: "manage",
    cancelConfirmOpen: false,
  });
}

export function openOpenPlanCancelConfirm(): void {
  if (!state.postId || state.mode !== "manage") return;
  setState({ ...state, cancelConfirmOpen: true });
}

export function closeOpenPlanCancelConfirm(): void {
  if (!state.cancelConfirmOpen) return;
  setState({ ...state, cancelConfirmOpen: false });
}

export function closeOpenPlanOverlay(): void {
  if (!state.postId && !state.mode) return;
  setState({ ...EMPTY });
}

/** Close topmost layer. Order: cancel confirm → sheet. */
export function closeOpenPlanOverlayTop(): void {
  if (state.cancelConfirmOpen) {
    closeOpenPlanCancelConfirm();
    return;
  }
  if (state.mode) {
    closeOpenPlanOverlay();
  }
}

/** Simulate auth change for account-isolation tests. */
export function __applyOpenPlanOverlayAuthForTests(
  next: string | null
): void {
  ensureOverlayAuthSubscription();
  if (next) {
    if (typeof overlayViewerId === "string" && overlayViewerId !== next) {
      if (state.postId || state.mode) {
        setState({ ...EMPTY });
      }
    }
    overlayViewerId = next;
    return;
  }
  if (state.postId || state.mode) {
    setState({ ...EMPTY });
  }
  overlayViewerId = null;
}

export function __resetOpenPlanActiveOverlayForTests(): void {
  state = { ...EMPTY };
  overlayViewerId = undefined;
  overlayAuthSubscribed = false;
  listeners.clear();
}
