/**
 * People list scroll-under chrome — padding lives on scrollers, not the outer pane.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleFeedScrollUnderChrome", () => {
  const overlay = read("pages/people/MatchDeckOverlay.tsx");
  const list = read("components/people/PeopleFeedList.tsx");
  const plans = read("pages/people/OpenPlanDeckBody.tsx");
  const groups = read("pages/people/GroupUpDeckBody.tsx");
  const nav = read("pages/people/PeopleFeedTopNav.tsx");
  const page = read("pages/people/PeoplePage.tsx");

  it("list-mode Overlay is transparent; PeoplePage keeps the page canvas", () => {
    expect(overlay).toContain(
      'className="relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-transparent"'
    );
    expect(overlay).not.toContain(
      'isDuoDeckScope ? "bg-transparent" : "bg-[var(--app-canvas)]"'
    );
    expect(page).toContain("bg-[var(--app-canvas)]");
  });

  it("non-Duo outer content pane has zero top padding; bottom pad preserved", () => {
    expect(overlay).toContain("paddingTop: 0");
    expect(overlay).toContain(
      "paddingBottom: isDuoDeckScope ? 0 : peopleFeedContentBottomPad()"
    );
    expect(overlay).not.toContain(
      "paddingTop: isDuoDeckScope"
    );
  });

  it("PeopleFeedList applies topChromePad on the scrolling root only", () => {
    expect(list).toContain("topChromePad?: string");
    expect(list).toContain("data-people-feed-list-top-chrome");
    expect(list).toContain("paddingTop: chromePad");
    expect(list).toContain("overflow-y-auto");
  });

  it("Discover / Plans / Groups wire scroller top clearance without doubling", () => {
    expect(overlay).toContain("topChromePad={peopleFeedContentTopPad()}");
    expect(plans).toContain("topChromePad={listTopChromePad}");
    expect(plans).toContain("peopleFeedContentTopPad()");
    expect(groups).toContain("topChromePad={listTopChromePad}");
    expect(groups).toContain("PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX");
    // Out-of-list states use the marker; list uses topChromePad (not both on list).
    expect(overlay).toContain('data-people-feed-out-of-list-chrome="true"');
    expect(plans).toContain('data-people-feed-out-of-list-chrome="true"');
    expect(groups).toContain('data-people-feed-out-of-list-chrome="true"');
  });

  it("loading/empty/error outside the list clear the nav", () => {
    expect(overlay).toMatch(
      /showLoading[\s\S]*?paddingTop: peopleFeedContentTopPad\(\)/
    );
    expect(overlay).toMatch(
      /showError[\s\S]*?paddingTop: peopleFeedContentTopPad\(\)/
    );
    expect(overlay).toMatch(
      /showEmpty[\s\S]*?paddingTop: peopleFeedContentTopPad\(\)/
    );
    expect(plans).toContain("data-people-open-plans-initial-loading");
    expect(groups).toContain("data-people-group-up-initial-loading");
  });

  it("preserves Duo inset / atmosphere and freezes top-nav chrome", () => {
    expect(overlay).toContain("peopleDuoModernScrollTopInset");
    expect(overlay).toContain("MineAtmosphereCrossfade");
    expect(overlay).toContain("frostedScrollThrough={isDuoDeckScope}");
    expect(nav).toContain("var(--gradient-from-top)");
    expect(nav).toContain("PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX");
    expect(nav).toContain("PiCompassBold");
  });

  it("Groups toggle remains under-nav; BottomTab / actions untouched by this pass", () => {
    expect(overlay).toContain("PeopleGroupsBrowseToggle");
    expect(overlay).toContain("PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX");
    expect(list).not.toContain("PeopleActionStateButton");
    expect(list).not.toContain("supabase");
  });
});
