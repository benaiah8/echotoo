/**
 * Open Plan RPC wrappers (no UI).
 * 8A create/cancel/get-mine · 8B list · 8C request/withdraw/get-request ·
 * 8D creator incoming list + accept → DM · 8E.0 batched own-state.
 */

import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import { assertPlainTextAllowedForUgc } from "../../lib/ugcTextPolicy";
import { toPairUpRpcError } from "./pairUp";
import type {
  OpenPlanAcceptResult,
  OpenPlanAnonymousPreview,
  OpenPlanCandidate,
  OpenPlanCandidatesPage,
  OpenPlanIncomingRequest,
  OpenPlanIncomingRequestsPage,
  OpenPlanOpportunity,
  OpenPlanRequest,
  OpenPlanRequestGroup,
  OpenPlanRequestGroupsPage,
  OpenPlanRequestStatus,
  OpenPlanRequester,
  OpenPlanRequestersPage,
} from "../../lib/people/types";
import {
  getCachedOpenPlanDeck,
  getCachedOpenPlanIncoming,
  getCachedOpenPlanOwn,
  invalidateOpenPlanDeck,
  invalidateOpenPlanIncoming,
  setCachedOpenPlanDeck,
  setCachedOpenPlanIncoming,
  setCachedOpenPlanOwn,
} from "../../lib/openPlanCache";
import {
  getCachedOpenPlanRequestGroups,
  invalidateOpenPlanRequestGroups,
  patchOpenPlanRequestGroupsAfterAccept,
  setCachedOpenPlanRequestGroups,
} from "../../lib/openPlanRequestGroupsCache";
import {
  getCachedOpenPlanRequesters,
  invalidateOpenPlanRequesters,
  removeFromCachedOpenPlanRequesters,
  setCachedOpenPlanRequesters,
} from "../../lib/openPlanRequestersCache";
import {
  normalizeEchoPreset,
  normalizeProfilePhotos,
} from "../../lib/profilePhotos";
import { parseOccursTimeExplicit } from "../../lib/openPlanSchedule";

type OpportunityRpcResult = {
  opportunity?: OpenPlanOpportunity | null;
};

type RequestRpcResult = {
  request?: OpenPlanRequest | null;
};

function parseOpenPlanOpportunity(raw: unknown): OpenPlanOpportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.source_post_id !== "string" ||
    typeof row.creator_id !== "string"
  ) {
    return null;
  }
  if (typeof row.occurs_at !== "string" || !row.occurs_at) return null;
  return {
    id: row.id,
    source_post_id: row.source_post_id,
    creator_id: row.creator_id,
    status: typeof row.status === "string" ? row.status : "active",
    description: typeof row.description === "string" ? row.description : null,
    occurs_at: row.occurs_at,
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    discoverable_until:
      typeof row.discoverable_until === "string" ? row.discoverable_until : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    closed_at: typeof row.closed_at === "string" ? row.closed_at : null,
  };
}

/** @internal Vitest — keep parse behavior covered without RPC. */
export function __parseOpenPlanOpportunityForTests(
  raw: unknown
): OpenPlanOpportunity | null {
  return parseOpenPlanOpportunity(raw);
}

function parseOpenPlanRequest(raw: unknown): OpenPlanRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.opportunity_id !== "string") {
    return null;
  }
  if (typeof row.status !== "string") return null;
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    status: row.status as OpenPlanRequestStatus | string,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
  };
}

function parseOpaqueCursor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

/**
 * Defensive candidate parse. Drops rows missing required ids/timestamps and
 * never surfaces display_name / username / profile_id / creator_id even if the
 * RPC accidentally included them.
 */
