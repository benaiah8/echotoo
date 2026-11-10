/**
 * Duo visual modernization — wiring contracts (Discover/Plans unchanged).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_DUO_MODERN_ACTION_ROW_GAP_PX,
  PEOPLE_DUO_MODERN_ACTION_ROW_H_PX,
  PEOPLE_DUO_MODERN_SCROLL_READABILITY_PX,
  PEOPLE_DUO_MODERN_SCROLL_TO_ACTION_GAP_PX,
  PEOPLE_DUO_MODERN_TAB_BAND_H_PX,
  PEOPLE_DUO_MODERN_TAB_OPTICAL_PX,
  PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB,
  peopleDuoModernSlideScrollBottomPad,
  peopleDuoModernTabBandPad,
  peopleShellDockBottomOffset,
} from "../../pages/people/peopleShellLayout";
import { peopleFeedContentBottomPad } from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDuoModernLayout", () => {
  it("Duo slide uses modern layout with below-photo info", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const canonical = read("components/people/PeopleCanonicalCandidatePresentation.tsx");
    expect(overlay).toContain('layoutVariant="duoModern"');
    expect(canonical).toContain("PeopleDuoOpportunityInfoCard");
    expect(canonical).toContain('data-people-duo-slide-scroll="true"');
    expect(canonical).toContain("hideMinePhotoIndicators={isDuoModern}");
    expect(canonical).toContain('mineStackPose={isDuoModern ? "duoModern" : "mine"}');
  });

  it("hides Duo photo indicator bars without feed changes", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("hideMinePhotoIndicators");
    expect(media).toContain("!hideMinePhotoIndicators");
  });

  it("wider portrait geometry for duoModern chrome profile", () => {
    const pres = read("lib/people/peopleCandidateMediaPresentation.ts");
    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    expect(pres).toContain("peopleDuoModernTargetFrameW");
    expect(pres).toContain("PEOPLE_DUO_MODERN_FRAME_W_SCALE");
    expect(pres).toContain('"duoModern"');
    expect(carousel).toContain("duoLayoutModern");
  });

  it("info panel aligns to front frame width variable", () => {
    const info = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    const canonical = read("components/people/PeopleCanonicalCandidatePresentation.tsx");
    expect(info).toContain("--people-mine-frame-w");
    expect(info).not.toContain("PEOPLE_DUO_QA_FULL_CAPTION");
    expect(info).toContain("line-clamp-3");
    expect(info).not.toContain("line-clamp-4");
    expect(info).toContain("PostCaptionText");
    expect(info).toContain("stopLinkPropagation");
    expect(info).toContain("data-people-duo-see-post");
    expect(info).not.toContain("import PeopleSeePostControl");
    expect(info).toContain("bg-transparent");
    expect(info).not.toContain("backdrop-blur");
    expect(info).toContain("PEOPLE_DUO_MODERN_FRAME_RADIUS");
    expect(canonical).toContain("data-people-duo-info-column");
    expect(canonical).toContain('width: "var(--people-mine-frame-w, 100%)"');
    expect(canonical).not.toContain("px-3 pb-4 pt-3");
  });

  it("directional edge nav motion for Duo bottom controls", () => {
    const motion = read("lib/people/mineMotionProbeProgress.ts");
    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    expect(motion).toContain("directionalEdgeCards");
    expect(motion).toContain("edgeCardFixedPosition");
    expect(motion).toContain("clearMineEdgeCardDuoBottomFeedback");
    expect(carousel).toContain("directionalEdgeCards: duoLayoutModernRef.current");
    expect(carousel).toContain("edgeCardFixedPosition: duoLayoutModernRef.current");
    expect(carousel).toContain("sceneExtras: !duoLayoutModernRef.current");
    expect(carousel).toContain("peopleDuoModernSceneSlideStyle");
    expect(carousel).toContain("duoModernScene: duoLayoutModern");
    expect(carousel).toContain("[data-people-duo-scene]");
    expect(read("components/people/PeopleCanonicalCandidatePresentation.tsx")).toContain(
      'data-people-duo-scene="true"'
    );
    expect(read("components/people/PeopleCandidateMedia.tsx")).toContain(
      "peopleDuoModernCardOpacity"
    );
    const pres = read("lib/people/peopleCandidateMediaPresentation.ts");
    expect(pres).toContain("PEOPLE_DUO_MODERN_SCENE_BLUR_PX = 9.6");
    expect(pres).toContain("PEOPLE_DUO_MODERN_STACK_ENVELOPE_PHOTO_COUNT = 3");
  });

  it("Duo modern portrait radius without changing global front token", () => {
    const pres = read("lib/people/peopleCandidateMediaPresentation.ts");
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(pres).toContain('PEOPLE_DUO_MODERN_FRAME_RADIUS = "1rem"');
    expect(pres).toContain("PEOPLE_DUO_FRONT_RADIUS");
    expect(media).toContain("PEOPLE_DUO_MODERN_FRAME_RADIUS");
    expect(media).toContain("rearMediaRadius");
    expect(media).toContain("cardRadius");
  });

  it("bottom nav feedback refs stay fixed in the action row", () => {
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    expect(row).toContain("data-people-duo-nav-feedback");
    expect(row).toContain("flex-row items-center");
    expect(row).toContain('data-people-duo-nav-feedback="prev"');
    expect(row).toContain('data-people-duo-nav-feedback="next"');
  });

  it("bottom nav chevrons use strong contrast styling", () => {
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    expect(row).toContain("--bottom-tab-pill-ring");
    expect(row).toContain("--glass-bg");
    expect(row).toContain("PiCaretLeftBold");
    expect(row).toContain("data-people-duo-heart-comment-pill");
    expect(row).toContain("p-2");
    expect(row).toContain("h-[52px]");
    expect(row).toContain("pointer-events-auto");
    expect(row).toContain("PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB");
    expect(row).toContain("gap-3");
    expect(row).toContain("NAV_SLOT_PX = 48");
    expect(row).toContain("data-people-duo-nav-feedback");
  });

  it("Duo atmosphere vertical fade over crossfade wash", () => {
    const atm = read("components/people/MineAtmosphereCrossfade.tsx");
    expect(atm).toContain("data-people-duo-atmosphere-vertical-fade");
    expect(atm).toContain("transparent 62%");
    expect(atm).toContain("var(--bg) 58%, transparent) 100%");
    expect(atm).toContain("var(--bg) 52%, transparent) 100%");
    expect(atm).toContain("data-people-mine-atmosphere-crossfade");
  });

  it("opportunity card stays transparent bordered surface", () => {
    const info = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    expect(info).toContain("bg-transparent");
    expect(info).not.toContain("backdrop-blur");
  });

  it("Duo modern stack clearance without separator double-count", () => {
    const pres = read("lib/people/peopleCandidateMediaPresentation.ts");
    const canonical = read("components/people/PeopleCanonicalCandidatePresentation.tsx");
    expect(pres).toContain("PEOPLE_DUO_MODERN_NAV_TO_STACK_CLEARANCE_PX = 0");
    expect(pres).not.toContain("PEOPLE_DUO_MODERN_SEPARATOR_W_PX");
    expect(pres).toContain("peopleDuoModernDistributeHostSurplus");
    expect(pres).toContain("PEOPLE_MINE_STACK_PAD_Y_TOP");
    expect(canonical).not.toContain("data-people-duo-stack-separator");
    expect(canonical).toContain("--people-duo-stack-pad-y-top");
    expect(canonical).toContain("peopleDuoModernSlideScrollBottomPad");
    expect(PEOPLE_DUO_MODERN_ACTION_ROW_H_PX).toBe(68);
    expect(PEOPLE_DUO_MODERN_ACTION_ROW_GAP_PX).toBe(14);
    expect(PEOPLE_DUO_MODERN_SCROLL_TO_ACTION_GAP_PX).toBe(10);
    expect(PEOPLE_DUO_MODERN_TAB_BAND_H_PX).toBe(64);
    expect(PEOPLE_DUO_MODERN_TAB_OPTICAL_PX).toBe(6);
    expect(peopleDuoModernSlideScrollBottomPad()).toBe(
      `calc(68px + 10px + 64px + 6px + max(${peopleShellDockBottomOffset()}, var(--safe-area-bottom-layout, 0px)))`
    );
    expect(pres).toContain("padBottom: 0");
    expect(pres).toContain("if (!Number.isFinite(surplus) || surplus <= 0)");
    expect(canonical).not.toContain("peopleShellMineDuoGlobalTabBottomPad");
    expect(canonical).toContain("data-people-mine-surplus-pad-bottom");
    expect(canonical).toContain("scroll-hide");
    expect(canonical).not.toContain("peopleShellMineDuoGlobalTabBottomPad");
  });

  it("nav feedback scale, SVG color, and single bottom clearance owner", () => {
    const motion = read("lib/people/mineMotionProbeProgress.ts");
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    expect(motion).toContain("MINE_DUO_BOTTOM_FEEDBACK_MAX_SCALE = 1.135");
    expect(motion).toContain("applyMineDuoNavFeedbackIconColor");
    expect(motion).toContain("settleMineEdgeCardDuoBottomFeedback");
    expect(row).toContain("NAV_FACE_CLASS");
    expect(row).toContain("settleMineEdgeCardDuoBottomFeedbackSide");
    expect(row).toContain("data-people-duo-nav-feedback");
    expect(overlay).not.toContain("data-people-duo-bottom-float-fade");
    expect(overlay).not.toContain("peopleShellMineDuoGlobalTabBottomPad");
    expect(overlay).toContain("paddingBottom: 0");
    expect(overlay).not.toContain("peopleFeedContentBottomPad()");
    expect(carousel).toContain("resolveDuoModernDisplayPhotoCount");
    expect(carousel).toContain("peopleMinePortraitCssVars");
  });

  it("bottom action row replaces Connect dock on Duo", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("PeopleDuoBottomActionRow");
    expect(read("components/people/PeopleDuoBottomActionRow.tsx")).toContain(
      "data-people-duo-heart-comment-pill"
    );
    expect(overlay).not.toContain("PeopleBottomDock");
    expect(overlay).toContain("visuallyHidden");
    expect(overlay).toContain("handleFeedMessage");
    expect(overlay).toContain("isPeopleTabVisible");
  });

  it("edge nav handlers preserved", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("goMinePrev");
    expect(overlay).toContain("goMineNext");
    expect(overlay).toContain("mineEdgeNavCardsRef");
  });

  it("Discover opportunity box unchanged", () => {
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(box).toContain("PeopleFeedActionRail");
  });

  it("Duo pane has no BottomTab pad; slide-scroll owns full bottom clearance", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const canonical = read("components/people/PeopleCanonicalCandidatePresentation.tsx");
    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    const info = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    expect(overlay).toContain("paddingBottom: 0");
    expect(overlay).not.toContain("peopleShellMineDuoGlobalTabBottomPad");
    expect(canonical).toContain('data-people-duo-slide-scroll="true"');
    expect(canonical).toContain("peopleDuoModernSlideScrollBottomPad");
    expect(PEOPLE_DUO_MODERN_SCROLL_READABILITY_PX).toBe(10);
    expect(PEOPLE_DUO_MODERN_SCROLL_TO_ACTION_GAP_PX).toBe(10);
    expect(peopleDuoModernSlideScrollBottomPad()).toBe(
      `calc(${PEOPLE_DUO_MODERN_ACTION_ROW_H_PX}px + ${PEOPLE_DUO_MODERN_SCROLL_TO_ACTION_GAP_PX}px + ${PEOPLE_DUO_MODERN_TAB_BAND_H_PX}px + ${PEOPLE_DUO_MODERN_TAB_OPTICAL_PX}px + max(${peopleShellDockBottomOffset()}, var(--safe-area-bottom-layout, 0px)))`
    );
    expect(peopleDuoModernSlideScrollBottomPad()).not.toContain(
      `${PEOPLE_DUO_MODERN_ACTION_ROW_GAP_PX}px`
    );
    expect(peopleFeedContentBottomPad()).toBe(
      "calc(64px + var(--safe-area-bottom-layout, 0px) + 12px)"
    );
    expect(carousel).toContain('data-people-embla-viewport="true"');
    expect(carousel).toContain("relative h-full overflow-hidden");
    expect(info).toContain("line-clamp-3");
    expect(info).not.toContain("PEOPLE_DUO_QA_FULL_CAPTION");
    expect(row).toContain("data-people-duo-heart-comment-pill");
    expect(row).toContain("PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB");
  });

  it("Duo-modern moves top inset into the scroller; nav fade is paint-only, pill keeps glass", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const canonical = read("components/people/PeopleCanonicalCandidatePresentation.tsx");
    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    const nav = read("pages/people/PeopleFeedTopNav.tsx");
    expect(overlay).toContain("paddingTop: 0");
    expect(overlay).toContain("isDuoDeckScope");
    expect(overlay).toContain("frostedScrollThrough={isDuoDeckScope}");
    expect(overlay).toContain("paddingBottom: 0");
    expect(canonical).toContain('data-people-duo-scroll-top-inset="true"');
    expect(canonical).toContain("height: peopleDuoModernScrollTopInset()");
    expect(canonical).not.toContain("height: peopleFeedContentTopPad()");
    expect(canonical.indexOf("data-people-duo-scroll-top-inset")).toBeLessThan(
      canonical.indexOf('data-people-duo-scene="true"')
    );
    expect(carousel).toContain("peopleDuoModernMetricsHostH");
    expect(carousel).toContain("peopleFeedContentTopPadPx");
    expect(carousel).toContain("relative h-full overflow-hidden");
    expect(nav).toContain("frostedScrollThrough");
    expect(nav).toContain("data-people-feed-top-fade-frost");
    expect(nav).toContain('data-people-feed-top-fade-soft="true"');
    expect(nav).toContain("pointer-events-none");
    expect(nav).toContain("pointer-events-auto");
    // Full-bleed fade: no blur/mask. Capsule keeps glass blur.
    expect(nav).not.toContain("backdropFilter");
    expect(nav).not.toContain("WebkitBackdropFilter");
    expect(nav).not.toContain("WebkitMaskImage");
    expect(nav).toContain("backdrop-blur-[var(--glass-blur)]");
    expect(nav).toContain("var(--glass-bg)");
    expect(nav).toContain("var(--gradient-from-top)");
    expect(nav).toContain("PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX");
    expect(nav).not.toContain("peopleFeedContentTopPad()");
    const fade = nav.slice(
      nav.indexOf("/* Paint-only fade"),
      nav.indexOf("data-people-feed-top-nav=")
    );
    expect(fade).not.toContain("backdrop-blur");
    expect(fade).not.toContain("backdropFilter");
  });

  it("Duo floating action cluster owns a pointer-none organic wash above BottomTab", () => {
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const tab = read("components/BottomTab.tsx");
    const washStart = row.indexOf("data-people-duo-action-cluster-wash");
    const wash = row.slice(washStart, row.indexOf("<button", washStart));
    expect(row).toContain('data-people-duo-bottom-action-cluster="true"');
    expect(row).toContain('data-people-duo-action-cluster-wash="true"');
    expect(overlay).not.toContain("data-people-duo-action-cluster-wash");
    expect(overlay).not.toContain("data-people-duo-bottom-float-fade");
    expect(tab).not.toContain("data-people-duo-action-cluster-wash");
    expect(wash).toContain("pointer-events-none");
    expect(wash).toContain("z-0");
    expect(wash).toContain("h-[180px]");
    expect(wash).toContain("w-[min(360px,calc(100vw-16px))]");
    expect(wash).toContain("ellipse 120px 100px");
    expect(wash).toContain("ellipse 180px 72px");
    expect(wash).toContain("transparent 78%");
    expect(wash).toContain("transparent 80%");
    expect(wash).toContain("ellipse 95% 88%");
    expect(wash).toContain("#000 42%");
    expect(wash).toContain("transparent 100%");
    expect(wash).not.toContain("ellipse 70% 62%");
    expect(wash).not.toContain("#000 18%");
    expect(wash).toContain("var(--bg)_90%");
    expect(wash).toContain("var(--bg)_55%");
    expect(wash).toContain("var(--app-canvas)_90%");
    expect(wash).toContain("var(--app-canvas)_58%");
    expect(wash).toContain("bottom: tabBandPad");
    expect(wash).toContain("calc(100% - 34px)");
    expect(wash).not.toContain("backdrop-filter");
    expect(wash).not.toContain("backdrop-blur");
    expect(row).toContain("const tabBandPad = peopleDuoModernTabBandPad()");
    expect(row).toContain("paddingBottom: tabBandPad");
    expect(row).toContain("bottom: tabBandPad");
    expect(PEOPLE_DUO_MODERN_TAB_OPTICAL_PX).toBe(6);
    expect(peopleDuoModernTabBandPad()).toBe(
      `calc(64px + ${peopleShellDockBottomOffset()} + 6px)`
    );
    expect(PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB).toBe(45);
    expect(row).toContain("peopleDuoModernTabBandPad");
    expect(row).toContain("pointer-events-auto relative z-[1]");
    expect(row).toContain("relative z-[1] rounded-full p-2");
    expect(row).toContain("data-people-duo-nav-prev");
    expect(row).toContain("data-people-duo-nav-next");
    expect(row).toContain("data-people-duo-heart-comment-pill");
    expect(row).toContain("PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB");
    expect(row.indexOf("data-people-duo-action-cluster-wash")).toBeLessThan(
      row.indexOf("data-people-duo-nav-prev")
    );
    expect(row).not.toContain("opacity-45");
    expect(row).not.toContain("saturate-[0.55]");
    expect(row).toContain("disabled={!prevEnabled}");
    expect(row).toContain("disabled={!nextEnabled}");
    expect(overlay).toContain("canMineGoPrev = !mineEdgeNavLocked && index > 0");
    expect(overlay).toContain("canMineGoNext");
    expect(overlay).toContain("index < carouselItems.length - 1");
  });

  it("Duo nav faces use CSS rest color, currentColor fill, and stable refs", () => {
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    const motion = read("lib/people/mineMotionProbeProgress.ts");
    expect(row).toContain("useCallback");
    expect(row).toContain("bindPrevFace");
    expect(row).toContain("bindNextFace");
    expect(row).not.toContain("bindEdgeRef");
    expect(row).toContain("peopleDuoNavFaceBound");
    expect(row).toContain("if (node.style.transform) return");
    expect(row).toContain("[&_svg]:fill-current");
    expect(row).toContain("app-light:bg-white app-light:text-[#141414]");
    expect(row).toContain("bg-[#141414] text-[#f5f0e6]");
    expect(row).toContain("group-disabled:text-[color-mix(in_oklab,#f5f0e6_42%,transparent)]");
    expect(row).toContain(
      "app-light:group-disabled:text-[color-mix(in_oklab,#141414_62%,transparent)]"
    );
    expect(row).toContain("motion-safe:duration-[240ms]");
    expect(row).toContain("motion-reduce:transition-none");
    expect(row).toContain("disabled:opacity-100");
    expect(row).not.toContain("opacity-45");
    expect(motion).toContain('svg.setAttribute("fill", "currentColor")');
    expect(motion).toContain('el.style.color = ""');
    expect(motion).not.toContain("settleMineEdgeCardDuoBottomFeedbackSide(edgeCards[idleSide])");
  });
});
