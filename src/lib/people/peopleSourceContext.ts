/**
 * Normalized source context for People decks — derived from candidate rows only.
 * Zero network I/O. Keyed by source_post_id for reuse across candidates.
 */

import type { PairUpCandidate } from "./types";
import {
  getPostScheduleLabel,
  type PostScheduleLabelKind,
} from "../postScheduleLabel";

export type PeopleSourceContext = {
  source_post_id: string;
  source_type: "hangout" | "experience" | null;
  caption: string;
  scheduleLabel: string;
  /** Semantic kind for schedule chip colors — from getPostScheduleLabel. */
  scheduleLabelKind: PostScheduleLabelKind | null;
  source_created_at: string | null;
  source_selected_dates: string[] | null;
  source_is_recurring: boolean | null;
  source_recurrence_days: string[] | null;
};

const DEFAULT_CAPTION = "P2P plan";

/** Build one normalized source entry from a candidate row (no fetch). */
export function normalizePeopleSourceContext(
  row: Pick<
    PairUpCandidate,
    | "source_post_id"
    | "source_type"
    | "source_caption"
    | "source_created_at"
    | "source_selected_dates"
    | "source_is_recurring"
    | "source_recurrence_days"
  >
): PeopleSourceContext {
  const type = row.source_type;
  const createdAt = row.source_created_at;
  const schedule = type && createdAt
    ? getPostScheduleLabel({
        type,
        createdAt,
        selectedDates: row.source_selected_dates,
        isRecurring: row.source_is_recurring,
        recurrenceDays: row.source_recurrence_days,
      })
    : null;

  return {
    source_post_id: row.source_post_id,
    source_type: type,
    caption: row.source_caption?.trim() || DEFAULT_CAPTION,
    scheduleLabel: schedule?.label ?? "",
    scheduleLabelKind: schedule?.kind ?? null,
    source_created_at: createdAt,
    source_selected_dates: row.source_selected_dates,
    source_is_recurring: row.source_is_recurring,
    source_recurrence_days: row.source_recurrence_days,
  };
}

/**
 * Derived map: later rows for the same source_post_id overwrite earlier ones
 * (fresher list data wins). No persistence beyond the caller’s useMemo lifetime.
 */
export function buildPeopleSourceContextMap(
  candidates: readonly Pick<
    PairUpCandidate,
    | "source_post_id"
    | "source_type"
    | "source_caption"
    | "source_created_at"
    | "source_selected_dates"
    | "source_is_recurring"
    | "source_recurrence_days"
  >[]
): Map<string, PeopleSourceContext> {
  const map = new Map<string, PeopleSourceContext>();
  for (const row of candidates) {
    const id = row.source_post_id?.trim();
    if (!id) continue;
    map.set(id, normalizePeopleSourceContext(row));
  }
  return map;
}

export function getPeopleSourceContext(
  map: Map<string, PeopleSourceContext>,
  sourcePostId: string | null | undefined
): PeopleSourceContext | null {
  const id = sourcePostId?.trim();
  if (!id) return null;
  return map.get(id) ?? null;
}
