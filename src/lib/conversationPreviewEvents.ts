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
