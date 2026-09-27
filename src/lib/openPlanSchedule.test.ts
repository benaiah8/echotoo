/**
 * Phase 2B.2 — Open Plan explicit-time parsing, storage mapping, display, migration.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  __parseOpenPlanCandidateForTests,
  __parseOpenPlanIncomingRequestForTests,
  __parseOpenPlanOpportunityForTests,
} from "../api/services/openPlans";
import {
  buildOpenPlanCreateSchedule,
  formatOpenPlanSchedule,
  parseOccursTimeExplicit,
  placeDuoCreateRequiresDate,
} from "./openPlanSchedule";

describe("parseOccursTimeExplicit", () => {
  it("missing → true", () => {
    expect(parseOccursTimeExplicit(undefined)).toBe(true);
    expect(parseOccursTimeExplicit(null)).toBe(true);
  });

  it("explicit true", () => {
    expect(parseOccursTimeExplicit(true)).toBe(true);
  });

  it("date-only false", () => {
    expect(parseOccursTimeExplicit(false)).toBe(false);
  });
});

describe("Open Plan RPC parsers", () => {
  const baseOpp = {
    id: "o1",
    source_post_id: "p1",
    creator_id: "u1",
    status: "active",
    description: null,
    occurs_at: "2026-10-12T12:00:00.000Z",
    discoverable_until: "2026-10-12T12:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    closed_at: null,
  };

  it("opportunity missing flag → true", () => {
    const parsed = __parseOpenPlanOpportunityForTests(baseOpp);
    expect(parsed?.occurs_time_explicit).toBe(true);
  });

  it("opportunity explicit false", () => {
    const parsed = __parseOpenPlanOpportunityForTests({
      ...baseOpp,
      occurs_time_explicit: false,
    });
    expect(parsed?.occurs_time_explicit).toBe(false);
  });

  it("candidate / incoming missing flag → true", () => {
    const cand = __parseOpenPlanCandidateForTests({
      opportunity_id: "o1",
      source_post_id: "p1",
      description: null,
      occurs_at: "2026-10-12T12:00:00.000Z",
      discoverable_until: "2026-10-12T12:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      avatar_url: null,
      profile_photos: [],
      echo_preset: null,
      bio: null,
      source_caption: null,
      source_type: "experience",
      my_request_status: null,
    });
    expect(cand?.occurs_time_explicit).toBe(true);

    const incoming = __parseOpenPlanIncomingRequestForTests({
      request_id: "r1",
      opportunity_id: "o1",
      requested_at: "2026-09-01T00:00:00.000Z",
      avatar_url: null,
      profile_photos: [],
      echo_preset: null,
      bio: null,
      source_post_id: "p1",
      source_caption: null,
      source_type: "experience",
      plan_description: null,
      occurs_at: "2026-10-12T12:00:00.000Z",
      discoverable_until: "2026-10-12T12:00:00.000Z",
    });
    expect(incoming?.occurs_time_explicit).toBe(true);
  });
});

describe("buildOpenPlanCreateSchedule", () => {
  const day = new Date(2026, 9, 12);

  it("null date → null (no RPC payload)", () => {
    expect(buildOpenPlanCreateSchedule(null, null)).toBeNull();
    expect(placeDuoCreateRequiresDate(null, null)).toBe(false);
  });

  it("date-only → local noon + false", () => {
    const payload = buildOpenPlanCreateSchedule(day, null);
    expect(payload).not.toBeNull();
    expect(payload!.occursTimeExplicit).toBe(false);
    expect(payload!.occursAt.getHours()).toBe(12);
    expect(payload!.occursAt.getMinutes()).toBe(0);
    expect(payload!.occursAt.getDate()).toBe(12);
    expect(payload!.occursAt.getMonth()).toBe(9);
  });

  it("date + time → stamped time + true", () => {
    const payload = buildOpenPlanCreateSchedule(day, {
      hours: 19,
      minutes: 30,
    });
    expect(payload!.occursTimeExplicit).toBe(true);
    expect(payload!.occursAt.getHours()).toBe(19);
    expect(payload!.occursAt.getMinutes()).toBe(30);
  });

  it("clear time returns date-only false semantics", () => {
    const withTime = buildOpenPlanCreateSchedule(day, {
      hours: 19,
      minutes: 0,
    });
    expect(withTime!.occursTimeExplicit).toBe(true);
    const cleared = buildOpenPlanCreateSchedule(day, null);
    expect(cleared!.occursTimeExplicit).toBe(false);
    expect(cleared!.occursAt.getHours()).toBe(12);
  });
});

describe("formatOpenPlanSchedule", () => {
  it("date-only never shows noon clock", () => {
    const localNoon = new Date(2026, 9, 12, 12, 0, 0, 0).toISOString();
    const label = formatOpenPlanSchedule(localNoon, false);
    expect(label.toLowerCase()).not.toMatch(/\b(noon|am|pm)\b/);
    expect(label.toLowerCase()).not.toMatch(/\d{1,2}:\d{2}/);
    expect(label).toMatch(/Oct/);
    expect(label).toMatch(/12/);
  });

  it("explicit time shows time", () => {
    const local = new Date(2026, 9, 12, 19, 0, 0, 0).toISOString();
    const label = formatOpenPlanSchedule(local, true);
    expect(label).toMatch(/7\s*PM|19/i);
  });
});

describe("create_open_plan migration signature safety", () => {
  it("drops old 3-arg signature and creates 4-arg with DEFAULT true", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260912120000_open_plan_occurs_time_explicit.sql"
      ),
      "utf8"
    );
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.create_open_plan(uuid, timestamptz, text);"
    );
    expect(sql).toMatch(
      /CREATE FUNCTION public\.create_open_plan\(\s*p_source_post_id uuid,\s*p_occurs_at timestamptz,\s*p_description text DEFAULT NULL,\s*p_occurs_time_explicit boolean DEFAULT true/s
    );
    // Must not leave a parallel CREATE for the old 3-arg overload.
    expect(sql).not.toMatch(
      /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION public\.create_open_plan\(\s*p_source_post_id uuid,\s*p_occurs_at timestamptz,\s*p_description text DEFAULT NULL\s*\)/s
    );
  });
});
