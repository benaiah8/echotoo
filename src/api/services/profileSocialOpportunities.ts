/**
 * Profile social-opportunity read + Profile Connect RPC wrappers.
 * Post-centric list_profile_social_opportunities: one row per source_post.
 */

import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import type {
  PairUpDiscoverConnectResult,
  ProfileSocialDuoPayload,
  ProfileSocialGroupPayload,
  ProfileSocialOpportunitiesPage,
  ProfileSocialOpportunity,
} from "../../lib/people/types";
import {
  getCachedProfileSocialOpportunities,
  patchCachedProfileSocialOpportunity,
  setCachedProfileSocialOpportunities,
} from "../../lib/profileSocialOpportunityCache";
import {
  invalidatePairUpDeck,
  setCachedPairUp,
} from "../../lib/pairUpCache";
import { toPairUpRpcError } from "./pairUp";

/** Launch Profile rail preview hard cap (matches list_profile_social_opportunities LIMIT). */
export const PROFILE_SOCIAL_OPPORTUNITY_LIMIT = 8;

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : [];
}

function parseDuoPayload(raw: unknown): ProfileSocialDuoPayload | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.opportunity_id !== "string") return null;
  return {
    opportunity_id: row.opportunity_id,
    viewer_duo_joined: row.viewer_duo_joined === true,
  };
}

function parseGroupPayload(raw: unknown): ProfileSocialGroupPayload | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.opportunity_id !== "string") return null;
  const groupState = row.viewer_group_state;
  const viewerGroupState =
    groupState === "none" ||
    groupState === "pending" ||
    groupState === "member"
      ? groupState
      : null;
  return {
    opportunity_id: row.opportunity_id,
    group_title: typeof row.group_title === "string" ? row.group_title : null,
    occurs_at: typeof row.occurs_at === "string" ? row.occurs_at : null,
    occurs_time_explicit:
      typeof row.occurs_time_explicit === "boolean"
        ? row.occurs_time_explicit
        : null,
    viewer_group_state: viewerGroupState,
    request_id: typeof row.request_id === "string" ? row.request_id : null,
  };
}

/** Parse one post-centric Profile rail row. Exported for focused contract tests. */
export function parseProfileSocialOpportunity(
  raw: unknown
): ProfileSocialOpportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.source_post_id !== "string") return null;
  if (row.source_type !== "hangout" && row.source_type !== "experience") {
    return null;
  }
  if (typeof row.source_author_id !== "string") return null;
  if (typeof row.created_at !== "string") return null;

  const duo = parseDuoPayload(row.duo);
  const group = parseGroupPayload(row.group);
  if (!duo && !group) return null;

  return {
    source_post_id: row.source_post_id,
    source_type: row.source_type,
    source_caption:
      typeof row.source_caption === "string" ? row.source_caption : null,
    source_cover_url:
      typeof row.source_cover_url === "string" ? row.source_cover_url : null,
    source_author_id: row.source_author_id,
    source_author_profile_id:
      typeof row.source_author_profile_id === "string"
        ? row.source_author_profile_id
        : null,
    source_author_display_name:
      typeof row.source_author_display_name === "string"
        ? row.source_author_display_name
        : null,
    source_author_username:
      typeof row.source_author_username === "string"
        ? row.source_author_username
        : null,
    source_author_avatar_url:
      typeof row.source_author_avatar_url === "string"
        ? row.source_author_avatar_url
        : null,
    source_selected_dates: parseStringArray(row.source_selected_dates),
    source_recurrence_days: parseStringArray(row.source_recurrence_days),
    source_is_recurring:
      typeof row.source_is_recurring === "boolean"
        ? row.source_is_recurring
        : null,
    created_at: row.created_at,
    duo,
    group,
  };
}

function parsePage(data: unknown): ProfileSocialOpportunitiesPage {
  if (!data || typeof data !== "object") {
    return { opportunities: [] };
  }
  const rows = (data as { opportunities?: unknown }).opportunities;
  if (!Array.isArray(rows)) return { opportunities: [] };
  return {
    opportunities: rows
      .map(parseProfileSocialOpportunity)
      .filter((row): row is ProfileSocialOpportunity => row != null)
      .slice(0, PROFILE_SOCIAL_OPPORTUNITY_LIMIT),
  };
}

async function requireSessionUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

export async function listProfileSocialOpportunities(options: {
  profileUserId: string;
  force?: boolean;
}): Promise<ProfileSocialOpportunitiesPage> {
  const profileUserId = options.profileUserId?.trim();
  if (!profileUserId) return { opportunities: [] };

  const viewerUserId = await requireSessionUserId();
  const force = options.force === true;

  if (!force) {
    const cached = getCachedProfileSocialOpportunities(
      viewerUserId,
      profileUserId
    );
    if (cached) return cached;
  }

  const result = await requestManager.execute(
    `profile_social_opps:${viewerUserId}:${profileUserId}`,
    async () => {
      const { data, error } = await supabase.rpc(
        "list_profile_social_opportunities",
        { p_profile_user_id: profileUserId }
      );
      if (error) throw toPairUpRpcError(error);
      return parsePage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? { opportunities: [] };
  setCachedProfileSocialOpportunities(viewerUserId, profileUserId, page);
  return page;
}

/**
 * Atomic Profile Connect. Does not require viewer Discover ON.
 * Prefer expressPairUpInterest when viewer_duo_joined is already true.
 *
 * Pass profileOwnerUserId to patch only that Profile rail cache (no viewer-wide clear).
 */
export async function connectProfilePairUp(
  toOpportunityId: string,
  options?: { profileOwnerUserId?: string | null }
): Promise<PairUpDiscoverConnectResult> {
  if (!toOpportunityId) throw new Error("Missing target opportunity");

  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("connect_profile_pair_up", {
    p_to_opportunity_id: toOpportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  const row = data as Record<string, unknown> | null;
  const opportunityRaw = row?.opportunity;
  let opportunity = null as PairUpDiscoverConnectResult["opportunity"] | null;
  if (opportunityRaw && typeof opportunityRaw === "object") {
    const o = opportunityRaw as Record<string, unknown>;
    if (
      typeof o.id === "string" &&
      typeof o.source_post_id === "string" &&
      typeof o.discoverable_until === "string" &&
      typeof o.created_at === "string"
    ) {
      opportunity = {
        id: o.id,
        source_post_id: o.source_post_id,
        status: typeof o.status === "string" ? o.status : "active",
        description: typeof o.description === "string" ? o.description : null,
        discoverable_until: o.discoverable_until,
        created_at: o.created_at,
      };
    }
  }

  if (
    !opportunity ||
    typeof row?.from_opportunity_id !== "string" ||
    typeof row?.to_opportunity_id !== "string"
  ) {
    throw new Error("Profile Connect failed");
  }

  setCachedPairUp(userId, opportunity.source_post_id, opportunity);
  invalidatePairUpDeck(userId);

  const ownerId = options?.profileOwnerUserId?.trim();
  if (ownerId) {
    patchCachedProfileSocialOpportunity(userId, ownerId, toOpportunityId, {
      viewer_duo_joined: true,
    });
  }

  return {
    opportunity,
    from_opportunity_id: row.from_opportunity_id,
    to_opportunity_id: row.to_opportunity_id,
    matched: row.matched === true,
  };
}
