/**
 * Pair Up RPC wrappers (no UI).
 */

import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import { assertPlainTextAllowedForUgc } from "../../lib/ugcTextPolicy";
import type {
  PairUpCandidate,
  PairUpCandidatesPage,
  PairUpDiscoverConnectResult,
  PairUpExpressResult,
  PairUpMatchCompletion,
  PairUpOpportunity,
  PeopleSourceListItem,
  PeopleSourcesPage,
} from "../../lib/people/types";
import {
  getCachedPairUp,
  getCachedPairUpDeck,
  getCachedPairUpDeckPreview,
  invalidatePairUpDeck,
  invalidatePairUpDeckKind,
  invalidatePairUpForPost,
  PAIR_UP_DECK_KIND_DISCOVER,
  PAIR_UP_DECK_KIND_MY_PLANS,
  setCachedPairUp,
  setCachedPairUpDeck,
  setCachedPairUpDeckPreview,
  type PairUpDeckKind,
} from "../../lib/pairUpCache";
import { getCachedProfile, setCachedProfile } from "../../lib/profileCache";
import {
  normalizeEchoPreset,
  normalizeProfilePhotos,
} from "../../lib/profilePhotos";
import {
  syncCachesAfterOwnDuoActivate,
  syncCachesAfterOwnDuoLeave,
} from "../../lib/ownProfileSocialSync";

type OpportunityRpcResult = {
  opportunity?: PairUpOpportunity | null;
  closed?: boolean;
};

function parseOpportunity(raw: unknown): PairUpOpportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.source_post_id !== "string") {
    return null;
  }
  return {
    id: row.id,
    source_post_id: row.source_post_id,
    status: typeof row.status === "string" ? row.status : "active",
    description: typeof row.description === "string" ? row.description : null,
    discoverable_until:
      typeof row.discoverable_until === "string" ? row.discoverable_until : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
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

/** PostgrestError is a plain object; String(err) becomes "[object Object]". */
export function toPairUpRpcError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return new Error(message);
    }
  }
  return new Error(String(err));
}

export async function getMyPairUpForSource(
  sourcePostId: string
): Promise<PairUpOpportunity | null> {
  if (!sourcePostId) return null;

  const userId = await requireSessionUserId();
  const cached = getCachedPairUp(userId, sourcePostId);
  if (cached !== undefined) return cached;

  const result = await requestManager.execute(
    `pair_up_get:${sourcePostId}`,
    async () => {
      const { data, error } = await supabase.rpc("get_my_pair_up_for_source", {
        p_source_post_id: sourcePostId,
      });
      if (error) throw error;
      return parseOpportunity((data as OpportunityRpcResult | null)?.opportunity);
    },
    "high"
  );

  if (result.error) throw result.error;
  const opportunity = result.data ?? null;
  setCachedPairUp(userId, sourcePostId, opportunity);
  return opportunity;
}

/** Per-RPC bound; matches the SQL DoS guardrail. Never truncate the caller list. */
const PAIR_UP_BATCH_MAX_IDS = 100;

type BatchMineRpcResult = {
  opportunities?: unknown;
};

