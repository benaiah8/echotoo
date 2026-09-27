import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  getMyPairUpsForSources,
  joinPairUp,
  leavePairUp,
} from "../api/services/pairUp";
import type { PairUpOpportunity } from "../lib/people/types";
import {
  getCachedPairUp,
  setCachedPairUp,
  subscribePairUpCache,
} from "../lib/pairUpCache";

export type PeoplePairUpJoinStatus = "pending" | "joined" | "idle";

const OPTIMISTIC_JOIN: Omit<PairUpOpportunity, "source_post_id"> = {
  id: "optimistic",
  status: "active",
  description: null,
  discoverable_until: "",
  created_at: "",
};

/**
 * Page-level join state for People source rows.
 * One batch `getMyPairUpsForSources` per loaded ID set. Rows must not mount
 * `useMyPairUpForSource`.
 */
export function usePeoplePairUpJoinState(sourcePostIds: string[]): {
  statusFor: (sourcePostId: string) => PeoplePairUpJoinStatus;
  join: (sourcePostId: string) => Promise<void>;
  leave: (sourcePostId: string) => Promise<void>;
} {
  const [joinMap, setJoinMap] = useState<Map<string, PairUpOpportunity | null>>(
    () => new Map()
  );
  const [userId, setUserId] = useState<string | null>(null);
  const orderedIdsRef = useRef<string[]>([]);
  /** IDs with a local write in flight; shared-cache echoes must not undo them. */
  const writingRef = useRef<Set<string>>(new Set());

  const stableIds = useMemo(() => {
    if (sourcePostIds.length === 0) {
      orderedIdsRef.current = [];
      return [];
    }
    const seen = new Set(orderedIdsRef.current);
    const next = [...orderedIdsRef.current];
    for (const raw of sourcePostIds) {
      const id = typeof raw === "string" ? raw.trim() : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    orderedIdsRef.current = next;
    return next;
  }, [sourcePostIds]);

  const idsKey = stableIds.join("|");

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || stableIds.length === 0) return;
    let cancelled = false;
    void getMyPairUpsForSources(stableIds)
      .then((batch) => {
        if (cancelled) return;
        setJoinMap((prev) => {
          const next = new Map(prev);
          for (const [id, opportunity] of batch) {
            next.set(id, opportunity);
          }
          return next;
        });
      })
      .catch(() => {
        /* Keep prior map; pending IDs stay pending. */
      });
    return () => {
      cancelled = true;
    };
  }, [userId, idsKey, stableIds]);

  /** Keep rows in step with joins/leaves made from the feed or post detail. */
  useEffect(() => {
    if (!userId) return;
    return subscribePairUpCache(() => {
      setJoinMap((prev) => {
        let next: Map<string, PairUpOpportunity | null> | null = null;
        for (const id of orderedIdsRef.current) {
          if (writingRef.current.has(id)) continue;
          const cached = getCachedPairUp(userId, id);
          if (cached === undefined) continue;
          const current = prev.get(id);
          if (current === cached) continue;
          if (Boolean(current) === Boolean(cached) && current !== undefined) {
            continue;
          }
          next = next ?? new Map(prev);
          next.set(id, cached);
        }
        return next ?? prev;
      });
    });
  }, [userId]);

  const statusFor = useCallback(
    (sourcePostId: string): PeoplePairUpJoinStatus => {
      const value = joinMap.get(sourcePostId);
      if (value === undefined) return "pending";
      return value ? "joined" : "idle";
    },
    [joinMap]
  );

  const join = useCallback(
    async (sourcePostId: string) => {
      if (!userId) throw new Error("Not authenticated");
      const previous = joinMap.get(sourcePostId) ?? null;
      const optimistic: PairUpOpportunity = {
        ...OPTIMISTIC_JOIN,
        source_post_id: sourcePostId,
        created_at: new Date().toISOString(),
      };
      setJoinMap((prev) => {
        const next = new Map(prev);
        next.set(sourcePostId, optimistic);
        return next;
      });
      writingRef.current.add(sourcePostId);
      try {
        const next = await joinPairUp(sourcePostId);
        setJoinMap((prev) => {
          const map = new Map(prev);
          map.set(sourcePostId, next);
          return map;
        });
      } catch (err) {
        setJoinMap((prev) => {
          const map = new Map(prev);
          map.set(sourcePostId, previous);
          return map;
        });
        setCachedPairUp(userId, sourcePostId, previous);
        throw err;
      } finally {
        writingRef.current.delete(sourcePostId);
      }
    },
    [userId, joinMap]
  );

  const leave = useCallback(
    async (sourcePostId: string) => {
      if (!userId) throw new Error("Not authenticated");
      const previous = joinMap.get(sourcePostId) ?? null;
      setJoinMap((prev) => {
        const next = new Map(prev);
        next.set(sourcePostId, null);
        return next;
      });
      writingRef.current.add(sourcePostId);
      try {
        await leavePairUp(sourcePostId);
      } catch (err) {
        setJoinMap((prev) => {
          const map = new Map(prev);
          map.set(sourcePostId, previous);
          return map;
        });
        setCachedPairUp(userId, sourcePostId, previous);
        throw err;
      } finally {
        writingRef.current.delete(sourcePostId);
      }
    },
    [userId, joinMap]
  );

  return { statusFor, join, leave };
}
