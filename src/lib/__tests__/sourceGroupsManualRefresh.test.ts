import { describe, expect, it } from "vitest";
import {
  mergeSourceGroupPagePreservingInFlight,
  shouldZeroDiscoverableCountFromRefreshPage,
} from "../sourceGroupsManualRefresh";
import type { SourceGroupRow } from "../social/sourceGroupTypes";

function row(
  partial: Partial<SourceGroupRow> & Pick<SourceGroupRow, "opportunity_id">
): SourceGroupRow {
  return {
    conversation_id: "c1",
    source_post_id: "src-1",
    group_title: "G",
    group_description: "d",
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: "",
    created_at: "",
    source_type: "experience",
    organizer_user_id: "u1",
    organizer_display_name: null,
    organizer_username: null,
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 1,
    viewer_state: "none",
    request_id: null,
    ...partial,
  };
}

describe("mergeSourceGroupPagePreservingInFlight", () => {
  it("keeps optimistic pending state while request is in flight", () => {
    const prev = [
      row({
        opportunity_id: "o1",
        viewer_state: "pending",
        request_id: null,
      }),
    ];
    const page = {
      candidates: [
        row({
          opportunity_id: "o1",
          viewer_state: "none",
          request_id: null,
        }),
        row({ opportunity_id: "o2" }),
      ],
      has_more: false,
      next_cursor: null,
    };
    const merged = mergeSourceGroupPagePreservingInFlight(
      page,
      prev,
      (id) => id === "o1"
    );
    expect(merged.candidates).toHaveLength(2);
    expect(merged.candidates[0].viewer_state).toBe("pending");
    expect(merged.candidates[1].viewer_state).toBe("none");
  });

  it("lets server truth win when not busy", () => {
    const prev = [
      row({
        opportunity_id: "o1",
        viewer_state: "pending",
        request_id: "r-old",
      }),
    ];
    const page = {
      candidates: [
        row({
          opportunity_id: "o1",
          viewer_state: "pending",
          request_id: "r-new",
        }),
      ],
      has_more: false,
      next_cursor: null,
    };
    const merged = mergeSourceGroupPagePreservingInFlight(
      page,
      prev,
      () => false
    );
    expect(merged.candidates[0].request_id).toBe("r-new");
  });
});

describe("shouldZeroDiscoverableCountFromRefreshPage", () => {
  it("zeros only when first page is empty and not paginating", () => {
    expect(
      shouldZeroDiscoverableCountFromRefreshPage({
        candidates: [],
        has_more: false,
        next_cursor: null,
      })
    ).toBe(true);
    expect(
      shouldZeroDiscoverableCountFromRefreshPage({
        candidates: [row({ opportunity_id: "o1" })],
        has_more: false,
        next_cursor: null,
      })
    ).toBe(false);
    expect(
      shouldZeroDiscoverableCountFromRefreshPage({
        candidates: [],
        has_more: true,
        next_cursor: "c1",
      })
    ).toBe(false);
  });
});