function parseOpenPlanCandidate(raw: unknown): OpenPlanCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.opportunity_id !== "string" ||
    typeof row.source_post_id !== "string"
  ) {
    return null;
  }
  if (typeof row.occurs_at !== "string" || !row.occurs_at) return null;

  const sourceTypeRaw = asNullableString(row.source_type);
  const source_type =
    sourceTypeRaw === "experience" ? ("experience" as const) : null;

  return {
    opportunity_id: row.opportunity_id,
    source_post_id: row.source_post_id,
    description: asNullableString(row.description),
    occurs_at: row.occurs_at,
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    discoverable_until: asNullableString(row.discoverable_until) ?? "",
    created_at: asNullableString(row.created_at) ?? "",
    avatar_url: asNullableString(row.avatar_url),
    profile_photos: normalizeProfilePhotos(row.profile_photos),
    echo_preset: normalizeEchoPreset(row.echo_preset),
    bio: asNullableString(row.bio),
    source_caption: asNullableString(row.source_caption),
    source_type,
    my_request_status: row.my_request_status === "pending" ? "pending" : null,
  };
}

/** @internal Vitest */
export function __parseOpenPlanCandidateForTests(
  raw: unknown
): OpenPlanCandidate | null {
  return parseOpenPlanCandidate(raw);
}

function parseOpenPlanCandidatesPage(raw: unknown): OpenPlanCandidatesPage {
  const payload = raw as {
    candidates?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.candidates) ? payload.candidates : [];
  return {
    candidates: list
      .map(parseOpenPlanCandidate)
      .filter((row): row is OpenPlanCandidate => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

/**
 * Defensive creator-inbox parse. Never surfaces requester_id / profile_id /
 * display_name / username / email / creator_id even if the RPC leaked them.
 */
function parseOpenPlanIncomingRequest(
  raw: unknown
): OpenPlanIncomingRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.request_id !== "string" ||
    typeof row.opportunity_id !== "string" ||
    typeof row.source_post_id !== "string"
  ) {
    return null;
  }
  if (typeof row.requested_at !== "string" || !row.requested_at) return null;
  if (typeof row.occurs_at !== "string" || !row.occurs_at) return null;

  const sourceTypeRaw = asNullableString(row.source_type);
  const source_type =
    sourceTypeRaw === "experience" ? ("experience" as const) : null;

  return {
    request_id: row.request_id,
    opportunity_id: row.opportunity_id,
    requested_at: row.requested_at,
    avatar_url: asNullableString(row.avatar_url),
    profile_photos: normalizeProfilePhotos(row.profile_photos),
    echo_preset: normalizeEchoPreset(row.echo_preset),
    bio: asNullableString(row.bio),
    source_post_id: row.source_post_id,
    source_caption: asNullableString(row.source_caption),
    source_type,
    plan_description: asNullableString(row.plan_description),
    occurs_at: row.occurs_at,
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    discoverable_until: asNullableString(row.discoverable_until) ?? "",
  };
}

/** @internal Vitest */
export function __parseOpenPlanIncomingRequestForTests(
  raw: unknown
): OpenPlanIncomingRequest | null {
  return parseOpenPlanIncomingRequest(raw);
}

function parseOpenPlanIncomingRequestsPage(
  raw: unknown
): OpenPlanIncomingRequestsPage {
  const payload = raw as {
    requests?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.requests) ? payload.requests : [];
  return {
    requests: list
      .map(parseOpenPlanIncomingRequest)
      .filter((row): row is OpenPlanIncomingRequest => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseOpenPlanAnonymousPreview(
  raw: unknown
): OpenPlanAnonymousPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    avatar_url: asNullableString(row.avatar_url),
    profile_photos: normalizeProfilePhotos(row.profile_photos),
    echo_preset: normalizeEchoPreset(row.echo_preset),
  };
}

/**
 * Defensive grouped-summary parse. Drops identity fields even if leaked.
 * Groups by opportunity_id only.
 */
function parseOpenPlanRequestGroup(raw: unknown): OpenPlanRequestGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.opportunity_id !== "string" || !row.opportunity_id) {
    return null;
  }
  if (typeof row.latest_request_id !== "string" || !row.latest_request_id) {
    return null;
  }
  const pendingRaw = row.pending_count;
  const pending_count =
    typeof pendingRaw === "number" ? pendingRaw : Number(pendingRaw);
  if (!Number.isFinite(pending_count) || pending_count < 0) return null;

  const previewsRaw = Array.isArray(row.preview_requesters)
    ? row.preview_requesters
    : [];
  const preview_requesters = previewsRaw
    .map(parseOpenPlanAnonymousPreview)
    .filter((item): item is OpenPlanAnonymousPreview => item != null)
    .slice(0, 2);

  return {
    opportunity_id: row.opportunity_id,
    source_post_id: asNullableString(row.source_post_id) ?? "",
    plan_description: asNullableString(row.plan_description),
    source_caption: asNullableString(row.source_caption),
    occurs_at: asNullableString(row.occurs_at),
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    pending_count,
    latest_request_at: asNullableString(row.latest_request_at) ?? "",
    latest_request_id: row.latest_request_id,
    preview_requesters,
  };
}

