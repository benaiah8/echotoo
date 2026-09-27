import { describe, expect, it } from "vitest";
import {
  createMineCandidateProfileOpenContext,
  isMineCandidateProfileOpenContext,
} from "./mineCandidateProfileOpenContext";
import type { PairUpCandidate } from "./types";
import { pairUpPersonKey } from "./pairUpPersonKey";

function candidate(
  overrides: Partial<PairUpCandidate> = {}
): PairUpCandidate {
  return {
    opportunity_id: "opp-b",
    source_post_id: "post-1",
    creator_id: "11111111-1111-1111-1111-111111111111",
    profile_id: "22222222-2222-2222-2222-222222222222",
    username: "bob",
    display_name: "Bob",
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
    description: "note",
    discoverable_until: "2026-12-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    expressed_by_me: false,
    source_caption: null,
    source_type: null,
    source_created_at: null,
    source_selected_dates: null,
    source_is_recurring: null,
    source_recurrence_days: null,
    ...overrides,
  };
}

describe("mineCandidateProfileOpenContext", () => {
  it("captures openKey, opportunityId, and personKey at open", () => {
    const row = candidate();
    const ctx = createMineCandidateProfileOpenContext(row);
    expect(ctx).not.toBeNull();
    expect(ctx!.openKey).toBe("bob");
    expect(ctx!.opportunityId).toBe("opp-b");
    expect(ctx!.personKey).toBe(pairUpPersonKey(row));
    expect(ctx!.scope).toBe("my_plans");
    expect(ctx!.candidate.opportunity_id).toBe("opp-b");
  });

  it("returns null without a resolvable open key", () => {
    expect(
      createMineCandidateProfileOpenContext(
        candidate({
          username: null,
          creator_id: "not-a-uuid",
          profile_id: null,
        })
      )
    ).toBeNull();
  });

  it("type guard accepts valid context and rejects empty", () => {
    const ctx = createMineCandidateProfileOpenContext(candidate());
    expect(isMineCandidateProfileOpenContext(ctx)).toBe(true);
    expect(isMineCandidateProfileOpenContext(null)).toBe(false);
    expect(isMineCandidateProfileOpenContext({ openKey: "x" })).toBe(false);
  });

  it("accepts discover scope for profile open context", () => {
    const ctx = createMineCandidateProfileOpenContext(candidate(), "discover");
    expect(ctx).not.toBeNull();
    expect(ctx!.scope).toBe("discover");
    expect(isMineCandidateProfileOpenContext(ctx)).toBe(true);
  });
});

describe("runMinePairUpConnect wiring (source)", () => {
  it("MatchDeckOverlay and Profile control share the Mine runner", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const overlay = readFileSync(
      resolve(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
      "utf8"
    );
    const runner = readFileSync(
      resolve(__dirname, "./runMinePairUpConnect.ts"),
      "utf8"
    );
    const profilePage = readFileSync(
      resolve(__dirname, "../../pages/OtherProfilePage.tsx"),
      "utf8"
    );
    const mineOverlay = readFileSync(
      resolve(__dirname, "../../components/people/MineCandidateProfileOverlay.tsx"),
      "utf8"
    );
    const card = readFileSync(
      resolve(
        __dirname,
        "../../components/profile/ProfileSocialOpportunityCard.tsx"
      ),
      "utf8"
    );

    expect(overlay).toContain("runMinePairUpConnect");
    expect(overlay).toContain("runPairUpConnectForTarget");
    expect(overlay).toContain("handleMineProfileConnect");
    expect(overlay).toContain("createMineCandidateProfileOpenContext");
    expect(overlay).not.toContain("mineProfileOpenKey");

    expect(runner).toContain("express_pair_up_interest");
    expect(runner).toContain("connect_discover_pair_up");
    expect(runner).toContain("people_connect");
    expect(runner).not.toContain("connectProfilePairUp");
    expect(runner.includes("connect_profile_pair_up")).toBe(false);

    expect(profilePage).not.toContain("MineProfileConnectControl");
    expect(profilePage).not.toContain("minePairUpConnect");
    expect(mineOverlay).toContain("data-people-mine-profile-footer");
    expect(mineOverlay).toContain("back-connect");
    expect(mineOverlay).toContain("glassActionSheetPillClass");
    expect(mineOverlay).toContain("data-people-mine-profile-connect-hit");
    expect(mineOverlay).toContain("deckConnectLabel");
    expect(mineOverlay).not.toContain("MineProfileConnectControl");
    expect(mineOverlay).toContain("opportunityId");

    // Organic rail still uses its own path.
    expect(card).toContain("connectProfilePairUp");
    expect(card).toContain("expressPairUpInterest");

    // Requests Back|Accept pattern remains.
    const requesterOverlay = readFileSync(
      resolve(
        __dirname,
        "../../components/messages/RequesterProfileOverlay.tsx"
      ),
      "utf8"
    );
    expect(requesterOverlay).toContain("back-accept");
    expect(requesterOverlay).toContain("glassActionSheetPillClass");
  });
});
