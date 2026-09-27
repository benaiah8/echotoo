import { useSelector } from "react-redux";
import { useMessagesActivitiesAttention } from "../hooks/useMessagesActivitiesAttention";
import type { RootState } from "../app/store";

/**
 * Always-on Activities attention seed + INSERT channel. Null render.
 */
export default function MessagesActivitiesAttentionMount() {
  const userId = useSelector((s: RootState) => s.auth.user?.id ?? null);
  useMessagesActivitiesAttention(userId);
  return null;
}
