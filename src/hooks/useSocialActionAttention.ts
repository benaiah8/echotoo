import { useEffect, useRef, type RefObject } from "react";
import {
  SOCIAL_ATTENTION_DWELL_MS,
  SOCIAL_ATTENTION_GAP_MS,
  SOCIAL_ATTENTION_PRESS_MS,
  SOCIAL_ATTENTION_VISIBLE_RATIO,
  applySocialPillVisualCue,
  canAutoCueSocialSource,
  clearAllSocialAttentionClasses,
  clearSocialPillVisualCue,
  hasSocialSourceNoticedThisSession,
  isBlockingOverlayOpen,
  isTypingTarget,
  markSocialSourceNoticedThisSession,
  prefersReducedMotion,
  recordSocialAutoCuePlayed,
} from "../lib/social/socialActionAttention";

/**
 * Visual-only Duo→Group press+ripple after ~10s continuous visible dwell.
 * Once per source / session + global cooldown. Never calls onPress.
 */
export function useSocialActionAttention(opts: {
  enabled: boolean;
  sourceId: string;
  clusterRef: RefObject<HTMLElement | null>;
}) {
  const { enabled, sourceId, clusterRef } = opts;
  const scrollingRef = useRef(false);
  const pointerDownRef = useRef(false);
  const visibleRef = useRef(false);
  const dwellStartRef = useRef<number | null>(null);
  const dwellTimerRef = useRef<number | null>(null);
  const seqTimersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled || !sourceId) return;
    if (prefersReducedMotion()) return;
    if (hasSocialSourceNoticedThisSession(sourceId)) return;

    const root = clusterRef.current;
    if (!root) return;

    const clearDwell = () => {
      dwellStartRef.current = null;
      if (dwellTimerRef.current != null) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    };

    const clearSeq = () => {
      for (const t of seqTimersRef.current) window.clearTimeout(t);
      seqTimersRef.current = [];
      clearAllSocialAttentionClasses(root);
    };

    const guardsOk = () => {
      if (hasSocialSourceNoticedThisSession(sourceId)) return false;
      if (!canAutoCueSocialSource(sourceId)) return false;
      if (prefersReducedMotion()) return false;
      if (document.visibilityState === "hidden") return false;
      if (scrollingRef.current) return false;
      if (pointerDownRef.current) return false;
      if (isBlockingOverlayOpen()) return false;
      if (isTypingTarget(document.activeElement)) return false;
      if (root.querySelector("[data-social-skeleton]")) return false;
      if (root.querySelector("[aria-busy='true']")) return false;
      const duo = root.querySelector<HTMLElement>('[data-social-pill="duo"]');
      const group = root.querySelector<HTMLElement>(
        '[data-social-pill="group"]'
      );
      if (!duo || !group) return false;
      return true;
    };

    const play = () => {
      if (!guardsOk()) return;
      recordSocialAutoCuePlayed(sourceId);
      const duo = root.querySelector<HTMLElement>('[data-social-pill="duo"]');
      const group = root.querySelector<HTMLElement>(
        '[data-social-pill="group"]'
      );
      if (!duo || !group) return;

      applySocialPillVisualCue(duo);
      const t1 = window.setTimeout(() => {
        clearSocialPillVisualCue(duo);
      }, SOCIAL_ATTENTION_PRESS_MS);

      const t2 = window.setTimeout(() => {
        applySocialPillVisualCue(group);
        const t3 = window.setTimeout(() => {
          clearSocialPillVisualCue(group);
        }, SOCIAL_ATTENTION_PRESS_MS);
        seqTimersRef.current.push(t3);
      }, SOCIAL_ATTENTION_PRESS_MS + SOCIAL_ATTENTION_GAP_MS);

      seqTimersRef.current.push(t1, t2);
    };

    const scheduleDwell = () => {
      clearDwell();
      if (!visibleRef.current) return;
      if (!guardsOk()) return;
      dwellStartRef.current = Date.now();
      dwellTimerRef.current = window.setTimeout(() => {
        dwellTimerRef.current = null;
        if (!visibleRef.current) return;
        if (!guardsOk()) return;
        play();
      }, SOCIAL_ATTENTION_DWELL_MS);
    };

    let scrollStopTimer: number | null = null;
    const onScroll = () => {
      scrollingRef.current = true;
      clearDwell();
      clearSeq();
      if (scrollStopTimer != null) window.clearTimeout(scrollStopTimer);
      scrollStopTimer = window.setTimeout(() => {
        scrollingRef.current = false;
        if (visibleRef.current) scheduleDwell();
      }, 180);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (root.contains(e.target as Node)) {
        pointerDownRef.current = true;
        /* Real press on Duo/Group — suppress auto cue for this source. */
        const pill = (e.target as Element | null)?.closest?.(
          "[data-social-pill]"
        );
        if (pill) {
          markSocialSourceNoticedThisSession(sourceId);
          clearDwell();
          clearSeq();
        }
      }
      clearDwell();
    };
    const onPointerUp = () => {
      pointerDownRef.current = false;
      if (visibleRef.current && !hasSocialSourceNoticedThisSession(sourceId)) {
        scheduleDwell();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearDwell();
        clearSeq();
      } else if (visibleRef.current) {
        scheduleDwell();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const ok =
          entry.isIntersecting &&
          entry.intersectionRatio >= SOCIAL_ATTENTION_VISIBLE_RATIO;
        visibleRef.current = ok;
        if (ok) {
          scheduleDwell();
        } else {
          clearDwell();
          clearSeq();
        }
      },
      { threshold: [0, SOCIAL_ATTENTION_VISIBLE_RATIO, 1] }
    );
    io.observe(root);

    return () => {
      clearDwell();
      clearSeq();
      if (scrollStopTimer != null) window.clearTimeout(scrollStopTimer);
      io.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, sourceId, clusterRef]);
}
