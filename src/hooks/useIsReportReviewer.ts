import { useEffect, useState } from "react";
import { getCurrentUserIsReportReviewer } from "../api/services/reportReview";
import { supabase } from "../lib/supabaseClient";

let cachedReviewer: boolean | null = null;
let cachedForUserId: string | null = null;
let inflight: Promise<boolean> | null = null;

async function resolveIsReportReviewer(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id ?? null;

  if (!uid) {
    cachedReviewer = false;
    cachedForUserId = null;
    return false;
  }

  if (cachedForUserId === uid && cachedReviewer !== null) {
    return cachedReviewer;
  }

  if (inflight) {
    return inflight;
  }

  inflight = getCurrentUserIsReportReviewer()
    .then((ok) => {
      cachedReviewer = ok;
      cachedForUserId = uid;
      return ok;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Reset module cache on auth changes (called from hook subscription). */
export function clearReportReviewerCache(): void {
  cachedReviewer = null;
  cachedForUserId = null;
  inflight = null;
}

/**
 * Shared reviewer flag for admin UI. Dedupes concurrent lookups across PostMenu instances.
 */
export function useIsReportReviewer(): {
  isReportReviewer: boolean;
  loading: boolean;
} {
  const [isReportReviewer, setIsReportReviewer] = useState(
    () => cachedReviewer ?? false
  );
  const [loading, setLoading] = useState(cachedReviewer === null);

  useEffect(() => {
    let cancelled = false;

    void resolveIsReportReviewer().then((ok) => {
      if (!cancelled) {
        setIsReportReviewer(ok);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      clearReportReviewerCache();
      if (cancelled) return;
      setLoading(true);
      void resolveIsReportReviewer().then((ok) => {
        if (!cancelled) {
          setIsReportReviewer(ok);
          setLoading(false);
        }
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isReportReviewer, loading };
}
