import { describe, expect, it } from "vitest";
import {
  __parseOpenPlanRequestGroupForTests,
  __parseOpenPlanRequesterForTests,
} from "../api/services/openPlans";

const FORBIDDEN_ON_SUMMARY = [
  "requester_id",
  "profile_id",
  "display_name",
  "username",
  "email",
  "requester_user_id",
  "requester_profile_id",
] as const;

const FORBIDDEN_ON_REQUESTER = [
  "requester_id",
  "profile_id",
  "username",
  "email",
  "requester_user_id",
  "requester_profile_id",
] as const;

describe("Open Plan grouped parsers strip identity", () => {
  it("keeps anonymous preview fields and drops identity on summaries", () => {
    const parsed = __parseOpenPlanRequestGroupForTests({
      opportunity_id: "opp-1",
      source_post_id: "post-1",
      plan_description: "After the gig",
      source_caption: "Show",
      occurs_at: "2026-09-20T12:00:00Z",
      occurs_time_explicit: false,
      pending_count: 2,
      latest_request_at: "2026-09-18T10:00:00Z",
      latest_request_id: "req-1",
      requester_id: "user-secret",
      display_name: "Should not leak",
      username: "leaky",
      email: "hidden@example.test",
      preview_requesters: [
        {
          avatar_url: "https://example.test/a.jpg",
          profile_photos: ["https://example.test/a.jpg"],
          echo_preset: null,
          display_name: "Ada",
          username: "ada",
          requester_id: "user-a",
          email: "ada@example.test",
        },
        {
          avatar_url: null,
          profile_photos: [],
          echo_preset: "preset:owl_04",
          display_name: "Ben",
        },
        {
          avatar_url: "https://example.test/third.jpg",
          profile_photos: [],
          echo_preset: null,
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.opportunity_id).toBe("opp-1");
    expect(parsed?.pending_count).toBe(2);
    expect(parsed?.preview_requesters).toHaveLength(2);
    expect(parsed?.preview_requesters[0]).toEqual({
      avatar_url: "https://example.test/a.jpg",
      profile_photos: ["https://example.test/a.jpg"],
      echo_preset: null,
    });
    for (const key of FORBIDDEN_ON_SUMMARY) {
      expect(parsed).not.toHaveProperty(key);
      expect(parsed?.preview_requesters[0]).not.toHaveProperty(key);
    }
  });

  it("parses gated display_name / profile_open_key and drops other identity fields", () => {
    const visible = __parseOpenPlanRequesterForTests({
      request_id: "req-1",
      requested_at: "2026-09-18T10:00:00Z",
      avatar_url: null,
      profile_photos: [],
      echo_preset: "preset:owl_02",
      bio: "secret bio should parse but UI must not show",
      display_name: "Ada Lovelace",
      profile_open_key: "ada",
      requester_id: "user-secret",
      profile_id: "profile-secret",
      username: "ada",
      email: "ada@example.test",
    });
    expect(visible).not.toBeNull();
    expect(visible?.request_id).toBe("req-1");
    expect(visible?.display_name).toBe("Ada Lovelace");
    expect(visible?.profile_open_key).toBe("ada");
    expect(visible?.echo_preset).toBe("preset:owl_02");
    expect(visible?.bio).toBe("secret bio should parse but UI must not show");
    for (const key of FORBIDDEN_ON_REQUESTER) {
      expect(visible).not.toHaveProperty(key);
    }

    const hidden = __parseOpenPlanRequesterForTests({
      request_id: "req-2",
      requested_at: "2026-09-18T09:00:00Z",
      avatar_url: null,
      profile_photos: [],
      echo_preset: null,
      bio: null,
      display_name: null,
      profile_open_key: null,
    });
    expect(hidden?.display_name).toBeNull();
    expect(hidden?.profile_open_key).toBeNull();

    const missing = __parseOpenPlanRequesterForTests({
      request_id: "req-3",
      requested_at: "2026-09-18T08:00:00Z",
      avatar_url: null,
      profile_photos: [],
      echo_preset: null,
      bio: null,
    });
    expect(missing?.display_name).toBeNull();
    expect(missing?.profile_open_key).toBeNull();

    const blank = __parseOpenPlanRequesterForTests({
      request_id: "req-4",
      requested_at: "2026-09-18T07:00:00Z",
      avatar_url: null,
      profile_photos: [],
      echo_preset: null,
      bio: null,
      display_name: "   ",
      profile_open_key: "   ",
    });
    expect(blank?.display_name).toBeNull();
    expect(blank?.profile_open_key).toBeNull();

    // Leaked username alone must not become profile_open_key.
    const leakedOnly = __parseOpenPlanRequesterForTests({
      request_id: "req-5",
      requested_at: "2026-09-18T06:00:00Z",
      avatar_url: null,
      profile_photos: [],
      echo_preset: null,
      bio: null,
      username: "leaked",
      requester_id: "00000000-0000-4000-8000-000000000099",
    });
    expect(leakedOnly?.profile_open_key).toBeNull();
    expect(leakedOnly).not.toHaveProperty("username");
    expect(leakedOnly).not.toHaveProperty("requester_id");
  });

  it("rejects a summary missing opportunity_id", () => {
    expect(
      __parseOpenPlanRequestGroupForTests({
        source_post_id: "post-1",
        pending_count: 1,
        latest_request_id: "req-1",
        latest_request_at: "2026-09-18T10:00:00Z",
      })
    ).toBeNull();
  });
});
