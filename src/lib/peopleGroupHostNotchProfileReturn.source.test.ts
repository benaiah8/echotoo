/**
 * Groups host notch compact polish + Duo-equivalent profile return (source).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Groups host notch compact + profile return (source)", () => {
  it("1–4: compact avatar, padding, balanced gap, text hierarchy", () => {
    const notch = read("components/people/PeopleGroupHostNotch.tsx");
    expect(notch).toContain("AVATAR_PX = 28");
    expect(notch).toContain("px-2 py-1.5");
    expect(notch).toContain("gap-1.5");
    expect(notch).toContain("max-w-[min(100%,18rem)]");
    expect(notch).toContain("w-max");
    expect(notch).not.toContain("flex-1");
    expect(notch).toContain("text-[9px]");
    expect(notch).toContain("text-[13px]");
    expect(notch).not.toContain("organizer_username");
  });

  it("5–7: host slot remains full-inset centered", () => {
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain("inset-x-3 top-3");
    expect(media).toContain("flex justify-center");
    expect(media).not.toContain("left-1/2 top-3 z-[2] -translate-x-1/2");
  });

  it("8–9: Groups host opens same embedded overlay; Back only", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("createGroupHostProfileOpenContext");
    expect(overlay).toContain("openGroupHostProfile");
    expect(overlay).toContain("MineCandidateProfileOverlay");
    expect(overlay).toContain("setMineProfileOpen(ctx)");

    const profile = read(
      "components/people/MineCandidateProfileOverlay.tsx",
    );
    expect(profile).toContain('open.scope === "my_plans"');
    expect(profile).toContain('data-people-mine-profile-footer={');
    expect(profile).toContain("useInviteOverlaySyntheticHistory");
    expect(profile).toContain("MINE_CANDIDATE_PROFILE_HISTORY_MARKER");
  });

  it("10–13: opening Profile does not reset Groups deck state", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const openFn = overlay.slice(
      overlay.indexOf("const openGroupHostProfile"),
      overlay.indexOf("const runPairUpConnectForTarget"),
    );
    expect(openFn).toContain("setMineProfileOpen(ctx)");
    expect(openFn).not.toContain("suspendDeckSession");
    expect(openFn).not.toContain("patchGroupUpScope");
    expect(openFn).not.toContain("setGroupUpScope");
    expect(openFn).not.toContain("emptyGroupUpDeckScopeSnapshot");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("mediaIndexById");
    expect(body).toContain("currentOpportunityIdByTab");
    expect(body).toContain('layout="duo"');
    expect(body).toContain('duoPresentation="mine"');
  });

  it("14: People Android Back suppresses while profile open", () => {
    const page = read("pages/people/PeoplePage.tsx");
    expect(page).toContain(
      "shouldSuppressUnderlyingBackForMineCandidateProfile",
    );
  });

  it("15: Duo/Discover profile open path unchanged", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("openMineProfileForCandidate");
    expect(overlay).toContain("createMineCandidateProfileOpenContext");
    expect(overlay).toContain('contentScope !== "my_plans"');
    expect(overlay).toContain('contentScope !== "discover"');
  });

  it("outer Group geometry footprint unchanged", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain('duoPresentation="mine"');
    expect(body).toContain("duoInFlowChrome");
    expect(body).toContain("MineEdgeNavCards");
  });
});
