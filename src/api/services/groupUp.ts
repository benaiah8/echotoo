/**
 * Group Up RPC wrappers (no UI).
 * G1: create/cancel/renew + batched own-state reads.
 */

import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import { parseOccursTimeExplicit } from "../../lib/openPlanSchedule";
import { assertPlainTextAllowedForUgc } from "../../lib/ugcTextPolicy";
import { toPairUpRpcError } from "./pairUp";
import type {
  GroupUpCandidate,
  GroupUpCandidatesPage,
  GroupUpIncomingRequest,
  GroupUpIncomingRequestsPage,
  GroupUpAcceptResult,
  GroupUpDeclineResult,
  GroupUpMembershipsPage,
  GroupUpMarkSeenResult,
  GroupUpOpportunity,
  GroupUpRequest,
  GroupUpRequestErrorKind,
  GroupUpRequestGroup,
  GroupUpRequestGroupsPage,
  GroupUpRequester,
  GroupUpRequestersPage,
  GroupUpSourceContext,
  GroupUpViewerState,
} from "../../lib/people/types";
import {
  getCachedGroupUpOwn,
  setCachedGroupUpOwn,
} from "../../lib/groupUpCache";
import {
  syncCachesAfterOwnGroupCancel,
  syncCachesAfterOwnGroupCreate,
} from "../../lib/ownProfileSocialSync";
import {
  getCachedGroupUpDeck,
  setCachedGroupUpDeck,
} from "../../lib/groupUpCandidateCache";
import {
  getCachedGroupUpIncoming,
  removeFromCachedGroupUpIncoming,
  setCachedGroupUpIncoming,
} from "../../lib/groupUpIncomingCache";
import {
  getCachedGroupUpMemberships,
  setCachedGroupUpMemberships,
} from "../../lib/groupUpMembershipsCache";
import {
  getCachedGroupUpRequestGroups,
  patchGroupUpRequestGroupsAfterResolve,
  setCachedGroupUpRequestGroups,
} from "../../lib/groupUpRequestGroupsCache";
import {
  getCachedGroupUpRequesters,
  removeFromCachedGroupUpRequesters,
  setCachedGroupUpRequesters,
} from "../../lib/groupUpRequestersCache";
import { clearDmInboxCache } from "../../lib/dmInboxCache";
import { normalizeEchoPreset } from "../../lib/profilePhotos";

type OpportunityRpcResult = {
  opportunity?: GroupUpOpportunity | null;
};

type ConversationStateRpcResult = {
  opportunity?: GroupUpOpportunity | null;
  can_renew?: boolean;
  renew_source_post_id?: string | null;
  renew_last_occurs_at?: string | null;
  conversation_title?: string | null;
  conversation_description?: string | null;
  source_context?: unknown;
};

export const GROUP_UP_TITLE_MAX = 80;
export const GROUP_UP_DESCRIPTION_MAX = 200;

/** Per-RPC bound; matches the SQL DoS guardrail. */
export const GROUP_UP_BATCH_MAX_IDS = 100;

function parseGroupUpOpportunity(raw: unknown): GroupUpOpportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.source_post_id !== "string" ||
    typeof row.creator_id !== "string" ||
    typeof row.conversation_id !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    source_post_id: row.source_post_id,
    creator_id: row.creator_id,
    conversation_id: row.conversation_id,
    status: typeof row.status === "string" ? row.status : "active",
    description: typeof row.description === "string" ? row.description : null,
    occurs_at: typeof row.occurs_at === "string" ? row.occurs_at : null,
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    discoverable_until:
      typeof row.discoverable_until === "string" ? row.discoverable_until : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    closed_at: typeof row.closed_at === "string" ? row.closed_at : null,
  };
}

type RequestRpcResult = {
  request?: GroupUpRequest | null;
};

function parseOpaqueCursor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

function parseStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((v): v is string => typeof v === "string");
  return out.length > 0 ? out : null;
}

function parseGroupUpViewerState(raw: unknown): GroupUpViewerState {
  if (raw === "owner" || raw === "pending" || raw === "member") return raw;
  return "none";
}

