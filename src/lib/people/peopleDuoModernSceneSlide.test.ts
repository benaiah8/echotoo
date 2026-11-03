import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_DUO_MODERN_SCENE_BLUR_PX,
  PEOPLE_DUO_MODERN_SCENE_EXTRA_X_PX,
  PEOPLE_DUO_MODERN_SCENE_IDENTITY,
  PEOPLE_DUO_MODERN_SCENE_INCOMING_OPACITY,
  PEOPLE_DUO_MODERN_SCENE_NEIGHBOR_OPACITY,
  PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE,
  PEOPLE_DUO_MODERN_SCENE_ROTATE_DEG,
  PEOPLE_DUO_MODERN_SCENE_START_SCALE,
  PEOPLE_DUO_MODERN_SCENE_TY_PX,
  PEOPLE_DUO_MODERN_STACK_POSE,
  peopleDuoModernSceneExtraTranslateX,
  peopleDuoModernSceneIncomingRotateDeg,
  peopleDuoModernSceneIncomingScale,
  peopleDuoModernSceneOutgoingBlurPx,
  peopleDuoModernSceneOutgoingIntensity,
  peopleDuoModernSceneOutgoingRotateDeg,
  peopleDuoModernSceneOutgoingScale,
  peopleDuoModernSceneRole,
  peopleDuoModernSceneSlideStyle,
  peopleDuoModernSceneGestureWriteAllowed,
} from "./peopleCandidateMediaPresentation";
import {
  computeMineMotionProbeProgress,
  writeDuoModernSceneVisual,
} from "./mineMotionProbeProgress";
import {
  peopleDuoModernSlideScrollBottomPad,
  peopleShellDockBottomOffset,
} from "../../pages/people/peopleShellLayout";

