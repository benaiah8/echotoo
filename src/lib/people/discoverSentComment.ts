/**
 * Discover-only sent comments for the current page session.
 * Cleared with Discover candidate retention. Not written to storage.
 */
import type { PostScheduleLabelKind } from "../postScheduleLabel";
import type { ProfileIdentityMediaSource } from "../profileIdentityMedia";

export type DiscoverSentComment = {
  opportunityId: string;
  sourcePostId: string;
  recipientUserId: string;
  body: string;
  displayName: string;
  identitySource: ProfileIdentityMediaSource;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind: PostScheduleLabelKind | null;
  sourceType: "hangout" | "experience" | null;
};

const sentByOpportunity = new Map<string, DiscoverSentComment>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeDiscoverSentComments(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDiscoverSentComment(
  opportunityId: string
): DiscoverSentComment | null {
  return sentByOpportunity.get(opportunityId) ?? null;
}

export function recordDiscoverSentComment(comment: DiscoverSentComment): void {
  const opportunityId = comment.opportunityId.trim();
  const body = comment.body.trim();
  const sourcePostId = comment.sourcePostId.trim();
  if (!opportunityId || !body || !sourcePostId) return;
  sentByOpportunity.set(opportunityId, {
    ...comment,
    opportunityId,
    sourcePostId,
    body,
  });
  emit();
}

export function clearDiscoverSentComments(): void {
  if (sentByOpportunity.size === 0) return;
  sentByOpportunity.clear();
  emit();
}

/** Newly created Discover delivery with a stored body. Retries do not qualify. */
export function shouldRecordDiscoverSentComment(input: {
  surface: string;
  created: boolean;
  body: string;
}): boolean {
  return input.surface === "discover" && input.created && input.body.trim().length > 0;
}
