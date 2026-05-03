import { supabase } from "../../lib/supabaseClient";
import type { ReportQueueRow, ReportQueueStatus } from "../../types/reportReview";

const REPORT_SELECT =
  "id,created_at,report_kind,reason,details,status,target_post_id,target_profile_id,target_owner_user_id,target_owner_profile_id,post_type,reporter_user_id,reviewed_at,reviewed_by_user_id";

/**
 * Whether the signed-in user is in `public.report_reviewers` (RLS: self-read).
 */
export async function getCurrentUserIsReportReviewer(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return false;

  const { data, error } = await supabase
    .from("report_reviewers")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    console.error("[reportReview] report_reviewers lookup", error);
    return false;
  }
  return !!data?.user_id;
}

/**
 * List reports visible to the current reviewer (RLS on `public.reports`).
 */
export async function listReportsForReview(
  limit = 100
): Promise<ReportQueueRow[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ReportQueueRow[];
}

export async function updateReportQueueStatus(
  reportId: string,
  status: ReportQueueStatus
): Promise<void> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const uid = session?.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("reports")
    .update({
      status,
      reviewed_at: now,
      reviewed_by_user_id: uid,
    })
    .eq("id", reportId);

  if (error) throw error;
}
