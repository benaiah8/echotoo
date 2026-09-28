/**
 * Own Profile social-rail + Post Detail sync after Duo/Group host mutations.
 * Narrow patches only — no full Profile refetch.
 */

import { invalidatePostDetailCache } from "../api/queries/getPostById";
import {
  invalidateProfileSocialOpportunities,
  markProfileSocialOpportunitiesSoftStale,
  removeCachedProfileSocialOpportunitySide,
} from "./profileSocialOpportunityCache";

/** After own Duo leave — clear Duo side, soft-revalidate rail, bust Detail. */
export function syncCachesAfterOwnDuoLeave(
  viewerUserId: string,
  sourcePostId: string,
  opportunityId?: string | null
): void {
  if (!viewerUserId || !sourcePostId) return;
  removeCachedProfileSocialOpportunitySide(viewerUserId, viewerUserId, {
    side: "duo",
    sourcePostId,
    opportunityId: opportunityId ?? null,
  });
  markProfileSocialOpportunitiesSoftStale(viewerUserId, viewerUserId);
  invalidatePostDetailCache(sourcePostId);
}

/** After own Duo join/create — Detail bust + Own rail revalidate (no fabricated row). */
export function syncCachesAfterOwnDuoActivate(
  viewerUserId: string,
  sourcePostId: string
): void {
  if (!viewerUserId || !sourcePostId) return;
  invalidateProfileSocialOpportunities(viewerUserId, viewerUserId);
  invalidatePostDetailCache(sourcePostId);
}

/** After hosted Group cancel — clear Group side only. */
export function syncCachesAfterOwnGroupCancel(
  viewerUserId: string,
  sourcePostId: string,
  opportunityId: string
): void {
  if (!viewerUserId || !sourcePostId || !opportunityId) return;
  removeCachedProfileSocialOpportunitySide(viewerUserId, viewerUserId, {
    side: "group",
    sourcePostId,
    opportunityId,
  });
  markProfileSocialOpportunitiesSoftStale(viewerUserId, viewerUserId);
  invalidatePostDetailCache(sourcePostId);
}

/** After hosted Group create — Own rail revalidate + Detail bust. */
export function syncCachesAfterOwnGroupCreate(
  viewerUserId: string,
  sourcePostId: string
): void {
  if (!viewerUserId || !sourcePostId) return;
  invalidateProfileSocialOpportunities(viewerUserId, viewerUserId);
  invalidatePostDetailCache(sourcePostId);
}
