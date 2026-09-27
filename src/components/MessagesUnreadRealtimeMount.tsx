import { useSelector } from "react-redux";
import { useMessagesUnreadRealtime } from "../hooks/useMessagesUnreadRealtime";
import type { RootState } from "../app/store";

/**
 * Always-on viewer member-unread channel + seed. Null render.
 */
export default function MessagesUnreadRealtimeMount() {
  const userId = useSelector((s: RootState) => s.auth.user?.id ?? null);
  useMessagesUnreadRealtime(userId);
  return null;
}
