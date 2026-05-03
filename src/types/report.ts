import type { FeedItem } from "../api/queries/getPublicFeed";
import type { Profile } from "../contexts/ProfileContext";

/**
 * Reason codes sent to `submit_report` — must stay in sync with DB CHECK / RPC validation.
 */
export type PostReportReasonCode =
  | "spam"
  | "inappropriate_content"
  | "harassment"
  | "false_information"
  | "other";

export type ReportDraft =
  | {
      reportKind: "post";
      targetPostId: string;
      targetOwnerUserId: string;
      targetOwnerProfileId: string | null;
      postType: "experience" | "hangout";
    }
  | {
      reportKind: "profile";
      /** `profiles.id` — reported profile row */
      targetProfileId: string;
      /** `profiles.user_id` — auth user id for that profile (not sent on RPC; server derives if needed) */
      targetOwnerUserId: string;
    };

export function buildPostReportDraftFromFeedItem(post: FeedItem): ReportDraft {
  return {
    reportKind: "post",
    targetPostId: post.id,
    targetOwnerUserId: post.author_id,
    targetOwnerProfileId: post.author?.id ?? null,
    postType: post.type,
  };
}

export function buildProfileReportDraftFromProfile(
  profile: Pick<Profile, "id" | "user_id">
): Extract<ReportDraft, { reportKind: "profile" }> {
  return {
    reportKind: "profile",
    targetProfileId: profile.id,
    targetOwnerUserId: profile.user_id,
  };
}
