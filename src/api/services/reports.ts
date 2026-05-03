import { supabase } from "../../lib/supabaseClient";
import type { PostReportReasonCode } from "../../types/report";

export type SubmitPostReportInput = {
  targetPostId: string;
  targetOwnerProfileId: string | null;
  postType: "experience" | "hangout";
  reason: PostReportReasonCode;
  details: string | null;
};

export type SubmitProfileReportInput = {
  targetProfileId: string;
  /** `profiles.user_id` — aligns with DB semantics; not sent as a separate RPC arg (no param on deploy). */
  targetOwnerUserId: string;
  reason: PostReportReasonCode;
  details: string | null;
};

function normalizeReportDetails(details: string | null | undefined): string | null {
  const t = details?.trim();
  return t === "" || t == null ? null : t;
}

async function requireSessionUserId(): Promise<string> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

/**
 * Submits a post report via `public.submit_report` (SECURITY DEFINER).
 * Reporter identity must come from the session — not passed from the client.
 */
export async function submitPostReport(
  input: SubmitPostReportInput
): Promise<string> {
  await requireSessionUserId();

  const details = normalizeReportDetails(input.details);

  const rpcPayload = {
    p_report_kind: "post" as const,
    p_reason: input.reason,
    p_details: details,
    p_target_post_id: input.targetPostId,
    p_target_profile_id: null as null,
    p_target_owner_profile_id: input.targetOwnerProfileId ?? null,
    p_post_type: input.postType,
  };

  const { data, error } = await supabase.rpc("submit_report", rpcPayload);

  if (error) throw error;
  if (data == null || data === "") {
    throw new Error("submit_report returned no id");
  }
  return String(data);
}

/**
 * Submits a profile report via `public.submit_report` (same RPC, different kind).
 */
export async function submitProfileReport(
  input: SubmitProfileReportInput
): Promise<string> {
  await requireSessionUserId();

  if (!input.targetOwnerUserId?.trim()) {
    throw new Error("Missing profile owner id for report");
  }

  const details = normalizeReportDetails(input.details);

  const rpcPayload = {
    p_report_kind: "profile" as const,
    p_reason: input.reason,
    p_details: details,
    p_target_post_id: null as null,
    p_target_profile_id: input.targetProfileId,
    p_target_owner_profile_id: null as null,
    p_post_type: null as null,
  };

  const { data, error } = await supabase.rpc("submit_report", rpcPayload);

  if (error) throw error;
  if (data == null || data === "") {
    throw new Error("submit_report returned no id");
  }
  return String(data);
}
