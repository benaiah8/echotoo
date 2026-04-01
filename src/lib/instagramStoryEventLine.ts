/**
 * One-line event summary for Instagram story (hangouts).
 * Recurrence → "Every Monday" / "Every Mon, Wed"; else earliest selected date.
 */

const SHORT_DAY: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

const FULL_DAY: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function formatCalendarDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatInstagramStoryEventLine(opts: {
  postType: "experience" | "hangout";
  selectedDates?: string[] | null;
  isRecurring?: boolean | null;
  recurrenceDays?: string[] | null;
}): string | null {
  if (opts.postType !== "hangout") return null;

  if (
    opts.isRecurring &&
    opts.recurrenceDays &&
    opts.recurrenceDays.length > 0
  ) {
    const codes = [...opts.recurrenceDays].filter(Boolean);
    if (codes.length === 1) {
      return `Every ${FULL_DAY[codes[0]] || codes[0]}`;
    }
    return `Every ${codes.map((c) => SHORT_DAY[c] || c).join(", ")}`;
  }

  if (opts.selectedDates && opts.selectedDates.length > 0) {
    const sorted = [...opts.selectedDates]
      .map((s) => new Date(s))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (sorted.length === 0) return null;
    return formatCalendarDate(sorted[0]);
  }

  return null;
}
