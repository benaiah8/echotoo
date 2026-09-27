/**
 * Shared social create schedule: date-only vs explicit time.
 * Submission noon stamp lives here — FutureDateTimePanel never invents noon.
 */

import {
  formatCreateFlowStartTimeCompact,
  stampStartTimeOnDates,
  type CreateFlowStartTime,
} from "./createFlowStartTime";

/** Rollout-safe: missing / non-boolean → treat as explicit time (legacy rows). */
export function parseOccursTimeExplicit(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return true;
}

/** Local noon stamp for date-only creates (not shown in UI). */
export function stampSocialLocalNoon(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0
  );
}

/** @deprecated Prefer {@link stampSocialLocalNoon}. */
export const stampOpenPlanLocalNoon = stampSocialLocalNoon;

export type SocialCreateSchedulePayload = {
  occursAt: Date;
  occursTimeExplicit: boolean;
};

/** Open Plan alias — same shape. */
export type OpenPlanCreateSchedulePayload = SocialCreateSchedulePayload;

/**
 * Map date + optional time → occurs_at + occurs_time_explicit.
 * Date required; time optional. Panel must not call this with null date.
 */
export function buildSocialCreateSchedule(
  selectedDate: Date | null,
  selectedTime: CreateFlowStartTime | null
): SocialCreateSchedulePayload | null {
  if (!selectedDate || Number.isNaN(selectedDate.getTime())) return null;
  if (selectedTime) {
    const stamped = stampStartTimeOnDates([selectedDate], selectedTime)[0];
    if (!stamped || Number.isNaN(stamped.getTime())) return null;
    return { occursAt: stamped, occursTimeExplicit: true };
  }
  return {
    occursAt: stampSocialLocalNoon(selectedDate),
    occursTimeExplicit: false,
  };
}

/** @deprecated Prefer {@link buildSocialCreateSchedule}. */
export function buildOpenPlanCreateSchedule(
  selectedDate: Date | null,
  selectedTime: CreateFlowStartTime | null
): OpenPlanCreateSchedulePayload | null {
  return buildSocialCreateSchedule(selectedDate, selectedTime);
}

/** True when Place Duo / Place Group can build a create schedule (date required). */
export function placeDuoCreateRequiresDate(
  selectedDate: Date | null,
  selectedTime: CreateFlowStartTime | null
): boolean {
  if (!selectedDate) return false;
  return buildSocialCreateSchedule(selectedDate, selectedTime) != null;
}

function formatSocialDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Shared schedule label for Open Plan / Group.
 * occurs_time_explicit === false → date only (never noon).
 */
export function formatOpenPlanSchedule(
  occursAt: string,
  occursTimeExplicit: boolean
): string {
  const d = new Date(occursAt);
  if (Number.isNaN(d.getTime())) return "";
  const dateLabel = formatSocialDateLabel(d);
  if (!occursTimeExplicit) return dateLabel;
  const timeLabel = formatCreateFlowStartTimeCompact({
    hours: d.getHours(),
    minutes: d.getMinutes(),
  });
  return `${dateLabel} · ${timeLabel}`;
}

/** Alias for Group / People dense labels. */
export const formatSocialOccursSchedule = formatOpenPlanSchedule;
