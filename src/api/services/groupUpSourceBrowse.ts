/**
 * Source-scoped Group Up browse RPCs (counts + list). No UI.
 */

import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import { parseOccursTimeExplicit } from "../../lib/openPlanSchedule";
import { toPairUpRpcError } from "./pairUp";
import { normalizeEchoPreset } from "../../lib/profilePhotos";
import type {
  GroupUpViewerState,
  SourceGroupListPage,
  SourceGroupRow,
} from "../../lib/social/sourceGroupTypes";

export const GROUP_UP_COUNT_BATCH_MAX = 50;

function asNullableString(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

function parseOpaqueCursor(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parseViewerState(raw: unknown): GroupUpViewerState {
  if (raw === "owner" || raw === "pending" || raw === "member") return raw;
  return "none";
}

function parseSourceGroupRow(raw: unknown): SourceGroupRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.opportunity_id !== "string" ||
    typeof row.conversation_id !== "string" ||
    typeof row.source_post_id !== "string" ||
    typeof row.organizer_user_id !== "string"
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
  if (!source_type) return null;

  const memberCountRaw = row.member_count;
  const member_count =
    typeof memberCountRaw === "number"
      ? memberCountRaw
      : Number(memberCountRaw);

  return {
    opportunity_id: row.opportunity_id,
    conversation_id: row.conversation_id,
    source_post_id: row.source_post_id,
    group_title: asNullableString(row.group_title),
    group_description: asNullableString(row.group_description),
    occurs_at: asNullableString(row.occurs_at),
    occurs_time_explicit: parseOccursTimeExplicit(row.occurs_time_explicit),
    discoverable_until: asNullableString(row.discoverable_until) ?? "",
    created_at: asNullableString(row.created_at) ?? "",
    source_type,
    organizer_user_id: row.organizer_user_id,
    organizer_display_name: asNullableString(row.organizer_display_name),
    organizer_username: asNullableString(row.organizer_username),
    organizer_avatar_url: asNullableString(row.organizer_avatar_url),
    organizer_echo_preset: normalizeEchoPreset(row.organizer_echo_preset),
    member_count: Number.isFinite(member_count) ? member_count : 0,
    viewer_state: parseViewerState(row.viewer_state),
    request_id: asNullableString(row.request_id),
  };
}

export function parseSourceGroupListPage(raw: unknown): SourceGroupListPage {
  const payload = raw as {
    candidates?: unknown;
    has_more?: unknown;
    next_cursor?: unknown;
  } | null;
  const list = Array.isArray(payload?.candidates) ? payload.candidates : [];
  return {
    candidates: list
      .map(parseSourceGroupRow)
      .filter((row): row is SourceGroupRow => row != null),
    has_more: payload?.has_more === true,
    next_cursor: parseOpaqueCursor(payload?.next_cursor),
  };
}

function dedupeIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const t = id?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function requireSessionUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

/**
 * Returns Map<source_post_id, discoverable_group_count>.
 * Missing ids are filled as 0 by the caller/store.
 */
export async function getGroupUpCountsForSources(
  sourcePostIds: string[]
): Promise<Map<string, number>> {
  const uniqueIds = dedupeIds(sourcePostIds).sort();
  const out = new Map<string, number>();
  if (uniqueIds.length === 0) return out;

  const userId = await requireSessionUserId();

  for (let i = 0; i < uniqueIds.length; i += GROUP_UP_COUNT_BATCH_MAX) {
    const chunk = uniqueIds.slice(i, i + GROUP_UP_COUNT_BATCH_MAX);
    const result = await requestManager.execute(
      `group_up_counts:${userId}:${chunk.join(",")}`,
      async () => {
        const { data, error } = await supabase.rpc(
          "get_group_up_counts_for_sources",
          { p_source_post_ids: chunk }
        );
        if (error) throw toPairUpRpcError(error);
        return data;
      },
      "high"
    );
    if (result.error) throw toPairUpRpcError(result.error);

    const payload = result.data as { counts?: unknown } | null;
    const list = Array.isArray(payload?.counts) ? payload.counts : [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const id = asNullableString(row.source_post_id);
      if (!id) continue;
      const n = row.discoverable_group_count;
      const count = typeof n === "number" ? n : Number(n);
      out.set(id, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    }
    for (const id of chunk) {
      if (!out.has(id)) out.set(id, 0);
    }
  }

  return out;
}

export async function listGroupUpsForSource(options: {
  sourcePostId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<SourceGroupListPage> {
  const sourcePostId = options.sourcePostId?.trim() ?? "";
  if (!sourcePostId) {
    return { candidates: [], has_more: false, next_cursor: null };
  }
  const limit = options.limit ?? 20;
  const cursor = options.cursor?.trim() || null;
  const userId = await requireSessionUserId();

  const dedupeKey = cursor
    ? `group_up_source_list:${userId}:${sourcePostId}:cursor:${cursor}`
    : `group_up_source_list:${userId}:${sourcePostId}:first`;

  const result = await requestManager.execute(
    dedupeKey,
    async () => {
      const { data, error } = await supabase.rpc("list_group_ups_for_source", {
        p_source_post_id: sourcePostId,
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw toPairUpRpcError(error);
      return parseSourceGroupListPage(data);
    },
    "high"
  );

  if (result.error) throw toPairUpRpcError(result.error);
  return (
    result.data ?? { candidates: [], has_more: false, next_cursor: null }
  );
}
