/**
 * Shared human-friendly schedule / posted-time labels for feed surfaces.
 * Viewer-local calendar (device timezone by default).
 */

import { CREATE_FLOW_WEEKDAYS } from "./createFlowScheduleConstants";
import {
  formatCreateFlowStartTimeCompact,
  normalizeCreateFlowStartTime,
  type CreateFlowStartTime,
} from "./createFlowStartTime";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** JS getDay() 0=Sun … 6=Sat → recurrence codes aligned with RPC / create flow */
const JS_DAY_TO_RECURRENCE_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const RECURRENCE_CODE_TO_WEEKDAY: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

export type PostScheduleLabelKind =
  | "today"
  | "tomorrow"
  | "next_weekday"
  | "in_days"
  | "posted_ago"
  | "passed";

export type PostScheduleLabelInput = {
  type: "hangout" | "experience";
  createdAt: string;
  selectedDates?: string[] | null;
  isRecurring?: boolean | null;
  recurrenceDays?: string[] | null;
  now?: Date;
  timeZone?: string;
  /**
   * Home date-filter matched Addis YYYY-MM-DD. When set, the label uses this
   * day instead of the nearest upcoming occurrence.
   */
  matchedOccurrenceDayKey?: string | null;
};

export type PostScheduleLabelResult = {
  label: string;
  kind: PostScheduleLabelKind;
  /** Today / Tomorrow — matches existing Post & Hangout highlight styling */
  highlight: boolean;
};

export function isPostScheduleLabelDebugEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("DEBUG_POST_SCHEDULE_LABEL") === "1"
  );
}

function logPostScheduleLabel(payload: Record<string, unknown>): void {
  if (!isPostScheduleLabelDebugEnabled()) return;
  console.log("[PostScheduleLabel]", payload);
}

