/**
 * Support/contact configuration for Play Store compliance.
 * Used for Report post, Report user, and Help & Support flows.
 */
export const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL || "support@echotoo.com";

export function getReportPostMailto(postId: string, postType?: string): string {
  const subject = encodeURIComponent(`Report Post - ${postId}`);
  const body = encodeURIComponent(
    `I would like to report this ${
      postType || "post"
    }.\n\nPost ID: ${postId}\n\nPlease describe the issue:\n`
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export function getReportUserMailto(
  profileId: string,
  username?: string
): string {
  const subject = encodeURIComponent(`Report User - @${username || profileId}`);
  const body = encodeURIComponent(
    `I would like to report this user.\n\nUser ID: ${profileId}\nUsername: @${
      username || "unknown"
    }\n\nPlease describe the issue:\n`
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export function getSupportMailto(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "Echotoo Support Request"
  )}`;
}

export function getAccountDeletionMailto(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "Account Deletion Request"
  )}`;
}
