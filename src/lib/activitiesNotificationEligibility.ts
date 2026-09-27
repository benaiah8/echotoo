/**
 * M3C — Types that appear as Activities surface content and drive the
 * Messages Activities unread badge. Keep invite (Invites tab) and saved
 * (intentionally hidden) out of both visibility and activityUnread.
 *
 * Phase 3: obsolete Going RSVP (`type=rsvp` without invite-response fields)
 * is also hidden. Invitation accepted/declined reuse `type=rsvp` and stay visible.
 */

export type NotificationEligibilityInput = {
  type?: string | null;
  additional_data?: Record<string, unknown> | null;
};

function readAdditionalString(
  data: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!data) return "";
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

export function coerceNotificationAdditionalData(
  raw: unknown,
): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function isActivitiesSurfaceType(type: string): boolean {
  return type !== "invite" && type !== "saved";
}

/** Incoming invite row (`type=invite`) — Invites tab, never Going. */
export function isIncomingInviteNotification(
  notification: NotificationEligibilityInput,
): boolean {
  return notification.type === "invite";
}

/**
 * Invite acceptance/decline stored as `type=rsvp`.
 * Keep when `additional_data.status` is accepted/declined, or `invite_id` is present.
 */
export function isInviteResponseRsvpNotification(
  notification: NotificationEligibilityInput,
): boolean {
  if (notification.type !== "rsvp") return false;
  const status = readAdditionalString(notification.additional_data, "status");
  if (status === "accepted" || status === "declined") return true;
  return readAdditionalString(notification.additional_data, "invite_id").length > 0;
}

/**
 * Obsolete Going RSVP: `type=rsvp` without invite-response payload.
 * Going construction: `{ rsvp_status: "going" }` — no `invite_id`, no invitation `status`.
 */
export function isObsoleteGoingRsvpNotification(
  notification: NotificationEligibilityInput,
): boolean {
  if (notification.type !== "rsvp") return false;
  return !isInviteResponseRsvpNotification(notification);
}

/** Activity list / badge / attention: surface types minus obsolete Going. */
export function isActivitiesSurfaceNotification(
  notification: NotificationEligibilityInput,
): boolean {
  const type =
    typeof notification.type === "string" ? notification.type : "";
  if (!isActivitiesSurfaceType(type)) return false;
  return !isObsoleteGoingRsvpNotification({
    type,
    additional_data: notification.additional_data,
  });
}

/**
 * PostgREST OR: keep non-rsvp rows, or rsvp rows that are invite responses.
 * AND with the existing type exclusions (invite / saved).
 */
export const ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR =
  "type.neq.rsvp,additional_data->>status.in.(accepted,declined),additional_data->>invite_id.not.is.null";

/**
 * Foreground push: inbox `rsvp` or transport `activity_rsvp` without invite-response fields.
 */
export function isObsoleteGoingRsvpPushPayload(
  data: Record<string, unknown>,
): boolean {
  const type = String(data.type ?? "").trim();
  if (type !== "rsvp" && type !== "activity_rsvp") return false;
  const inviteId =
    readAdditionalString(data, "invite_id") ||
    readAdditionalString(data, "inviteId");
  return isObsoleteGoingRsvpNotification({
    type: "rsvp",
    additional_data: {
      status: data.status,
      invite_id: inviteId,
      rsvp_status: data.rsvp_status ?? data.rsvpStatus,
    },
  });
}
