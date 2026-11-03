/**
 * Lightweight inbox patch bus for DM push / Realtime (no full refetch).
 */
export type ConversationPreviewPatch = {
  conversationId: string;
  preview?: string;
  lastMessageAt?: string;
  senderUserId?: string;
  unreadDelta?: number;
};

export const CONVERSATION_PREVIEW_EVENT = "conversation:preview";

export function emitConversationPreviewPatch(
  patch: ConversationPreviewPatch
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONVERSATION_PREVIEW_EVENT, { detail: patch })
  );
}

export function subscribeConversationPreviewPatches(
  handler: (patch: ConversationPreviewPatch) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<ConversationPreviewPatch>).detail;
    if (detail?.conversationId) handler(detail);
  };
  window.addEventListener(CONVERSATION_PREVIEW_EVENT, listener);
  return () => window.removeEventListener(CONVERSATION_PREVIEW_EVENT, listener);
}

/** Viewer reply accepted a request. Cache patch only — not an inbox refetch. */
export const INBOX_REQUEST_PROMOTED_EVENT = "conversation:request-promoted";

export function emitInboxRequestPromoted(conversationId: string): void {
  const id = conversationId.trim();
  if (!id || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(INBOX_REQUEST_PROMOTED_EVENT, {
      detail: { conversationId: id },
    })
  );
}

export function subscribeInboxRequestPromoted(
  handler: (conversationId: string) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ conversationId?: string }>).detail;
    const id = detail?.conversationId?.trim();
    if (id) handler(id);
  };
  window.addEventListener(INBOX_REQUEST_PROMOTED_EVENT, listener);
  return () =>
    window.removeEventListener(INBOX_REQUEST_PROMOTED_EVENT, listener);
}