/** Viewer-local IANA timezone (device default when omitted). */
export function resolveViewerTimeZone(explicit?: string): string {
  if (explicit) return explicit;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function resolveTimeZone(explicit?: string): string {
  return resolveViewerTimeZone(explicit);
}

/** Calendar YYYY-MM-DD in `timeZone` for instant `d`. */
export function calendarDayKey(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseCalendarDayKey(key: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const utcNoon = Date.UTC(y, mo, d, 12, 0, 0);
  const probe = new Date(utcNoon);
  const back = calendarDayKey(probe, timeZone);
  if (back === key) return probe;
  for (let h = 0; h < 24; h++) {
    const t = new Date(Date.UTC(y, mo, d, h, 0, 0));
    if (calendarDayKey(t, timeZone) === key) return t;
  }
  return probe;
}

export function addCalendarDays(
  anchor: Date,
  deltaDays: number,
  timeZone: string
): Date {
  const key = calendarDayKey(anchor, timeZone);
  const base = parseCalendarDayKey(key, timeZone);
  if (!base) {
    const f = new Date(anchor);
    f.setDate(f.getDate() + deltaDays);
    return f;
  }
  const next = new Date(base.getTime() + deltaDays * MS_PER_DAY);
  return parseCalendarDayKey(calendarDayKey(next, timeZone), timeZone) ?? next;
}

function dayOffset(fromKey: string, toKey: string, timeZone: string): number {
  const from = parseCalendarDayKey(fromKey, timeZone);
  const to = parseCalendarDayKey(toKey, timeZone);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function normalizeRecurrenceCodes(
  codes: string[] | null | undefined
): string[] {
  if (!codes?.length) return [];
  const allowed = new Set(CREATE_FLOW_WEEKDAYS.map((d) => d.code));
  return [...new Set(codes.map((c) => String(c).trim().toUpperCase()))].filter(
    (c) => allowed.has(c)
  );
}

function recurrenceCodeForCalendarDay(day: Date, timeZone: string): string {
  const key = calendarDayKey(day, timeZone);
  const parsed = parseCalendarDayKey(key, timeZone);
  const dow = (parsed ?? day).getDay();
  return JS_DAY_TO_RECURRENCE_CODE[dow] ?? "SU";
}

/** Days until next matching recurrence (0 = today). Returns -1 when exhausted. */
export function daysUntilNextRecurrence(
  recurrenceDays: string[],
  from: Date,
  timeZone: string
): number {
  const codes = new Set(recurrenceDays);
  const todayKey = calendarDayKey(from, timeZone);
  for (let offset = 0; offset < 370; offset++) {
    const probe = addCalendarDays(from, offset, timeZone);
    if (codes.has(recurrenceCodeForCalendarDay(probe, timeZone))) {
      return dayOffset(todayKey, calendarDayKey(probe, timeZone), timeZone);
    }
  }
  return -1;
}

/** Selected-date calendar keys on or after today's local day, sorted ascending. */
export function upcomingSelectedDateKeys(
  selectedDates: string[],
  from: Date,
  timeZone: string
): string[] {
  const todayKey = calendarDayKey(from, timeZone);
  const keys = new Set<string>();
  for (const raw of selectedDates) {
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const instant = new Date(trimmed);
    if (Number.isNaN(instant.getTime())) continue;
    const key = calendarDayKey(instant, timeZone);
    if (key >= todayKey) keys.add(key);
  }
  return [...keys].sort();
}

/** Viewer-local weekday index: 0=Sun … 6=Sat (matches JS getDay). */
function weekdayIndexInTimeZone(day: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(day);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short] ?? 0;
}

/** ISO-style calendar week start (Monday) for a YYYY-MM-DD key in `timeZone`. */
function calendarWeekStartKey(dayKey: string, timeZone: string): string {
  const anchor = parseCalendarDayKey(dayKey, timeZone);
  if (!anchor) return dayKey;
  const daysSinceMonday = (weekdayIndexInTimeZone(anchor, timeZone) + 6) % 7;
  const monday = addCalendarDays(anchor, -daysSinceMonday, timeZone);
  return calendarDayKey(monday, timeZone);
}

function isSameCalendarWeek(
  fromKey: string,
  toKey: string,
  timeZone: string
): boolean {
  return (
    calendarWeekStartKey(fromKey, timeZone) === calendarWeekStartKey(toKey, timeZone)
  );
}

function isImmediatelyNextCalendarWeek(
  fromKey: string,
  toKey: string,
  timeZone: string
): boolean {
  const fromWeekStart = calendarWeekStartKey(fromKey, timeZone);
  const fromWeekStartDate = parseCalendarDayKey(fromWeekStart, timeZone);
  if (!fromWeekStartDate) return false;
  const nextWeekStart = calendarDayKey(
    addCalendarDays(fromWeekStartDate, 7, timeZone),
    timeZone
  );
  return calendarWeekStartKey(toKey, timeZone) === nextWeekStart;
}

function labelForDayOffsetWithContext(
  offset: number,
  from: Date,
  timeZone: string
): PostScheduleLabelResult {
  if (offset === 0) {
    return { label: "Today", kind: "today", highlight: true };
  }
  if (offset === 1) {
    return { label: "Tomorrow", kind: "tomorrow", highlight: true };
  }

  const fromKey = calendarDayKey(from, timeZone);
  const probe = addCalendarDays(from, offset, timeZone);
  const targetKey = calendarDayKey(probe, timeZone);
  const code = recurrenceCodeForCalendarDay(probe, timeZone);
  const weekday = RECURRENCE_CODE_TO_WEEKDAY[code] ?? "day";

  if (isSameCalendarWeek(fromKey, targetKey, timeZone)) {
    return {
      label: `This ${weekday}`,
      kind: "next_weekday",
      highlight: false,
    };
  }

  if (isImmediatelyNextCalendarWeek(fromKey, targetKey, timeZone)) {
    return {
      label: `Next ${weekday}`,
      kind: "next_weekday",
      highlight: false,
    };
  }

  return {
    label: `in ${offset} days`,
    kind: "in_days",
    highlight: false,
  };
}

function clockPartsInTimeZone(
  instant: Date,
  timeZone: string
): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
    second: Number(parts.find((p) => p.type === "second")?.value ?? 0),
  };
}

/** Explicit start time from a stored ISO instant in `timeZone` (midnight = date-only). */
function extractStartTimeFromInstant(
  instant: Date,
  timeZone: string
): CreateFlowStartTime | null {
  const { hour, minute, second } = clockPartsInTimeZone(instant, timeZone);
  if (hour === 0 && minute === 0 && second === 0) return null;
  return normalizeCreateFlowStartTime({ hours: hour, minutes: minute });
}

function extractStartTimeFromIso(
  raw: string,
  timeZone: string
): CreateFlowStartTime | null {
  const instant = new Date(String(raw).trim());
  if (Number.isNaN(instant.getTime())) return null;
  return extractStartTimeFromInstant(instant, timeZone);
}

function occurrenceInstantForCalendarDay(
  dayKey: string,
  time: CreateFlowStartTime,
  timeZone: string
): Date | null {
  const anchor = parseCalendarDayKey(dayKey, timeZone);
  if (!anchor) return null;
  const target = normalizeCreateFlowStartTime(time);
  for (let deltaMin = -12 * 60; deltaMin <= 36 * 60; deltaMin++) {
    const probe = new Date(anchor.getTime() + deltaMin * 60_000);
    if (calendarDayKey(probe, timeZone) !== dayKey) continue;
    const clock = clockPartsInTimeZone(probe, timeZone);
    if (clock.hour === target.hours && clock.minute === target.minutes) {
      return probe;
    }
  }
  return null;
}

