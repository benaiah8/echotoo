import { ENABLE_ADMIN_CAMPAIGN_PUSH_UI } from "../../lib/featureFlags";
import { supabase } from "../../lib/supabaseClient";

export type AdminCampaignPushParams = {
  title?: string;
  body?: string;
  postId?: string;
  postType?: "hangout" | "experience";
  recipientUserIds?: string[];
  dryRun?: boolean;
};

export type AdminCampaignPushResult = {
  ok?: boolean;
  dry_run?: boolean;
  recipientCount?: number;
  deviceCount?: number;
  capped?: boolean;
  postId?: string | null;
  postType?: string | null;
  title?: string;
  bodyPreview?: string;
  sent?: number;
  attempted?: number;
  skipped?: string;
  maxRecipients?: number;
  cooldownMinutes?: number;
  error?: string;
};

/**
 * Reviewer-gated broadcast via send-admin-campaign-push Edge (push-only).
 */
export async function invokeAdminCampaignPush(
  params: AdminCampaignPushParams
): Promise<AdminCampaignPushResult> {
  if (!ENABLE_ADMIN_CAMPAIGN_PUSH_UI) {
    return { error: "Admin campaign push is not enabled" };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase.functions.invoke(
    "send-admin-campaign-push",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        title: params.title,
        body: params.body,
        post_id: params.postId,
        dry_run: params.dryRun === true,
        ...(params.recipientUserIds?.length
          ? { recipient_user_ids: params.recipientUserIds }
          : {}),
      },
    }
  );

  if (error) {
    const payload = (data ?? {}) as AdminCampaignPushResult;
    return {
      ...payload,
      error: payload.error || error.message,
    };
  }

  return (data ?? {}) as AdminCampaignPushResult;
}
