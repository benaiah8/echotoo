/** Shared Start Time for every selected local calendar date (V4 schedule sheet). */

export type CreateFlowStartTime = {
  /** 0–23 local hours */
  hours: number;
  /** 0–59 local minutes */
  minutes: number;
};

/** Default when the Time wheel is first shown with no explicit time. */
export const CREATE_FLOW_DEFAULT_START_TIME: CreateFlowStartTime = {
  hours: 19,
  minutes: 0,
};

/**
 * Local midnight (00:00) is date-only in `selected_dates`.
 * Explicit 12:00 AM cannot be stored without a schema field, so the wheel
 * coerces that clock position to 12:01 AM.
 */
export const CREATE_FLOW_MIDNIGHT_EXPLICIT: CreateFlowStartTime = {
  hours: 0,
  minutes: 1,
};

export function isLocalMidnight(d: Date): boolean {
  return (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  );
}

export function clampCreateFlowMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(59, Math.max(0, Math.round(minutes)));
}

export function clampCreateFlowHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.min(23, Math.max(0, Math.round(hours)));
}

export function normalizeCreateFlowStartTime(
  time: CreateFlowStartTime
): CreateFlowStartTime {
  const hours = clampCreateFlowHours(time.hours);
  const minutes = clampCreateFlowMinutes(time.minutes);
  if (hours === 0 && minutes === 0) {
    return CREATE_FLOW_MIDNIGHT_EXPLICIT;
  }
  return { hours, minutes };
}

export function parseCreateFlowStartTime(
  raw: unknown
): CreateFlowStartTime | null {
  if (!raw || typeof raw !== "object") return null;
  const hours = (raw as { hours?: unknown }).hours;
  const minutes = (raw as { minutes?: unknown }).minutes;
  if (typeof hours !== "number" || typeof minutes !== "number") return null;
  return normalizeCreateFlowStartTime({ hours, minutes });
}

/**
 * Explicit Start Time from stored timestamps.
 * Local midnight (legacy date-only) is treated as no time — including 12:00 AM.
 * Minutes are kept as stored (0–59); legacy 15-minute values hydrate as-is.
 */
export function extractExplicitStartTime(
  dates: Date[]
): CreateFlowStartTime | null {
  if (dates.length === 0) return null;
  const d = dates[0];
  if (Number.isNaN(d.getTime()) || isLocalMidnight(d)) return null;
  return normalizeCreateFlowStartTime({
    hours: d.getHours(),
    minutes: d.getMinutes(),
  });
}

export function stampStartTimeOnDates(
  dates: Date[],
  time: CreateFlowStartTime | null
): Date[] {
  const stamped = time ? normalizeCreateFlowStartTime(time) : null;
  return dates.map((d) => {
    if (Number.isNaN(d.getTime())) return d;
    if (!stamped) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      stamped.hours,
      stamped.minutes,
      0,
      0
    );
  });
}

export function formatCreateFlowStartTime(time: CreateFlowStartTime): string {
  const period = time.hours >= 12 ? "PM" : "AM";
  const hour12 = time.hours % 12 === 0 ? 12 : time.hours % 12;
  const mm = String(time.minutes).padStart(2, "0");
  return `${hour12}:${mm} ${period}`;
}

/** Feed/detail schedule labels: omit “:00” minutes (e.g. `6 PM`, `7:30 PM`). */
export function formatCreateFlowStartTimeCompact(
  time: CreateFlowStartTime
): string {
  const period = time.hours >= 12 ? "PM" : "AM";
  const hour12 = time.hours % 12 === 0 ? 12 : time.hours % 12;
  if (time.minutes === 0) return `${hour12} ${period}`;
  const mm = String(time.minutes).padStart(2, "0");
  return `${hour12}:${mm} ${period}`;
}

export function startTimeTo12Hour(time: CreateFlowStartTime): {
  hour12: number;
  minutes: number;
  period: "AM" | "PM";
} {
  return {
    hour12: time.hours % 12 === 0 ? 12 : time.hours % 12,
    minutes: time.minutes,
    period: time.hours >= 12 ? "PM" : "AM",
  };
}

export function startTimeFrom12Hour(
  hour12: number,
  minutes: number,
  period: "AM" | "PM"
): CreateFlowStartTime {
  const h = hour12 % 12;
  const hours = period === "PM" ? h + 12 : h;
  return normalizeCreateFlowStartTime({ hours, minutes });
}
