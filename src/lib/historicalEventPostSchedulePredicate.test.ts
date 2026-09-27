/**
 * Local static checks for the NULL-safe structured-schedule predicate used by
 * supabase/migrations/20261007120000_historical_event_post_type_mismatch_cleanup.sql
 *
 * Mirrors SQL:
 *   CASE WHEN jsonb_typeof(selected_dates) = 'array'
 *        THEN jsonb_array_length(selected_dates) > 0
 *        ELSE false END
 *   OR COALESCE(cardinality(recurrence_days), 0) > 0
 *   OR COALESCE(is_recurring, false) = true
 *
 * And documents why the old `typeof = 'array' AND length > 0` form fails under NULL.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type JsonbTypeof = "array" | "object" | "string" | "number" | "boolean" | "null" | null;

function jsonbTypeof(value: unknown): JsonbTypeof {
  if (value === null || value === undefined) return null; // SQL jsonb_typeof(NULL) → NULL
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return null;
}

/** Old defective form — can yield null (UNKNOWN). */
function hasStructuredScheduleOldNullable(args: {
  selectedDates: unknown;
  recurrenceDays: string[] | null;
  isRecurring: boolean | null;
}): boolean | null {
  const typeofDates = jsonbTypeof(args.selectedDates);
  const datesPart =
    typeofDates === "array"
      ? (args.selectedDates as unknown[]).length > 0
      : typeofDates === null
        ? null
        : false;
  const recurrencePart = (args.recurrenceDays?.length ?? 0) > 0;
  const recurringPart = (args.isRecurring ?? false) === true;

  // SQL: a OR b OR c with three-valued logic
  const or = (a: boolean | null, b: boolean | null): boolean | null => {
    if (a === true || b === true) return true;
    if (a === false && b === false) return false;
    return null;
  };
  return or(or(datesPart, recurrencePart), recurringPart);
}

/** NULL-safe form used by the fixed migration — always boolean. */
function hasStructuredScheduleNullSafe(args: {
  selectedDates: unknown;
  recurrenceDays: string[] | null;
  isRecurring: boolean | null;
}): boolean {
  const typeofDates = jsonbTypeof(args.selectedDates);
  const datesPart =
    typeofDates === "array"
      ? (args.selectedDates as unknown[]).length > 0
      : false; // ELSE false — including NULL selected_dates
  const recurrencePart = (args.recurrenceDays?.length ?? 0) > 0;
  const recurringPart = (args.isRecurring ?? false) === true;
  return datesPart || recurrencePart || recurringPart;
}

describe("historical cleanup structured-schedule NULL predicate", () => {
  it("1: selected_dates NULL, recurrence NULL, is_recurring false → no schedule", () => {
    const args = {
      selectedDates: null,
      recurrenceDays: null,
      isRecurring: false,
    };
    expect(hasStructuredScheduleOldNullable(args)).toBeNull();
    expect(hasStructuredScheduleNullSafe(args)).toBe(false);
    expect(!hasStructuredScheduleNullSafe(args)).toBe(true);
  });

  it("2: selected_dates empty array → no schedule", () => {
    const args = {
      selectedDates: [],
      recurrenceDays: null,
      isRecurring: false,
    };
    expect(hasStructuredScheduleNullSafe(args)).toBe(false);
    expect(!hasStructuredScheduleNullSafe(args)).toBe(true);
  });

  it("3: selected_dates populated → schedule", () => {
    expect(
      hasStructuredScheduleNullSafe({
        selectedDates: ["2026-08-14T21:00:00.000Z"],
        recurrenceDays: null,
        isRecurring: false,
      }),
    ).toBe(true);
  });

  it("4: recurrence_days populated → schedule", () => {
    expect(
      hasStructuredScheduleNullSafe({
        selectedDates: null,
        recurrenceDays: ["MO"],
        isRecurring: false,
      }),
    ).toBe(true);
  });

  it("5: is_recurring true → schedule", () => {
    expect(
      hasStructuredScheduleNullSafe({
        selectedDates: null,
        recurrenceDays: null,
        isRecurring: true,
      }),
    ).toBe(true);
  });

  it("6: malformed/non-array selected_dates → no array-length path; false unless other gates", () => {
    expect(
      hasStructuredScheduleNullSafe({
        selectedDates: { not: "array" },
        recurrenceDays: null,
        isRecurring: false,
      }),
    ).toBe(false);
  });

  it("old NOT(predicate) drops NULL selected_dates hangouts; fixed NOT does not", () => {
    const hangoutNoSchedule = {
      selectedDates: null,
      recurrenceDays: null,
      isRecurring: false,
    };
    // WHERE ... AND NOT(old) → NOT(NULL) → NULL → row excluded
    expect(hasStructuredScheduleOldNullable(hangoutNoSchedule)).toBeNull();
    // WHERE ... AND NOT(safe) → NOT(false) → true → row included
    expect(!hasStructuredScheduleNullSafe(hangoutNoSchedule)).toBe(true);
  });

  it("migration file uses CASE/ELSE false consistently; no old AND form", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261007120000_historical_event_post_type_mismatch_cleanup.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("ELSE false");
    expect(sql).toContain(
      "WHEN jsonb_typeof(p.selected_dates) = 'array'",
    );
    expect(sql).not.toMatch(
      /jsonb_typeof\(p\.selected_dates\) = 'array'\s+AND\s+jsonb_array_length/,
    );
    // verification comments also use CASE form
    expect(sql).toContain("WHEN jsonb_typeof(selected_dates) = 'array'");
    expect(sql).not.toMatch(
      /jsonb_typeof\(selected_dates\) = 'array'\s+AND\s+jsonb_array_length/,
    );
  });
});
