/**
 * App-level company announcements runtime: session bind, hydrate, visibility refresh.
 * Does not interact with AppUpdateRuntimeController, Activity, or Invites.
 */

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  bindCompanyAnnouncementViewer,
  clearCompanyAnnouncementStore,
  hydrateCompanyAnnouncements,
} from "../lib/companyAnnouncementStore";
import CompanyAnnouncementModal from "./CompanyAnnouncementModal";

const VISIBILITY_MIN_INTERVAL_MS = 120_000;

export default function CompanyAnnouncementRuntimeController() {
  const lastVisibilityHydrateRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const applySession = (userId: string | null) => {
      if (cancelled) return;
      if (!userId) {
        clearCompanyAnnouncementStore();
        return;
      }
      bindCompanyAnnouncementViewer(userId);
      void hydrateCompanyAnnouncements({ force: true });
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session?.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearCompanyAnnouncementStore();
        return;
      }
      applySession(session?.user?.id ?? null);
    });

    const onVisibility = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastVisibilityHydrateRef.current < VISIBILITY_MIN_INTERVAL_MS) {
        return;
      }
      lastVisibilityHydrateRef.current = now;
      void hydrateCompanyAnnouncements({
        force: false,
        minIntervalMs: VISIBILITY_MIN_INTERVAL_MS,
      });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <CompanyAnnouncementModal />;
}
