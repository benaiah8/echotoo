/**
 * Client-side recency buckets for Activity feed (no per-bucket queries).
 */

export type NotificationRecencyBucket =
  | "today"
  | "yesterday"
  | "last7"
  | "earlier";

export const NOTIFICATION_RECENCY_LABELS: Record<
  NotificationRecencyBucket,
  string
> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  earlier: "Earlier",
};

const BUCKET_ORDER: NotificationRecencyBucket[] = [
  "today",
  "yesterday",
  "last7",
  "earlier",
];

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function notificationRecencyBucket(
  createdAt: string,
  nowMs: number = Date.now()
): NotificationRecencyBucket {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return "earlier";

  const now = new Date(nowMs);
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const last7Start = todayStart - 6 * 24 * 60 * 60 * 1000;

  if (t >= todayStart) return "today";
  if (t >= yesterdayStart) return "yesterday";
  if (t >= last7Start) return "last7";
  return "earlier";
}

export type RecencyGroupedNotifications<T extends { created_at: string }> = {
  bucket: NotificationRecencyBucket;
  label: string;
  items: T[];
};

/**
 * Groups already-loaded notifications by local calendar recency.
 * Preserves relative order within each bucket (caller should pass desc by created_at).
 */
export function groupNotificationsByRecency<T extends { created_at: string }>(
  items: T[],
  nowMs: number = Date.now()
): RecencyGroupedNotifications<T>[] {
  const buckets: Record<NotificationRecencyBucket, T[]> = {
    today: [],
    yesterday: [],
    last7: [],
    earlier: [],
  };

  for (const item of items) {
    buckets[notificationRecencyBucket(item.created_at, nowMs)].push(item);
  }

  return BUCKET_ORDER.filter((b) => buckets[b].length > 0).map((bucket) => ({
    bucket,
    label: NOTIFICATION_RECENCY_LABELS[bucket],
    items: buckets[bucket],
  }));
}