const carousel = readFileSync(
  join(__dirname, "../../pages/people/MatchDeckCarousel.tsx"),
  "utf8"
);
const canonical = readFileSync(
  join(__dirname, "../../components/people/PeopleCanonicalCandidatePresentation.tsx"),
  "utf8"
);
const overlay = readFileSync(
  join(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
  "utf8"
);
const media = readFileSync(
  join(__dirname, "../../components/people/PeopleCandidateMedia.tsx"),
  "utf8"
);
const presentation = readFileSync(
  join(__dirname, "./peopleCandidateMediaPresentation.ts"),
  "utf8"
);
const motion = readFileSync(
  join(__dirname, "./mineMotionProbeProgress.ts"),
  "utf8"
);

function assertIdentity(
  style: ReturnType<typeof peopleDuoModernSceneSlideStyle>
): void {
  expect(style).toEqual({ ...PEOPLE_DUO_MODERN_SCENE_IDENTITY });
  expect(style.opacity).toBe("1");
  expect(style.filter).toBe("");
}

describe("peopleDuoModernSceneSlideStyle finger-follow", () => {
  it("at-rest idle and outgoing p=0 are identity; opacity always 1", () => {
    assertIdentity(peopleDuoModernSceneSlideStyle(0));
    assertIdentity(peopleDuoModernSceneSlideStyle(0, { role: "idle" }));
    assertIdentity(peopleDuoModernSceneSlideStyle(0, { role: "outgoing" }));
    expect(PEOPLE_DUO_MODERN_SCENE_BLUR_PX).toBe(9.6);
    expect(PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE).toBe(0.52);
    expect(PEOPLE_DUO_MODERN_SCENE_TY_PX).toBe(0);
    expect(PEOPLE_DUO_MODERN_SCENE_INCOMING_OPACITY).toBe(1);
    expect(PEOPLE_DUO_MODERN_SCENE_NEIGHBOR_OPACITY).toBe(1);
  });

  it("incoming scene grows as progress advances", () => {
    expect(PEOPLE_DUO_MODERN_SCENE_START_SCALE).toBe(0.68);
    expect(peopleDuoModernSceneIncomingScale(0)).toBe(0.68);
    expect(peopleDuoModernSceneIncomingScale(0.5)).toBeCloseTo(0.84);
    expect(peopleDuoModernSceneIncomingScale(1)).toBe(1);
    const start = peopleDuoModernSceneSlideStyle(0, {
      role: "incoming",
      side: "next",
    });
    const mid = peopleDuoModernSceneSlideStyle(0.5, {
      role: "incoming",
      side: "next",
    });
    const end = peopleDuoModernSceneSlideStyle(1, {
      role: "incoming",
      side: "next",
    });
    expect(start.opacity).toBe("1");
    expect(mid.opacity).toBe("1");
    expect(end.opacity).toBe("1");
    expect(start.filter).toBe("");
    expect(mid.filter).toBe("");
    expect(end.filter).toBe("");
    expect(start.transform).toContain("scale(0.6800)");
    expect(mid.transform).toContain("scale(0.8400)");
    expect(end.transform).toContain("scale(1.0000)");
    expect(Number(start.transform.match(/scale\(([^)]+)\)/)?.[1])).toBeLessThan(
      Number(mid.transform.match(/scale\(([^)]+)\)/)?.[1])
    );
  });

  it("outgoing scene shrinks as progress advances", () => {
    expect(peopleDuoModernSceneOutgoingScale(0)).toBe(1);
    expect(peopleDuoModernSceneOutgoingScale(0.5)).toBeCloseTo(0.58);
    expect(peopleDuoModernSceneOutgoingScale(1)).toBe(0.52);
    const mid = peopleDuoModernSceneSlideStyle(0.5, {
      role: "outgoing",
      side: "next",
    });
    const end = peopleDuoModernSceneSlideStyle(1, {
      role: "outgoing",
      side: "next",
    });
    expect(mid.opacity).toBe("1");
    expect(mid.filter).toBe("blur(8.40px)");
    expect(end.filter).toBe("blur(9.60px)");
    expect(end.transform).toContain("scale(0.5200)");
    expect(end.transform).not.toContain("scale(0.9600)");
    expect(end.transform).not.toContain("translateY");
  });

  it("outgoing intensity is ease-out cubic; incoming stays sharp", () => {
    const samples = [0, 0.25, 0.5, 0.75, 1] as const;
    const intensities = samples.map(peopleDuoModernSceneOutgoingIntensity);
    expect(intensities[0]).toBe(0);
    expect(intensities[1]).toBeCloseTo(0.578125);
    expect(intensities[2]).toBeCloseTo(0.875);
    expect(intensities[3]).toBeCloseTo(0.984375);
    expect(intensities[4]).toBe(1);
    for (let i = 1; i < intensities.length; i++) {
      expect(intensities[i]!).toBeGreaterThan(intensities[i - 1]!);
    }
    const out = (p: number) =>
      peopleDuoModernSceneSlideStyle(p, { role: "outgoing", side: "next" });
    expect(out(0).filter).toBe("");
    expect(out(0).transform).toBe("");
    expect(out(0.25).transform).toContain("scale(0.7225)");
    expect(out(0.25).filter).toBe("blur(5.55px)");
    expect(out(0.5).transform).toContain("scale(0.5800)");
    expect(out(0.5).filter).toBe("blur(8.40px)");
    expect(out(0.75).transform).toContain("scale(0.5275)");
    expect(out(0.75).filter).toBe("blur(9.45px)");
    expect(out(1).transform).toContain("scale(0.5200)");
    expect(out(1).filter).toBe("blur(9.60px)");
    expect(out(1).filter).toBe(
      `blur(${peopleDuoModernSceneOutgoingBlurPx(1).toFixed(2)}px)`
    );
    expect(out(0.25).filter).not.toBe(out(0.5).filter);
    expect(
      Number(out(0.25).filter.match(/blur\(([^p]+)px\)/)?.[1])
    ).toBeLessThan(Number(out(0.5).filter.match(/blur\(([^p]+)px\)/)?.[1]));
    expect(
      peopleDuoModernSceneSlideStyle(1, {
        role: "outgoing",
        side: "prev",
      }).filter
    ).toBe("blur(9.60px)");
    expect(
      peopleDuoModernSceneSlideStyle(0.5, { role: "incoming", side: "next" })
        .filter
    ).toBe("");
    expect(peopleDuoModernSceneSlideStyle(1, { role: "idle" }).filter).toBe("");
    expect(
      peopleDuoModernSceneSlideStyle(1, {
        role: "outgoing",
        reduceMotion: true,
      }).filter
    ).toBe("");
    expect(carousel).not.toContain("will-change: filter");
    expect(motion).not.toContain("will-change: filter");
    expect(motion).toContain("el.style.filter = style.filter");
  });

  it("incoming keeps linear grow; outgoing uses its own intensity", () => {
    const p = 0.4;
    expect(peopleDuoModernSceneIncomingScale(p)).toBe(
      PEOPLE_DUO_MODERN_SCENE_START_SCALE +
        p * (1 - PEOPLE_DUO_MODERN_SCENE_START_SCALE)
    );
    expect(peopleDuoModernSceneOutgoingScale(p)).toBe(
      1 -
        peopleDuoModernSceneOutgoingIntensity(p) *
          (1 - PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE)
    );
    expect(peopleDuoModernSceneIncomingScale(0.5)).toBeCloseTo(0.84);
  });

  it("rotation returns to zero at center; forward/back mirror", () => {
    expect(PEOPLE_DUO_MODERN_SCENE_ROTATE_DEG).toBe(6);
    expect(peopleDuoModernSceneIncomingRotateDeg(1, "next")).toBe(0);
    expect(peopleDuoModernSceneIncomingRotateDeg(1, "prev")).toBe(0);
    expect(peopleDuoModernSceneOutgoingRotateDeg(0, "next")).toBe(0);
    expect(peopleDuoModernSceneIncomingRotateDeg(0, "next")).toBe(6);
    expect(peopleDuoModernSceneIncomingRotateDeg(0, "prev")).toBe(-6);
    expect(peopleDuoModernSceneOutgoingRotateDeg(1, "next")).toBe(-6);
    expect(peopleDuoModernSceneOutgoingRotateDeg(1, "prev")).toBe(6);
    const nextIn = peopleDuoModernSceneSlideStyle(0.5, {
      role: "incoming",
      side: "next",
    });
    const prevIn = peopleDuoModernSceneSlideStyle(0.5, {
      role: "incoming",
      side: "prev",
    });
    expect(nextIn.transform).toContain("rotate(3.00deg)");
    expect(prevIn.transform).toContain("rotate(-3.00deg)");
  });

  it("bounded extra X stays inside visible scene (not portrait off-screen park)", () => {
    expect(PEOPLE_DUO_MODERN_SCENE_EXTRA_X_PX).toBe(28);
    expect(peopleDuoModernSceneExtraTranslateX("incoming", "next", 0)).toBe(28);
    expect(peopleDuoModernSceneExtraTranslateX("incoming", "next", 1)).toBe(0);
    expect(peopleDuoModernSceneExtraTranslateX("outgoing", "next", 1)).toBe(-28);
    expect(peopleDuoModernSceneExtraTranslateX("incoming", "prev", 0)).toBe(-28);
    expect(
      Math.abs(peopleDuoModernSceneExtraTranslateX("incoming", "next", 0))
    ).toBeLessThan(80);
    const style = peopleDuoModernSceneSlideStyle(1, {
      role: "outgoing",
      side: "next",
    });
    expect(style.transform).not.toBe("translate(-8px, 16px) scale(0.94)");
    expect(style.opacity).not.toBe("0.55");
    expect(style.opacity).not.toBe("0.88");
  });

  it("reduced motion is identity for both roles", () => {
    assertIdentity(
      peopleDuoModernSceneSlideStyle(1, { role: "outgoing", reduceMotion: true })
    );
    assertIdentity(
      peopleDuoModernSceneSlideStyle(0, { role: "incoming", reduceMotion: true })
    );
  });
});

