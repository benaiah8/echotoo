/**
 * Shared People Comment Composer — single root overlay context.
 * Category adapters open with preloaded candidate/source data (no refetch).
 */

import type { PostScheduleLabelKind } from "../postScheduleLabel";
import type { ProfileIdentityMediaSource } from "../profileIdentityMedia";
import { supabase } from "../supabaseClient";
import { getDiscoverSentComment } from "./discoverSentComment";

export type PeopleCommentComposerSurface = "discover" | "duo";

export type PeopleCommentComposerContext = {
  surface: PeopleCommentComposerSurface;
  opportunityId: string;
  sourcePostId: string;
  recipientUserId: string;
  displayName: string;
  identitySource: ProfileIdentityMediaSource;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind: PostScheduleLabelKind | null;
  sourceType: "hangout" | "experience" | null;
  expressedByMe: boolean;
  /** Discover read-only view of a comment confirmed in this session. */
  presentation?: "compose" | "sent";
  sentBody?: string;
  /**
   * Legacy Discover hook. The composer no longer calls this after delivery.
   * Comment success joins the sender's pool and does not Connect.
   */
  onAfterMessageDelivered?: () => Promise<void>;
  /**
   * Discover only, after a newly created comment joins the sender's pool.
   * Does not Connect and does not express interest.
   */
  onDiscoverCommentJoined?: (opportunityId: string) => void;
};

type PeopleCommentComposerState = {
  open: boolean;
  context: PeopleCommentComposerContext | null;
  /** Sticky idempotency key for the current open session. */
  clientMessageId: string | null;
};

const EMPTY: PeopleCommentComposerState = {
  open: false,
  context: null,
  clientMessageId: null,
};

let state: PeopleCommentComposerState = { ...EMPTY };
const listeners = new Set<() => void>();
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

function setState(next: PeopleCommentComposerState): void {
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
        overlayViewerId !== next &&
        state.open
      ) {
        setState({ ...EMPTY });
      }
      overlayViewerId = next;
      return;
    }
    if (event === "SIGNED_OUT") {
      if (state.open) setState({ ...EMPTY });
      overlayViewerId = null;
    }
  });
}

export function getPeopleCommentComposerState(): PeopleCommentComposerState {
  ensureOverlayAuthSubscription();
  return state;
}

export function subscribePeopleCommentComposer(listener: () => void): () => void {
  ensureOverlayAuthSubscription();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isPeopleCommentComposerOpen(
  s: PeopleCommentComposerState = state
): boolean {
  return Boolean(s.open && s.context);
}

export function openPeopleCommentComposer(
  context: PeopleCommentComposerContext
): void {
  ensureOverlayAuthSubscription();
  if (!context.recipientUserId?.trim() || !context.sourcePostId?.trim()) {
    return;
  }
  setState({
    open: true,
    context,
    clientMessageId: null,
  });
}

export function openDiscoverSentComment(opportunityId: string): boolean {
  const sent = getDiscoverSentComment(opportunityId);
  if (!sent?.recipientUserId.trim()) return false;
  openPeopleCommentComposer({
    surface: "discover",
    presentation: "sent",
    sentBody: sent.body,
    opportunityId: sent.opportunityId,
    sourcePostId: sent.sourcePostId,
    recipientUserId: sent.recipientUserId,
    displayName: sent.displayName,
    identitySource: sent.identitySource,
    caption: sent.caption,
    scheduleLabel: sent.scheduleLabel,
    scheduleLabelKind: sent.scheduleLabelKind,
    sourceType: sent.sourceType,
    expressedByMe: false,
  });
  return true;
}

export function closePeopleCommentComposer(): void {
  if (!state.open && !state.context) return;
  setState({ ...EMPTY });
}

export function closePeopleCommentComposerTop(): void {
  closePeopleCommentComposer();
}

/** Assign or return sticky client message id for this open session. */
export function ensurePeopleCommentComposerClientMessageId(
  factory: () => string
): string {
  if (state.clientMessageId) return state.clientMessageId;
  const id = factory();
  state = { ...state, clientMessageId: id };
  emit();
  return id;
}