/** Start time for the selected next occurrence (shared time across stamped dates). */
function resolveOccurrenceStartTime(
  selectedDates: string[] | null | undefined,
  occurrenceDayKey: string,
  timeZone: string
): CreateFlowStartTime | null {
  if (!selectedDates?.length) return null;

  for (const raw of selectedDates) {
    const instant = new Date(String(raw).trim());
    if (Number.isNaN(instant.getTime())) continue;
    if (calendarDayKey(instant, timeZone) !== occurrenceDayKey) continue;
    const explicit = extractStartTimeFromInstant(instant, timeZone);
    if (explicit) return explicit;
  }

  for (const raw of selectedDates) {
    const explicit = extractStartTimeFromIso(raw, timeZone);
    if (explicit) return explicit;
  }

  return null;
}

function enrichHangoutLabelWithStartTime(
  base: PostScheduleLabelResult,
  offset: number,
  now: Date,
  occurrenceDayKey: string,
  startTime: CreateFlowStartTime | null,
  timeZone: string
): PostScheduleLabelResult {
  if (!startTime) return base;

  const todayKey = calendarDayKey(now, timeZone);
  const startInstant = occurrenceInstantForCalendarDay(
    occurrenceDayKey,
    startTime,
    timeZone
  );
  if (!startInstant) return base;

  if (occurrenceDayKey === todayKey) {
    const msUntil = startInstant.getTime() - now.getTime();
    if (msUntil <= 60_000) {
      return { label: "Happening now", kind: "today", highlight: true };
    }
    if (now.getTime() >= startInstant.getTime()) {
      return { label: "Happening now", kind: "today", highlight: true };
    }
    const minutesUntil = Math.floor(msUntil / 60_000);
    if (minutesUntil >= 60) {
      const hours = Math.floor(minutesUntil / 60);
      return { ...base, label: `${base.label} · in ${hours}h` };
    }
    return { ...base, label: `${base.label} · in ${minutesUntil}m` };
  }

  if (offset >= 1) {
    return {
      ...base,
      label: `${base.label} · ${formatCreateFlowStartTimeCompact(startTime)}`,
    };
  }

  return base;
}

function finalizeHangoutScheduleLabel(
  base: PostScheduleLabelResult,
  offset: number,
  now: Date,
  occurrenceDayKey: string,
  selectedDates: string[] | null | undefined,
  timeZone: string
): PostScheduleLabelResult {
  const startTime = resolveOccurrenceStartTime(
    selectedDates,
    occurrenceDayKey,
    timeZone
  );
  return enrichHangoutLabelWithStartTime(
    base,
    offset,
    now,
    occurrenceDayKey,
    startTime,
    timeZone
  );
}

function formatPostedAgo(createdAt: string, now: Date, timeZone: string): PostScheduleLabelResult {
  const createdKey = calendarDayKey(new Date(createdAt), timeZone);
  const todayKey = calendarDayKey(now, timeZone);
  const diff = dayOffset(createdKey, todayKey, timeZone);

  if (diff <= 0) {
    return { label: "posted today", kind: "posted_ago", highlight: false };
  }
  if (diff === 1) {
    return { label: "posted 1 day ago", kind: "posted_ago", highlight: false };
  }
  if (diff < 7) {
    return {
      label: `posted ${diff} days ago`,
      kind: "posted_ago",
      highlight: false,
    };
  }
  if (diff < 30) {
    return { label: "posted a week ago", kind: "posted_ago", highlight: false };
  }
  if (diff < 60) {
    return { label: "posted a month ago", kind: "posted_ago", highlight: false };
  }
  const months = Math.floor(diff / 30);
  if (months < 12) {
    return {
      label: `posted ${months} months ago`,
      kind: "posted_ago",
      highlight: false,
    };
  }
  return { label: "posted a year ago", kind: "posted_ago", highlight: false };
}

function hasAnyValidSelectedDate(selectedDates: string[] | null | undefined): boolean {
  if (!selectedDates?.length) return false;
  return selectedDates.some((raw) => {
    const t = new Date(String(raw).trim());
    return !Number.isNaN(t.getTime());
  });
}

/**
 * Primary label for feed cards (Post + Hangout rail).
 */