describe("peopleDuoModernSceneRole + computeMineMotionProbeProgress", () => {
  const snaps = [0, 0.5, 1];

  it("next swipe: departure outgoing, next incoming, same p", () => {
    const progress = computeMineMotionProbeProgress(0.25, snaps, 0);
    expect(progress).toEqual({ prev: 0, next: 0.5 });
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 0,
        departureIndex: 0,
        progress,
      })
    ).toBe("outgoing");
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 1,
        departureIndex: 0,
        progress,
      })
    ).toBe("incoming");
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 2,
        departureIndex: 0,
        progress,
      })
    ).toBe("idle");
  });

  it("previous swipe mirrors next", () => {
    const progress = computeMineMotionProbeProgress(0.25, snaps, 1);
    expect(progress).toEqual({ prev: 0.5, next: 0 });
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 1,
        departureIndex: 1,
        progress,
      })
    ).toBe("outgoing");
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 0,
        departureIndex: 1,
        progress,
      })
    ).toBe("incoming");
  });

  it("reverse-drag swaps incoming neighbor; departure stays outgoing", () => {
    const towardNext = computeMineMotionProbeProgress(0.75, snaps, 1);
    expect(towardNext.next).toBeGreaterThan(0);
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 2,
        departureIndex: 1,
        progress: towardNext,
      })
    ).toBe("incoming");
    const towardPrev = computeMineMotionProbeProgress(0.25, snaps, 1);
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 0,
        departureIndex: 1,
        progress: towardPrev,
      })
    ).toBe("incoming");
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 2,
        departureIndex: 1,
        progress: towardPrev,
      })
    ).toBe("idle");
  });

  it("canceled navigation (progress 0) is idle identity", () => {
    const progress = computeMineMotionProbeProgress(0.5, snaps, 1);
    expect(progress).toEqual({ prev: 0, next: 0 });
    expect(
      peopleDuoModernSceneRole({
        slideIndex: 1,
        departureIndex: 1,
        progress,
      })
    ).toBe("idle");
    assertIdentity(peopleDuoModernSceneSlideStyle(0, { role: "outgoing" }));
  });
});

