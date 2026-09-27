import type { FeedItem } from "../api/queries/getPublicFeed";
import { seedPairUpJoinFromSnapshot } from "./pairUpJoinStore";
import { seedOpenPlanOwnFromSnapshot } from "./openPlanOwnStore";
import { seedGroupUpOwnFromSnapshot } from "./groupUpOwnStore";
import { seedGroupUpCountFromSnapshot } from "./groupUpCountStore";
import { readSocialActionLastUserId } from "./socialActionPersistCache";

export type SocialSnapshotFeedFields = {
  id: string;
  type?: "experience" | "hangout" | string | null;
  duo_own_active?: boolean | null;
  group_own_active?: boolean | null;
  discoverable_group_count?: number | null;
};

function resolveViewerId(explicit?: string | null): string | null {
  if (typeof explicit === "string" && explicit) return explicit;
  return readSocialActionLastUserId();
}

/**
 * Seed canonical Duo/Group stores from Feed/Detail compact snapshot fields.
 * Missing fields (old cache) are skipped — UNKNOWN stays UNKNOWN.
 * Known booleans/counts write memory + persist mirror and mark soft-revalidate.
 */
export function seedSocialActionsFromFeedItems(
  items: readonly SocialSnapshotFeedFields[] | null | undefined,
  viewerUserId?: string | null
): void {
  if (!items?.length) return;
  const viewer = resolveViewerId(viewerUserId ?? null);
  if (!viewer) return;

  for (const item of items) {
    const postId = item?.id;
    if (!postId) continue;
    const postType = item.type === "experience" || item.type === "hangout"
      ? item.type
      : null;

    if (typeof item.duo_own_active === "boolean") {
      if (postType === "experience") {
        seedOpenPlanOwnFromSnapshot(viewer, postId, item.duo_own_active);
      } else if (postType === "hangout") {
        seedPairUpJoinFromSnapshot(viewer, postId, item.duo_own_active);
      }
    }

    if (typeof item.group_own_active === "boolean") {
      seedGroupUpOwnFromSnapshot(viewer, postId, item.group_own_active);
    }

    if (
      typeof item.discoverable_group_count === "number" &&
      Number.isFinite(item.discoverable_group_count)
    ) {
      seedGroupUpCountFromSnapshot(
        viewer,
        postId,
        Math.max(0, Math.floor(item.discoverable_group_count))
      );
    }
  }
}

/** Convenience for a single Detail/Feed item. */
export function seedSocialActionsFromFeedItem(
  item: SocialSnapshotFeedFields | FeedItem | null | undefined,
  viewerUserId?: string | null
): void {
  if (!item) return;
  seedSocialActionsFromFeedItems([item], viewerUserId);
}
