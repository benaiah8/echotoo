import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  PEOPLE_DUO_MODE_TRANSITION_MS,
  duoModeEnterFromY,
  duoModeExitToY,
  duoModeTransitionDirection,
  prefersDuoModeMotionReduce,
  type DuoModeTransitionDirection,
  type DuoModeTransitionPhase,
  type PeoplePrimaryScope,
} from "../../lib/people/peopleDuoModeTransition";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Controlled Duo ↔ Discover ↔ Plans ↔ Groups content transition.
 * Keep Back / Connect / bottom nav outside this wrapper.
 * Children host Embla — translateY never shares a node with Embla's X.
 *
 * latest-target: rapid taps only update the destination; no animation queue.
 */
export default function PeopleDuoModeTransition({
  activeScope,
  onVisualScopeChange,
  children,
}: {
  activeScope: PeoplePrimaryScope;
  onVisualScopeChange?: (scope: PeoplePrimaryScope) => void;
  children: (visualScope: PeoplePrimaryScope) => ReactNode;
}) {
  const [visualScope, setVisualScope] = useState(activeScope);
  const [phase, setPhase] = useState<DuoModeTransitionPhase>("idle");
  const [direction, setDirection] = useState<DuoModeTransitionDirection>(0);
  const targetRef = useRef(activeScope);
  const visualRef = useRef(visualScope);
  visualRef.current = visualScope;
  const reduceMotion = prefersDuoModeMotionReduce();

  useEffect(() => {
    onVisualScopeChange?.(visualScope);
  }, [visualScope, onVisualScopeChange]);

  useEffect(() => {
    targetRef.current = activeScope;
    if (activeScope === visualRef.current) return;
    if (phase !== "idle") return;
    const dir = duoModeTransitionDirection(visualRef.current, activeScope);
    if (dir === 0) {
      setVisualScope(activeScope);
      onVisualScopeChange?.(activeScope);
      return;
    }
    setDirection(dir);
    setPhase("out");
  }, [activeScope, phase, onVisualScopeChange]);

  useEffect(() => {
    if (phase !== "out") return;
    const t = window.setTimeout(() => {
      const next = targetRef.current;
      const dir = duoModeTransitionDirection(visualRef.current, next);
      setDirection(dir === 0 ? direction : dir);
      setVisualScope(next);
      onVisualScopeChange?.(next);
      setPhase("in");
    }, PEOPLE_DUO_MODE_TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [phase, direction, onVisualScopeChange]);

  useEffect(() => {
    if (phase !== "in") return;
    const t = window.setTimeout(() => {
      if (targetRef.current !== visualRef.current) {
        const dir = duoModeTransitionDirection(
          visualRef.current,
          targetRef.current
        );
        if (dir !== 0) {
          setDirection(dir);
          setPhase("out");
          return;
        }
      }
      setPhase("idle");
    }, PEOPLE_DUO_MODE_TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const style: CSSProperties = (() => {
    const transition = reduceMotion
      ? `opacity ${PEOPLE_DUO_MODE_TRANSITION_MS}ms ${EASE}`
      : `transform ${PEOPLE_DUO_MODE_TRANSITION_MS}ms ${EASE}, opacity ${PEOPLE_DUO_MODE_TRANSITION_MS}ms ${EASE}`;

    if (phase === "out") {
      const y = duoModeExitToY(direction, reduceMotion);
      return {
        opacity: 0,
        transform: reduceMotion ? "none" : `translateY(${y}px)`,
        transition,
      };
    }
    if (phase === "in") {
      return {
        opacity: 1,
        transform: "translateY(0px)",
        transition,
      };
    }
    return {
      opacity: 1,
      transform: "translateY(0px)",
      transition: "none",
    };
  })();

  return (
    <div
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-people-primary-scope-transition="true"
      data-people-primary-visual-scope={visualScope}
      data-people-primary-target-scope={activeScope}
    >
      <div
        key={`${visualScope}:${phase === "in" ? "in" : "show"}`}
        className="flex min-h-0 w-full flex-1 flex-col will-change-transform"
        style={
          phase === "in"
            ? {
                ...style,
                ["--duo-enter-y" as string]: `${duoModeEnterFromY(
                  direction,
                  reduceMotion
                )}px`,
                animation: reduceMotion
                  ? `peopleDuoModeFadeIn ${PEOPLE_DUO_MODE_TRANSITION_MS}ms ${EASE}`
                  : `peopleDuoModeSlideIn ${PEOPLE_DUO_MODE_TRANSITION_MS}ms ${EASE}`,
              }
            : style
        }
      >
        {children(visualScope)}
      </div>
    </div>
  );
}
