/**
 * Home date-filter matched occurrence — the Addis calendar day that caused
 * a post to qualify for the active Today / Tomorrow / week window.
 * Labels only. Does not change eligibility or mutate posts.
 */

import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";
import {
  addCalendarDays,
  calendarDayKey,
  normalizeRecurrenceCodes,
} from "./postScheduleLabel";

const WEEKDAY_SHORT_TO_CODE: Record<string, string> = {
  Sun: "SU",
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
};

export type HomeMatchedOccurrencePost = {
  selected_dates?: string[] | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
};

export type HomeOccurrenceMatchContext = {
  occursOn?: string | null;
  occursFrom?: string | null;
  occursTo?: string | null;
  occursTz?: string | null;
};

function resolveOccurrenceTimeZone(ctx: HomeOccurrenceMatchContext): string {
  return ctx.occursTz?.trim() || HOME_EVENT_TIMEZONE;
}

function selectedAddisDayKeys(
  selectedDates: string[] | null | undefined,
  timeZone: string
): string[] {
  if (!selectedDates?.length) return [];
  const keys = new Set<string>();
  for (const raw of selectedDates) {
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const instant = new Date(trimmed);
    if (Number.isNaN(instant.getTime())) continue;
    const key = calendarDayKey(instant, timeZone);
    if (key) keys.add(key);
  }
  return [...keys];
}

function recurrenceCodeForDayKey(dayKey: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return "";
  const probe = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  );
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(probe);
  return WEEKDAY_SHORT_TO_CODE[short] ?? "";
}

function enumerateInclusiveDayKeys(
  fromKey: string,
  toKey: string,
  timeZone: string
): string[] {
  if (!fromKey || !toKey || fromKey > toKey) return [];
  const keys: string[] = [];
  let probe = new Date(`${fromKey}T12:00:00.000Z`);
  for (let i = 0; i < 400; i++) {
    const key = calendarDayKey(probe, timeZone);
    if (!key || key > toKey) break;
    if (key >= fromKey) keys.push(key);
    probe = addCalendarDays(probe, 1, timeZone);
  }
  return keys;
}

function postRecurrenceCodes(post: HomeMatchedOccurrencePost): Set<string> {
  return new Set(normalizeRecurrenceCodes(post.recurrence_days));
}

function postIsRecurring(post: HomeMatchedOccurrencePost, codes: Set<string>): boolean {
  return Boolean(post.is_recurring) || codes.size > 0;
}

function dayMatchesPost(
  dayKey: string,
  selectedKeys: Set<string>,
  recurring: boolean,
  codes: Set<string>,
  timeZone: string
): boolean {
  if (selectedKeys.has(dayKey)) return true;
  if (!recurring || codes.size === 0) return false;
  return codes.has(recurrenceCodeForDayKey(dayKey, timeZone));
}

/**
 * Addis YYYY-MM-DD that matched the active Home date filter, or null.
 */
export function getMatchedOccurrenceDayKey(
  post: HomeMatchedOccurrencePost,
  ctx: HomeOccurrenceMatchContext
): string | null {
  const timeZone = resolveOccurrenceTimeZone(ctx);
  const selectedKeys = new Set(selectedAddisDayKeys(post.selected_dates, timeZone));
  const codes = postRecurrenceCodes(post);
  const recurring = postIsRecurring(post, codes);

  const occursOn = ctx.occursOn?.trim() || null;
  if (occursOn) {
    return dayMatchesPost(occursOn, selectedKeys, recurring, codes, timeZone)
      ? occursOn
      : null;
  }

  const occursFrom = ctx.occursFrom?.trim() || null;
  const occursTo = ctx.occursTo?.trim() || null;
  if (!occursFrom || !occursTo) return null;

  for (const dayKey of enumerateInclusiveDayKeys(occursFrom, occursTo, timeZone)) {
    if (dayMatchesPost(dayKey, selectedKeys, recurring, codes, timeZone)) {
      return dayKey;
    }
  }
  return null;
}

export function hasActiveHomeOccurrenceFilter(
  ctx: Pick<HomeOccurrenceMatchContext, "occursOn" | "occursFrom" | "occursTo">
): boolean {
  if (ctx.occursOn) return true;
  if (ctx.occursFrom && ctx.occursTo) return true;
  return false;
}

export type LegacyFeedDateSortContext = Pick<
  HomeOccurrenceMatchContext,
  "occursOn" | "occursFrom" | "occursTo"
> & {
  type?: "hangout" | "experience" | string | null;
  friendsOnly?: boolean | null;
  q?: string | null;
  tags?: string[] | null;
};

/** True unfiltered Home All: no type, friends, occurrence, search, or tags. */
export function isTrueDefaultAllFeed(
  ctx: LegacyFeedDateSortContext
): boolean {
  if (ctx.type) return false;
  if (ctx.friendsOnly) return false;
  if (hasActiveHomeOccurrenceFilter(ctx)) return false;
  if (ctx.q && ctx.q.trim() !== "") return false;
  if (ctx.tags && ctx.tags.length > 0) return false;
  return true;
}

/**
 * Legacy feed date sorter: search/tags All only.
 * Skip occurrence, Events, Places, Friends, and true default All (server all_score).
 */
export function shouldApplyLegacyFeedDateSort(
  ctx: LegacyFeedDateSortContext
): boolean {
  if (hasActiveHomeOccurrenceFilter(ctx)) return false;
  if (ctx.friendsOnly) return false;
  if (ctx.type === "hangout" || ctx.type === "experience") return false;
  if (isTrueDefaultAllFeed(ctx)) return false;
  return true;
}
