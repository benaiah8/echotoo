import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { __parseGroupUpRequestGroupForTests } from "../api/services/groupUp";
import {
  closeGroupUpRequestersOverlay,
  getGroupUpRequestersOverlayState,
  openGroupUpRequestersOverlay,
} from "./groupUpRequestersOverlayStore";
import { formatSocialOccursSchedule } from "./openPlanSchedule";
import type { GroupUpRequestGroup } from "./people/types";

const GROUPS_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20260917120000_group_up_g4_request_groups.sql"
);
const SUCCESSOR_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261008120000_group_up_request_groups_occurs_at.sql"
);

function group(
  partial: Partial<GroupUpRequestGroup> = {}
): GroupUpRequestGroup {
  return {
    conversation_id: "conv-1",
    opportunity_id: "opp-1",
    group_title: "Weekend Coffee",
    description: "Short desc that can wrap onto two lines in the header",
    source_post_id: "post-1",
    source_type: "hangout",
    latest_request_at: "2026-09-04T10:00:00.000Z",
    latest_request_id: "req-e",
    pending_count: 2,
    new_count: 1,
    occurs_at: null,
    occurs_time_explicit: true,
    ...partial,
  };
}

const requiredPayload = {
  conversation_id: "conv-1",
  opportunity_id: "opp-1",
  latest_request_id: "req-e",
  pending_count: 2,
  new_count: 1,
};

afterEach(() => {
  closeGroupUpRequestersOverlay();
});

describe("list_my_group_up_request_groups schedule successor", () => {
  const base = readFileSync(GROUPS_SQL, "utf8");
  const sql = readFileSync(SUCCESSOR_SQL, "utf8");

  it("replaces only the groups RPC and adds occurs fields to the payload", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.list_my_group_up_request_groups"
    );
    expect(sql).toContain("o.occurs_at");
    expect(sql).toContain("o.occurs_time_explicit");
    expect(sql).toContain("'occurs_at', t.occurs_at");
    expect(sql).toContain("'occurs_time_explicit', t.occurs_time_explicit");
    expect(sql).not.toContain("ADD COLUMN");
    expect(sql).not.toContain("list_group_up_requesters");
    expect(sql).not.toContain("accept_group_up_request");
    expect(sql).not.toContain("discoverable_until");
  });

  it("keeps G4 security, filters, pagination, and counts", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO public, pg_temp");
    expect(sql).toContain("r.status = 'pending'");
    expect(sql).toContain("o.kind = 'group_up'");
    expect(sql).toContain("o.creator_id = v_me");
    expect(sql).toContain("COUNT(*)::integer AS pending_count");
    expect(sql).toContain("latest_request_at DESC, e.latest_request_id DESC");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_my_group_up_request_groups(integer, text)"
    );
    expect(base).not.toContain("'occurs_at', t.occurs_at");
  });
});

describe("__parseGroupUpRequestGroupForTests schedule", () => {
  it("keeps explicit time", () => {
    const parsed = __parseGroupUpRequestGroupForTests({
      ...requiredPayload,
      occurs_at: "2026-09-18T19:30:00",
      occurs_time_explicit: true,
    });
    expect(parsed?.occurs_at).toBe("2026-09-18T19:30:00");
    expect(parsed?.occurs_time_explicit).toBe(true);
    const label = formatSocialOccursSchedule(
      parsed!.occurs_at!,
      parsed!.occurs_time_explicit
    );
    expect(label).toMatch(/7:30|19:30/);
  });

  it("keeps date-only without showing noon", () => {
    const parsed = __parseGroupUpRequestGroupForTests({
      ...requiredPayload,
      occurs_at: "2026-09-18T12:00:00.000Z",
      occurs_time_explicit: false,
    });
    expect(parsed?.occurs_time_explicit).toBe(false);
    const label = formatSocialOccursSchedule(
      parsed!.occurs_at!,
      parsed!.occurs_time_explicit
    );
    expect(label).not.toMatch(/12:00|noon|PM|AM/i);
    expect(label.length).toBeGreaterThan(0);
  });

  it("treats missing occurs_at as undated", () => {
    const parsed = __parseGroupUpRequestGroupForTests(requiredPayload);
    expect(parsed?.occurs_at).toBeNull();
    expect(parsed?.occurs_time_explicit).toBe(true);
  });

  it("does not drop older cached groups missing the new fields", () => {
    const parsed = __parseGroupUpRequestGroupForTests({
      conversation_id: "conv-old",
      opportunity_id: "opp-old",
      group_title: "A very long group title that should still parse",
      description: "A long description that remains available to the drawer",
      latest_request_id: "req-old",
      pending_count: 4,
      new_count: 2,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.conversation_id).toBe("conv-old");
    expect(parsed?.group_title).toContain("very long group title");
    expect(parsed?.occurs_at).toBeNull();
    expect(parsed?.occurs_time_explicit).toBe(true);
  });
});

describe("openGroupUpRequestersOverlay schedule path", () => {
  it("copies opportunity schedule into the overlay without another RPC", () => {
    openGroupUpRequestersOverlay(
      group({
        occurs_at: "2026-09-18T19:30:00.000Z",
        occurs_time_explicit: true,
      })
    );
    const opening = getGroupUpRequestersOverlayState().opening;
    expect(opening?.occursAt).toBe("2026-09-18T19:30:00.000Z");
    expect(opening?.occursTimeExplicit).toBe(true);
    expect(opening?.groupTitle).toBe("Weekend Coffee");
    expect(opening?.description).toContain("two lines");
  });

  it("omits blank dates and treats missing explicit flag as true", () => {
    openGroupUpRequestersOverlay(
      group({
        occurs_at: "   ",
        occurs_time_explicit: undefined as unknown as boolean,
      })
    );
    const opening = getGroupUpRequestersOverlayState().opening;
    expect(opening?.occursAt).toBeNull();
    expect(opening?.occursTimeExplicit).toBe(true);
  });
});
