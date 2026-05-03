/** Row shape for `public.reports` reviewer queue (RLS-filtered). */
export type ReportQueueRow = {
  id: string;
  created_at: string;
  report_kind: string;
  reason: string;
  details: string | null;
  status: string;
  target_post_id: string | null;
  target_profile_id: string | null;
  target_owner_user_id: string | null;
  target_owner_profile_id: string | null;
  post_type: string | null;
  reporter_user_id: string;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
};

export type ReportQueueStatus = "open" | "triaged" | "closed";
