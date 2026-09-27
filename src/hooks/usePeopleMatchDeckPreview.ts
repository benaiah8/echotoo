import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { listPairUpCandidatesPreview } from "../api/services/pairUp";
import type { PairUpCandidate } from "../lib/people/types";
import { getCachedAvatar } from "../lib/avatarCache";
import { getCachedPairUpDeckPreview } from "../lib/pairUpCache";

export type MatchDeckViewer = {
  userId: string | null;
  avatarUrl: string | null;
  displayName: string | null;
};

function readLocalViewer(userId: string | null): MatchDeckViewer {
  const avatarUrl =
    (userId ? getCachedAvatar(userId) : null) ||
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("my_avatar_url")
      : null);
  const displayName =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("my_display_name")
      : null;
  return {
    userId,
    avatarUrl: avatarUrl || null,
    displayName,
  };
}

/**
 * People-tab Match Deck preview only. Does not mount usePairUpCandidates.
 * Fetches at most 2 candidates while the People tab is active.
 */
export function usePeopleMatchDeckPreview(args: {
  active: boolean;
  epoch: number;
}): {
  candidates: PairUpCandidate[];
  viewer: MatchDeckViewer;
  hasCandidates: boolean;
} {
  const { active, epoch } = args;
  const [userId, setUserId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PairUpCandidate[]>([]);
  const [viewer, setViewer] = useState<MatchDeckViewer>(() =>
    readLocalViewer(null)
  );
  const lastEpochRef = useRef<number | null>(null);

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

  const hydrateViewer = useCallback(async (id: string | null) => {
    const local = readLocalViewer(id);
    setViewer(local);
    if (!id) return;
    if (local.avatarUrl && local.displayName) return;
    try {
      const { getProfileByUserId } = await import("../api/services/follows");
      const profile = await getProfileByUserId(id);
      if (!profile) return;
      setViewer({
        userId: id,
        avatarUrl: profile.avatar_url ?? local.avatarUrl,
        displayName: profile.display_name ?? local.displayName,
      });
    } catch {
      /* Keep local viewer. */
    }
  }, []);

  useEffect(() => {
    void hydrateViewer(userId);
  }, [userId, hydrateViewer]);

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    const force = lastEpochRef.current !== null && lastEpochRef.current !== epoch;
    lastEpochRef.current = epoch;

    if (!force) {
      const cached = getCachedPairUpDeckPreview(userId);
      if (cached) {
        setCandidates(cached.candidates);
        return;
      }
    }

    void listPairUpCandidatesPreview({ force })
      .then((page) => {
        if (!cancelled) setCandidates(page.candidates);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [active, userId, epoch]);

  return {
    candidates,
    viewer,
    hasCandidates: candidates.length > 0,
  };
}