describe("writeDuoModernSceneVisual", () => {
  function slideWithScene(style: Record<string, string>) {
    return {
      querySelector: (sel: string) =>
        sel.includes("people-duo-scene") ? { style } : null,
    } as unknown as HTMLElement;
  }

  it("grows incoming and shrinks outgoing without touching opacity", () => {
    const a: Record<string, string> = {};
    const b: Record<string, string> = {};
    writeDuoModernSceneVisual({
      slides: [slideWithScene(a), slideWithScene(b)],
      progress: { prev: 0, next: 0.5 },
      departureIndex: 0,
      reduceMotion: false,
    });
    expect(a.opacity).toBe("1");
    expect(b.opacity).toBe("1");
    expect(a.transform).toContain("scale(0.5800)");
    expect(b.transform).toContain("scale(0.8400)");
    expect(a.transform).toContain("rotate(-3.00deg)");
    expect(b.transform).toContain("rotate(3.00deg)");
    expect(a.filter).toBe("blur(8.40px)");
    expect(b.filter).toBe("");
  });

  it("helper can park incoming at p=0; carousel must not call this for arrows", () => {
    const a: Record<string, string> = { transform: "stale" };
    const b: Record<string, string> = { transform: "stale" };
    writeDuoModernSceneVisual({
      slides: [slideWithScene(a), slideWithScene(b)],
      progress: { prev: 0, next: 0 },
      departureIndex: 0,
      forceSide: "next",
      reduceMotion: false,
    });
    expect(a.transform).toBe("");
    expect(b.transform).toContain("scale(0.6800)");
    expect(carousel).toContain("writeDuoModernSceneIfDragging");
    expect(carousel).toContain("peopleDuoModernSceneGestureWriteAllowed");
    expect(carousel).toContain("duoGestureSceneFlightRef");
  });

  it("cancel/idle progress restores identity", () => {
    const a: Record<string, string> = { transform: "stale", filter: "blur(9.60px)" };
    writeDuoModernSceneVisual({
      slides: [slideWithScene(a)],
      progress: { prev: 0, next: 0 },
      departureIndex: 0,
      reduceMotion: false,
    });
    expect(a.transform).toBe("");
    expect(a.opacity).toBe("1");
    expect(a.filter).toBe("");
  });

  it("outgoing blur follows progress; reverse and settle clear it", () => {
    const a: Record<string, string> = {};
    const b: Record<string, string> = {};
    const slides = [slideWithScene(a), slideWithScene(b)];
    writeDuoModernSceneVisual({
      slides,
      progress: { prev: 0, next: 1 },
      departureIndex: 0,
      reduceMotion: false,
    });
    expect(a.filter).toBe("blur(9.60px)");
    expect(b.filter).toBe("");
    writeDuoModernSceneVisual({
      slides,
      progress: { prev: 0, next: 0.5 },
      departureIndex: 0,
      reduceMotion: false,
    });
    expect(a.filter).toBe("blur(8.40px)");
    expect(b.filter).toBe("");
    writeDuoModernSceneVisual({
      slides,
      progress: { prev: 1, next: 0 },
      departureIndex: 1,
      reduceMotion: false,
    });
    expect(b.filter).toBe("blur(9.60px)");
    expect(a.filter).toBe("");
    writeDuoModernSceneVisual({
      slides,
      progress: { prev: 0, next: 0 },
      departureIndex: 1,
      reduceMotion: false,
    });
    expect(a.filter).toBe("");
    expect(b.filter).toBe("");
  });

  it("does not write portrait or info-column selectors", () => {
    expect(motion).toContain("writeDuoModernSceneVisual");
    expect(motion).toContain('PEOPLE_DUO_MODERN_SCENE_SELECTOR = "[data-people-duo-scene]"');
    const writer = motion.match(
      /export function writeDuoModernSceneVisual[\s\S]*?^function clamp01/m
    )?.[0];
    expect(writer).toBeTruthy();
    expect(writer).not.toContain("MINE_NAV_PORTRAIT_SELECTOR");
    expect(writer).not.toContain("mineDuoInfoColumnCounterMotionStyle");
  });
});

