/**
 * Conversation-scoped shared_post → card resolution (Share S1).
 * Call ensureResolved from explicit load / older / realtime sites — not from a map-driven effect loop.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPostsByIdsForCards,
  type SharedPostCardData,
} from "../api/services/posts";

export type SharedPostResolveStatus =
  | "pending"
  | "ready"
  | "unavailable"
  | "error";

export type SharedPostResolveEntry = {
  status: SharedPostResolveStatus;
  data?: SharedPostCardData;
};

function normalizeIds(ids: string[]): string[] {
  return [
    ...new Set(
      (ids ?? [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    ),
  ];
}

export function useSharedPostResolution(conversationId: string) {
  const [entries, setEntries] = useState<
    Record<string, SharedPostResolveEntry>
  >({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const inFlightRef = useRef<Set<string>>(new Set());
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  useEffect(() => {
    setEntries({});
    inFlightRef.current.clear();
  }, [conversationId]);

  const getEntry = useCallback(
    (postId: string): SharedPostResolveEntry | undefined => {
      const id = (postId ?? "").trim();
      if (!id) return undefined;
      return entriesRef.current[id];
    },
    []
  );

  const ensureResolved = useCallback(async (ids: string[]) => {
    const scopedConversationId = conversationIdRef.current;
    const unique = normalizeIds(ids);
    if (unique.length === 0) return;

    const toFetch: string[] = [];
    for (const id of unique) {
      const existing = entriesRef.current[id];
      if (existing?.status === "ready" || existing?.status === "unavailable") {
        continue;
      }
      if (inFlightRef.current.has(id)) continue;
      toFetch.push(id);
    }
    if (toFetch.length === 0) return;

    for (const id of toFetch) {
      inFlightRef.current.add(id);
    }

    setEntries((prev) => {
      const next = { ...prev };
      for (const id of toFetch) {
        next[id] = { status: "pending" };
      }
      return next;
    });

    const { data, error } = await getPostsByIdsForCards(toFetch);

    if (conversationIdRef.current !== scopedConversationId) {
      for (const id of toFetch) {
        inFlightRef.current.delete(id);
      }
      return;
    }

    for (const id of toFetch) {
      inFlightRef.current.delete(id);
    }

    if (error) {
      setEntries((prev) => {
        const next = { ...prev };
        for (const id of toFetch) {
          next[id] = { status: "error" };
        }
        return next;
      });
      return;
    }

    const byId = new Map(data.map((card) => [card.id, card]));
    setEntries((prev) => {
      const next = { ...prev };
      for (const id of toFetch) {
        const card = byId.get(id);
        if (card) {
          next[id] = { status: "ready", data: card };
        } else {
          next[id] = { status: "unavailable" };
        }
      }
      return next;
    });
  }, []);

  return { entries, getEntry, ensureResolved };
}

/** Collect unique shared_post reference ids from message rows. */
export function collectSharedPostReferenceIds(
  messages: Array<{
    message_kind?: string;
    reference_type?: string | null;
    reference_id?: string | null;
  }>
): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    if (m.message_kind !== "shared_post") continue;
    if (m.reference_type !== "post") continue;
    const id = typeof m.reference_id === "string" ? m.reference_id.trim() : "";
    if (id) ids.push(id);
  }
  return normalizeIds(ids);
}
