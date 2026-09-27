import { describe, expect, it } from "vitest";
import { mergeGroupUpBrowseAndMemberships } from "./groupUpBrowse";
import type { GroupUpCandidate } from "./people/types";

function row(
  partial: Partial<GroupUpCandidate> &
    Pick<GroupUpCandidate, "opportunity_id" | "conversation_id" | "viewer_state">
): GroupUpCandidate {
  return {
    source_post_id: "post",
    group_title: "Title",
    group_description: null,
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: "",
    created_at: "2026-01-01T00:00:00Z",
    source_type: "hangout",
    source_caption: null,
    source_selected_dates: null,
    source_recurrence_days: null,
    source_is_recurring: null,
    organizer_user_id: "org",
    organizer_display_name: null,
    organizer_username: null,
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 1,
    request_id: null,
    source_unavailable: false,
    ...partial,
  };
}

describe("mergeGroupUpBrowseAndMemberships", () => {
  it("keeps one row per conversation_id", () => {
    const browse = [
      row({
        opportunity_id: "opp-old",
        conversation_id: "conv-1",
        viewer_state: "none",
        created_at: "2026-01-01T00:00:00Z",
      }),
    ];
    const memberships = [
      row({
        opportunity_id: "opp-new",
        conversation_id: "conv-1",
        viewer_state: "member",
        created_at: "2026-02-01T00:00:00Z",
      }),
    ];
    const merged = mergeGroupUpBrowseAndMemberships(browse, memberships);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.opportunity_id).toBe("opp-new");
    expect(merged[0]?.viewer_state).toBe("member");
  });

  it("owner beats member beats pending", () => {
    const browse = [
      row({
        opportunity_id: "a",
        conversation_id: "c",
        viewer_state: "pending",
        request_id: "r1",
      }),
    ];
    const memberships = [
      row({
        opportunity_id: "a",
        conversation_id: "c",
        viewer_state: "member",
      }),
      row({
        opportunity_id: "a",
        conversation_id: "c",
        viewer_state: "owner",
      }),
    ];
    const merged = mergeGroupUpBrowseAndMemberships(browse, memberships);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.viewer_state).toBe("owner");
  });

  it("member beats stale pending", () => {
    const browse = [
      row({
        opportunity_id: "a",
        conversation_id: "c",
        viewer_state: "pending",
        request_id: "r1",
      }),
    ];
    const memberships = [
      row({
        opportunity_id: "a",
        conversation_id: "c",
        viewer_state: "member",
      }),
    ];
    const merged = mergeGroupUpBrowseAndMemberships(browse, memberships);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.viewer_state).toBe("member");
  });
});