/** @internal Vitest */
export function __parseOpenPlanRequestGroupForTests(
  raw: unknown
): OpenPlanRequestGroup | null {
  return parseOpenPlanRequestGroup(raw);
}

function parseOpenPlanRequestGroupsPage(
  raw: unknown
): OpenPlanRequestGroupsPage {
  const payload = raw as {
    groups?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.groups) ? payload.groups : [];
  return {
    groups: list
      .map(parseOpenPlanRequestGroup)
      .filter((row): row is OpenPlanRequestGroup => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseOpenPlanRequester(raw: unknown): OpenPlanRequester | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.request_id !== "string" || !row.request_id) return null;
  if (typeof row.requested_at !== "string" || !row.requested_at) return null;
  const displayRaw = asNullableString(row.display_name);
  const openKeyRaw = asNullableString(row.profile_open_key);
  return {
    request_id: row.request_id,
    requested_at: row.requested_at,
    display_name: displayRaw?.trim() ? displayRaw.trim() : null,
    // Gated open key only — ignore leaked username / requester_id / email.
    profile_open_key: openKeyRaw?.trim() ? openKeyRaw.trim() : null,
    avatar_url: asNullableString(row.avatar_url),
    profile_photos: normalizeProfilePhotos(row.profile_photos),
    echo_preset: normalizeEchoPreset(row.echo_preset),
    bio: asNullableString(row.bio),
  };
}

/** @internal Vitest */
export function __parseOpenPlanRequesterForTests(
  raw: unknown
): OpenPlanRequester | null {
  return parseOpenPlanRequester(raw);
}

function parseOpenPlanRequestersPage(raw: unknown): OpenPlanRequestersPage {
  const payload = raw as {
    requests?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.requests) ? payload.requests : [];
  return {
    requests: list
      .map(parseOpenPlanRequester)
      .filter((row): row is OpenPlanRequester => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function parseOpenPlanAcceptResult(raw: unknown): OpenPlanAcceptResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.accepted !== "boolean") return null;
  return {
    accepted: row.accepted,
    reason: asNullableString(row.reason),
    request: parseOpenPlanRequest(row.request),
    conversation_id: asNullableString(row.conversation_id),
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

export async function getMyOpenPlanForSource(
  sourcePostId: string
): Promise<OpenPlanOpportunity | null> {
  if (!sourcePostId) return null;
  const userId = await requireSessionUserId();

  const cached = getCachedOpenPlanOwn(userId, sourcePostId);
  if (cached !== undefined) return cached;

  const { data, error } = await supabase.rpc("get_my_open_plan_for_source", {
    p_source_post_id: sourcePostId,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseOpenPlanOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  const { applyFetchedOpenPlanOwnState } = await import(
    "../../lib/openPlanOwnStore"
  );
  const applied = applyFetchedOpenPlanOwnState(
    userId,
    sourcePostId,
    opportunity
  );
  return applied
    ? opportunity
    : (getCachedOpenPlanOwn(userId, sourcePostId) ?? null);
}

/** Per-RPC bound; matches the SQL DoS guardrail. Never truncate the caller list. */
const OPEN_PLAN_BATCH_MAX_IDS = 100;

type BatchMineRpcResult = {
  opportunities?: unknown;
};

function parseBatchOpenPlanOpportunities(raw: unknown): OpenPlanOpportunity[] {
  const payload = raw as BatchMineRpcResult | null;
  if (!Array.isArray(payload?.opportunities)) return [];
  return payload.opportunities
    .map(parseOpenPlanOpportunity)
    .filter((row): row is OpenPlanOpportunity => row != null);
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

/**
 * Batch-read the caller's active Open Plans for source posts.
 * Skips cache hits (including cached null). Chunks missing IDs into ≤100 RPCs.
 * Every requested ID is written after a successful chunk (null → idle).
 */
export async function getMyOpenPlansForSources(
  sourcePostIds: string[],
  options?: { bypassCache?: boolean }
): Promise<Map<string, OpenPlanOpportunity | null>> {
  const uniqueIds = dedupeSourcePostIds(sourcePostIds).sort();
  const out = new Map<string, OpenPlanOpportunity | null>();
  if (uniqueIds.length === 0) return out;

  const userId = await requireSessionUserId();

  const missing: string[] = [];
  for (const id of uniqueIds) {
    if (!options?.bypassCache) {
      const cached = getCachedOpenPlanOwn(userId, id);
      if (cached !== undefined) {
        out.set(id, cached);
        continue;
      }
    }
    missing.push(id);
  }

  if (missing.length === 0) return out;

  for (let i = 0; i < missing.length; i += OPEN_PLAN_BATCH_MAX_IDS) {
    const chunk = missing.slice(i, i + OPEN_PLAN_BATCH_MAX_IDS);
    const result = await requestManager.execute(
      `open_plan_get_batch:${userId}:${chunk.join(",")}`,
      async () => {
        const { data, error } = await supabase.rpc(
          "get_my_open_plans_for_sources",
          { p_source_post_ids: chunk }
        );
        if (error) throw error;
        return parseBatchOpenPlanOpportunities(data);
      },
      "high"
    );

    if (result.error) throw toPairUpRpcError(result.error);

    const foundBySource = new Map<string, OpenPlanOpportunity>();
    for (const opportunity of result.data ?? []) {
      foundBySource.set(opportunity.source_post_id, opportunity);
    }

    // Sparse RPC: omitted IDs are known-null (idle), never left loading.
    const { applyFetchedOpenPlanOwnState } = await import(
      "../../lib/openPlanOwnStore"
    );
    for (const id of chunk) {
      const opportunity = foundBySource.get(id) ?? null;
      const applied = applyFetchedOpenPlanOwnState(userId, id, opportunity);
      out.set(
        id,
        applied ? opportunity : (getCachedOpenPlanOwn(userId, id) ?? null)
      );
    }
  }

  return out;
}

export async function createOpenPlan(input: {
  sourcePostId: string;
  occursAt: string;
  description?: string | null;
  /** Defaults true for legacy callers; Place Duo date-only sends false. */
  occursTimeExplicit?: boolean;
}): Promise<OpenPlanOpportunity> {
  const sourcePostId = input.sourcePostId?.trim() ?? "";
  if (!sourcePostId) throw new Error("Missing source post");
  const occursAt = input.occursAt?.trim() ?? "";
  if (!occursAt) throw new Error("Missing occurs_at");

  const trimmed = input.description?.trim() || null;
  if (trimmed) assertPlainTextAllowedForUgc(trimmed, "default");

  const userId = await requireSessionUserId();
  const occursTimeExplicit =
    typeof input.occursTimeExplicit === "boolean"
      ? input.occursTimeExplicit
      : true;

  const { data, error } = await supabase.rpc("create_open_plan", {
    p_source_post_id: sourcePostId,
    p_occurs_at: occursAt,
    p_description: trimmed,
    p_occurs_time_explicit: occursTimeExplicit,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseOpenPlanOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Create Open Plan failed");
  setCachedOpenPlanOwn(userId, sourcePostId, opportunity);
  const { markLocalOpenPlanMutation } = await import(
    "../../lib/openPlanOwnStore"
  );
  markLocalOpenPlanMutation(sourcePostId, true);
  invalidateOpenPlanDeck(userId);
  return opportunity;
}

export async function cancelOpenPlan(
  opportunityId: string
): Promise<OpenPlanOpportunity> {
  if (!opportunityId) throw new Error("Missing opportunity");

  const { isRealOpenPlanOpportunityId, markLocalOpenPlanMutation } =
    await import("../../lib/openPlanOwnStore");
  if (!isRealOpenPlanOpportunityId(opportunityId)) {
    throw new Error("Missing opportunity");
  }

  const userId = await requireSessionUserId();

  const { data, error } = await supabase.rpc("cancel_open_plan", {
    p_opportunity_id: opportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseOpenPlanOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Cancel Open Plan failed");
  setCachedOpenPlanOwn(userId, opportunity.source_post_id, null);
  markLocalOpenPlanMutation(opportunity.source_post_id, false);
  invalidateOpenPlanDeck(userId);
  invalidateOpenPlanIncoming(userId);
  invalidateOpenPlanRequestGroups(userId);
  return opportunity;
}

export async function listOpenPlanCandidates(options?: {
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<OpenPlanCandidatesPage> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor?.trim() || null;
  const force = options?.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedOpenPlanDeck(userId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `open_plan_list:${userId}:first`
    : `open_plan_list:${userId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc("list_open_plan_candidates", {
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw toPairUpRpcError(error);
      return parseOpenPlanCandidatesPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    candidates: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedOpenPlanDeck(userId, page);
  return page;
}

export async function requestOpenPlan(
  opportunityId: string,
  options?: { identityVisibleToHost?: boolean }
): Promise<OpenPlanRequest> {
  if (!opportunityId) throw new Error("Missing opportunity");

  const userId = await requireSessionUserId();
  // Only pass true when this client presented the updated disclosure.
  // Omit/false keeps old-client anonymity (server DEFAULT false).
  const identityVisible = options?.identityVisibleToHost === true;
  const { data, error } = await supabase.rpc("request_open_plan", {
    p_opportunity_id: opportunityId,
    p_identity_visible_to_host: identityVisible,
  });
  if (error) throw toPairUpRpcError(error);

  const request = parseOpenPlanRequest(
    (data as RequestRpcResult | null)?.request
  );
  if (!request) throw new Error("Request Open Plan failed");
  invalidateOpenPlanDeck(userId);
  return request;
}

export async function withdrawOpenPlanRequest(
  opportunityId: string
): Promise<OpenPlanRequest> {
  if (!opportunityId) throw new Error("Missing opportunity");

  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("withdraw_open_plan_request", {
    p_opportunity_id: opportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  const request = parseOpenPlanRequest(
    (data as RequestRpcResult | null)?.request
  );
  if (!request) throw new Error("Withdraw Open Plan request failed");
  invalidateOpenPlanDeck(userId);
  return request;
}

export async function getMyOpenPlanRequest(
  opportunityId: string
): Promise<OpenPlanRequest | null> {
  if (!opportunityId) return null;
  await requireSessionUserId();

  const { data, error } = await supabase.rpc("get_my_open_plan_request", {
    p_opportunity_id: opportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  return parseOpenPlanRequest((data as RequestRpcResult | null)?.request);
}

export async function listMyOpenPlanRequests(options?: {
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<OpenPlanIncomingRequestsPage> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor?.trim() || null;
  const force = options?.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedOpenPlanIncoming(userId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `open_plan_incoming:${userId}:first`
    : `open_plan_incoming:${userId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc("list_my_open_plan_requests", {
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw toPairUpRpcError(error);
      return parseOpenPlanIncomingRequestsPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    requests: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedOpenPlanIncoming(userId, page);
  return page;
}

export async function listMyOpenPlanRequestGroups(options?: {
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<OpenPlanRequestGroupsPage> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor?.trim() || null;
  const force = options?.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedOpenPlanRequestGroups(userId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `open_plan_request_groups:${userId}:first`
    : `open_plan_request_groups:${userId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc(
        "list_my_open_plan_request_groups",
        {
          p_limit: limit,
          p_cursor: cursor,
        }
      );
      if (error) throw toPairUpRpcError(error);
      return parseOpenPlanRequestGroupsPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    groups: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedOpenPlanRequestGroups(userId, page);
  return page;
}

export async function listOpenPlanRequesters(options: {
  opportunityId: string;
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}): Promise<OpenPlanRequestersPage> {
  const opportunityId = options.opportunityId?.trim() || "";
  if (!opportunityId) throw new Error("Missing opportunity");
  const limit = options.limit ?? 20;
  const cursor = options.cursor?.trim() || null;
  const force = options.force === true;
  const userId = await requireSessionUserId();

  const isFirstPage = !cursor;
  if (isFirstPage && !force) {
    const cached = getCachedOpenPlanRequesters(userId, opportunityId);
    if (cached) return cached;
  }

  const dedupeKey = isFirstPage
    ? `open_plan_requesters:${userId}:${opportunityId}:first`
    : `open_plan_requesters:${userId}:${opportunityId}:cursor:${cursor}`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc("list_open_plan_requesters", {
        p_opportunity_id: opportunityId,
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw toPairUpRpcError(error);
      return parseOpenPlanRequestersPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    requests: [],
    has_more: false,
    next_cursor: null,
  };
  if (isFirstPage) setCachedOpenPlanRequesters(userId, opportunityId, page);
  return page;
}

export async function acceptOpenPlanRequest(
  requestId: string,
  options?: {
    opportunityId?: string | null;
    remainingPreviews?: OpenPlanAnonymousPreview[] | null;
    remainingLatest?: { at: string; id: string } | null;
    acceptedWasLatest?: boolean;
  }
): Promise<OpenPlanAcceptResult> {
  if (!requestId) throw new Error("Missing request");

  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("accept_open_plan_request", {
    p_request_id: requestId,
  });
  if (error) throw toPairUpRpcError(error);

  const result = parseOpenPlanAcceptResult(data);
  if (!result) throw new Error("Accept Open Plan request failed");

  const opportunityId =
    options?.opportunityId?.trim() ||
    result.request?.opportunity_id?.trim() ||
    "";

  if (result.accepted) {
    invalidateOpenPlanIncoming(userId);
    if (opportunityId) {
      removeFromCachedOpenPlanRequesters(userId, opportunityId, requestId);
      patchOpenPlanRequestGroupsAfterAccept(userId, opportunityId, {
        remainingPreviews: options?.remainingPreviews ?? null,
        remainingLatest: options?.remainingLatest ?? null,
        acceptedWasLatest: options?.acceptedWasLatest === true,
      });
    } else {
      invalidateOpenPlanRequestGroups(userId);
    }
  } else if (result.reason === "plan_unavailable") {
    invalidateOpenPlanIncoming(userId);
    if (opportunityId) {
      invalidateOpenPlanRequesters(userId, opportunityId);
      patchOpenPlanRequestGroupsAfterAccept(userId, opportunityId, {
        remainingPreviews: null,
        remainingLatest: null,
        acceptedWasLatest: false,
        removePlan: true,
      });
    } else {
      invalidateOpenPlanRequestGroups(userId);
    }
  }

  return result;
}
