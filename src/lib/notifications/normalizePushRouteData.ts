/**
 * Normalize FCM/Capacitor push data into a flat string-key record for routing + display.
 * Preserves all known route fields; coerces values to trimmed strings.
 */

const ROUTE_KEY_ALIASES: Record<string, string> = {
  post_id: "postId",
  post_type: "postType",
  invite_id: "inviteId",
  thread_id: "threadId",
  thread_kind: "threadKind",
  actor_id: "actorId",
  actor_username: "actorUsername",
  avatar_url: "avatarUrl",
  conversation_id: "conversationId",
  message_id: "messageId",
  sender_user_id: "senderUserId",
  sender_id: "senderId",
  sender_name: "senderName",
  sender_display_name: "senderDisplayName",
  group_name: "groupName",
  message_preview: "body",
  preview: "body",
  occurrence_date: "occurrenceDate",
  target_path: "targetPath",
  request_id: "requestId",
  opportunity_id: "opportunityId",
  source_post_id: "sourcePostId",
};

function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function assignNormalized(
  out: Record<string, string>,
  key: string,
  value: unknown
): void {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return;
  out[key] = trimmed;
  const alias = ROUTE_KEY_ALIASES[key.toLowerCase()];
  if (alias && !out[alias]) {
    out[alias] = trimmed;
  }
}

function flattenRecord(
  raw: Record<string, unknown>,
  out: Record<string, string>
): void {
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      if (key === "notification") {
        const n = value as { title?: unknown; body?: unknown; data?: unknown };
        assignNormalized(out, "title", n.title);
        assignNormalized(out, "body", n.body);
        if (
          n.data &&
          typeof n.data === "object" &&
          !Array.isArray(n.data)
        ) {
          flattenRecord(n.data as Record<string, unknown>, out);
        }
      }
      continue;
    }
    assignNormalized(out, key, value);
  }
}

/**
 * Merge notification block title/body without overwriting existing data fields.
 */
export function mergePushDisplayFields(
  data: Record<string, string>,
  notification?: { title?: string; body?: string } | null
): Record<string, string> {
  const merged = { ...data };
  if (notification?.title && !merged.title) {
    merged.title = notification.title.trim();
  }
  if (notification?.body && !merged.body) {
    merged.body = notification.body.trim();
  }
  return merged;
}

/**
 * Extract route + display fields from a Capacitor foreground push event or raw data map.
 */
export function normalizePushRouteData(
  raw: unknown,
  notification?: { title?: string; body?: string } | null
): Record<string, string> {
  const out: Record<string, string> = {};

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    flattenRecord(raw as Record<string, unknown>, out);
  }

  if (out.senderUserId && !out.senderId) {
    out.senderId = out.senderUserId;
  }
  if (out.senderDisplayName && !out.senderName) {
    out.senderName = out.senderDisplayName;
  }

  return mergePushDisplayFields(out, notification);
}

/** DEV-only: keys safe to log (no values). */
export function pushRouteDataKeyMeta(data: Record<string, string>): {
  keys: string[];
  hasType: boolean;
  hasPostId: boolean;
  hasPostType: boolean;
  hasInviteId: boolean;
  hasThreadId: boolean;
  hasConversationId: boolean;
  hasMessageId: boolean;
  hasTargetPath: boolean;
} {
  const keys = Object.keys(data);
  return {
    keys,
    hasType: Boolean(data.type),
    hasPostId: Boolean(data.postId),
    hasPostType: Boolean(data.postType),
    hasInviteId: Boolean(data.inviteId),
    hasThreadId: Boolean(data.threadId),
    hasConversationId: Boolean(data.conversationId),
    hasMessageId: Boolean(data.messageId),
    hasTargetPath: Boolean(data.targetPath),
  };
}
