/**
 * People vertical feed layout + shell contracts (presentation only).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_FEED_MAX_W_PX,
  PEOPLE_FEED_MEDIA_MAX_H,
  PEOPLE_FEED_MEDIA_RADIUS,
  PEOPLE_FEED_RAIL_W_PX,
  PEOPLE_FEED_STACK_PAD_Y_TOP_PX,
  PEOPLE_FEED_NEUTRAL_ECHO_NAMESPACE,
  resolvePeopleFeedEchoPreset,
  PEOPLE_FEED_CONTENT_TOP_PAD_FIXED_PX,
  peopleDuoModernMetricsHostH,
  peopleDuoModernScrollTopInset,
  peopleFeedContentBottomPad,
  peopleFeedContentTopPad,
  peopleFeedContentTopPadPx,
  peopleFeedCssVars,
  peopleFeedTopNavOffset,
  parsePeopleLayoutPx,
  PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX,
} from "./peopleFeedLayout";
import { PEOPLE_MINE_STACK_POSE } from "./peopleCandidateMediaPresentation";
import { PEOPLE_FLAT_DESTINATION_ORDER } from "../../pages/people/peopleShellLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleFeedLayout", () => {
  it("mirrors Home page width, gutter, radius, and media max-height", () => {
    expect(PEOPLE_FEED_MAX_W_PX).toBe(640);
    expect(PEOPLE_FEED_MEDIA_MAX_H).toBe("40vh");
    expect(PEOPLE_FEED_MEDIA_RADIUS).toBe("1rem");
    expect(PEOPLE_FEED_RAIL_W_PX).toBeGreaterThanOrEqual(44);
    expect(PEOPLE_FEED_STACK_PAD_Y_TOP_PX).toBe(0);
    const vars = peopleFeedCssVars();
    expect(vars["--people-feed-max-w"]).toBe("640px");
    expect(vars["--people-feed-media-max-h"]).toBe("40vh");
    expect(vars["--people-feed-media-radius"]).toBe("1rem");
    expect(vars["--people-feed-gutter"]).toBe("var(--gutter)");
    expect(peopleFeedContentBottomPad()).toContain("--safe-area-bottom-layout");
    expect(peopleFeedContentTopPad()).toBe(
      "calc(var(--safe-area-top-layout, 0px) + 10px + 40px + 10px)"
    );
    expect(peopleFeedTopNavOffset()).toBe(
      "calc(var(--safe-area-top-layout, 0px) + 10px)"
    );
    expect(PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX).toBe(10);
    expect(peopleDuoModernScrollTopInset()).toBe(
      "calc(var(--safe-area-top-layout, 0px) + 10px + 40px)"
    );
    expect(peopleDuoModernScrollTopInset()).not.toContain("+ 10px + 40px + 10px");
    expect(PEOPLE_FEED_CONTENT_TOP_PAD_FIXED_PX).toBe(60);
    expect(peopleFeedContentTopPadPx(0)).toBe(60);
    expect(peopleFeedContentTopPadPx(47)).toBe(107);
    expect(peopleFeedContentTopPadPx(Number.NaN)).toBe(60);
    expect(parsePeopleLayoutPx("47px")).toBe(47);
    expect(peopleDuoModernMetricsHostH(780, 60)).toBe(720);
    expect(peopleDuoModernMetricsHostH(720, 0)).toBe(720);
    expect(peopleDuoModernMetricsHostH(50, 80)).toBe(0);
    expect(peopleFeedContentTopPad().split("--safe-area-top-layout").length - 1).toBe(1);
    expect(peopleDuoModernScrollTopInset().split("--safe-area-top-layout").length - 1).toBe(1);
  });

  it("Duo visual inset is 10px shorter than the metrics/feed pad; Discover pad unchanged", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    const canonical = read("components/people/PeopleCanonicalCandidatePresentation.tsx");
    const skeleton = read("components/skeletons/PeopleDuoCardSkeleton.tsx");
    const nav = read("pages/people/PeopleFeedTopNav.tsx");
    expect(canonical).toContain("peopleDuoModernScrollTopInset()");
    expect(canonical).not.toContain("height: peopleFeedContentTopPad()");
    expect(skeleton).toContain("peopleDuoModernScrollTopInset()");
    expect(skeleton).not.toContain("peopleFeedContentTopPad");
    expect(carousel).toContain("peopleDuoModernMetricsHostH");
    expect(carousel).toContain("peopleFeedContentTopPadPx");
    expect(carousel).not.toContain("peopleDuoModernScrollTopInset");
    expect(overlay).toContain("topChromePad={peopleFeedContentTopPad()}");
    expect(overlay).toContain("paddingTop: 0");
    expect(overlay).toContain("isDuoDeckScope ? 0 : peopleFeedContentBottomPad()");
    expect(nav).toContain("peopleFeedTopNavOffset()");
    expect(nav).not.toContain("peopleFeedContentTopPad()");
    expect(nav).toContain("PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX");
    expect(nav).toContain("w-fit");
    expect(nav).toContain("PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX");
  });

  it("does not mutate deck stack poses", () => {
    expect(PEOPLE_MINE_STACK_POSE.right.yPct).toBe(-7);
    expect(PEOPLE_MINE_STACK_POSE.left.yPct).toBe(-14);
  });

  it("resolves feed Echo without inventing creator identity", () => {
    const assigned = resolvePeopleFeedEchoPreset({
      echo_preset: "preset:owl_01",
      user_id: null,
      profile_id: null,
    });
    expect(assigned).toBe("preset:owl_01");

    const withUser = resolvePeopleFeedEchoPreset({
      user_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(withUser.startsWith("preset:")).toBe(true);

    const neutral = resolvePeopleFeedEchoPreset({}, "opp-anon-1");
    expect(neutral.startsWith("preset:")).toBe(true);
    expect(PEOPLE_FEED_NEUTRAL_ECHO_NAMESPACE).toContain("people-feed-neutral");
  });

  it("defaults Discover first in flat destinations", () => {
    expect(PEOPLE_FLAT_DESTINATION_ORDER[0]).toBe("discover");
  });

  it("row shares main column for source+media; rail is sibling", () => {
    const row = read("components/people/PeopleFeedRow.tsx");
    expect(row).toContain('data-people-feed-main-col="true"');
    expect(row).toContain('data-people-feed-columns="true"');
    expect(row).toContain("items-end");
    expect(row).toContain("PeopleFeedActionRail");
    expect(row).toContain("PEOPLE_FEED_CAPTION_TEXT_CLASS");
    expect(row).toContain("feedNeutralEchoSeed={opportunityId}");
    expect(row).toContain("feedLayout");
    /* Source header lives inside main column, not full article width alone. */
    const mainIdx = row.indexOf('data-people-feed-main-col="true"');
    const sourceIdx = row.indexOf('data-people-feed-source-header="true"');
    expect(mainIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeGreaterThan(mainIdx);
  });

  it("feed media hides rear stack and uses Home radius", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("PEOPLE_FEED_MEDIA_RADIUS");
    expect(media).toContain('if (feedLayout && role !== "front") return null');
    expect(media).toContain("FeedEchoCompact");
    expect(media).toContain("resolvePeopleFeedEchoPreset");
    expect(media).toContain('data-people-feed-single-frame');
  });

  it("feed identity overlay stays on photo and accessible", () => {
    const overlay = read("components/people/MinePortraitIdentityOverlay.tsx");
    expect(overlay).toContain("feedLayout");
    expect(overlay).toContain("top-left");
    expect(overlay).toContain("NAME_TEXT_FEED_CLASS");
    expect(overlay).toContain("deckOpenProfile");
  });

  it("action rail marks content-bottom alignment", () => {
    const rail = read("components/people/PeopleFeedActionRail.tsx");
    expect(rail).toContain('data-people-feed-action-align="content-bottom"');
    expect(rail).toContain("self-end");
  });

  it("shell keeps opportunity ordering and BottomTab", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("interleavePairUpCandidates");
    expect(overlay).toContain("PeopleFeedList");
    expect(overlay).toContain("PeopleDiscoverPersonRow");
    expect(overlay).toContain("<MatchDeckCarousel");
    expect(overlay).toContain("<MineAtmosphereCrossfade");
    expect(overlay).toContain("isDuoAtmosphereScope");
    const tab = read("components/BottomTab.tsx");
    expect(tab).toContain("hidePeopleNav = false");
  });
});
