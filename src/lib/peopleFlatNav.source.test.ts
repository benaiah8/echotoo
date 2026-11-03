/**
 * People flat primary nav + Groups Yours secondary control (source).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_FLAT_DESTINATION_ORDER,
  PEOPLE_SHELL_HAS_END_HOUSINGS,
  PEOPLE_SHELL_HAS_FLAT_PRIMARY_NAV,
  PEOPLE_CENTER_W_CSS,
  stepPeopleFlatDestination,
} from "../pages/people/peopleShellLayout";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("People flat navigation", () => {
  it("1–2: flat order Discover Duo Plans Groups; Mine not in nav", () => {
    expect([...PEOPLE_FLAT_DESTINATION_ORDER]).toEqual([
      "discover",
      "duo",
      "plans",
      "groups",
    ]);
    expect(peopleUiCopy.shellDuo).toBe("Duo");
    expect(peopleUiCopy.scopeMyPlans).toBe("Duo");
    expect(peopleUiCopy.scopeDiscover).toBe("Discover");
    expect(peopleUiCopy.scopeOpenPlans).toBe("Plans");
    expect(peopleUiCopy.shellGroups).toBe("Groups");

    const nav = read("pages/people/PeopleFeedTopNav.tsx");
    expect(nav).toContain("PEOPLE_FLAT_DESTINATION_ORDER");
    expect(nav).toContain("peopleUiCopy.shellDuo");
    expect(nav).not.toContain("PeoplePrimaryShelf");
    expect(nav).not.toContain("GROUPS_SUBMODE_ORDER");
    expect(nav).not.toContain("groupUpBrowseTabNew");
    expect(nav).not.toContain("groupUpBrowseTabYours");
    expect(nav).not.toMatch(/["']Mine["']/);
  });

  it("3–7: destination mapping + stable geometry flags", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("onSelectDuo={selectDuoMode}");
    expect(overlay).toContain("onSelectDiscover={handleSelectDiscover}");
    expect(overlay).toContain("onSelectPlans={handleSelectOpenPlans}");
    expect(overlay).toContain("onSelectGroups={selectGroupsMode}");
    expect(overlay).toContain('setActiveScope("my_plans")');
    expect(overlay).toContain("onRequestGroupUpsMount");

    expect(PEOPLE_SHELL_HAS_FLAT_PRIMARY_NAV).toBe(true);
    expect(PEOPLE_SHELL_HAS_END_HOUSINGS).toBe(false);
    expect(PEOPLE_CENTER_W_CSS).toContain("440px");
    expect(stepPeopleFlatDestination("discover", 1)).toBe("duo");
    expect(stepPeopleFlatDestination("groups", -1)).toBe("plans");
  });

  it("8–14: centered New|Yours secondary; browseTab semantics preserved", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("PeopleGroupsBrowseToggle");
    expect(overlay).toContain("toggleGroupsYoursBrowse");
    expect(overlay).toContain('browseTab === "yours"');
    expect(overlay).toContain('("new" as const)');
    expect(overlay).toContain("handleSelectGroupsBrowseTab");
    expect(overlay).toContain("PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX");
    expect(overlay).not.toContain("former-back");
    expect(overlay).not.toContain("PiGlobe");
    expect(overlay).not.toContain("PiUsersThree");
    expect(overlay).toContain("PeopleFeedTopNav");
    expect(overlay).toContain("PeopleFeedList");

    const toggle = read("components/people/PeopleGroupsBrowseToggle.tsx");
    expect(toggle).toContain('data-people-groups-yours-slot="under-nav-center"');
    expect(toggle).toContain("groupUpBrowseTabNew");
    expect(toggle).toContain("groupUpBrowseTabYours");
    expect(toggle).toContain("groupUpYoursControlAria");
    expect(toggle).toContain("if (tab === browseTab) return;");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("groupUpRowMatchesBrowseTab");
    expect(body).toContain("browseTab");
  });

  it("15–20: Groups heart mutations intact on feed rows", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("requestGroupUp");
    expect(body).toContain("withdrawGroupUpRequest");
    expect(body).toContain("peopleUiCopy.groupUpShellRequest");
    expect(body).toContain("peopleUiCopy.groupUpBrowseRequested");
    expect(body).toContain("peopleUiCopy.groupUpShellOpen");
    expect(body).toContain("messagesConversationPath");
    expect(body).toContain("PeopleGroupUpFeedCard");
  });

  it("21–23: top nav frosted; Groups Yours green accent", () => {
    const nav = read("pages/people/PeopleFeedTopNav.tsx");
    expect(nav).toContain("bg-[var(--glass-bg)]");
    expect(nav).toContain("bg-[rgb(34,197,94)]");
    expect(nav).toContain("data-people-feed-top-nav");
  });

  it("24–26: feed bottom pad clears global BottomTab safe-area", () => {
    const layout = read("lib/people/peopleFeedLayout.ts");
    expect(layout).toContain("peopleFeedContentBottomPad");
    expect(layout).toContain("--safe-area-bottom-layout");
    const tab = read("components/BottomTab.tsx");
    expect(tab).toContain("hidePeopleNav = false");
  });

  it("27–30: cards / profile / browse data unchanged", () => {
    const group = read("components/people/PeopleGroupUpCandidatePresentation.tsx");
    expect(group).toContain("PeopleGroupHostNotch");
    expect(group).toContain("PeopleGroupSourceMedia");

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("openGroupHostProfile");
    expect(overlay).toContain("MineCandidateProfileOverlay");
    expect(overlay).toContain("openMineProfileForCandidate");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("groupUpRowMatchesBrowseTab");
    expect(body).not.toContain("PeopleFluidNav");
  });
});
