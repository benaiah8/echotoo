import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../../app/store";
import { useCreateChooser } from "../../context/CreateChooserContext";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { isPostDetailRoutePath } from "../../lib/inviteOverlayHistory";
import {
  applySocialPillVisualCue,
  clearSocialPillVisualCue,
} from "../../lib/social/socialActionAttention";
import HomeTourCelebration from "./HomeTourCelebration";
import HomeTourOverlay, { type SpotlightRect } from "./HomeTourOverlay";
import { registerHomeTourDevApi } from "./homeTourDevApi";
import {
  HOME_TOUR_STEPS,
  homeTourTargetSelector,
  type HomeTourStep,
} from "./homeTourSteps";
import {
  hasCompletedHomeTour,
  markHomeTourCompleted,
} from "./homeTourStorage";
import { clampSpotlightTargetRect } from "./homeTourLayout";
import {
  ensureSocialTargetInSafeViewport,
  socialTargetNeedsSafeViewportMove,
  SOCIAL_BOTTOM_TAB_CLEARANCE_PX,
} from "./homeTourSocialViewport";

export { SOCIAL_BOTTOM_TAB_CLEARANCE_PX };

const HOME_TOUR_HISTORY_MARKER = "echotooHomeTourV1";
/** Delay after Home is eligible before starting (lets chrome + feed settle). */
const START_DELAY_MS = 900;
/** How long to wait for an optional target (Duo/Group) before skipping. */
const OPTIONAL_TARGET_WAIT_MS = 2800;
const OPTIONAL_TARGET_POLL_MS = 200;
/** Allow Home filter drawer expand before measuring filter panel. */
const FILTER_DRAWER_SETTLE_MS = 320;

export type HomeTourProps = {
  /** Home persistent tab is the active primary tab. */
  isHomeVisible: boolean;
  /** Home post/user search shell is open. */
  homePostSearchActive: boolean;
  /** Brand WelcomeModal / info overlay on Home. */
  welcomeModalOpen: boolean;
  /** Open Home filter panel (reveal header + setFiltersOpen) — no DOM click. */
  onOpenTourFilters?: () => void;
  /** Close Home filter panel opened for the tour. */
  onCloseTourFilters?: () => void;
  /**
   * One-shot Home top positioning before tour lock
   * (existing Home scroll-to-top + header reveal).
   */
  onPrepareTourStart?: () => void;
};

