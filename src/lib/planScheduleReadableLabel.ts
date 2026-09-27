import { formatFinalizeDateGroupLabel } from "./createFlowDateSummary";
import {
  extractExplicitStartTime,
  formatCreateFlowStartTime,
  stampStartTimeOnDates,
  type CreateFlowStartTime,
} from "./createFlowStartTime";
import {
  calendarDayKey,
  addCalendarDays,
  resolveViewerTimeZone,
} from "./postScheduleLabel";

const RELATIVE_PREFIX_MAX_DAYS = 7;

function normalizeLocalCalendarDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function localCalendarDayOffset(from: Date, to: Date): number {
  const start = normalizeLocalCalendarDate(from);
  const end = normalizeLocalCalendarDate(to);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function timezoneCalendarDayOffset(
  from: Date,
  to: Date,
  timeZone: string
): number {
  const toKey = calendarDayKey(to, timeZone);
  for (let offset = -400; offset <= 400; offset++) {
    const probe = addCalendarDays(from, offset, timeZone);
    if (calendarDayKey(probe, timeZone) === toKey) return offset;
  }
  return localCalendarDayOffset(from, to);
}

function relativePrefix(offset: number): string | null {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset >= 2 && offset <= RELATIVE_PREFIX_MAX_DAYS) {
    return `In ${offset} days`;
  }
  return null;
}

function formatAbsoluteDateFragment(target: Date, now: Date): string {
  return formatFinalizeDateGroupLabel(
    { type: "single", start: normalizeLocalCalendarDate(target) },
    [normalizeLocalCalendarDate(target)],
    now
  );
}

function formatTimeSegment(
  instant: Date,
  explicitTime: CreateFlowStartTime | null
): string | null {
  if (explicitTime) return formatCreateFlowStartTime(explicitTime);
  const hours = instant.getHours();
  const minutes = instant.getMinutes();
  const seconds = instant.getSeconds();
  if (hours === 0 && minutes === 0 && seconds === 0) return null;
  return formatCreateFlowStartTime({ hours, minutes });
}

export type PlanScheduleReadableLabelInput =
  | { instant: Date }
  | { selectedDates: Date[]; startTime: CreateFlowStartTime | null };

/**
 * Human-readable plan schedule for Group Up UI (collapsed summary, source context, G2 cards).
 * Today · 8:00 PM | Tomorrow · 7:30 PM | In 3 days · Fri, Sep 4 · 8:00 PM | Fri, Nov 12 · 8:00 PM
 */
export function formatPlanScheduleReadableLabel(
  input: PlanScheduleReadableLabelInput
): string | null {
  const now = new Date();
  const timeZone = resolveViewerTimeZone();

  let targetInstant: Date | null = null;
  let explicitTime: CreateFlowStartTime | null = null;
  let localTargetDate: Date | null = null;

  if ("instant" in input) {
    const instant = input.instant;
    if (Number.isNaN(instant.getTime())) return null;
    targetInstant = instant;
    explicitTime = formatTimeSegment(instant, null)
      ? { hours: instant.getHours(), minutes: instant.getMinutes() }
      : null;
    if (
      instant.getHours() === 0 &&
      instant.getMinutes() === 0 &&
      instant.getSeconds() === 0
    ) {
      explicitTime = null;
    }
    const key = calendarDayKey(instant, timeZone);
    for (let h = 0; h < 24; h++) {
      const probe = new Date(instant);
      probe.setHours(h, 0, 0, 0);
      if (calendarDayKey(probe, timeZone) === key) {
        localTargetDate = normalizeLocalCalendarDate(probe);
        break;
      }
    }
    if (!localTargetDate) {
      localTargetDate = normalizeLocalCalendarDate(instant);
    }
  } else {
    const { selectedDates, startTime } = input;
    if (selectedDates.length === 0) return null;
    const stamped = stampStartTimeOnDates(selectedDates, startTime);
    const first = stamped[0];
    if (!first || Number.isNaN(first.getTime())) return null;
    targetInstant = first;
    explicitTime = extractExplicitStartTime(stamped) ?? startTime;
    localTargetDate = normalizeLocalCalendarDate(selectedDates[0]);
  }

  if (!targetInstant || !localTargetDate) return null;

  const offset = timezoneCalendarDayOffset(now, targetInstant, timeZone);
  const prefix = relativePrefix(offset);
  const dateFragment = formatAbsoluteDateFragment(localTargetDate, now);
  const timeFragment = explicitTime
    ? formatCreateFlowStartTime(explicitTime)
    : formatTimeSegment(targetInstant, null);

  if (prefix && offset <= RELATIVE_PREFIX_MAX_DAYS) {
    const parts = [prefix];
    if (offset >= 2) parts.push(dateFragment);
    if (timeFragment) parts.push(timeFragment);
    return parts.join(" · ");
  }

  const parts = [dateFragment];
  if (timeFragment) parts.push(timeFragment);
  return parts.join(" · ");
}