/** Exported for focused membership/source-unavailable parse tests. */
export function parseGroupUpCandidate(raw: unknown): GroupUpCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.conversation_id !== "string" || !row.conversation_id.trim()) {
    return null;
  }

  const opportunity_id = asNullableString(row.opportunity_id);
  const source_post_id = asNullableString(row.source_post_id);
  const organizer_user_id = asNullableString(row.organizer_user_id);
  const source_unavailable = row.source_unavailable === true;

  const sourceTypeRaw = asNullableString(row.source_type);
  const source_type =
    sourceTypeRaw === "hangout"
      ? ("hangout" as const)
      : sourceTypeRaw === "experience"
        ? ("experience" as const)
        : null;

  // Live discovery/membership rows still require source context.
  if (!source_unavailable) {
    if (!opportunity_id || !source_post_id || !source_type || !organizer_user_id) {
      return null;
    }
  }

  const memberCountRaw = row.member_count;
  const member_count =
    typeof memberCountRaw === "number"
      ? memberCountRaw
      : Number(memberCountRaw);

  return {
    opportunity_id,
    conversation_id: row.conversation_id,
    source_post_id,
    group_title: asNullableString(row.group_title),
    group_description: asNullableString(row.group_description),
    occurs_at: asNullableString(row.occurs_at),
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    discoverable_until: asNullableString(row.discoverable_until),
    created_at: asNullableString(row.created_at) ?? "",
    source_type,
    source_caption: asNullableString(row.source_caption),
    source_selected_dates: parseStringArray(row.source_selected_dates),
    source_recurrence_days: parseStringArray(row.source_recurrence_days),
    source_is_recurring:
      typeof row.source_is_recurring === "boolean"
        ? row.source_is_recurring
        : null,
    organizer_user_id,
    organizer_display_name: asNullableString(row.organizer_display_name),
    organizer_username: asNullableString(row.organizer_username),
    organizer_avatar_url: asNullableString(row.organizer_avatar_url),
    organizer_echo_preset: normalizeEchoPreset(row.organizer_echo_preset),
    member_count: Number.isFinite(member_count) ? member_count : 0,
    viewer_state: parseGroupUpViewerState(row.viewer_state),
    request_id: asNullableString(row.request_id),
    source_unavailable,
  };
}

function parseGroupUpCandidatesPage(raw: unknown): GroupUpCandidatesPage {
  const payload = raw as {
    candidates?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.candidates) ? payload.candidates : [];
  return {
    candidates: list
      .map(parseGroupUpCandidate)
      .filter((row): row is GroupUpCandidate => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseGroupUpRequest(raw: unknown): GroupUpRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.opportunity_id !== "string") {
    return null;
  }
  if (typeof row.status !== "string") return null;
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    status: row.status,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: asNullableString(row.updated_at),
    resolved_at: asNullableString(row.resolved_at),
  };
}

function parseProfilePhotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function parseGroupUpIncomingRequest(raw: unknown): GroupUpIncomingRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.request_id !== "string" ||
    typeof row.opportunity_id !== "string" ||
    typeof row.conversation_id !== "string" ||
    typeof row.requester_user_id !== "string"
  ) {
    return null;
  }
  const sourceTypeRaw = asNullableString(row.source_type);
  const source_type =
    sourceTypeRaw === "hangout"
      ? ("hangout" as const)
      : sourceTypeRaw === "experience"
        ? ("experience" as const)
        : null;
  const memberCountRaw = row.member_count;
  const member_count =
    typeof memberCountRaw === "number"
      ? memberCountRaw
      : Number(memberCountRaw);

  return {
    request_id: row.request_id,
    opportunity_id: row.opportunity_id,
    conversation_id: row.conversation_id,
    requested_at: asNullableString(row.requested_at) ?? "",
    requester_user_id: row.requester_user_id,
    requester_profile_id: asNullableString(row.requester_profile_id),
    display_name: asNullableString(row.display_name),
    username: asNullableString(row.username),
    avatar_url: asNullableString(row.avatar_url),
    profile_photos: parseProfilePhotos(row.profile_photos),
    echo_preset: normalizeEchoPreset(row.echo_preset),
    bio: asNullableString(row.bio),
    title: asNullableString(row.title),
    description: asNullableString(row.description),
    source_post_id: asNullableString(row.source_post_id) ?? "",
    source_type,
    source_caption: asNullableString(row.source_caption),
    occurs_at: asNullableString(row.occurs_at),
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    discoverable_until: asNullableString(row.discoverable_until),
    member_count: Number.isFinite(member_count) ? member_count : 0,
  };
}

