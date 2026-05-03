import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../app/store";
import {
  startPostEngagementRealtime,
  stopPostEngagementRealtime,
} from "../lib/postEngagementRealtime";

/**
 * Mounts central post engagement Realtime sync when an authenticated user exists.
 */
export default function PostEngagementRealtimeMount() {
  const userId = useSelector((s: RootState) => s.auth.user?.id);

  useEffect(() => {
    if (!userId) {
      stopPostEngagementRealtime();
      return;
    }
    startPostEngagementRealtime(userId);
    return () => {
      stopPostEngagementRealtime();
    };
  }, [userId]);

  return null;
}
