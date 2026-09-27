/**
 * People Groups-state + nav-spacing cleanup (source).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_ACTIVE_PILL_MIN_H_PX,
  PEOPLE_CENTER_H_PX,
  PEOPLE_CENTER_PAD_X_PX,
  PEOPLE_CENTER_PAD_Y_PX,
  PEOPLE_DEST_PAD_X_PX,
  PEOPLE_NAV_ITEM_GAP_PX,
  PEOPLE_FLAT_DESTINATION_ORDER,
  PEOPLE_FLUID_CENTER_RAISE_PX,
  peopleShellDockBottomOffset,
} from "../pages/people/peopleShellLayout";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("People Groups-state + nav-spacing cleanup", () => {
  it("1–4: Groups New = normal white active; Yours = green; label Groups", () => {
    const nav = read("pages/people/PeopleFluidNav.tsx");
    expect(nav).toContain("bottom-tab-feed-notif-active-bg");
    expect(nav).toContain("bg-[var(--green-text)]");
    expect(nav).toContain('groupsAccent === "yours"');
    expect(nav).not.toContain("grayActive");
    expect(nav).not.toContain("var(--text)_16%,var(--surface)");
    expect(nav).toContain("peopleUiCopy.shellGroups");
    expect(peopleUiCopy.shellGroups).toBe("Groups");

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain('groupsPillState={');
    expect(overlay).toContain('"inactive"');
    expect(overlay).toContain('? "yours"');
    expect(overlay).toContain(': "new"');
  });

  it("5–10: New = text-only Yours; Yours = globe circle; caption band", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain('data-people-groups-yours-shape="text-pill"');
    expect(overlay).toContain('data-people-groups-yours-shape="globe-circle"');
    expect(overlay).toContain("groupUpYoursControlLabel");
    expect(overlay).toContain("PiGlobe");
    expect(overlay).not.toContain("PiUsersThree");
    expect(overlay).not.toContain("groupUpDiscoverControlLabel");
    expect(overlay).toContain("groupUpYoursControlAria");
    expect(overlay).toContain("groupUpDiscoverControlAria");
    expect(peopleUiCopy.groupUpYoursControlAria).toBe("Your groups");
    expect(peopleUiCopy.groupUpDiscoverControlAria).toBe("Discover groups");
    /* Compact left slot — does not expand into caption pad-left band. */
    expect(overlay).toContain("max-w-[4.5rem]");
    expect(overlay).toContain("PEOPLE_BACK_SIZE_PX");
    expect(overlay).toContain("PEOPLE_BACK_EDGE_INSET_PX");
  });

  it("11: Your groups context only in Yours", () => {
    const dock = read("pages/people/PeopleBottomDock.tsx");
    expect(dock).toContain("groupsYoursActive");
    expect(dock).toContain("groupUpYoursContextLabel");
    expect(peopleUiCopy.groupUpYoursContextLabel).toBe("Your groups");
  });

  it("12–15: enter Groups → New; re-tap toggles; shared browseTab", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("toggleGroupsYoursBrowse");
    expect(overlay).toContain('handleSelectGroupsBrowseTab("new")');
    expect(overlay).toContain('mode === "groups"');
    expect(overlay).toContain("toggleGroupsYoursBrowse()");
    expect(overlay).toContain("selectGroupsMode");
    /* Top + bottom both route through browseTab helpers. */
    expect(overlay).toContain("handleSelectGroupsBrowseTab");
    expect(overlay).toContain("patchGroupUpScope");
  });

  it("16–20: equal outer pad; single parent gap; equal heights; no item margins", () => {
    expect(PEOPLE_CENTER_PAD_X_PX).toBe(PEOPLE_CENTER_PAD_Y_PX);
    expect(PEOPLE_CENTER_PAD_Y_PX).toBe(5);
    expect(PEOPLE_ACTIVE_PILL_MIN_H_PX).toBe(40);
    expect(PEOPLE_CENTER_H_PX).toBe(
      PEOPLE_ACTIVE_PILL_MIN_H_PX + PEOPLE_CENTER_PAD_Y_PX * 2
    );
    expect(PEOPLE_DEST_PAD_X_PX).toBe(11);
    expect(PEOPLE_NAV_ITEM_GAP_PX).toBe(3);
    expect(PEOPLE_FLUID_CENTER_RAISE_PX).toBe(0);
    expect(peopleShellDockBottomOffset()).toMatch(/8px|safe-area-bottom-layout/);

    const nav = read("pages/people/PeopleFluidNav.tsx");
    expect(nav).toContain("padding: PEOPLE_CENTER_PAD_Y_PX");
    expect(nav).toContain("gap: PEOPLE_NAV_ITEM_GAP_PX");
    expect(nav).toContain('data-people-single-row-gap="true"');
    expect(nav).toContain("margin: 0");
    expect(nav).not.toContain("people-center-inner");
    expect(nav).not.toContain("marginLeft");
    expect(nav).not.toContain("marginRight");
    expect(nav).not.toContain("translateX");
  });

  it("21–24: regressions — destinations/data/actions/cards frozen", () => {
    expect([...PEOPLE_FLAT_DESTINATION_ORDER]).toEqual([
      "duo",
      "discover",
      "plans",
      "groups",
    ]);
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("requestGroupUp");
    expect(body).toContain("withdrawGroupUpRequest");
    expect(body).toContain("groupUpRowMatchesBrowseTab");

    const dock = read("pages/people/PeopleBottomDock.tsx");
    expect(dock).toContain('data-people-action-single-layer="true"');
    expect(dock).not.toContain("var(--gradient-from-bottom)");

    const group = read(
      "components/people/PeopleGroupUpCandidatePresentation.tsx"
    );
    expect(group).toContain("PeopleGroupHostNotch");
    expect(group).toContain("SOURCE_PAD_LEFT_PX");

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("MineCandidateProfileOverlay");
  });
});
