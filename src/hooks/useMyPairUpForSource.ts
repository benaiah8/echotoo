import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  getMyPairUpForSource,
  joinPairUp,
  leavePairUp,
} from "../api/services/pairUp";
import type { PairUpOpportunity } from "../lib/people/types";
import { getCachedPairUp, setCachedPairUp } from "../lib/pairUpCache";

export function useMyPairUpForSource(postId: string | null): {
  opportunity: PairUpOpportunity | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  join: (description?: string | null) => Promise<void>;
  leave: () => Promise<void>;
} {
  const [opportunity, setOpportunity] = useState<PairUpOpportunity | null>(null);
  const [loading, setLoading] = useState(Boolean(postId));
  const [error, setError] = useState<Error | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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

  const refresh = useCallback(async () => {
    if (!postId || !userId) {
      setOpportunity(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getMyPairUpForSource(postId);
      setOpportunity(next);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setOpportunity(null);
    } finally {
      setLoading(false);
    }
  }, [postId, userId]);

  useEffect(() => {
    if (!postId || !userId) {
      setOpportunity(null);
      setLoading(false);
      return;
    }
    const cached = getCachedPairUp(userId, postId);
    if (cached !== undefined) {
      setOpportunity(cached);
      setLoading(false);
    }
    void refresh();
  }, [postId, userId, refresh]);

  const join = useCallback(
    async (description?: string | null) => {
      if (!postId || !userId) throw new Error("Not authenticated");
      const previous = opportunity;
      setError(null);
      setOpportunity((prev) =>
        prev ?? {
          id: "optimistic",
          source_post_id: postId,
          status: "active",
          description: description?.trim() || null,
          discoverable_until: "",
          created_at: new Date().toISOString(),
        }
      );
      try {
        const next = await joinPairUp(postId, description);
        setOpportunity(next);
      } catch (err) {
        setOpportunity(previous);
        if (userId) setCachedPairUp(userId, postId, previous);
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [postId, userId, opportunity]
  );

  const leave = useCallback(async () => {
    if (!postId || !userId) throw new Error("Not authenticated");
    const previous = opportunity;
    setError(null);
    setOpportunity(null);
    try {
      await leavePairUp(postId);
    } catch (err) {
      setOpportunity(previous);
      if (userId) setCachedPairUp(userId, postId, previous);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [postId, userId, opportunity]);

  return { opportunity, loading, error, refresh, join, leave };
}
