/**
 * PeopleFeedTopNav — wider icon+label pill, short Home-token fade, no first-card overhang.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX,
  PEOPLE_FEED_TOP_NAV_H_PX,
  PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX,
  PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX,
  PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX,
  peopleDuoModernScrollTopInset,
  peopleFeedContentTopPad,
  peopleFeedTopNavOffset,
} from "./peopleFeedLayout";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleFeedTopNavStyling", () => {
  const nav = read("pages/people/PeopleFeedTopNav.tsx");
  const tab = read("components/BottomTab.tsx");
  const layout = read("lib/people/peopleFeedLayout.ts");

  it("uses a wider responsive capsule (360–380 class) clamped for 320px", () => {
    expect(nav).toContain("w-fit");
    expect(nav).toContain('data-people-feed-top-nav-compact="true"');
    expect(nav).toContain("justify-center");
    expect(nav).toContain(
      "maxWidth: `min(${PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX}px, 100%)`"
    );
    expect(nav).toContain(
      "px-[var(--people-feed-gutter,var(--gutter))]"
    );
    expect(PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX).toBe(372);
    expect(PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX).toBeGreaterThanOrEqual(360);
    expect(PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX).toBeLessThanOrEqual(380);
    expect(nav).toContain("max-[360px]:px-1.5");
    expect(nav).toContain("max-[360px]:gap-0.5");
  });

  it("keeps equal capsule padding and four icon+label segments at ~13px", () => {
    expect(nav).toContain("p-[2px]");
    expect(nav).toContain("h-9");
    expect(nav).toContain("h-8 min-h-[32px]");
    expect(nav).toContain("text-[13px]");
    expect(nav).toContain("PiCompassBold");
    expect(nav).toContain("PiUsersBold");
    expect(nav).toContain("PiCalendarBlankBold");
    expect(nav).toContain("PiUsersThreeBold");
    expect(nav).toContain("h-3.5 w-3.5");
    expect(nav).toContain("data-people-feed-dest-icon");
    expect(peopleUiCopy.scopeDiscover).toBe("Discover");
    expect(peopleUiCopy.shellDuo).toBe("Duo");
    expect(peopleUiCopy.scopeOpenPlans).toBe("Plans");
    expect(peopleUiCopy.shellGroups).toBe("Groups");
    expect(nav).toContain("whitespace-nowrap");
    expect(nav).toContain("focus-visible:outline-[var(--brand)]");
    expect(nav).toContain("bg-[var(--brand)] text-[var(--brand-ink)]");
  });

  it("uses a short Home-token fade ending in transparency; no full-width blur", () => {
    expect(nav).toContain('data-people-feed-top-fade-soft="true"');
    expect(nav).toContain("var(--gradient-from-top)");
    expect(nav).toContain("PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX");
    expect(nav).not.toContain("peopleFeedContentTopPad()");
    expect(nav).not.toContain("SOFT_PAGE_TOP_FADE");
    expect(nav).not.toContain("maskImage");
    expect(nav).not.toContain("backdropFilter");
    expect(nav).not.toContain("WebkitBackdropFilter");
    expect(nav).toContain("backdrop-blur-[var(--glass-blur)]");
    expect(PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX).toBe(56);
    expect(PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX).toBeGreaterThanOrEqual(40);
    expect(PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX).toBeLessThanOrEqual(66);
    // Fade must stay within reserved pad (safe+60), not pad+28 overhang.
    expect(PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX).toBeLessThanOrEqual(
      PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX +
        PEOPLE_FEED_TOP_NAV_H_PX +
        PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX
    );
    const css = read("index.css");
    expect(css).toContain("--gradient-from-top:");
    expect(css).toMatch(
      /--gradient-from-top:\s*linear-gradient\(\s*to bottom,\s*var\(--app-canvas\) 0%,\s*transparent 100%/
    );
  });

  it("omits first Discover/Plans section dividers; keeps subsequent + skeleton parity", () => {
    const discover = read("components/people/PeopleDiscoverPersonRow.tsx");
    const plans = read("components/people/PeopleOpenPlanFeedCard.tsx");
    const discoverSkel = read(
      "components/people/PeopleDiscoverFeedSkeleton.tsx"
    );
    const plansSkel = read(
      "components/people/PeoplePlansGroupsFeedSkeleton.tsx"
    );
    const groups = read("components/people/PeopleGroupUpFeedCard.tsx");
    expect(discover).toContain(
      "border-t border-[var(--border)] first:border-t-0"
    );
    expect(plans).toContain(
      "border-t border-[var(--border)] first:border-t-0"
    );
    expect(discoverSkel).toContain(
      "border-t border-[var(--border)] first:border-t-0"
    );
    expect(plansSkel).toContain(
      "border-t border-[var(--border)] first:border-t-0"
    );
    expect(groups).toContain("PEOPLE_GROUP_UP_CARD_GAP_CLASS");
    expect(groups).not.toContain("first:border-t-0");
  });

  it("freezes safe-area / top-pad / Duo inset constants", () => {
    expect(PEOPLE_FEED_TOP_NAV_H_PX).toBe(40);
    expect(PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX).toBe(10);
    expect(PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX).toBe(10);
    expect(peopleFeedTopNavOffset()).toBe(
      "calc(var(--safe-area-top-layout, 0px) + 10px)"
    );
    expect(peopleFeedContentTopPad()).toBe(
      "calc(var(--safe-area-top-layout, 0px) + 10px + 40px + 10px)"
    );
    expect(peopleDuoModernScrollTopInset()).toBe(
      "calc(var(--safe-area-top-layout, 0px) + 10px + 40px)"
    );
    expect(layout).toContain("PEOPLE_FEED_TOP_NAV_H_PX = 40");
    expect(nav).toContain("peopleFeedTopNavOffset()");
  });

  it("Groups selector + Duo fade marker + handlers remain; BottomTab untouched", () => {
    const toggle = read("components/people/PeopleGroupsBrowseToggle.tsx");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(toggle).toContain("--people-feed-top-nav-safe-gap");
    expect(toggle).toContain('data-people-groups-yours-slot="under-nav-center"');
    expect(overlay).toContain("PeopleGroupsBrowseToggle");
    expect(overlay).toContain("frostedScrollThrough={isDuoDeckScope}");
    expect(nav).toContain("frostedScrollThrough");
    expect(nav).toContain("onSelectDuo");
    expect(nav).toContain("onSelectDiscover");
    expect(nav).toContain("onSelectPlans");
    expect(nav).toContain("onSelectGroups");
    expect(tab).not.toContain("PeopleFeedTopNav");
  });
});
