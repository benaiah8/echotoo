/**
 * Groups host → embedded Profile open context.
 */
import { describe, expect, it } from "vitest";
import {
  createGroupHostProfileOpenContext,
  isGroupHostProfileOpenContext,
} from "./groupHostProfileOpenContext";
import { resolveGroupHostProfileOpenKey } from "./resolveGroupHostProfileOpenKey";
import type { GroupUpCandidate } from "./types";

function candidate(
  overrides: Partial<GroupUpCandidate> = {},
): GroupUpCandidate {
  return {
    opportunity_id: "opp-g1",
    conversation_id: "conv-1",
    source_post_id: "post-1",
    group_title: "Sunset hike",
    group_description: null,
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: "2026-12-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    source_type: "hangout",
    source_caption: null,
    source_selected_dates: null,
    source_recurrence_days: null,
    source_is_recurring: null,
    organizer_user_id: "11111111-1111-1111-1111-111111111111",
    organizer_display_name: "Kara Miles",
    organizer_username: "kara",
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 2,
    viewer_state: "none",
    request_id: null,
    source_unavailable: false,
    ...overrides,
  };
}

describe("resolveGroupHostProfileOpenKey", () => {
  it("prefers organizer_username over user id", () => {
    expect(resolveGroupHostProfileOpenKey(candidate())).toBe("kara");
  });

  it("strips @ from username", () => {
    expect(
      resolveGroupHostProfileOpenKey(
        candidate({ organizer_username: "@kara" }),
      ),
    ).toBe("kara");
  });

  it("falls back to organizer_user_id UUID", () => {
    expect(
      resolveGroupHostProfileOpenKey(
        candidate({ organizer_username: null }),
      ),
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns null without username or uuid", () => {
    expect(
      resolveGroupHostProfileOpenKey(
        candidate({
          organizer_username: null,
          organizer_user_id: "not-uuid",
        }),
      ),
    ).toBeNull();
  });
});

describe("createGroupHostProfileOpenContext", () => {
  it("captures groups scope and openKey", () => {
    const ctx = createGroupHostProfileOpenContext(candidate());
    expect(ctx).not.toBeNull();
    expect(ctx!.scope).toBe("groups");
    expect(ctx!.openKey).toBe("kara");
    expect(ctx!.opportunityId).toBe("opp-g1");
    expect(isGroupHostProfileOpenContext(ctx)).toBe(true);
  });

  it("rejects incomplete hosts", () => {
    expect(
      createGroupHostProfileOpenContext(
        candidate({
          organizer_username: null,
          organizer_user_id: "bad",
        }),
      ),
    ).toBeNull();
  });

  it("type guard rejects mine contexts", () => {
    expect(
      isGroupHostProfileOpenContext({
        openKey: "bob",
        opportunityId: "opp",
        personKey: "p",
        scope: "my_plans",
        candidate: {},
      }),
    ).toBe(false);
  });
});
