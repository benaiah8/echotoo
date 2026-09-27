/**
 * Yours survival after source post deletion — parse + merge + deck identity.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGroupUpCandidate } from "../api/services/groupUp";
import { groupUpDeckRowId } from "./groupUpDeckRowId";
import {
  groupUpRowMatchesBrowseTab,
  mergeGroupUpBrowseAndMemberships,
} from "./groupUpBrowse";
import type { GroupUpCandidate } from "./people/types";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261029120000_list_my_group_up_memberships_survive_source_delete.sql"
);

function liveRow(
  partial: Partial<GroupUpCandidate> &
    Pick<GroupUpCandidate, "opportunity_id" | "conversation_id" | "viewer_state">
): GroupUpCandidate {
  return {
    source_post_id: "post-1",
    group_title: "Live Group",
    group_description: "desc",
    occurs_at: "2099-01-01T12:00:00.000Z",
    occurs_time_explicit: true,
    discoverable_until: "2099-02-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    source_type: "hangout",
    source_caption: "caption",
    source_selected_dates: null,
    source_recurrence_days: null,
    source_is_recurring: null,
    organizer_user_id: "org",
    organizer_display_name: "Org",
    organizer_username: "org",
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 2,
    request_id: null,
    source_unavailable: false,
    ...partial,
  };
}

function orphanRow(
  partial: Partial<GroupUpCandidate> &
    Pick<GroupUpCandidate, "conversation_id" | "viewer_state">
): GroupUpCandidate {
  return {
    opportunity_id: null,
    source_post_id: null,
    group_title: "Surviving Group",
    group_description: "still here",
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: null,
    created_at: "2026-01-01T00:00:00.000Z",
    source_type: null,
    source_caption: null,
    source_selected_dates: null,
    source_recurrence_days: null,
    source_is_recurring: null,
    organizer_user_id: "org",
    organizer_display_name: "Org",
    organizer_username: "org",
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 3,
    request_id: null,
    source_unavailable: true,
    ...partial,
  };
}

describe("list_my_group_up_memberships survive source delete", () => {
  it("migration is conversation-first with optional opp/post + source_unavailable", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("FROM public.conversation_members cm");
    expect(sql).toContain("c.kind = 'group'");
    expect(sql).toContain("c.dissolved_at IS NULL");
    expect(sql).toContain("cm.left_at IS NULL");
    expect(sql).toContain("LEFT JOIN public.social_opportunities o");
    expect(sql).toContain("LEFT JOIN public.posts p");
    expect(sql).toContain("'source_unavailable'");
    expect(sql).toContain("public._count_active_members");
    expect(sql).not.toMatch(
      /EXISTS\s*\(\s*SELECT 1\s+FROM public\.social_opportunities/
    );
    expect(sql).not.toContain("INNER JOIN public.posts p");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_my_group_up_memberships(integer, text)"
    );
    // Discovery RPCs untouched in this migration.
    expect(sql).not.toContain("list_group_up_candidates");
    expect(sql).not.toContain("list_group_ups_for_source");
  });

  it("parses live membership row unchanged", () => {
    const row = parseGroupUpCandidate({
      opportunity_id: "opp-1",
      conversation_id: "conv-1",
      source_post_id: "post-1",
      group_title: "Live",
      group_description: null,
      occurs_at: "2099-01-01T12:00:00.000Z",
      occurs_time_explicit: true,
      discoverable_until: "2099-02-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      source_type: "hangout",
      source_caption: "hi",
      source_selected_dates: null,
      source_recurrence_days: null,
      source_is_recurring: null,
      organizer_user_id: "org",
      organizer_display_name: null,
      organizer_username: null,
      organizer_avatar_url: null,
      organizer_echo_preset: null,
      member_count: 2,
      viewer_state: "owner",
      request_id: null,
      source_unavailable: false,
    });
    expect(row).not.toBeNull();
    expect(row?.opportunity_id).toBe("opp-1");
    expect(row?.source_unavailable).toBe(false);
    expect(row?.viewer_state).toBe("owner");
  });

  it("parses source-unavailable surviving membership", () => {
    const row = parseGroupUpCandidate({
      opportunity_id: null,
      conversation_id: "conv-survive",
      source_post_id: null,
      group_title: "Surviving",
      group_description: "chat lives",
      occurs_at: null,
      occurs_time_explicit: null,
      discoverable_until: null,
      created_at: "2026-01-01T00:00:00.000Z",
      source_type: null,
      source_caption: null,
      source_selected_dates: null,
      source_recurrence_days: null,
      source_is_recurring: null,
      organizer_user_id: "host",
      organizer_display_name: "Host",
      organizer_username: "host",
      organizer_avatar_url: null,
      organizer_echo_preset: null,
      member_count: 4,
      viewer_state: "member",
      request_id: null,
      source_unavailable: true,
    });
    expect(row).not.toBeNull();
    expect(row?.opportunity_id).toBeNull();
    expect(row?.source_post_id).toBeNull();
    expect(row?.source_type).toBeNull();
    expect(row?.source_unavailable).toBe(true);
    expect(row?.group_title).toBe("Surviving");
    expect(row?.member_count).toBe(4);
    expect(row?.viewer_state).toBe("member");
  });

  it("rejects incomplete live rows without inventing source_unavailable", () => {
    expect(
      parseGroupUpCandidate({
        opportunity_id: null,
        conversation_id: "conv-1",
        source_post_id: null,
        source_type: null,
        organizer_user_id: "org",
        viewer_state: "member",
        member_count: 1,
        source_unavailable: false,
      })
    ).toBeNull();
  });

  it("deck row id falls back to conversation_id", () => {
    expect(
      groupUpDeckRowId({
        opportunity_id: null,
        conversation_id: "conv-x",
      })
    ).toBe("conv-x");
    expect(
      groupUpDeckRowId({
        opportunity_id: "opp-1",
        conversation_id: "conv-x",
      })
    ).toBe("opp-1");
  });

  it("source-unavailable appears in Yours only, not New", () => {
    const orphan = orphanRow({
      conversation_id: "conv-o",
      viewer_state: "member",
    });
    expect(groupUpRowMatchesBrowseTab(orphan, "yours")).toBe(true);
    expect(groupUpRowMatchesBrowseTab(orphan, "new")).toBe(false);
  });

  it("merge keeps surviving membership by conversation_id", () => {
    const browse = [
      liveRow({
        opportunity_id: "opp-live",
        conversation_id: "conv-other",
        viewer_state: "none",
      }),
    ];
    const memberships = [
      orphanRow({
        conversation_id: "conv-survive",
        viewer_state: "owner",
      }),
    ];
    const merged = mergeGroupUpBrowseAndMemberships(browse, memberships);
    expect(merged).toHaveLength(2);
    const surviving = merged.find((r) => r.conversation_id === "conv-survive");
    expect(surviving?.source_unavailable).toBe(true);
    expect(surviving?.viewer_state).toBe("owner");
    expect(
      merged.some(
        (r) => r.viewer_state === "none" && r.conversation_id === "conv-other"
      )
    ).toBe(true);
  });

  it("owner > member > pending precedence unchanged with orphan row", () => {
    const browse = [
      liveRow({
        opportunity_id: "opp-a",
        conversation_id: "conv-a",
        viewer_state: "pending",
        request_id: "r1",
      }),
    ];
    const memberships = [
      orphanRow({
        conversation_id: "conv-a",
        viewer_state: "owner",
        opportunity_id: null,
      }),
    ];
    const merged = mergeGroupUpBrowseAndMemberships(browse, memberships);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.viewer_state).toBe("owner");
    expect(merged[0]?.source_unavailable).toBe(true);
  });
});
