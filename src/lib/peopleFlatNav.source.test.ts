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
  it("1–2: flat order Duo Discover Plans Groups; Mine not in nav", () => {
    expect([...PEOPLE_FLAT_DESTINATION_ORDER]).toEqual([
      "duo",
      "discover",
      "plans",
      "groups",
    ]);
    expect(peopleUiCopy.shellDuo).toBe("Duo");
    expect(peopleUiCopy.scopeMyPlans).toBe("Duo");
    expect(peopleUiCopy.scopeDiscover).toBe("Discover");
    expect(peopleUiCopy.scopeOpenPlans).toBe("Plans");
    expect(peopleUiCopy.shellGroups).toBe("Groups");

    const nav = read("pages/people/PeopleFluidNav.tsx");
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
    expect(stepPeopleFlatDestination("duo", 1)).toBe("discover");
    expect(stepPeopleFlatDestination("groups", -1)).toBe("plans");
  });

  it("8–14: Yours secondary in former Back slot; browseTab semantics preserved", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("data-people-groups-yours-control");
    expect(overlay).toContain("toggleGroupsYoursBrowse");
    expect(overlay).toContain("groupUpYoursControlAria");
    expect(overlay).toContain("groupUpDiscoverControlAria");
    expect(overlay).toContain("PiGlobe");
    expect(overlay).toContain("groupUpYoursControlLabel");
    expect(overlay).toContain('data-people-groups-yours-shape="text-pill"');
    expect(overlay).toContain('data-people-groups-yours-shape="globe-circle"');
    expect(overlay).toContain('browseTab === "yours"');
    expect(overlay).toContain('("new" as const)');
    expect(overlay).toContain("handleSelectGroupsBrowseTab");
    expect(overlay).toContain('data-people-groups-yours-slot="former-back"');
    expect(overlay).not.toContain("PiUsersThree");
    expect(overlay).not.toContain("groupUpDiscoverControlLabel");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("groupUpRowMatchesBrowseTab");
    expect(body).toContain("browseTab");

    const dock = read("pages/people/PeopleBottomDock.tsx");
    expect(dock).not.toContain("onSelectBrowseTab");
    expect(dock).toContain("activeDestination");
    expect(dock).toContain("groupsYoursActive");
  });

  it("15–20: Groups action uses compact pill geometry; mutations intact", () => {
    const dock = read("pages/people/PeopleBottomDock.tsx");
    expect(dock).toContain("PEOPLE_MINE_CONNECT_H_PX");
    expect(dock).toContain("data-people-mine-connect-pill");
    expect(dock).toContain("mineCompactConnect");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("requestGroupUp");
    expect(body).toContain("withdrawGroupUpRequest");
    expect(body).toContain("peopleUiCopy.groupUpShellRequest");
    expect(body).toContain("peopleUiCopy.groupUpBrowseRequested");
    expect(body).toContain("peopleUiCopy.groupUpShellOpen");
    expect(body).toContain("messagesConversationPath");
  });

  it("21–23: frosted dock always; Groups New uses normal active; Yours green", () => {
    const nav = read("pages/people/PeopleFluidNav.tsx");
    expect(nav).toContain('data-people-groups-dock-inverted="false"');
    expect(nav).toContain('data-people-center-surface="frosted"');
    expect(nav).toContain("bg-[var(--glass-bg)]");
    expect(nav).toContain("bg-[var(--green-text)]");
    expect(nav).toContain("bottom-tab-feed-notif-active-bg");
    expect(nav).not.toContain(
      "bg-[color-mix(in_oklab,var(--text)_88%,var(--bg))]"
    );
  });

  it("24–26: safe-area dock bottom matches Home BottomTab", () => {
    const layout = read("pages/people/peopleShellLayout.ts");
    expect(layout).toContain("peopleShellDockBottomOffset");
    expect(layout).toContain("--safe-area-bottom-layout");
    expect(layout).toContain("bottomTabBottomOffset");
    const dock = read("pages/people/PeopleBottomDock.tsx");
    expect(dock).toContain("peopleShellDockBottomOffset");
    expect(dock).toContain("data-people-shell-home-nav-baseline");
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
