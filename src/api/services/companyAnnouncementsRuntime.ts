import { supabase } from "../../lib/supabaseClient";
import type { CompanyAnnouncementRuntimeItem } from "../../types/companyAnnouncement";

function normalizeRuntimeRow(
  raw: Record<string, unknown>
): CompanyAnnouncementRuntimeItem | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  return {
    id,
    title: String(raw.title ?? "").trim(),
    message: String(raw.message ?? "").trim(),
    starts_at:
      raw.starts_at == null || raw.starts_at === ""
        ? null
        : String(raw.starts_at),
    expires_at:
      raw.expires_at == null || raw.expires_at === ""
        ? null
        : String(raw.expires_at),
    created_at: String(raw.created_at ?? ""),
    is_seen: Boolean(raw.is_seen),
  };
}

/**
 * Bounded active company announcements + is_seen for the current session user.
 * RPC: public.get_company_announcements_runtime()
 */
export async function fetchCompanyAnnouncementsRuntime(): Promise<
  CompanyAnnouncementRuntimeItem[]
> {
  const { data, error } = await supabase.rpc(
    "get_company_announcements_runtime"
  );

  if (error) {
    console.warn("[companyAnnouncementsRuntime] get", error.message);
    throw error;
  }

  if (data == null) return [];
  const rows = Array.isArray(data) ? data : [data];
  const out: CompanyAnnouncementRuntimeItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const n = normalizeRuntimeRow(row as Record<string, unknown>);
    if (n) out.push(n);
  }
  return out;
}

/**
 * Batch mark-seen. Idempotent. Only marks IDs that exist server-side.
 * RPC: public.mark_company_announcements_seen(p_ids)
 */
export async function markCompanyAnnouncementsSeen(
  announcementIds: string[]
): Promise<void> {
  const ids = [
    ...new Set(
      announcementIds.map((id) => id.trim()).filter(Boolean)
    ),
  ].slice(0, 5);

  if (!ids.length) return;

  const { error } = await supabase.rpc("mark_company_announcements_seen", {
    p_ids: ids,
  });

  if (error) {
    console.warn("[companyAnnouncementsRuntime] mark seen", error.message);
    throw error;
  }
}