describe("MatchDeckCarousel Duo-modern wiring", () => {
  it("one scene writer; portrait/info extras stay off", () => {
    expect(canonical).toContain('data-people-duo-scene="true"');
    expect(carousel).toContain("writeDuoModernSceneVisual");
    expect(carousel).toContain("writeDuoModernSceneIfDragging");
    expect(carousel).toContain("peopleDuoModernSceneSlideStyle");
    expect(carousel).toContain("sceneExtras: !duoLayoutModernRef.current");
    expect(carousel).toContain("computeMineMotionProbeProgress");
    expect(carousel).not.toContain("peopleDuoModernSceneProgressU");
    expect(carousel).toContain("if (duoLayoutModernRef.current) return;");
    expect(carousel).toContain("cancelPresentationRaf");
  });

  it("Plans/Mine full-width without Duo-modern stays identity", () => {
    expect(carousel).toContain('mode === "fullWidth" && !duoModernScene');
    expect(carousel).toContain("isPlansPresentation");
  });

  it("Embla navigation and arrow prepare remain wired", () => {
    expect(carousel).toContain("useEmblaCarousel");
    expect(carousel).toContain("emblaApi.scrollTo");
    expect(carousel).toContain("forceSide");
    expect(overlay).toContain("goMinePrev");
    expect(overlay).toContain("goMineNext");
  });

  it("Duo bottom clipping and overflow stay protected", () => {
    expect(overlay).toContain("isDuoDeckScope ? 0 : peopleFeedContentBottomPad()");
    expect(canonical).toContain('data-people-duo-slide-scroll="true"');
    expect(canonical).toContain('data-people-duo-scroll-top-inset="true"');
    expect(canonical).toContain("peopleDuoModernScrollTopInset()");
    expect(canonical).not.toContain("height: peopleFeedContentTopPad()");
    expect(canonical).toContain("overflow-x-hidden");
    expect(canonical).toContain("peopleDuoModernSlideScrollBottomPad");
    expect(peopleDuoModernSlideScrollBottomPad()).toBe(
      `calc(68px + 10px + 64px + 6px + max(${peopleShellDockBottomOffset()}, var(--safe-area-bottom-layout, 0px)))`
    );
    expect(carousel).toContain("relative h-full overflow-hidden");
  });

  it("gesture flight continues after pointer-up until settle; arrows stay native", () => {
    expect(peopleDuoModernSceneGestureWriteAllowed({
      pointerDown: true,
      gestureFlight: false,
    })).toBe(true);
    expect(peopleDuoModernSceneGestureWriteAllowed({
      pointerDown: false,
      gestureFlight: true,
    })).toBe(true);
    expect(peopleDuoModernSceneGestureWriteAllowed({
      pointerDown: false,
      gestureFlight: false,
    })).toBe(false);
    expect(peopleDuoModernSceneGestureWriteAllowed({
      pointerDown: true,
      gestureFlight: true,
      forceSide: "next",
    })).toBe(false);
    expect(carousel).toContain("duoGestureSceneFlightRef.current = true");
    expect(carousel).toMatch(
      /const onPointerUp = \(\) => \{[\s\S]*idle\.prev <= 0 && idle\.next <= 0/
    );
    expect(carousel).not.toMatch(
      /const onPointerUp = \(\) => \{[\s\S]{0,280}clearDuoModernSceneVisual\(emblaApi\.slideNodes\(\)\)/
    );
    expect(carousel).toContain(
      "if (duoLayoutModern && duoGestureSceneFlightRef.current) return"
    );
    expect(carousel).toContain(
      "if (duoLayoutModernRef.current && duoGestureSceneFlightRef.current)"
    );
    expect(PEOPLE_DUO_MODERN_SCENE_START_SCALE).toBe(0.68);
    expect(PEOPLE_DUO_MODERN_SCENE_ROTATE_DEG).toBe(6);
    expect(PEOPLE_DUO_MODERN_SCENE_EXTRA_X_PX).toBe(28);
  });

  it("portrait stack geometry remains unchanged", () => {
    expect(PEOPLE_DUO_MODERN_STACK_POSE.front.scale).toBe(1);
    expect(PEOPLE_DUO_MODERN_STACK_POSE.left.opacity).toBe(0.88);
    expect(presentation).toContain("PEOPLE_DUO_MODERN_FRONT_WIDTH_RATIO = 0.85");
    expect(media).toContain("mineStackPose");
    expect(media).toContain("promote");
    expect(media).toContain("PEOPLE_PHOTO_CROSSFADE_MS");
  });
});