function parseGroupUpIncomingPage(raw: unknown): GroupUpIncomingRequestsPage {
  const payload = raw as {
    requests?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.requests) ? payload.requests : [];
  return {
    requests: list
      .map(parseGroupUpIncomingRequest)
      .filter((row): row is GroupUpIncomingRequest => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseSourceType(
  raw: unknown
): "hangout" | "experience" | null {
  const sourceTypeRaw = asNullableString(raw);
  if (sourceTypeRaw === "hangout") return "hangout";
  if (sourceTypeRaw === "experience") return "experience";
  return null;
}

function parseGroupUpRequestGroup(raw: unknown): GroupUpRequestGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.conversation_id !== "string" ||
    typeof row.opportunity_id !== "string" ||
    typeof row.latest_request_id !== "string"
  ) {
    return null;
  }
  const pendingRaw = row.pending_count;
  const newRaw = row.new_count;
  const pending_count =
    typeof pendingRaw === "number" ? pendingRaw : Number(pendingRaw);
  const new_count = typeof newRaw === "number" ? newRaw : Number(newRaw);
  return {
    conversation_id: row.conversation_id,
    opportunity_id: row.opportunity_id,
    group_title: asNullableString(row.group_title),
    description: asNullableString(row.description),
    source_post_id: asNullableString(row.source_post_id) ?? "",
    source_type: parseSourceType(row.source_type),
    latest_request_at: asNullableString(row.latest_request_at) ?? "",
    latest_request_id: row.latest_request_id,
    pending_count: Number.isFinite(pending_count) ? pending_count : 0,
    new_count: Number.isFinite(new_count) ? new_count : 0,
    occurs_at: asNullableString(row.occurs_at),
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
  };
}

/** @internal Vitest */
export function __parseGroupUpRequestGroupForTests(
  raw: unknown
): GroupUpRequestGroup | null {
  return parseGroupUpRequestGroup(raw);
}

function parseGroupUpRequestGroupsPage(
  raw: unknown
): GroupUpRequestGroupsPage {
  const payload = raw as {
    groups?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.groups) ? payload.groups : [];
  return {
    groups: list
      .map(parseGroupUpRequestGroup)
      .filter((row): row is GroupUpRequestGroup => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseGroupUpRequester(raw: unknown): GroupUpRequester | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.request_id !== "string" ||
    typeof row.opportunity_id !== "string" ||
    typeof row.conversation_id !== "string" ||
    typeof row.requester_user_id !== "string"
  ) {
    return null;
  }
  return {
    request_id: row.request_id,
    opportunity_id: row.opportunity_id,
    conversation_id: row.conversation_id,
    requested_at: asNullableString(row.requested_at) ?? "",
    requester_user_id: row.requester_user_id,
    requester_profile_id: asNullableString(row.requester_profile_id),
    display_name: asNullableString(row.display_name),
    username: asNullableString(row.username),
    avatar_url: asNullableString(row.avatar_url),
    profile_photos: parseProfilePhotos(row.profile_photos),
    echo_preset: normalizeEchoPreset(row.echo_preset),
    bio: asNullableString(row.bio),
  };
}

function parseGroupUpRequestersPage(raw: unknown): GroupUpRequestersPage {
  const payload = raw as {
    requests?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.requests) ? payload.requests : [];
  return {
    requests: list
      .map(parseGroupUpRequester)
      .filter((row): row is GroupUpRequester => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseGroupUpMarkSeenResult(raw: unknown): GroupUpMarkSeenResult {
  const payload = raw as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    advanced: payload?.advanced === true,
    conversation_id: asNullableString(payload?.conversation_id),
    last_seen_request_at: asNullableString(payload?.last_seen_request_at),
    last_seen_request_id: asNullableString(payload?.last_seen_request_id),
  };
}

function parseGroupUpMembershipsPage(raw: unknown): GroupUpMembershipsPage {
  const payload = raw as {
    memberships?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.memberships) ? payload.memberships : [];
  return {
    memberships: list
      .map(parseGroupUpCandidate)
      .filter((row): row is GroupUpCandidate => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseGroupUpAcceptResult(raw: unknown): GroupUpAcceptResult {
  const payload = raw as Record<string, unknown> | null;
  return {
    accepted: payload?.accepted === true,
    reason: asNullableString(payload?.reason),
    request: parseGroupUpRequest(payload?.request),
    opportunity_id: asNullableString(payload?.opportunity_id),
    conversation_id: asNullableString(payload?.conversation_id),
    requester_user_id: asNullableString(payload?.requester_user_id),
  };
}

function parseGroupUpDeclineResult(raw: unknown): GroupUpDeclineResult {
  const payload = raw as Record<string, unknown> | null;
  return {
    declined: payload?.declined === true,
    request: parseGroupUpRequest(payload?.request),
    opportunity_id: asNullableString(payload?.opportunity_id),
    conversation_id: asNullableString(payload?.conversation_id),
    requester_user_id: asNullableString(payload?.requester_user_id),
  };
}

export function classifyGroupUpRequestError(err: unknown): GroupUpRequestErrorKind {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = message.toLowerCase();
  if (
    lower.includes("not available") ||
    lower.includes("not found") ||
    lower.includes("not eligible") ||
    lower.includes("your own group up")
  ) {
    return "unavailable";
  }
  if (lower.includes("member limit")) {
    return "full";
  }
  if (lower.includes("already a group member")) {
    return "already_member";
  }
  if (lower.includes("cannot request this group up")) {
    return "declined";
  }
  return "unknown";
}

function parseGroupUpSourceContext(raw: unknown): GroupUpSourceContext | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.source_post_id !== "string") return null;
  const postType = row.post_type;
  if (postType !== "hangout" && postType !== "experience") return null;
  return {
    source_post_id: row.source_post_id,
    post_type: postType,
    caption: typeof row.caption === "string" ? row.caption : null,
    is_recurring:
      typeof row.is_recurring === "boolean" ? row.is_recurring : null,
    selected_dates: parseStringArray(row.selected_dates),
    recurrence_days: parseStringArray(row.recurrence_days),
    group_up_occurs_at:
      typeof row.group_up_occurs_at === "string"
        ? row.group_up_occurs_at
        : null,
  };
}

type BatchMineRpcResult = {
  opportunities?: unknown;
};

function parseBatchGroupUpOpportunities(raw: unknown): GroupUpOpportunity[] {
  const payload = raw as BatchMineRpcResult | null;
  if (!Array.isArray(payload?.opportunities)) return [];
  return payload.opportunities
    .map(parseGroupUpOpportunity)
    .filter((row): row is GroupUpOpportunity => row != null);
}

function dedupeSourcePostIds(sourcePostIds: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of sourcePostIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
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

export async function getMyGroupUpForSource(
  sourcePostId: string
): Promise<GroupUpOpportunity | null> {
  if (!sourcePostId) return null;
  const userId = await requireSessionUserId();

  const cached = getCachedGroupUpOwn(userId, sourcePostId);
  if (cached !== undefined) return cached;

  const { data, error } = await supabase.rpc("get_my_group_up_for_source", {
    p_source_post_id: sourcePostId,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseGroupUpOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  const { applyFetchedGroupUpOwnState } = await import(
    "../../lib/groupUpOwnStore"
  );
  const applied = applyFetchedGroupUpOwnState(
    userId,
    sourcePostId,
    opportunity
  );
  return applied
    ? opportunity
    : (getCachedGroupUpOwn(userId, sourcePostId) ?? null);
}

export async function getMyGroupUpsForSources(
  sourcePostIds: string[],
  options?: { bypassCache?: boolean }
): Promise<Map<string, GroupUpOpportunity | null>> {
  const uniqueIds = dedupeSourcePostIds(sourcePostIds).sort();
  const out = new Map<string, GroupUpOpportunity | null>();
  if (uniqueIds.length === 0) return out;

  const userId = await requireSessionUserId();

  const missing: string[] = [];
  for (const id of uniqueIds) {
    if (!options?.bypassCache) {
      const cached = getCachedGroupUpOwn(userId, id);
      if (cached !== undefined) {
        out.set(id, cached);
        continue;
      }
    }
    missing.push(id);
  }

  if (missing.length === 0) return out;

  const { applyFetchedGroupUpOwnState } = await import(
    "../../lib/groupUpOwnStore"
  );

  for (let i = 0; i < missing.length; i += GROUP_UP_BATCH_MAX_IDS) {
    const chunk = missing.slice(i, i + GROUP_UP_BATCH_MAX_IDS);
    const result = await requestManager.execute(
      `group_up_get_batch:${userId}:${chunk.join(",")}`,
      async () => {
        const { data, error } = await supabase.rpc(
          "get_my_group_ups_for_sources",
          { p_source_post_ids: chunk }
        );
        if (error) throw error;
        return parseBatchGroupUpOpportunities(data);
      },
      "high"
    );

    if (result.error) throw toPairUpRpcError(result.error);

    const foundBySource = new Map<string, GroupUpOpportunity>();
    for (const opportunity of result.data ?? []) {
      foundBySource.set(opportunity.source_post_id, opportunity);
    }

    for (const id of chunk) {
      const opportunity = foundBySource.get(id) ?? null;
      const applied = applyFetchedGroupUpOwnState(userId, id, opportunity);
      out.set(
        id,
        applied ? opportunity : (getCachedGroupUpOwn(userId, id) ?? null)
      );
    }
  }

  return out;
}

export async function createGroupUp(input: {
  sourcePostId: string;
  title: string;
  description: string;
  occursAt?: string | null;
  occursTimeExplicit?: boolean;
}): Promise<GroupUpOpportunity> {
  const sourcePostId = input.sourcePostId?.trim() ?? "";
  if (!sourcePostId) throw new Error("Missing source post");

  const trimmedTitle = input.title?.trim() ?? "";
  if (!trimmedTitle) throw new Error("Group name required");
  if (trimmedTitle.length > GROUP_UP_TITLE_MAX) {
    throw new Error("Group name is too long");
  }
  assertPlainTextAllowedForUgc(trimmedTitle, "default");

  const trimmed = input.description?.trim() ?? "";
  if (!trimmed) throw new Error("Description required");
  if (trimmed.length > GROUP_UP_DESCRIPTION_MAX) {
    throw new Error("Description too long");
  }
  assertPlainTextAllowedForUgc(trimmed, "default");

  const userId = await requireSessionUserId();

  const { data, error } = await supabase.rpc("create_group_up", {
    p_source_post_id: sourcePostId,
    p_title: trimmedTitle,
    p_description: trimmed,
    p_occurs_at: input.occursAt ?? null,
    p_occurs_time_explicit:
      input.occursAt == null
        ? true
        : input.occursTimeExplicit !== false,
  });
  if (error) {
    if (import.meta.env.DEV) {
      console.error("[GroupUp create failed]", {
        sourcePostId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
    throw toPairUpRpcError(error);
  }

  const opportunity = parseGroupUpOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Create Group Up failed");
  const { markLocalGroupUpMutation } = await import("../../lib/groupUpOwnStore");
  markLocalGroupUpMutation(sourcePostId, true);
  setCachedGroupUpOwn(userId, sourcePostId, opportunity);
  clearDmInboxCache();
  const { applyLocalCreateGroupPatches } = await import(
    "../../lib/groupUpLocalPatches"
  );
  applyLocalCreateGroupPatches(opportunity, {
    title: trimmedTitle,
    description: trimmed,
  });
  syncCachesAfterOwnGroupCreate(userId, sourcePostId);
  return opportunity;
}

export async function cancelGroupUp(
  opportunityId: string
): Promise<GroupUpOpportunity> {
  if (!opportunityId) throw new Error("Missing opportunity");

  const { isRealGroupUpOpportunityId, markLocalGroupUpMutation } = await import(
    "../../lib/groupUpOwnStore"
  );
  if (!isRealGroupUpOpportunityId(opportunityId)) {
    throw new Error("Invalid Group Up opportunity");
  }

  const userId = await requireSessionUserId();

  const { data, error } = await supabase.rpc("cancel_group_up", {
    p_opportunity_id: opportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseGroupUpOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Cancel Group Up failed");
  markLocalGroupUpMutation(opportunity.source_post_id, false);
  setCachedGroupUpOwn(userId, opportunity.source_post_id, null);
  const { applyLocalCancelGroupPatches } = await import(
    "../../lib/groupUpLocalPatches"
  );
  applyLocalCancelGroupPatches(opportunity.source_post_id, opportunity.id);
  syncCachesAfterOwnGroupCancel(
    userId,
    opportunity.source_post_id,
    opportunity.id
  );
  return opportunity;
}

export async function renewGroupUp(input: {
  conversationId: string;
  description: string;
  occursAt?: string | null;
  occursTimeExplicit?: boolean;
}): Promise<GroupUpOpportunity> {
  const conversationId = input.conversationId?.trim() ?? "";
  if (!conversationId) throw new Error("Missing conversation");

  const trimmed = input.description?.trim() ?? "";
  if (!trimmed) throw new Error("Description required");
  assertPlainTextAllowedForUgc(trimmed, "default");

  const userId = await requireSessionUserId();

  const { data, error } = await supabase.rpc("renew_group_up", {
    p_conversation_id: conversationId,
    p_description: trimmed,
    p_occurs_at: input.occursAt ?? null,
    p_occurs_time_explicit:
      input.occursAt == null
        ? true
        : input.occursTimeExplicit !== false,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseGroupUpOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Renew Group Up failed");
  setCachedGroupUpOwn(userId, opportunity.source_post_id, opportunity);
  return opportunity;
}

export async function updateGroupUpSchedule(input: {
  opportunityId: string;
  occursAt?: string | null;
  occursTimeExplicit?: boolean;
}): Promise<GroupUpOpportunity> {
  const opportunityId = input.opportunityId?.trim() ?? "";
  if (!opportunityId) throw new Error("Missing opportunity");

  const userId = await requireSessionUserId();

  const { data, error } = await supabase.rpc("update_group_up_schedule", {
    p_opportunity_id: opportunityId,
    p_occurs_at: input.occursAt ?? null,
    p_occurs_time_explicit:
      input.occursAt == null
        ? true
        : input.occursTimeExplicit !== false,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseGroupUpOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Update Group Up schedule failed");
  setCachedGroupUpOwn(userId, opportunity.source_post_id, opportunity);
  return opportunity;
}

export type GroupUpConversationState = {
  opportunity: GroupUpOpportunity | null;
  canRenew: boolean;
  renewSourcePostId: string | null;
  renewLastOccursAt: string | null;
  conversationTitle: string | null;
  conversationDescription: string | null;
  sourceContext: GroupUpSourceContext | null;
};

const EMPTY_CONVERSATION_STATE: GroupUpConversationState = {
  opportunity: null,
  canRenew: false,
  renewSourcePostId: null,
  renewLastOccursAt: null,
  conversationTitle: null,
  conversationDescription: null,
  sourceContext: null,
};

export async function getMyGroupUpForConversation(
  conversationId: string
): Promise<GroupUpConversationState> {
  if (!conversationId) return EMPTY_CONVERSATION_STATE;

  const { data, error } = await supabase.rpc(
    "get_my_group_up_for_conversation",
    { p_conversation_id: conversationId }
  );
  if (error) throw toPairUpRpcError(error);

  const payload = data as ConversationStateRpcResult | null;
  return {
    opportunity: parseGroupUpOpportunity(payload?.opportunity),
    canRenew: payload?.can_renew === true,
    renewSourcePostId:
      typeof payload?.renew_source_post_id === "string"
        ? payload.renew_source_post_id
        : null,
    renewLastOccursAt:
      typeof payload?.renew_last_occurs_at === "string"
        ? payload.renew_last_occurs_at
        : null,
    conversationTitle:
      typeof payload?.conversation_title === "string"
        ? payload.conversation_title
        : null,
    conversationDescription:
      typeof payload?.conversation_description === "string"
        ? payload.conversation_description
        : null,
    sourceContext: parseGroupUpSourceContext(payload?.source_context),
  };
}

export async function listGroupUpCandidates(options?: {
  limit?: number;
  cursor?: string | null;
  force?: boolean;
  /** When false, skip writing the first-page module cache (hook merges locally). */
  writeCache?: boolean;
}): Promise<GroupUpCandidatesPage> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor?.trim() || null;
  const force = options?.force === true;
  const writeCache = options?.writeCache !== false;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedGroupUpDeck(userId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `group_up_list:${userId}:first`
    : `group_up_list:${userId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc("list_group_up_candidates", {
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw toPairUpRpcError(error);
      return parseGroupUpCandidatesPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    candidates: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage && writeCache) setCachedGroupUpDeck(userId, page);
  return page;
}

export async function requestGroupUp(
  opportunityId: string
): Promise<GroupUpRequest> {
  if (!opportunityId) throw new Error("Missing opportunity");

  const { data, error } = await supabase.rpc("request_group_up", {
    p_opportunity_id: opportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  const request = parseGroupUpRequest(
    (data as RequestRpcResult | null)?.request
  );
  if (!request) throw new Error("Request Group Up failed");
  return request;
}

export async function withdrawGroupUpRequest(
  opportunityId: string
): Promise<GroupUpRequest> {
  if (!opportunityId) throw new Error("Missing opportunity");

  const { data, error } = await supabase.rpc("withdraw_group_up_request", {
    p_opportunity_id: opportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  const request = parseGroupUpRequest(
    (data as RequestRpcResult | null)?.request
  );
  if (!request) throw new Error("Withdraw Group Up request failed");
  return request;
}

export async function listMyGroupUpRequests(options?: {
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<GroupUpIncomingRequestsPage> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor?.trim() || null;
  const force = options?.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedGroupUpIncoming(userId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `group_up_incoming:${userId}:first`
    : `group_up_incoming:${userId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc("list_my_group_up_requests", {
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw toPairUpRpcError(error);
      return parseGroupUpIncomingPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    requests: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedGroupUpIncoming(userId, page);
  return page;
}

export async function listMyGroupUpRequestGroups(options?: {
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<GroupUpRequestGroupsPage> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor?.trim() || null;
  const force = options?.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedGroupUpRequestGroups(userId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `group_up_request_groups:${userId}:first`
    : `group_up_request_groups:${userId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc(
        "list_my_group_up_request_groups",
        {
          p_limit: limit,
          p_cursor: cursor,
        }
      );
      if (error) throw toPairUpRpcError(error);
      return parseGroupUpRequestGroupsPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    groups: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedGroupUpRequestGroups(userId, page);
  return page;
}

export async function listGroupUpRequesters(options: {
  conversationId: string;
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<GroupUpRequestersPage> {
  const conversationId = options.conversationId?.trim() || "";
  if (!conversationId) throw new Error("Missing conversation");
  const limit = options.limit ?? 20;
  const cursor = options.cursor?.trim() || null;
  const force = options.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedGroupUpRequesters(userId, conversationId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `group_up_requesters:${userId}:${conversationId}:first`
    : `group_up_requesters:${userId}:${conversationId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc("list_group_up_requesters", {
        p_conversation_id: conversationId,
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw toPairUpRpcError(error);
      return parseGroupUpRequestersPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    requests: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedGroupUpRequesters(userId, conversationId, page);
  return page;
}

const markSeenInflight = new Map<string, Promise<GroupUpMarkSeenResult>>();

export async function markGroupUpRequestsSeen(options: {
  conversationId: string;
  throughRequestAt: string;
  throughRequestId: string;
}): Promise<GroupUpMarkSeenResult> {
  const conversationId = options.conversationId?.trim() || "";
  const throughRequestAt = options.throughRequestAt?.trim() || "";
  const throughRequestId = options.throughRequestId?.trim() || "";
  if (!conversationId || !throughRequestAt || !throughRequestId) {
    throw new Error("Missing mark-seen cursor");
  }

  const dedupeKey = `group_up_mark_seen:${conversationId}:${throughRequestAt}:${throughRequestId}`;
  const existing = markSeenInflight.get(dedupeKey);
  if (existing) return existing;

  const run = (async () => {
    const { data, error } = await supabase.rpc("mark_group_up_requests_seen", {
      p_conversation_id: conversationId,
      p_through_request_at: throughRequestAt,
      p_through_request_id: throughRequestId,
    });
    if (error) throw toPairUpRpcError(error);
    return parseGroupUpMarkSeenResult(data);
  })();

  markSeenInflight.set(dedupeKey, run);
  try {
    return await run;
  } finally {
    markSeenInflight.delete(dedupeKey);
  }
}

export async function acceptGroupUpRequest(
  requestId: string,
  options?: {
    conversationId?: string | null;
    requestedAt?: string | null;
  }
): Promise<GroupUpAcceptResult> {
  if (!requestId) throw new Error("Missing request");
  const userId = await requireSessionUserId();

  const { data, error } = await supabase.rpc("accept_group_up_request", {
    p_request_id: requestId,
  });
  if (error) throw toPairUpRpcError(error);

  const parsed = parseGroupUpAcceptResult(data);
  if (parsed.accepted || parsed.reason === "group_unavailable") {
    removeFromCachedGroupUpIncoming(userId, requestId);
    const conversationId =
      options?.conversationId?.trim() ||
      parsed.conversation_id ||
      "";
    const requestedAt = options?.requestedAt?.trim() || "";
    if (conversationId) {
      removeFromCachedGroupUpRequesters(userId, conversationId, requestId);
      if (requestedAt) {
        patchGroupUpRequestGroupsAfterResolve(userId, conversationId, {
          at: requestedAt,
          id: requestId,
        });
      }
    }
    clearDmInboxCache();
  }
  return parsed;
}

export async function declineGroupUpRequest(
  requestId: string,
  options?: {
    conversationId?: string | null;
    requestedAt?: string | null;
  }
): Promise<GroupUpDeclineResult> {
  if (!requestId) throw new Error("Missing request");
  const userId = await requireSessionUserId();

  const { data, error } = await supabase.rpc("decline_group_up_request", {
    p_request_id: requestId,
  });
  if (error) throw toPairUpRpcError(error);

  const parsed = parseGroupUpDeclineResult(data);
  if (parsed.declined) {
    removeFromCachedGroupUpIncoming(userId, requestId);
    const conversationId =
      options?.conversationId?.trim() ||
      parsed.conversation_id ||
      "";
    const requestedAt = options?.requestedAt?.trim() || "";
    if (conversationId) {
      removeFromCachedGroupUpRequesters(userId, conversationId, requestId);
      if (requestedAt) {
        patchGroupUpRequestGroupsAfterResolve(userId, conversationId, {
          at: requestedAt,
          id: requestId,
        });
      }
    }
  }
  return parsed;
}

export async function listMyGroupUpMemberships(options?: {
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<GroupUpMembershipsPage> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor?.trim() || null;
  const force = options?.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedGroupUpMemberships(userId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `group_up_memberships:${userId}:first`
    : `group_up_memberships:${userId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc(
        "list_my_group_up_memberships",
        {
          p_limit: limit,
          p_cursor: cursor,
        }
      );
      if (error) throw toPairUpRpcError(error);
      return parseGroupUpMembershipsPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    memberships: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedGroupUpMemberships(userId, page);
  return page;
}