function parseBatchOpportunities(raw: unknown): PairUpOpportunity[] {
  const payload = raw as BatchMineRpcResult | null;
  if (!Array.isArray(payload?.opportunities)) return [];
  return payload.opportunities
    .map(parseOpportunity)
    .filter((row): row is PairUpOpportunity => row != null);
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
 * Batch-read the caller's join state for source posts.
 * Skips cache hits (including cached null). Chunks missing IDs into ≤100 RPCs.
 * Does not silently truncate. A failed chunk throws without nulling unqueried IDs.
 */
export async function getMyPairUpsForSources(
  sourcePostIds: string[],
  options?: { bypassCache?: boolean }
): Promise<Map<string, PairUpOpportunity | null>> {
  const uniqueIds = dedupeSourcePostIds(sourcePostIds);
  const out = new Map<string, PairUpOpportunity | null>();
  if (uniqueIds.length === 0) return out;

  const userId = await requireSessionUserId();

  const missing: string[] = [];
  for (const id of uniqueIds) {
    if (!options?.bypassCache) {
      const cached = getCachedPairUp(userId, id);
      if (cached !== undefined) {
        out.set(id, cached);
        continue;
      }
    }
    missing.push(id);
  }

  if (missing.length === 0) return out;

  for (let i = 0; i < missing.length; i += PAIR_UP_BATCH_MAX_IDS) {
    const chunk = missing.slice(i, i + PAIR_UP_BATCH_MAX_IDS);
    const result = await requestManager.execute(
      `pair_up_get_batch:${chunk.join(",")}`,
      async () => {
        const { data, error } = await supabase.rpc(
          "get_my_pair_ups_for_sources",
          { p_source_post_ids: chunk }
        );
        if (error) throw error;
        return parseBatchOpportunities(data);
      },
      "high"
    );

    if (result.error) throw result.error;

    const foundBySource = new Map<string, PairUpOpportunity>();
    for (const opportunity of result.data ?? []) {
      foundBySource.set(opportunity.source_post_id, opportunity);
    }

    for (const id of chunk) {
      const opportunity = foundBySource.get(id) ?? null;
      setCachedPairUp(userId, id, opportunity);
      out.set(id, opportunity);
    }
  }

  return out;
}

const PEOPLE_SOURCES_DEFAULT_LIMIT = 15;

type PeopleSourcesRpcResult = {
  sources?: unknown;
  has_more?: unknown;
};

function parsePeopleSourceItem(raw: unknown): PeopleSourceListItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.source_post_id !== "string" || !row.source_post_id) return null;
  return { source_post_id: row.source_post_id };
}

/**
 * Read-only catalog of source posts with current Pair Up activity.
 * IDs only. No deck cache. No UI.
 */
