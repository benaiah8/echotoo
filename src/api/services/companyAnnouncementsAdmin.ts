import { supabase } from "../../lib/supabaseClient";
import type {
  CompanyAnnouncementAdminRow,
  CompanyAnnouncementAdminSaveInput,
} from "../../types/companyAnnouncement";

const SELECT_COLS =
  "id,title,message,is_active,starts_at,expires_at,created_by,created_at,updated_at";

function normalizeAdminRow(
  raw: Record<string, unknown>
): CompanyAnnouncementAdminRow {
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    message: String(raw.message ?? ""),
    is_active: Boolean(raw.is_active),
    starts_at:
      raw.starts_at == null || raw.starts_at === ""
        ? null
        : String(raw.starts_at),
    expires_at:
      raw.expires_at == null || raw.expires_at === ""
        ? null
        : String(raw.expires_at),
    created_by: (raw.created_by as string | null) ?? null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

/** Recent company announcements (RLS: report reviewers only). */
export async function listCompanyAnnouncementsAdmin(
  limit = 50
): Promise<CompanyAnnouncementAdminRow[]> {
  const { data, error } = await supabase
    .from("company_announcements")
    .select(SELECT_COLS)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) throw error;
  return (data ?? []).map((row) =>
    normalizeAdminRow(row as Record<string, unknown>)
  );
}

export async function createCompanyAnnouncementAdmin(
  input: CompanyAnnouncementAdminSaveInput
): Promise<CompanyAnnouncementAdminRow> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id ?? null;

  const { data, error } = await supabase
    .from("company_announcements")
    .insert({
      title: input.title.trim(),
      message: input.message.trim(),
      is_active: !!input.is_active,
      starts_at: input.starts_at,
      expires_at: input.expires_at,
      created_by: uid,
    })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return normalizeAdminRow(data as Record<string, unknown>);
}

export async function updateCompanyAnnouncementAdmin(
  id: string,
  input: CompanyAnnouncementAdminSaveInput
): Promise<CompanyAnnouncementAdminRow> {
  const { data, error } = await supabase
    .from("company_announcements")
    .update({
      title: input.title.trim(),
      message: input.message.trim(),
      is_active: !!input.is_active,
      starts_at: input.starts_at,
      expires_at: input.expires_at,
    })
    .eq("id", id)
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return normalizeAdminRow(data as Record<string, unknown>);
}

export function validateCompanyAnnouncementAdminSave(
  input: CompanyAnnouncementAdminSaveInput
): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (!input.message.trim()) return "Message is required.";
  if (input.starts_at && input.expires_at) {
    const a = Date.parse(input.starts_at);
    const b = Date.parse(input.expires_at);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= b) {
      return "starts_at must be before expires_at.";
    }
  }
  return null;
}

/** Parse datetime-local value to ISO, or null if empty. */
export function companyAnnouncementLocalInputToIso(
  localValue: string
): string | null {
  const t = localValue.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** ISO → datetime-local string for inputs. */
export function companyAnnouncementIsoToLocalInput(
  iso: string | null
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
