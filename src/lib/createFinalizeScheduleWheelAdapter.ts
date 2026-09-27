/**
 * Create Finalize schedule sheet — wheel focus adapter (working copy only).
 * Does not import Duo/Group 12-month horizon.
 */

import {
  stampStartTimeOnDates,
  type CreateFlowStartTime,
} from "./createFlowStartTime";

/** Local calendar-day normalize (matches CreateScheduleCalendarBody). */
export function normalizeScheduleLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Technical envelope for FutureDateWheel props only.
 * Not a Create product rule; calendar selectable range stays unchanged.
 */
export function getCreateScheduleWheelTechnicalBounds(now = new Date()): {
  minDate: Date;
  maxDate: Date;
} {
  const y = now.getFullYear();
  return {
    minDate: new Date(y - 50, 0, 1),
    maxDate: new Date(y + 50, 11, 31),
  };
}

/** Focused index for wheel: last explicit working date. */
export function getCreateScheduleWheelFocusIndex(workingDates: Date[]): number {
  return Math.max(0, workingDates.length - 1);
}

export function getCreateScheduleWheelFocusDate(
  workingDates: Date[],
  now = new Date()
): Date {
  if (workingDates.length === 0) return normalizeScheduleLocalDay(now);
  return normalizeScheduleLocalDay(
    workingDates[getCreateScheduleWheelFocusIndex(workingDates)]!
  );
}

/**
 * Apply wheel selection into workingDates without collapsing multi-date sets.
 * 0 → [next]; 1 → replace; many → replace focused/last only.
 */
export function applyCreateScheduleWheelDateChange(
  workingDates: Date[],
  next: Date,
  workingStartTime: CreateFlowStartTime | null,
  focusIndex: number = getCreateScheduleWheelFocusIndex(workingDates)
): Date[] {
  const day = normalizeScheduleLocalDay(next);

  if (workingDates.length === 0) {
    return stampStartTimeOnDates([day], workingStartTime);
  }

  if (workingDates.length === 1) {
    return stampStartTimeOnDates([day], workingStartTime);
  }

  const idx = Math.min(
    Math.max(0, focusIndex),
    workingDates.length - 1
  );
  const copy = workingDates.map((d) => new Date(d.getTime()));
  copy[idx] = day;
  return stampStartTimeOnDates(copy, workingStartTime);
}
