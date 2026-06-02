/**
 * Shared human-friendly schedule / posted-time labels for feed surfaces.
 * Viewer-local calendar (device timezone by default).
 */

import { CREATE_FLOW_WEEKDAYS } from "./createFlowScheduleConstants";

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

function resolveTimeZone(explicit?: string): string {
  if (explicit) return explicit;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Calendar YYYY-MM-DD in `timeZone` for instant `d`. */
function calendarDayKey(d: Date, timeZone: string): string {
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

function addCalendarDays(anchor: Date, deltaDays: number, timeZone: string): Date {
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

function normalizeRecurrenceCodes(codes: string[] | null | undefined): string[] {
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

/** Days until next matching recurrence (0 = today). */
function daysUntilNextRecurrence(
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

function upcomingSelectedDateKeys(
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
  if (offset >= 2 && offset <= 6) {
    const probe = addCalendarDays(from, offset, timeZone);
    const code = recurrenceCodeForCalendarDay(probe, timeZone);
    const weekday = RECURRENCE_CODE_TO_WEEKDAY[code] ?? "day";
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

  if (input.type === "hangout" && recurring && recurrenceDays.length > 0) {
    const offset = daysUntilNextRecurrence(recurrenceDays, now, timeZone);
    if (offset >= 0) {
      result = labelForDayOffsetWithContext(offset, now, timeZone);
    } else if (hasSchedule) {
      const upcoming = upcomingSelectedDateKeys(
        input.selectedDates!,
        now,
        timeZone
      );
      result =
        upcoming.length > 0
          ? labelForDayOffsetWithContext(
              dayOffset(calendarDayKey(now, timeZone), upcoming[0], timeZone),
              now,
              timeZone
            )
          : { label: "Event passed", kind: "passed", highlight: false };
    } else {
      result = formatPostedAgo(input.createdAt, now, timeZone);
    }
  } else if (hasSchedule) {
    const upcoming = upcomingSelectedDateKeys(input.selectedDates!, now, timeZone);
    if (upcoming.length > 0) {
      const offset = dayOffset(
        calendarDayKey(now, timeZone),
        upcoming[0],
        timeZone
      );
      result = labelForDayOffsetWithContext(offset, now, timeZone);
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
