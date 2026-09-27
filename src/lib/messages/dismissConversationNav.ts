/**
 * M1C — Deterministic conversation dismiss.
 * Default: return to Messages inbox.
 * Contextual Group Manage launch: restore supplied background (Manage stays mounted).
 */

import type { Location, NavigateFunction } from "react-router-dom";
import {
  isMessagesConversationPath,
  messagesConversationPath,
  Paths,
} from "../../router/Paths";

/** Route-state marker for Open group from Group Manage. */
export const CONVERSATION_RETURN_GROUP_MANAGE = "group-manage" as const;

export type ConversationOverlayReturnContext =
  typeof CONVERSATION_RETURN_GROUP_MANAGE;

export type ConversationOverlayLocationState = {
  backgroundLocation?: Location;
  conversationReturnContext?: ConversationOverlayReturnContext;
};

type BackgroundState = {
  backgroundLocation?: Location;
  conversationReturnContext?: unknown;
};

/** Stable underlay for conversation overlays (Messages inbox tab). */
export const MESSAGES_INBOX_BACKGROUND: Location = {
  pathname: Paths.messages,
  search: "",
  hash: "",
  key: "default",
  state: null,
};

/** True when underlay is the Messages inbox tab (not a nested conversation). */
export function isMessagesInboxBackground(
  background: Location | null | undefined
): boolean {
  return (background?.pathname ?? "") === Paths.messages;
}

/**
 * Normalize navigate `backgroundLocation` for opening a conversation.
 * Never allow `/messages/:conversationId` — that poisons AppRouter overlay matching.
 * Preserves inbox search/hash/state when the candidate is already `/messages`.
 */
export function normalizeMessagesInboxBackground(
  candidate: unknown
): Location {
  if (candidate && typeof candidate === "object") {
    const loc = candidate as Partial<Location>;
    if (typeof loc.pathname === "string" && loc.pathname === Paths.messages) {
      return {
        pathname: Paths.messages,
        search: typeof loc.search === "string" ? loc.search : "",
        hash: typeof loc.hash === "string" ? loc.hash : "",
        key: typeof loc.key === "string" ? loc.key : "default",
        state: loc.state ?? null,
      };
    }
  }
  return {
    pathname: MESSAGES_INBOX_BACKGROUND.pathname,
    search: MESSAGES_INBOX_BACKGROUND.search,
    hash: MESSAGES_INBOX_BACKGROUND.hash,
    key: MESSAGES_INBOX_BACKGROUND.key,
    state: null,
  };
}

export function getConversationOverlayReturnContext(
  state: unknown
): ConversationOverlayReturnContext | null {
  const raw = (state as BackgroundState | null)?.conversationReturnContext;
  if (raw === CONVERSATION_RETURN_GROUP_MANAGE) {
    return CONVERSATION_RETURN_GROUP_MANAGE;
  }
  return null;
}

export function isGroupManageConversationLaunch(state: unknown): boolean {
  return getConversationOverlayReturnContext(state) === CONVERSATION_RETURN_GROUP_MANAGE;
}

/** Navigate state for Group Manage → Open group (keeps Manage mounted). */
export function buildGroupManageConversationNavState(
  backgroundLocation: Location
): ConversationOverlayLocationState {
  return {
    backgroundLocation,
    conversationReturnContext: CONVERSATION_RETURN_GROUP_MANAGE,
  };
}

/**
 * Open-group navigation from Manage — never closes the Manage overlay.
 * Callers must NOT invoke closeGroupUpOverlay for this action.
 */
export function buildGroupManageOpenGroupNavigation(
  conversationId: string,
  backgroundLocation: Location
): {
  path: string;
  state: ConversationOverlayLocationState;
  closeManage: false;
} {
  return {
    path: messagesConversationPath(conversationId),
    state: buildGroupManageConversationNavState(backgroundLocation),
    closeManage: false,
  };
}

export function messagesBackgroundFromLocationState(
  state: unknown
): Location | null {
  const bg = (state as BackgroundState | null)?.backgroundLocation;
  if (!bg || typeof bg.pathname !== "string") return null;
  if (isMessagesConversationPath(bg.pathname)) return null;
  return bg;
}

/**
 * Close conversation overlay.
 * - Group Manage contextual launch → restore non-Messages background (or history -1).
 * - Normal Messages launch → Messages inbox (unchanged).
 */
export function dismissConversationOverlay(
  navigate: NavigateFunction,
  locationState: unknown
): void {
  if (isGroupManageConversationLaunch(locationState)) {
    const bg = messagesBackgroundFromLocationState(locationState);
    if (bg) {
      // Prefer history return: Open group pushed one entry above the Manage underlay.
      navigate(-1);
      return;
    }
  }

  const bg = normalizeMessagesInboxBackground(
    messagesBackgroundFromLocationState(locationState)
  );
  if (isMessagesInboxBackground(bg)) {
    const { pathname, search, hash, state: bgState } = bg;
    navigate(
      { pathname, search: search ?? "", hash: hash ?? "" },
      { state: bgState, replace: true }
    );
    return;
  }
  navigate(Paths.messages, { replace: true });
}