function readTargetElement(
  target: HomeTourStep["target"]
): HTMLElement | null {
  if (!target || typeof document === "undefined") return null;
  const nodes = document.querySelectorAll(
    homeTourTargetSelector(target)
  ) as NodeListOf<HTMLElement>;
  if (!nodes.length) return null;

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const midY = window.innerHeight / 2;

  for (const el of nodes) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const inView = r.bottom > 8 && r.top < window.innerHeight - 8;
    const dist = Math.abs(r.top + r.height / 2 - midY);
    const score = inView ? dist : dist + 10_000;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function elementToRect(el: Element | null): SpotlightRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

/**
 * For Duo/Group steps, prefer the specific pill rect when present;
 * otherwise keep the cluster rect (no targeting rewrite).
 * Spotlight rects are clamped to the usable app frame (safe area / phone shell).
 */
function readStepSpotlightRect(step: HomeTourStep): SpotlightRect | null {
  if (!step.target) return null;
  const clusterOrTarget = readTargetElement(step.target);
  if (!clusterOrTarget) return null;

  let raw: SpotlightRect | null = null;

  if (step.target === "duo-group") {
    const pillSel =
      step.id === "duo"
        ? '[data-social-pill="duo"]'
        : step.id === "group"
          ? '[data-social-pill="group"]'
          : null;
    if (pillSel) {
      const pill = clusterOrTarget.querySelector(pillSel);
      raw = elementToRect(pill);
    }
  }

  if (!raw) raw = elementToRect(clusterOrTarget);
  if (!raw) return null;
  return clampSpotlightTargetRect(raw);
}

function stepNeedsTourFilters(step: HomeTourStep | null): boolean {
  return (
    step?.target === "home-filter-panel" ||
    step?.target === "home-filter-dates" ||
    step?.id === "date-time"
  );
}

/** Two frames so layout/paint after lock-aware scroll are visible to measure. */
function scheduleLayoutSettle(cb: () => void): () => void {
  let cancelled = false;
  let outer = 0;
  let inner = 0;
  outer = window.requestAnimationFrame(() => {
    if (cancelled) return;
    inner = window.requestAnimationFrame(() => {
      if (cancelled) return;
      cb();
    });
  });
  return () => {
    cancelled = true;
    if (outer) window.cancelAnimationFrame(outer);
    if (inner) window.cancelAnimationFrame(inner);
  };
}

/**
 * Isolated first-time Home walkthrough. Does not change feed/filter/Duo/Create/nav logic.
 */
export default function HomeTour({
  isHomeVisible,
  homePostSearchActive,
  welcomeModalOpen,
  onOpenTourFilters,
  onCloseTourFilters,
  onPrepareTourStart,
}: HomeTourProps) {
  const location = useLocation();
  const userId = useSelector((s: RootState) => s.auth?.user?.id ?? null);
  const authModalOpen = useSelector(
    (s: RootState) => Boolean(s.modal?.authModal)
  );
  const { isOpen: createChooserOpen } = useCreateChooser();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  /** Highest step the user has reached — future segments stay locked. */
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [celebrationOpen, setCelebrationOpen] = useState(false);

  /** One-shot social reposition key: step id ("duo" | "group"). */
  const scrolledSocialStepRef = useRef<string | null>(null);
  const maxReachedRef = useRef(0);
  const startTimerRef = useRef<number | null>(null);
  const historyPushedRef = useRef(false);
  const skipPopstateRef = useRef(false);
  const completingRef = useRef(false);
  const tourFiltersOpenedRef = useRef(false);
  const cuedPillRef = useRef<HTMLElement | null>(null);

  const step = HOME_TOUR_STEPS[stepIndex] ?? null;
  const stepCount = HOME_TOUR_STEPS.length;

  const closeTourFilters = useCallback(() => {
    if (!tourFiltersOpenedRef.current) {
      onCloseTourFilters?.();
      return;
    }
    tourFiltersOpenedRef.current = false;
    onCloseTourFilters?.();
  }, [onCloseTourFilters]);

  const openTourFilters = useCallback(() => {
    tourFiltersOpenedRef.current = true;
    onOpenTourFilters?.();
  }, [onOpenTourFilters]);

  const eligibleToStart =
    Boolean(userId) &&
    !hasCompletedHomeTour(userId) &&
    isHomeVisible &&
    !homePostSearchActive &&
    !welcomeModalOpen &&
    !authModalOpen &&
    !createChooserOpen &&
    !isPostDetailRoutePath(location.pathname);

  const activateTour = useCallback(() => {
    // One-shot Home top + chrome reveal BEFORE scroll lock settles.
    onPrepareTourStart?.();
    completingRef.current = false;
    setCelebrationOpen(false);
    setStepIndex(0);
    setMaxReachedIndex(0);
    maxReachedRef.current = 0;
    scrolledSocialStepRef.current = null;
    setActive(true);
  }, [onPrepareTourStart]);

  const closeTour = useCallback(
    (markComplete: boolean) => {
      if (markComplete) {
        if (completingRef.current) return;
        completingRef.current = true;
        markHomeTourCompleted(userId);
      }
      closeTourFilters();
      if (cuedPillRef.current) {
        clearSocialPillVisualCue(cuedPillRef.current);
        cuedPillRef.current = null;
      }
      setActive(false);
      setTargetRect(null);
      setStepIndex(0);
      setMaxReachedIndex(0);
      maxReachedRef.current = 0;
      scrolledSocialStepRef.current = null;
      if (!markComplete) {
        completingRef.current = false;
      }
    },
    [userId, closeTourFilters]
  );

  const finishTour = useCallback(
    (options?: { celebrate?: boolean }) => {
      closeTour(true);
      if (options?.celebrate) {
        setCelebrationOpen(true);
      }
    },
    [closeTour]
  );

  const abortTourWithoutCompleting = useCallback(() => {
    closeTour(false);
  }, [closeTour]);

  /**
   * Central step navigation for Next, progress taps, and optional skips.
   * Side effects (filters / social cues / reposition) are driven by step
   * effects — this only chooses the index and prepares chrome when needed.
   */
  const goToStep = useCallback(
    (nextIndex: number, options?: { allowForward?: boolean }) => {
      if (nextIndex < 0 || nextIndex >= HOME_TOUR_STEPS.length) return;
      const maxReached = maxReachedRef.current;
      if (!options?.allowForward && nextIndex > maxReached) return;

      const nextStep = HOME_TOUR_STEPS[nextIndex];
      // Welcome / filters: restore coherent Home top chrome.
      if (nextStep?.id === "welcome" || nextStep?.id === "filters-search") {
        onPrepareTourStart?.();
      }

      // Re-run Duo/Group safe viewport placement on every visit (incl. back).
      if (nextStep?.target === "duo-group") {
        scrolledSocialStepRef.current = null;
      }

      const newMax = Math.max(maxReached, nextIndex);
      maxReachedRef.current = newMax;
      setMaxReachedIndex(newMax);
      setStepIndex(nextIndex);
    },
    [onPrepareTourStart]
  );

  const goNext = useCallback(() => {
    if (stepIndex >= HOME_TOUR_STEPS.length - 1) {
      finishTour({ celebrate: true });
      return;
    }
    goToStep(stepIndex + 1, { allowForward: true });
  }, [stepIndex, goToStep, finishTour]);

  const skipTour = useCallback(() => {
    finishTour({ celebrate: false });
  }, [finishTour]);

  const forceStartTour = useCallback(() => {
    if (startTimerRef.current != null) {
      window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    closeTourFilters();
    if (cuedPillRef.current) {
      clearSocialPillVisualCue(cuedPillRef.current);
      cuedPillRef.current = null;
    }
    activateTour();
  }, [closeTourFilters, activateTour]);

  // DEV: window.__echoHomeTour.start() / .reset()
  useEffect(() => {
    return registerHomeTourDevApi({
      userId,
      start: forceStartTour,
    });
  }, [userId, forceStartTour]);

  // Start after delay when eligible; cancel if eligibility drops.
  useEffect(() => {
    if (active) return;
    if (!eligibleToStart) {
      if (startTimerRef.current != null) {
        window.clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
      return;
    }

    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      if (hasCompletedHomeTour(userId)) return;
      activateTour();
    }, START_DELAY_MS);

    return () => {
      if (startTimerRef.current != null) {
        window.clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
    };
  }, [active, eligibleToStart, userId, activateTour]);

  // Soft-abort if Home becomes ineligible mid-tour (can resume later if not completed).
  useEffect(() => {
    if (!active) return;
    if (
      !isHomeVisible ||
      homePostSearchActive ||
      welcomeModalOpen ||
      authModalOpen ||
      createChooserOpen ||
      isPostDetailRoutePath(location.pathname)
    ) {
      abortTourWithoutCompleting();
    }
  }, [
    active,
    isHomeVisible,
    homePostSearchActive,
    welcomeModalOpen,
    authModalOpen,
    createChooserOpen,
    location.pathname,
    abortTourWithoutCompleting,
  ]);

  // Open/close real Home filter panel for Date & Time only (no filter value changes).
  useEffect(() => {
    if (!active || !step) {
      closeTourFilters();
      return;
    }
    if (stepNeedsTourFilters(step)) {
      openTourFilters();
    } else {
      closeTourFilters();
    }
  }, [active, step, openTourFilters, closeTourFilters]);

  // Visual-only Duo/Group pill cues (never press / mutate social state).
  useEffect(() => {
    if (!active || !step) return;

    const clearCue = () => {
      if (cuedPillRef.current) {
        clearSocialPillVisualCue(cuedPillRef.current);
        cuedPillRef.current = null;
      }
    };

    clearCue();

    if (step.id !== "duo" && step.id !== "group") {
      return clearCue;
    }

    const cluster = readTargetElement("duo-group");
    if (!cluster) return clearCue;

    const pillSel =
      step.id === "duo"
        ? '[data-social-pill="duo"]'
        : '[data-social-pill="group"]';
    const pill = cluster.querySelector<HTMLElement>(pillSel);
    if (!pill) return clearCue;

    applySocialPillVisualCue(pill);
    cuedPillRef.current = pill;
    return clearCue;
  }, [active, step]);

  // Measure target + optional wait/skip + Duo/Group lock-aware scroll then settle.
  useEffect(() => {
    if (!active || !step) return;

    let cancelled = false;
    let pollTimer: number | null = null;
    let settleTimer: number | null = null;
    let cancelSettle: (() => void) | null = null;
    let socialPositionInFlight = false;
    let waitDeadline = 0;
    let allowMeasure = !stepNeedsTourFilters(step);

    const applyRect = (rect: SpotlightRect | null) => {
      if (cancelled) return;
      setTargetRect(rect);
    };

    const clearSettle = () => {
      if (cancelSettle) {
        cancelSettle();
        cancelSettle = null;
      }
    };

    /**
     * Duo/Group: resolve → scroll under lock → layout settle → measure.
     * At most one corrective pass if still outside the safe band (tall media).
     * One-shot marker is set only after the attempt is evaluated.
     */
    const finishSocialMeasure = () => {
      if (cancelled) return;
      socialPositionInFlight = false;
      scrolledSocialStepRef.current = step.id;
      applyRect(readStepSpotlightRect(step));
    };

    const runSocialPositionThenMeasure = () => {
      if (cancelled || !step.target) return;
      if (scrolledSocialStepRef.current === step.id) {
        applyRect(readStepSpotlightRect(step));
        return;
      }
      if (socialPositionInFlight) return;

      const el = readTargetElement(step.target);
      if (!el) {
        applyRect(null);
        return;
      }

      socialPositionInFlight = true;
      // Avoid a stale spotlight while the feed is still moving.
      applyRect(null);

      const first = ensureSocialTargetInSafeViewport(el, step.id);

      const afterFirstSettle = () => {
        if (cancelled) return;
        cancelSettle = null;
        const elAfter = readTargetElement(step.target!);
        if (!elAfter) {
          socialPositionInFlight = false;
          applyRect(null);
          return;
        }

        if (socialTargetNeedsSafeViewportMove(elAfter, step.id)) {
          ensureSocialTargetInSafeViewport(elAfter, step.id);
          clearSettle();
          cancelSettle = scheduleLayoutSettle(() => {
            if (cancelled) return;
            cancelSettle = null;
            const elFinal = readTargetElement(step.target!);
            if (!elFinal) {
              socialPositionInFlight = false;
              applyRect(null);
              return;
            }
            finishSocialMeasure();
          });
          return;
        }

        finishSocialMeasure();
      };

      if (first.didScroll) {
        clearSettle();
        cancelSettle = scheduleLayoutSettle(afterFirstSettle);
      } else {
        // Already in the safe band — measure immediately (no stale pre-scroll coords).
        finishSocialMeasure();
      }
    };

    const tick = (): boolean => {
      if (cancelled) return false;
      // Centered welcome (no spotlight target).
      if (!step.target) {
        applyRect(null);
        return true;
      }
      if (!allowMeasure) {
        applyRect(null);
        return false;
      }
      const el = readTargetElement(step.target);
      if (el) {
        if (step.target === "duo-group") {
          runSocialPositionThenMeasure();
          return true;
        }
        applyRect(readStepSpotlightRect(step));
        return true;
      }
      applyRect(null);
      return false;
    };

    if (stepNeedsTourFilters(step)) {
      openTourFilters();
      settleTimer = window.setTimeout(() => {
        if (cancelled) return;
        allowMeasure = true;
        if (tick()) return;
        waitDeadline = Date.now() + OPTIONAL_TARGET_WAIT_MS;
        const pollPanel = () => {
          if (cancelled) return;
          if (tick()) return;
          if (Date.now() >= waitDeadline) return;
          pollTimer = window.setTimeout(pollPanel, OPTIONAL_TARGET_POLL_MS);
        };
        pollTimer = window.setTimeout(pollPanel, OPTIONAL_TARGET_POLL_MS);
      }, FILTER_DRAWER_SETTLE_MS);
    } else if (tick()) {
      // keep measuring on resize / scroll while this step is active
    } else if (step.optionalTarget) {
      waitDeadline = Date.now() + OPTIONAL_TARGET_WAIT_MS;
      const poll = () => {
        if (cancelled) return;
        if (tick()) return;
        if (Date.now() >= waitDeadline) {
          // Skip optional step(s) sharing this missing target.
          let next = stepIndex + 1;
          while (
            next < HOME_TOUR_STEPS.length &&
            HOME_TOUR_STEPS[next]?.target === step.target &&
            HOME_TOUR_STEPS[next]?.optionalTarget
          ) {
            next += 1;
          }
          if (next >= HOME_TOUR_STEPS.length) {
            finishTour({ celebrate: false });
          } else {
            goToStep(next, { allowForward: true });
          }
          return;
        }
        pollTimer = window.setTimeout(poll, OPTIONAL_TARGET_POLL_MS);
      };
      pollTimer = window.setTimeout(poll, OPTIONAL_TARGET_POLL_MS);
    }

    const onReposition = () => {
      if (cancelled) return;
      if (step.target === "duo-group") {
        // After one-shot placement, only remeasure — never re-scroll from resize noise.
        if (scrolledSocialStepRef.current === step.id) {
          applyRect(readStepSpotlightRect(step));
        }
        return;
      }
      tick();
    };
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      cancelled = true;
      socialPositionInFlight = false;
      clearSettle();
      if (pollTimer != null) window.clearTimeout(pollTimer);
      if (settleTimer != null) window.clearTimeout(settleTimer);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [active, step, stepIndex, finishTour, openTourFilters, goToStep]);

  // Freeze background feed scroll while the tour is open (canonical overlay lock).
  // Duo/Group reposition uses scrollDocumentByWhileLocked — no temporary unlock.
  useOverlayBackgroundScrollLock(active);

  // Synthetic history + Escape + Android hardware back → skip/finish.
  useEffect(() => {
    if (!active) return;

    if (!historyPushedRef.current) {
      window.history.pushState(
        { [HOME_TOUR_HISTORY_MARKER]: true } as Record<string, boolean>,
        "",
        window.location.href
      );
      historyPushedRef.current = true;
    }

    const onPopState = () => {
      if (skipPopstateRef.current) {
        skipPopstateRef.current = false;
        return;
      }
      finishTour({ celebrate: false });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishTour({ celebrate: false });
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    const unsubAndroid = subscribeAndroidHardwareBack(() => {
      finishTour({ celebrate: false });
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      unsubAndroid();
      if (historyPushedRef.current) {
        const st = window.history.state as Record<string, boolean> | null;
        if (st && st[HOME_TOUR_HISTORY_MARKER] === true) {
          skipPopstateRef.current = true;
          window.history.back();
        }
        historyPushedRef.current = false;
      }
    };
  }, [active, finishTour]);

  useEffect(() => {
    return () => {
      completingRef.current = false;
      closeTourFilters();
      if (cuedPillRef.current) {
        clearSocialPillVisualCue(cuedPillRef.current);
        cuedPillRef.current = null;
      }
    };
  }, [closeTourFilters]);

  const dismissCelebration = useCallback(() => {
    setCelebrationOpen(false);
  }, []);

  return (
    <>
      {active && step ? (
        <HomeTourOverlay
          step={step}
          stepIndex={stepIndex}
          stepCount={stepCount}
          maxReachedIndex={maxReachedIndex}
          targetRect={targetRect}
          onNext={goNext}
          onSkip={skipTour}
          onGoToStep={goToStep}
        />
      ) : null}
      {celebrationOpen ? (
        <HomeTourCelebration onDismiss={dismissCelebration} />
      ) : null}
    </>
  );
}
