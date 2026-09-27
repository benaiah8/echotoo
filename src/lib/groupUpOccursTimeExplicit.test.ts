/**
 * Group schedule Phase 2 — shared builder, prefill, dirty, migration contract.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isGroupCreateDraftDirty } from "./composeCreateDraftGuard";
import {
  deriveGroupUpScheduleFromOccursAt,
  deriveGroupUpSchedulePrefill,
} from "./groupUpSchedulePrefill";
import {
  buildSocialCreateSchedule,
  formatSocialOccursSchedule,
  parseOccursTimeExplicit,
} from "./openPlanSchedule";

describe("buildSocialCreateSchedule", () => {
  it("date only → noon + false", () => {
    const day = new Date(2026, 8, 18);
    const payload = buildSocialCreateSchedule(day, null);
    expect(payload).not.toBeNull();
    expect(payload!.occursTimeExplicit).toBe(false);
    expect(payload!.occursAt.getHours()).toBe(12);
    expect(payload!.occursAt.getMinutes()).toBe(0);
  });

  it("time → actual time + true", () => {
    const day = new Date(2026, 8, 18);
    const payload = buildSocialCreateSchedule(day, {
      hours: 19,
      minutes: 30,
    });
    expect(payload).not.toBeNull();
    expect(payload!.occursTimeExplicit).toBe(true);
    expect(payload!.occursAt.getHours()).toBe(19);
    expect(payload!.occursAt.getMinutes()).toBe(30);
  });

  it("null date → null", () => {
    expect(buildSocialCreateSchedule(null, null)).toBeNull();
  });
});

describe("parseOccursTimeExplicit + formatSocialOccursSchedule", () => {
  it("missing defaults true", () => {
    expect(parseOccursTimeExplicit(undefined)).toBe(true);
    expect(parseOccursTimeExplicit(null)).toBe(true);
  });

  it("false preserved", () => {
    expect(parseOccursTimeExplicit(false)).toBe(false);
  });

  it("false never shows noon/time", () => {
    const label = formatSocialOccursSchedule(
      "2026-09-18T12:00:00",
      false
    );
    expect(label).not.toMatch(/12:00|noon|PM|AM/i);
    expect(label.length).toBeGreaterThan(0);
  });

  it("true shows time", () => {
    const label = formatSocialOccursSchedule(
      "2026-09-18T19:30:00",
      true
    );
    expect(label).toMatch(/7:30|19:30/);
  });
});

describe("Event Group prefill", () => {
  it("timed source → explicit true", () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    future.setHours(19, 30, 0, 0);
    const prefill = deriveGroupUpSchedulePrefill({
      postType: "hangout",
      isRecurring: false,
      selectedDates: [future.toISOString()],
    });
    expect(prefill.sourceTimeExplicit).toBe(true);
    expect(prefill.startTime?.hours).toBe(19);
    const built = buildSocialCreateSchedule(
      prefill.selectedDates[0]!,
      prefill.sourceTimeExplicit ? prefill.startTime : null
    );
    expect(built?.occursTimeExplicit).toBe(true);
    expect(built?.occursAt.getHours()).toBe(19);
  });

  it("date-only → noon + false (no 19:00)", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const dateOnly = new Date(
      future.getFullYear(),
      future.getMonth(),
      future.getDate()
    );
    const prefill = deriveGroupUpSchedulePrefill({
      postType: "hangout",
      isRecurring: false,
      selectedDates: [dateOnly.toISOString()],
    });
    expect(prefill.sourceTimeExplicit).toBe(false);
    expect(prefill.startTime).toBeNull();
    const built = buildSocialCreateSchedule(
      prefill.selectedDates[0]!,
      null
    );
    expect(built?.occursTimeExplicit).toBe(false);
    expect(built?.occursAt.getHours()).toBe(12);
  });

  it("hydrate date-only ignores noon clock", () => {
    const future = new Date();
    future.setDate(future.getDate() + 4);
    const noon = new Date(
      future.getFullYear(),
      future.getMonth(),
      future.getDate(),
      12,
      0,
      0,
      0
    );
    const prefill = deriveGroupUpScheduleFromOccursAt(
      noon.toISOString(),
      false
    );
    expect(prefill.sourceTimeExplicit).toBe(false);
    expect(prefill.startTime).toBeNull();
  });
});

describe("Place Group dirty + validation helpers", () => {
  it("dirty includes Place schedule", () => {
    expect(
      isGroupCreateDraftDirty({
        titleDraft: "",
        descriptionDraft: "",
        selectedDate: new Date(2026, 8, 18),
        selectedTime: null,
      })
    ).toBe(true);
    expect(
      isGroupCreateDraftDirty({
        titleDraft: "",
        descriptionDraft: "",
        selectedDate: null,
        selectedTime: { hours: 20, minutes: 0 },
      })
    ).toBe(true);
    expect(
      isGroupCreateDraftDirty({
        titleDraft: "",
        descriptionDraft: "",
        selectedDate: null,
        selectedTime: null,
      })
    ).toBe(false);
  });

  it("Place create schedule requires date", () => {
    expect(buildSocialCreateSchedule(null, null)).toBeNull();
    expect(
      buildSocialCreateSchedule(new Date(2026, 8, 18), null)
    ).not.toBeNull();
  });
});

describe("group_up_occurs_time_explicit migration contract", () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      "../../supabase/migrations/20260921120000_group_up_occurs_time_explicit.sql"
    ),
    "utf8"
  );

  it("drops old signatures", () => {
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_group_up\(uuid, text, text, timestamptz\);/
    );
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.renew_group_up\(uuid, text, timestamptz\);/
    );
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.update_group_up_schedule\(uuid, timestamptz\);/
    );
  });

  it("new boolean DEFAULT true", () => {
    expect(sql).toMatch(
      /p_occurs_time_explicit boolean DEFAULT true/
    );
  });

  it("threads JSON helper + lists", () => {
    expect(sql).toMatch(/'occurs_time_explicit', o\.occurs_time_explicit/);
    expect(sql).toMatch(/'occurs_time_explicit', t\.occurs_time_explicit/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_group_up_candidates/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_group_ups_for_source/);
  });

  it("does not add a column", () => {
    expect(sql).not.toMatch(/ADD COLUMN/i);
  });
});
