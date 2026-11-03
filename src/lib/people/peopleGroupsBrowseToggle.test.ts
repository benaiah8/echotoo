/**
 * Groups New | Yours — Home feed compact filter chip parity.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import PeopleGroupsBrowseToggle, {
  PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX,
  PEOPLE_GROUPS_BROWSE_TOGGLE_H_PX,
} from "../../components/people/PeopleGroupsBrowseToggle";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("PeopleGroupsBrowseToggle", () => {
  it("matches Home compact filter chip visual tokens", () => {
    const home = read("components/HomeTopBar.tsx");
    const toggle = read("components/people/PeopleGroupsBrowseToggle.tsx");
    const html = renderToStaticMarkup(
      createElement(PeopleGroupsBrowseToggle, {
        browseTab: "new",
        onToggle: () => {},
      })
    );

    // Home chip geometry / type
    expect(home).toContain('h-[18px] min-h-[18px] px-3');
    expect(home).toContain("text-[11px] font-semibold");
    expect(toggle).toContain('h-[18px] min-h-[18px] px-3');
    expect(toggle).toContain("text-[11px] font-semibold");
    expect(html).toContain("h-[18px]");
    expect(html).toContain("text-[11px]");

    // Selected / idle surfaces (Home chipButtonClass)
    expect(toggle).toContain("bg-[var(--brand)] text-[var(--brand-ink)]");
    expect(toggle).toContain("bg-neutral-800 text-white");
    expect(toggle).toContain("app-dark:bg-white/[0.88]");
    expect(toggle).toContain("app-dark:text-neutral-900");
    expect(html).toContain("bg-[var(--brand)]");
    expect(html).toContain("bg-neutral-800");

    // Home filter capsule chrome
    expect(home).toContain("bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]");
    expect(home).toContain("border border-[var(--bottom-tab-border)]");
    expect(toggle).toContain("bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]");
    expect(toggle).toContain("border border-[var(--bottom-tab-border)]");
    expect(html).toContain("border-[var(--bottom-tab-border)]");

    expect(html).toContain('data-people-groups-browse-toggle-theme="home-filter-chips"');
    expect(html).toContain('data-people-groups-browse-toggle-align="center"');
    expect(html).toContain('data-people-groups-browse-toggle-pad="4"');
    expect(html).toContain("justify-center");
    expect(html).toContain("p-1");
    expect(html).toContain("h-11 w-11");
    expect(html).toContain("data-people-groups-browse-hit");
    expect(html).not.toContain("min-h-[44px]");
    expect(html).toContain(peopleUiCopy.groupUpBrowseTabNew);
    expect(html).toContain(peopleUiCopy.groupUpBrowseTabYours);
  });

  it("shows both New and Yours with selected styling on the active chip", () => {
    const neu = renderToStaticMarkup(
      createElement(PeopleGroupsBrowseToggle, {
        browseTab: "new",
        onToggle: () => {},
      })
    );
    expect(neu).toContain('data-people-groups-browse-tab="new"');
    expect(neu).toContain('data-people-groups-browse-tab-active="true"');
    expect(neu).toContain('data-people-groups-browse-tab="yours"');
    expect(neu).toContain("data-people-groups-browse-chip");

    const yours = renderToStaticMarkup(
      createElement(PeopleGroupsBrowseToggle, {
        browseTab: "yours",
        onToggle: () => {},
      })
    );
    expect(yours).toContain('data-people-groups-yours-active="true"');
    expect(yours).toContain(
      'data-people-groups-browse-tab="yours" data-people-groups-browse-tab-active="true"'
    );
  });

  it("no-ops the active tab and toggles once for the other tab", () => {
    const onToggle = vi.fn();
    renderToStaticMarkup(
      createElement(PeopleGroupsBrowseToggle, {
        browseTab: "new",
        onToggle,
      })
    );
    const src = read("components/people/PeopleGroupsBrowseToggle.tsx");
    expect(src).toContain("if (tab === browseTab) return;");
    expect(src).toContain("onToggle()");
    expect(onToggle).not.toHaveBeenCalled();

    let tab: "new" | "yours" = "new";
    const toggle = vi.fn(() => {
      tab = tab === "new" ? "yours" : "new";
    });
    const select = (next: "new" | "yours") => {
      if (next === tab) return;
      toggle();
    };
    select("new");
    expect(toggle).not.toHaveBeenCalled();
    select("yours");
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(tab).toBe("yours");
    select("yours");
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("exports equal-pad shell clearance smaller than former Back row", () => {
    expect(PEOPLE_GROUPS_BROWSE_TOGGLE_H_PX).toBe(26);
    expect(PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX).toBe(36);
    expect(PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX).toBeLessThan(40 + 8);
    const src = read("components/people/PeopleGroupsBrowseToggle.tsx");
    expect(src).toContain("overflow-visible rounded-full p-1");
    expect(src).toContain("h-[18px] w-auto");
    expect(src).toContain("h-11 w-11 -translate-x-1/2 -translate-y-1/2");
  });

  it("wires MatchDeckOverlay without changing toggle handlers", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("PeopleGroupsBrowseToggle");
    expect(overlay).toContain("PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX");
    expect(overlay).toContain("browseTab={groupUpScope.browseTab}");
    expect(overlay).toContain("onToggle={toggleGroupsYoursBrowse}");
    expect(overlay).toContain("toggleGroupsYoursBrowse");
    expect(overlay).toContain("selectGroupsMode");
    expect(overlay).not.toContain("former-back");
    expect(overlay).not.toContain("PiGlobe");
  });

  it("preserves Group request path and leaves Duo/Discover/Plans nav intact", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const nav = read("pages/people/PeopleFeedTopNav.tsx");
    const home = read("components/HomeTopBar.tsx");
    expect(body).toContain("requestGroupUp");
    expect(body).toContain("PeopleGroupUpFeedCard");
    expect(overlay).toContain("PeopleFeedTopNav");
    expect(nav).not.toContain("PeopleGroupsBrowseToggle");
    expect(home).toContain("chipButtonClass");
    expect(home).not.toContain("PeopleGroupsBrowseToggle");
  });
});
