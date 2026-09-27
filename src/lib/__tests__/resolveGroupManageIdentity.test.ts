import { describe, expect, it, beforeEach } from "vitest";
import {
  computeSeeOtherGroupsCount,
  mergeGroupManageIdentityFromConversation,
  resolveGroupManageIdentityFromCache,
  resolveGroupManageUtilityActions,
} from "../resolveGroupManageIdentity";
import {
  __resetGroupUpSourceListCacheForTests,
  setGroupUpSourceListPage,
} from "../groupUpSourceListCache";
import type { SourceGroupRow } from "../social/sourceGroupTypes";

function row(
  partial: Partial<SourceGroupRow> & Pick<SourceGroupRow, "opportunity_id">
): SourceGroupRow {
  return {
    conversation_id: "c1",
    source_post_id: "src-1",
    group_title: "Coffee Crew",
    group_description: "Meet at the cafe",
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
    viewer_state: "owner",
    request_id: null,
    ...partial,
  };
}

describe("resolveGroupManageIdentityFromCache", () => {
  beforeEach(() => {
    __resetGroupUpSourceListCacheForTests();
  });

  it("reads title/description/source_type from owner row", () => {
    setGroupUpSourceListPage("src-1", {
      candidates: [row({ opportunity_id: "opp-1" })],
      has_more: false,
      next_cursor: null,
    });
    const id = resolveGroupManageIdentityFromCache({
      sourcePostId: "src-1",
      opportunityId: "opp-1",
      opportunityDescription: null,
      overlayCaption: null,
      overlayPostType: null,
    });
    expect(id.title).toBe("Coffee Crew");
    expect(id.description).toBe("Meet at the cafe");
    expect(id.sourceType).toBe("experience");
    expect(id.sourceCaption).toBeNull();
  });

  it("prefers overlay post type when present", () => {
    setGroupUpSourceListPage("src-1", {
      candidates: [row({ opportunity_id: "opp-1", source_type: "experience" })],
      has_more: false,
      next_cursor: null,
    });
    const id = resolveGroupManageIdentityFromCache({
      sourcePostId: "src-1",
      opportunityId: "opp-1",
      opportunityDescription: null,
      overlayCaption: "Caption",
      overlayPostType: "hangout",
    });
    expect(id.sourceType).toBe("hangout");
    expect(id.sourceCaption).toBe("Caption");
  });
});

describe("mergeGroupManageIdentityFromConversation", () => {
  it("fills missing title/type from conversation payload", () => {
    const merged = mergeGroupManageIdentityFromConversation({
      base: {
        title: null,
        description: "desc",
        sourceType: null,
        sourceCaption: null,
      },
      conversationTitle: "From Chat",
      conversationDescription: null,
      sourceContext: {
        source_post_id: "src-1",
        post_type: "hangout",
        caption: "Event caption",
        is_recurring: false,
        selected_dates: null,
        recurrence_days: null,
        group_up_occurs_at: null,
      },
    });
    expect(merged.title).toBe("From Chat");
    expect(merged.sourceType).toBe("hangout");
    expect(merged.sourceCaption).toBe("Event caption");
  });
});

describe("computeSeeOtherGroupsCount", () => {
  it("subtracts one when owns active discoverable group", () => {
    expect(computeSeeOtherGroupsCount(3, true)).toBe(2);
    expect(computeSeeOtherGroupsCount(1, true)).toBe(0);
    expect(computeSeeOtherGroupsCount(3, false)).toBe(3);
    expect(computeSeeOtherGroupsCount(null, true)).toBe(0);
  });
});

describe("resolveGroupManageUtilityActions", () => {
  it("pairs See other groups with Cancel when otherCount > 0", () => {
    expect(resolveGroupManageUtilityActions(2)).toEqual({
      showSeeOtherGroups: true,
      showCancelGroup: true,
    });
  });

  it("shows Cancel only when otherCount is 0", () => {
    expect(resolveGroupManageUtilityActions(0)).toEqual({
      showSeeOtherGroups: false,
      showCancelGroup: true,
    });
  });
});