export function getPostScheduleLabel(
  input: PostScheduleLabelInput
): PostScheduleLabelResult {
  const now = input.now ?? new Date();
  const timeZone = resolveTimeZone(input.timeZone);
  const recurring =
    Boolean(input.isRecurring) ||
    normalizeRecurrenceCodes(input.recurrenceDays).length > 0;
  const recurrenceDays = normalizeRecurrenceCodes(input.recurrenceDays);
  const hasSchedule = hasAnyValidSelectedDate(input.selectedDates);

  let result: PostScheduleLabelResult;

  const matchedDayKey = input.matchedOccurrenceDayKey?.trim() || null;
  if (matchedDayKey) {
    const todayKey = calendarDayKey(now, timeZone);
    const offset = dayOffset(todayKey, matchedDayKey, timeZone);
    const base = labelForDayOffsetWithContext(offset, now, timeZone);
    result =
      input.type === "hangout"
        ? finalizeHangoutScheduleLabel(
            base,
            offset,
            now,
            matchedDayKey,
            input.selectedDates,
            timeZone
          )
        : base;
    logPostScheduleLabel({
      type: input.type,
      recurring,
      recurrenceDays,
      hasSchedule,
      matchedOccurrenceDayKey: matchedDayKey,
      label: result.label,
      kind: result.kind,
      highlight: result.highlight,
      timeZone,
    });
    return result;
  }

  if (input.type === "hangout" && recurring && recurrenceDays.length > 0) {
    const offset = daysUntilNextRecurrence(recurrenceDays, now, timeZone);
    if (offset >= 0) {
      const occurrenceDayKey = calendarDayKey(
        addCalendarDays(now, offset, timeZone),
        timeZone
      );
      const base = labelForDayOffsetWithContext(offset, now, timeZone);
      result = finalizeHangoutScheduleLabel(
        base,
        offset,
        now,
        occurrenceDayKey,
        input.selectedDates,
        timeZone
      );
    } else if (hasSchedule) {
      const upcoming = upcomingSelectedDateKeys(
        input.selectedDates!,
        now,
        timeZone
      );
      if (upcoming.length > 0) {
        const todayKey = calendarDayKey(now, timeZone);
        const occurrenceDayKey = upcoming[0]!;
        const offset = dayOffset(todayKey, occurrenceDayKey, timeZone);
        const base = labelForDayOffsetWithContext(offset, now, timeZone);
        result = finalizeHangoutScheduleLabel(
          base,
          offset,
          now,
          occurrenceDayKey,
          input.selectedDates,
          timeZone
        );
      } else {
        result = { label: "Event passed", kind: "passed", highlight: false };
      }
    } else {
      result = formatPostedAgo(input.createdAt, now, timeZone);
    }
  } else if (hasSchedule) {
    const upcoming = upcomingSelectedDateKeys(input.selectedDates!, now, timeZone);
    if (upcoming.length > 0) {
      const todayKey = calendarDayKey(now, timeZone);
      const occurrenceDayKey = upcoming[0]!;
      const offset = dayOffset(todayKey, occurrenceDayKey, timeZone);
      const base = labelForDayOffsetWithContext(offset, now, timeZone);
      result =
        input.type === "hangout"
          ? finalizeHangoutScheduleLabel(
              base,
              offset,
              now,
              occurrenceDayKey,
              input.selectedDates,
              timeZone
            )
          : base;
    } else if (input.type === "hangout") {
      result = { label: "Event passed", kind: "passed", highlight: false };
    } else {
      result = formatPostedAgo(input.createdAt, now, timeZone);
    }
  } else if (input.type === "experience" || input.type === "hangout") {
    result = formatPostedAgo(input.createdAt, now, timeZone);
  } else {
    result = formatPostedAgo(input.createdAt, now, timeZone);
  }

  logPostScheduleLabel({
    type: input.type,
    recurring,
    recurrenceDays,
    hasSchedule,
    label: result.label,
    kind: result.kind,
    highlight: result.highlight,
    timeZone,
  });

  return result;
}

/**
 * Post Detail Schedule box status line — presentation aliases only.
 * Reuses getPostScheduleLabel occurrence logic; does not change feed wording.
 *
 * - "Today · in 5h" / "… · in 45m" → "Starts in 5h" / "Starts in 45m"
 * - "Happening now" → "Happening now"
 * - "Event passed" → "Event passed"
 * - date-only / posted-ago / weekday+clock labels → null (no invention)
 */
export function formatPostDetailScheduleStatus(
  result: PostScheduleLabelResult
): string | null {
  const label = result.label.trim();
  if (!label) return null;

  if (result.kind === "passed" || label === "Event passed") {
    return "Event passed";
  }
  if (label === "Happening now") {
    return "Happening now";
  }

  const relative = /(?:^|·\s*)in (\d+)(h|m)$/i.exec(label);
  if (relative) {
    return `Starts in ${relative[1]}${relative[2]}`;
  }

  return null;
}
