/**
 * Frontend notification kind constants (Layer C transport + in-app banner).
 * Not yet mirrored in the notifications DB CHECK constraint.
 */

export const NOTIFICATION_KINDS = {
  INVITE: "invite",
  FOLLOWED_POST: "followed_post",
  EVENT_REMINDER: "event_reminder",
  ADMIN_CAMPAIGN: "admin_campaign",
  DM_MESSAGE: "dm_message",
  GROUP_MESSAGE: "group_message",
  ACTIVITY_LIKE: "activity_like",
  ACTIVITY_COMMENT: "activity_comment",
  ACTIVITY_FOLLOW: "activity_follow",
  ACTIVITY_RSVP: "activity_rsvp",
} as const;

export type NotificationKind =
  (typeof NOTIFICATION_KINDS)[keyof typeof NOTIFICATION_KINDS];

/** Maps inbox `notifications.type` values to transport kinds where applicable. */
export const INBOX_TYPE_TO_KIND: Partial<
  Record<string, NotificationKind>
> = {
  invite: NOTIFICATION_KINDS.INVITE,
  post: NOTIFICATION_KINDS.FOLLOWED_POST,
  like: NOTIFICATION_KINDS.ACTIVITY_LIKE,
  comment: NOTIFICATION_KINDS.ACTIVITY_COMMENT,
  follow: NOTIFICATION_KINDS.ACTIVITY_FOLLOW,
  rsvp: NOTIFICATION_KINDS.ACTIVITY_RSVP,
};

export type NotificationKindMeta = {
  /** Can resolve to an in-app route today */
  routable: boolean;
  /** Intended to use native push when backgrounded */
  pushCapable: boolean;
  /** Show in-app banner when foregrounded */
  bannerCapable: boolean;
};

export const NOTIFICATION_KIND_META: Record<
  NotificationKind,
  NotificationKindMeta
> = {
  [NOTIFICATION_KINDS.INVITE]: {
    routable: true,
    pushCapable: true,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.FOLLOWED_POST]: {
    routable: true,
    pushCapable: true,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.EVENT_REMINDER]: {
    routable: true,
    pushCapable: true,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.ADMIN_CAMPAIGN]: {
    routable: true,
    pushCapable: true,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.DM_MESSAGE]: {
    routable: false,
    pushCapable: true,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.GROUP_MESSAGE]: {
    routable: false,
    pushCapable: true,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.ACTIVITY_LIKE]: {
    routable: true,
    pushCapable: false,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.ACTIVITY_COMMENT]: {
    routable: true,
    pushCapable: false,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.ACTIVITY_FOLLOW]: {
    routable: true,
    pushCapable: false,
    bannerCapable: true,
  },
  [NOTIFICATION_KINDS.ACTIVITY_RSVP]: {
    routable: true,
    pushCapable: false,
    bannerCapable: true,
  },
};

export function normalizeNotificationKind(
  raw: unknown
): NotificationKind | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  const values = Object.values(NOTIFICATION_KINDS) as string[];
  if (values.includes(t)) return t as NotificationKind;
  if (t === "post") return NOTIFICATION_KINDS.FOLLOWED_POST;
  return null;
}
