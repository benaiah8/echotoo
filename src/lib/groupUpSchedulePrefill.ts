/**
 * Derive optional Group Up create/renew schedule prefill from source post fields.
 * Date-only sources stamp local noon for persistence (never CREATE_FLOW_DEFAULT 19:00).
 */

import {
  extractExplicitStartTime,
  type CreateFlowStartTime,
} from "./createFlowStartTime";
import { stampSocialLocalNoon } from "./openPlanSchedule";
import {
  addCalendarDays,
  calendarDayKey,
  daysUntilNextRecurrence,
  normalizeRecurrenceCodes,
  resolveViewerTimeZone,
  upcomingSelectedDateKeys,
} from "./postScheduleLabel";

export type GroupUpSourceScheduleInput = {
  postType: "hangout" | "experience";
  isRecurring?: boolean | null;
  selectedDates?: string[] | null;
  recurrenceDays?: string[] | null;
};

export type GroupUpSchedulePrefill = {
  selectedDates: Date[];
  /** Explicit clock when source had one; null for date-only. */
  startTime: CreateFlowStartTime | null;
  /**
   * True when the source instant had a non-midnight clock time.
   * Persistence: true → stamp startTime; false → local noon + occurs_time_explicit=false.
   */
  sourceTimeExplicit: boolean;
};

const EMPTY: GroupUpSchedulePrefill = {
  selectedDates: [],
  startTime: null,
  sourceTimeExplicit: false,
};

function isFutureCalendarDay(day: Date): boolean {
  const noon = stampSocialLocalNoon(day);
  return !Number.isNaN(noon.getTime()) && noon.getTime() > Date.now();
}

function prefillFromInstant(instant: Date): GroupUpSchedulePrefill {
  const extracted = extractExplicitStartTime([instant]);
  const day = new Date(
    instant.getFullYear(),
    instant.getMonth(),
    instant.getDate()
  );
  if (extracted) {
    const stamped = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      extracted.hours,
      extracted.minutes,
      0,
      0
    );
    if (Number.isNaN(stamped.getTime()) || stamped.getTime() <= Date.now()) {
      return EMPTY;
    }
    return {
      selectedDates: [day],
      startTime: extracted,
      sourceTimeExplicit: true,
    };
  }
  if (!isFutureCalendarDay(day)) return EMPTY;
  return {
    selectedDates: [day],
    startTime: null,
    sourceTimeExplicit: false,
  };
}

function prefillFromHangoutDates(
  selectedDates: string[],
  now: Date,
  timeZone: string
): GroupUpSchedulePrefill {
  const upcoming = upcomingSelectedDateKeys(selectedDates, now, timeZone);
  if (upcoming.length === 0) return EMPTY;

  const targetKey = upcoming[0]!;
  let rawIso: string | null = null;
  for (const raw of selectedDates) {
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const instant = new Date(trimmed);
    if (Number.isNaN(instant.getTime())) continue;
    if (calendarDayKey(instant, timeZone) === targetKey) {
      rawIso = trimmed;
      break;
    }
  }

  if (!rawIso) return EMPTY;
  return prefillFromInstant(new Date(rawIso));
}

function prefillFromRecurring(
  selectedDates: string[] | null | undefined,
  recurrenceDays: string[],
  now: Date,
  timeZone: string
): GroupUpSchedulePrefill {
  const offset = daysUntilNextRecurrence(recurrenceDays, now, timeZone);
  if (offset < 0) return EMPTY;

  const probeDay = addCalendarDays(now, offset, timeZone);
  const probeKey = calendarDayKey(probeDay, timeZone);

  if (selectedDates?.length) {
    for (const raw of selectedDates) {
      const trimmed = String(raw).trim();
      if (!trimmed) continue;
      const instant = new Date(trimmed);
      if (Number.isNaN(instant.getTime())) continue;
      if (calendarDayKey(instant, timeZone) === probeKey) {
        return prefillFromInstant(instant);
      }
    }
  }

  const dateOnly = new Date(
    probeDay.getFullYear(),
    probeDay.getMonth(),
    probeDay.getDate()
  );
  return prefillFromInstant(dateOnly);
}

/** Optional schedule prefill for Group Up create/renew. Returns empty when unreliable. */
export function deriveGroupUpSchedulePrefill(
  input: GroupUpSourceScheduleInput | null | undefined,
  now: Date = new Date(),
  timeZone?: string
): GroupUpSchedulePrefill {
  if (!input || input.postType === "experience") return EMPTY;

  const tz = resolveViewerTimeZone(timeZone);
  const selectedDates = input.selectedDates ?? [];
  const recurrenceDays = normalizeRecurrenceCodes(input.recurrenceDays);

  if (input.isRecurring && recurrenceDays.length > 0) {
    return prefillFromRecurring(selectedDates, recurrenceDays, now, tz);
  }

  if (!input.isRecurring && selectedDates.length > 0) {
    return prefillFromHangoutDates(selectedDates, now, tz);
  }

  return EMPTY;
}

/**
 * Hydrate picker state from a stored occurs_at ISO when still in the future.
 * Prefer DB occurs_time_explicit when known — do not infer time from noon stamp.
 */
export function deriveGroupUpScheduleFromOccursAt(
  occursAt: string | null | undefined,
  occursTimeExplicit: boolean = true
): GroupUpSchedulePrefill {
  if (!occursAt?.trim()) return EMPTY;
  const instant = new Date(occursAt);
  if (Number.isNaN(instant.getTime())) return EMPTY;

  const day = new Date(
    instant.getFullYear(),
    instant.getMonth(),
    instant.getDate()
  );

  if (!occursTimeExplicit) {
    if (!isFutureCalendarDay(day)) return EMPTY;
    return {
      selectedDates: [day],
      startTime: null,
      sourceTimeExplicit: false,
    };
  }

  return prefillFromInstant(instant);
}
