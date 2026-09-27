/**
 * Warm the Group Up requesters cache used by the detail overlay.
 * Cache-first, default first-page size, never force-refetch.
 * One in-flight RPC per conversation via requestManager.
 */

import { useEffect } from "react";
import { listGroupUpRequesters } from "../api/services/groupUp";

export function useEnsureGroupUpRequestersCached(
  conversationId: string | null,
  enabled: boolean
): void {
  const convId = conversationId?.trim() || "";
  useEffect(() => {
    if (!enabled || !convId) return;
    void listGroupUpRequesters({ conversationId: convId }).catch(() => {
      /* Preview is optional; overlay can still load on open. */
    });
  }, [enabled, convId]);
}
