/**
 * Pure active-window + unread helpers mirroring
 * public.get_company_announcements_runtime SQL rules.
 * Used by tests and any client-side filtering/preview.
 */

export type CompanyAnnouncementActiveInput = {
  id: string;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  is_seen?: boolean;
};

export function isCompanyAnnouncementActiveAt(
  row: Pick<
    CompanyAnnouncementActiveInput,
    "is_active" | "starts_at" | "expires_at"
  >,
  nowMs: number = Date.now()
): boolean {
  if (!row.is_active) return false;
  if (row.starts_at) {
    const start = Date.parse(row.starts_at);
    if (!Number.isFinite(start) || start > nowMs) return false;
  }
  if (row.expires_at) {
    const exp = Date.parse(row.expires_at);
    if (!Number.isFinite(exp) || exp <= nowMs) return false;
  }
  return true;
}

/** Newest first, bounded — matches runtime LIMIT 5. */
export function selectActiveCompanyAnnouncements<
  T extends CompanyAnnouncementActiveInput
>(rows: T[], nowMs: number = Date.now(), limit = 5): T[] {
  return rows
    .filter((r) => isCompanyAnnouncementActiveAt(r, nowMs))
    .slice()
    .sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || 0
    )
    .slice(0, limit);
}

export function companyAnnouncementsHaveUnread(
  items: Array<{ is_seen: boolean }>
): boolean {
  return items.some((i) => !i.is_seen);
}

/** Patch is_seen for given ids (local cache after successful mark-seen). */
export function patchCompanyAnnouncementsSeen<
  T extends { id: string; is_seen: boolean }
>(items: T[], seenIds: string[]): T[] {
  if (!seenIds.length) return items;
  const set = new Set(seenIds);
  return items.map((item) =>
    set.has(item.id) ? { ...item, is_seen: true } : item
  );
}
