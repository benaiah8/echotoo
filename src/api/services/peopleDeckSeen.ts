/**
 * People deck seen-state Supabase RPCs (cross-device).
 * Do not call supabase.rpc from People UI — use this service.
 */

import { supabase } from "../../lib/supabaseClient";
import type { PairUpSeenScope } from "../../lib/people/peoplePairUpSeenHistory";

export type PeopleDeckSeenRow = {
  item_id: string;
  seen_at_ms: number;
};

export const PEOPLE_DECK_SEEN_MARK_CHUNK = 50;

const SCOPES: ReadonlySet<string> = new Set([
  "my_plans",
  "discover",
  "open_plans",
  "groups_new",
]);

function assertScope(scope: string): asserts scope is PairUpSeenScope {
  if (!SCOPES.has(scope)) {
    throw new Error(`invalid people deck seen scope: ${scope}`);
  }
}

function normalizeUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id) return null;
  return id;
}

function seenAtToMs(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Compact server seen map for one People browsing scope.
 * RPC: public.get_people_deck_seen(p_scope)
 */
export async function getPeopleDeckSeen(
  scope: PairUpSeenScope
): Promise<PeopleDeckSeenRow[]> {
  assertScope(scope);
  const { data, error } = await supabase.rpc("get_people_deck_seen", {
    p_scope: scope,
  });
  if (error) {
    console.warn("[peopleDeckSeen] get", error.message);
    throw error;
  }
  if (data == null) return [];
  const rows = Array.isArray(data) ? data : [data];
  const out: PeopleDeckSeenRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const item_id = normalizeUuid(rec.item_id);
    const seen_at_ms = seenAtToMs(rec.seen_at);
    if (!item_id || seen_at_ms == null) continue;
    if (seen.has(item_id)) continue;
    seen.add(item_id);
    out.push({ item_id, seen_at_ms });
  }
  return out;
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

/**
 * Batch mark seen. Chunks to <=50 DISTINCT ids per RPC.
 * Navigation must not await this for UX — callers flush from outbox.
 * RPC: public.mark_people_deck_seen(p_scope, p_item_ids)
 *
 * When `expectedUserId` is set, aborts if the live session user differs
 * (prevents Account A outbox writing under Account B's JWT).
 */
export async function markPeopleDeckSeen(
  scope: PairUpSeenScope,
  ids: readonly string[],
  expectedUserId?: string | null
): Promise<void> {
  assertScope(scope);
  const unique = [
    ...new Set(
      ids.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
    ),
  ];
  if (unique.length === 0) return;

  const expected = expectedUserId?.trim() || "";

  for (const chunk of chunkIds(unique, PEOPLE_DECK_SEEN_MARK_CHUNK)) {
    if (chunk.length > PEOPLE_DECK_SEEN_MARK_CHUNK) {
      throw new Error("peopleDeckSeen: chunk exceeded 50");
    }
    if (expected) {
      const { data } = await supabase.auth.getSession();
      const live = data.session?.user?.id?.trim() || "";
      if (live !== expected) {
        throw new Error("peopleDeckSeen: session user mismatch");
      }
    }
    const { error } = await supabase.rpc("mark_people_deck_seen", {
      p_scope: scope,
      p_item_ids: chunk,
    });
    if (error) {
      console.warn("[peopleDeckSeen] mark", error.message);
      throw error;
    }
  }
}