export async function listPeopleSources(options?: {
  limit?: number;
  offset?: number;
}): Promise<PeopleSourcesPage> {
  const limit = options?.limit ?? PEOPLE_SOURCES_DEFAULT_LIMIT;
  const offset = options?.offset ?? 0;

  await requireSessionUserId();

  const result = await requestManager.execute(
    `people_sources:${limit}:${offset}`,
    async () => {
      const { data, error } = await supabase.rpc("list_people_sources", {
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      const payload = data as PeopleSourcesRpcResult | null;
      const sources = Array.isArray(payload?.sources)
        ? payload.sources
            .map(parsePeopleSourceItem)
            .filter((row): row is PeopleSourceListItem => row != null)
        : [];
      return {
        sources,
        has_more: payload?.has_more === true,
      } satisfies PeopleSourcesPage;
    },
    "high"
  );

  if (result.error) throw result.error;
  return result.data ?? { sources: [], has_more: false };
}

export async function joinPairUp(
  sourcePostId: string,
  description?: string | null
): Promise<PairUpOpportunity> {
  if (!sourcePostId) throw new Error("Missing source post");

  const trimmed = description?.trim() || null;
  if (trimmed) assertPlainTextAllowedForUgc(trimmed, "default");

  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("join_pair_up", {
    p_source_post_id: sourcePostId,
    p_description: trimmed,
  });
  if (error) throw error;

  const opportunity = parseOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Join failed");

  setCachedPairUp(userId, sourcePostId, opportunity);
  invalidatePairUpDeck(userId);
  syncCachesAfterOwnDuoActivate(userId, sourcePostId);
  return opportunity;
}

export async function setP2pDiscoverEnabled(
  enabled: boolean
): Promise<boolean> {
  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("set_p2p_discover_enabled", {
    p_enabled: enabled,
  });
  if (error) throw toPairUpRpcError(error);

  const row = data as { p2p_discover_enabled?: unknown } | null;
  const next = row?.p2p_discover_enabled === true;

  invalidatePairUpDeckKind(userId, PAIR_UP_DECK_KIND_DISCOVER);

  const storedProfileId = localStorage.getItem("my_profile_id");
  const existing = storedProfileId
    ? getCachedProfile(storedProfileId)
    : null;
  if (existing) {
    const patched = { ...existing, p2p_discover_enabled: next };
    setCachedProfile(patched);
    window.dispatchEvent(
      new CustomEvent("profile:updated", {
        detail: { id: existing.id, profile: patched },
      })
    );
  }

  return next;
}

export async function leavePairUp(sourcePostId: string): Promise<void> {
  if (!sourcePostId) throw new Error("Missing source post");

  const userId = await requireSessionUserId();
  const prior = getCachedPairUp(userId, sourcePostId);
  const opportunityId =
    prior &&
    typeof prior.id === "string" &&
    prior.id !== "optimistic" &&
    prior.id !== "feed_snapshot" &&
    !prior.id.startsWith("persist:")
      ? prior.id
      : null;

  const { error } = await supabase.rpc("leave_pair_up", {
    p_source_post_id: sourcePostId,
  });
  if (error) throw error;

  invalidatePairUpForPost(sourcePostId);
  setCachedPairUp(userId, sourcePostId, null);
  invalidatePairUpDeck(userId);
  syncCachesAfterOwnDuoLeave(userId, sourcePostId, opportunityId);
}

/** Max length for Pair Up notes (parity with invite notes). */
export const PAIR_UP_NOTE_MAX_LENGTH = 200;

/**
 * Update or clear the caller's active in-window Pair Up description.
 * Empty/whitespace clears the note.
 */
export async function updatePairUpNote(
  sourcePostId: string,
  description?: string | null
): Promise<PairUpOpportunity> {
  if (!sourcePostId) throw new Error("Missing source post");

  const trimmed = description?.trim() || null;
  if (trimmed) {
    if (trimmed.length > PAIR_UP_NOTE_MAX_LENGTH) {
      throw new Error("Description too long");
    }
    assertPlainTextAllowedForUgc(trimmed, "default");
  }

  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("update_pair_up_note", {
    p_source_post_id: sourcePostId,
    p_description: trimmed,
  });
  if (error) throw toPairUpRpcError(error);

  const opportunity = parseOpportunity(
    (data as OpportunityRpcResult | null)?.opportunity
  );
  if (!opportunity) throw new Error("Couldn't update note");

  // Own note is not a row in the caller's People deck — patch local cache only.
  setCachedPairUp(userId, sourcePostId, opportunity);
  return opportunity;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : [];
}

function parseSourceType(value: unknown): "hangout" | "experience" | null {
  return value === "hangout" || value === "experience" ? value : null;
}

/** Missing/old cache treats Discover as ON (same as People chip). */
export function isOwnP2pDiscoverDisabled(): boolean {
  const storedProfileId = localStorage.getItem("my_profile_id");
  if (!storedProfileId) return false;
  const existing = getCachedProfile(storedProfileId);
  return existing?.p2p_discover_enabled === false;
}

function parsePageCandidates(payload: {
  candidates?: unknown;
} | null): PairUpCandidate[] {
  if (!Array.isArray(payload?.candidates)) return [];
  return payload.candidates
    .map(parseCandidate)
    .filter((row): row is PairUpCandidate => row != null);
}

function parseOpaqueCursor(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseCandidate(raw: unknown): PairUpCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.opportunity_id !== "string" || typeof row.source_post_id !== "string") {
    return null;
  }
  if (typeof row.creator_id !== "string") return null;
  return {
    opportunity_id: row.opportunity_id,
    source_post_id: row.source_post_id,
    creator_id: row.creator_id,
    description: typeof row.description === "string" ? row.description : null,
    discoverable_until:
      typeof row.discoverable_until === "string" ? row.discoverable_until : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    username: typeof row.username === "string" ? row.username : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    profile_photos: normalizeProfilePhotos(row.profile_photos),
    echo_preset: normalizeEchoPreset(row.echo_preset),
    expressed_by_me: row.expressed_by_me === true,
    profile_id: typeof row.profile_id === "string" ? row.profile_id : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    source_caption: typeof row.source_caption === "string" ? row.source_caption : null,
    source_type: parseSourceType(row.source_type),
    source_created_at:
      typeof row.source_created_at === "string" ? row.source_created_at : null,
    source_selected_dates: parseStringArray(row.source_selected_dates),
    source_is_recurring:
      typeof row.source_is_recurring === "boolean" ? row.source_is_recurring : null,
    source_recurrence_days: parseStringArray(row.source_recurrence_days),
  };
}

export async function listPairUpCandidates(options?: {
  sourcePostId?: string | null;
  limit?: number;
  offset?: number;
  /** Opaque Discover keyset. Ignored for My Plans. */
  cursor?: string | null;
  /** Skip a still-valid 120s cache read and hit the network. */
  force?: boolean;
  kind?: PairUpDeckKind;
}): Promise<PairUpCandidatesPage> {
  const sourcePostId = options?.sourcePostId ?? null;
  const limit = options?.limit;
  const offset = options?.offset ?? 0;
  const cursor = options?.cursor ?? null;
  const force = options?.force === true;
  const kind = options?.kind ?? PAIR_UP_DECK_KIND_MY_PLANS;

  const userId = await requireSessionUserId();

  if (kind === PAIR_UP_DECK_KIND_DISCOVER) {
    if (isOwnP2pDiscoverDisabled()) {
      return { candidates: [], has_more: false, next_cursor: null };
    }

    const isFirstPage = !cursor;
    if (isFirstPage && !force) {
      const cached = getCachedPairUpDeck(userId, null, 0, kind);
      if (cached) return cached;
    }

    const result = await requestManager.execute(
      `pair_up_candidates:${kind}:mixed:${cursor ?? "start"}`,
      async () => {
        const { data, error } = await supabase.rpc(
          "list_discover_pair_up_candidates",
          {
            p_limit: limit ?? 20,
            p_cursor: cursor,
          }
        );
        if (error) throw toPairUpRpcError(error);
        const payload = data as {
          candidates?: unknown;
          has_more?: unknown;
          next_cursor?: unknown;
        } | null;
        return {
          candidates: parsePageCandidates(payload),
          has_more: payload?.has_more === true,
          next_cursor: parseOpaqueCursor(payload?.next_cursor),
        } satisfies PairUpCandidatesPage;
      },
      "high"
    );

    if (result.error) throw toPairUpRpcError(result.error);
    const page = result.data ?? {
      candidates: [],
      has_more: false,
      next_cursor: null,
    };
    if (isFirstPage) setCachedPairUpDeck(userId, null, 0, page, kind);
    return page;
  }

  if (offset === 0 && !force) {
    const cached = getCachedPairUpDeck(userId, sourcePostId, 0, kind);
    if (cached) return cached;
  }

  const filter = sourcePostId ?? "mixed";
  const result = await requestManager.execute(
    `pair_up_candidates:${kind}:${filter}:${offset}`,
    async () => {
      const { data, error } = await supabase.rpc("list_pair_up_candidates", {
        p_source_post_id: sourcePostId,
        p_limit: limit ?? 20,
        p_offset: offset,
      });
      if (error) throw toPairUpRpcError(error);
      const payload = data as { candidates?: unknown; has_more?: unknown } | null;
      return {
        candidates: parsePageCandidates(payload),
        has_more: payload?.has_more === true,
        next_cursor: null,
      } satisfies PairUpCandidatesPage;
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? {
    candidates: [],
    has_more: false,
    next_cursor: null,
  };
  if (offset === 0) setCachedPairUpDeck(userId, sourcePostId, 0, page, kind);
  return page;
}

const MATCH_DECK_PREVIEW_LIMIT = 2;

/**
 * Lightweight Match Deck launcher preview. Must not write the mixed offset-0
 * full-deck cache (that key does not include limit).
 */
export async function listPairUpCandidatesPreview(options?: {
  force?: boolean;
}): Promise<PairUpCandidatesPage> {
  const userId = await requireSessionUserId();
  if (!options?.force) {
    const cached = getCachedPairUpDeckPreview(userId);
    if (cached) return cached;
  }

  const result = await requestManager.execute(
    `pair_up_candidates_preview:${userId}`,
    async () => {
      const { data, error } = await supabase.rpc("list_pair_up_candidates", {
        p_source_post_id: null,
        p_limit: MATCH_DECK_PREVIEW_LIMIT,
        p_offset: 0,
      });
      if (error) throw toPairUpRpcError(error);
      const payload = data as { candidates?: unknown; has_more?: unknown } | null;
      const candidates = Array.isArray(payload?.candidates)
        ? payload.candidates
            .map(parseCandidate)
            .filter((row): row is PairUpCandidate => row != null)
        : [];
      return {
        candidates,
        has_more: payload?.has_more === true,
      } satisfies PairUpCandidatesPage;
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  const page = result.data ?? { candidates: [], has_more: false };
  setCachedPairUpDeckPreview(userId, page);
  return page;
}

export async function expressPairUpInterest(
  toOpportunityId: string
): Promise<PairUpExpressResult> {
  if (!toOpportunityId) throw new Error("Missing target opportunity");

  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("express_pair_up_interest", {
    p_to_opportunity_id: toOpportunityId,
  });
  if (error) throw error;

  const row = data as Record<string, unknown> | null;
  if (
    !row ||
    typeof row.from_opportunity_id !== "string" ||
    typeof row.to_opportunity_id !== "string"
  ) {
    throw new Error("Express failed");
  }

  invalidatePairUpDeck(userId);
  return {
    from_opportunity_id: row.from_opportunity_id,
    to_opportunity_id: row.to_opportunity_id,
    matched: row.matched === true,
  };
}

/**
 * Atomic Discover Connect. Calls only connect_discover_pair_up — never
 * join_pair_up + express_pair_up_interest as two client RPCs.
 * Does not open a DM; matched clients still call complete_pair_up_match.
 */
export async function connectDiscoverPairUp(
  toOpportunityId: string
): Promise<PairUpDiscoverConnectResult> {
  if (!toOpportunityId) throw new Error("Missing target opportunity");

  const userId = await requireSessionUserId();
  const { data, error } = await supabase.rpc("connect_discover_pair_up", {
    p_to_opportunity_id: toOpportunityId,
  });
  if (error) throw toPairUpRpcError(error);

  const row = data as Record<string, unknown> | null;
  const opportunity = parseOpportunity(row?.opportunity);
  if (
    !opportunity ||
    typeof row?.from_opportunity_id !== "string" ||
    typeof row?.to_opportunity_id !== "string"
  ) {
    throw new Error("Discover Connect failed");
  }

  setCachedPairUp(userId, opportunity.source_post_id, opportunity);
  invalidatePairUpDeck(userId);

  return {
    opportunity,
    from_opportunity_id: row.from_opportunity_id,
    to_opportunity_id: row.to_opportunity_id,
    matched: row.matched === true,
  };
}

export async function completePairUpMatch(
  toOpportunityId: string
): Promise<PairUpMatchCompletion> {
  if (!toOpportunityId) throw new Error("Missing target opportunity");

  const { data, error } = await supabase.rpc("complete_pair_up_match", {
    p_to_opportunity_id: toOpportunityId,
  });
  if (error) throw error;

  const row = data as Record<string, unknown> | null;
  const conversation_id =
    typeof row?.conversation_id === "string" ? row.conversation_id : null;
  const other_user_id =
    typeof row?.other_user_id === "string" ? row.other_user_id : null;
  const source_post_id =
    typeof row?.source_post_id === "string" ? row.source_post_id : null;
  if (!conversation_id || !other_user_id || !source_post_id) {
    throw new Error("Complete match failed");
  }

  return {
    conversation_id,
    other_user_id,
    source_post_id,
    created: row?.created === true,
  };
}
