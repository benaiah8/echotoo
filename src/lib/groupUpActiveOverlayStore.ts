/**
 * Single active Group Up overlay stack: create/manage sheet → cancel confirm.
 */

export type GroupUpOverlayMode = "create" | "manage";

export type GroupUpSourceScheduleContext = {
  postType: "hangout" | "experience";
  isRecurring?: boolean | null;
  selectedDates?: string[] | null;
  recurrenceDays?: string[] | null;
};

type GroupUpActiveOverlayState = {
  postId: string | null;
  sourceCaption: string | null;
  sourceSchedule: GroupUpSourceScheduleContext | null;
  mode: GroupUpOverlayMode | null;
  cancelConfirmOpen: boolean;
};

const EMPTY: GroupUpActiveOverlayState = {
  postId: null,
  sourceCaption: null,
  sourceSchedule: null,
  mode: null,
  cancelConfirmOpen: false,
};

let state: GroupUpActiveOverlayState = { ...EMPTY };
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

function setState(next: GroupUpActiveOverlayState): void {
  state = next;
  emit();
}

export function getGroupUpActiveOverlayState(): GroupUpActiveOverlayState {
  return state;
}

export function subscribeGroupUpActiveOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isGroupUpActiveOverlayStackOpen(
  s: GroupUpActiveOverlayState = state
): boolean {
  return Boolean(s.postId && s.mode);
}

export function openGroupUpCreate(
  postId: string,
  sourceCaption?: string | null,
  sourceSchedule?: GroupUpSourceScheduleContext | null
): void {
  if (!postId) return;
  setState({
    postId,
    sourceCaption: sourceCaption?.trim() || null,
    sourceSchedule: sourceSchedule ?? null,
    mode: "create",
    cancelConfirmOpen: false,
  });
}

export function openGroupUpManage(
  postId: string,
  sourceCaption?: string | null,
  sourceSchedule?: GroupUpSourceScheduleContext | null
): void {
  if (!postId) return;
  setState({
    postId,
    sourceCaption: sourceCaption?.trim() || null,
    sourceSchedule: sourceSchedule ?? null,
    mode: "manage",
    cancelConfirmOpen: false,
  });
}

export function openGroupUpCancelConfirm(): void {
  if (!state.postId || state.mode !== "manage") return;
  setState({ ...state, cancelConfirmOpen: true });
}

export function closeGroupUpCancelConfirm(): void {
  if (!state.cancelConfirmOpen) return;
  setState({ ...state, cancelConfirmOpen: false });
}

export function closeGroupUpOverlay(): void {
  if (!state.postId && !state.mode) return;
  setState({ ...EMPTY });
}

export function closeGroupUpOverlayTop(): void {
  if (state.cancelConfirmOpen) {
    closeGroupUpCancelConfirm();
    return;
  }
  if (state.mode) {
    closeGroupUpOverlay();
  }
}
