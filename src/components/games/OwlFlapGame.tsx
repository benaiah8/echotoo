import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getHighScore, setHighScoreIfBetter } from "../../lib/gameHighScores";

import owl09 from "../../assets/avatar-presets/owls/owl_09.png";
import owl11 from "../../assets/avatar-presets/owls/owl_11.png";
import owl14 from "../../assets/avatar-presets/owls/owl_14.png";
import owl16 from "../../assets/avatar-presets/owls/owl_16.png";

const OWL_STAGES = [owl09, owl11, owl14, owl16];

/** Single edit surface for gameplay + feedback tuning. */
const FLAP_CONFIG = {
  /** Owl sprite + pipe pattern advance every N points passed. */
  levelUpScore: 10,
  gravity: 0.35,
  flapImpulse: -6.2,
  owlSize: 42,
  owlX: 70,
  pipeWidth: 46,
  stageRippleMs: 640,
  /** Difficulty ramps from score 0 → difficultyRampScore. */
  difficultyRampScore: 28,
  gapHeightStart: 198,
  gapHeightMin: 148,
  scrollSpeedStart: 2.0,
  scrollSpeedMax: 2.9,
  pipeSpacingStart: 290,
  pipeSpacingMin: 235,
  /** Max vertical shift between consecutive gap centers (px). */
  maxGapCenterDeltaStart: 72,
  maxGapCenterDeltaMax: 108,
  edgeMarginStart: 36,
  edgeMarginMax: 52,
  owlClearance: 16,
} as const;

type Phase = "idle" | "playing" | "gameover";

type PipePattern = "solid" | "horizontal" | "diagonal" | "cross";

interface Pipe {
  id: number;
  x: number;
  gapY: number;
  gapHeight: number;
  pattern: PipePattern;
  passed: boolean;
}

function visualStageIndex(score: number) {
  const tier = Math.floor(score / FLAP_CONFIG.levelUpScore);
  return tier % OWL_STAGES.length;
}

/** Display stage — keeps counting (1, 2, … 11, 12) while visuals rotate. */
function stageNumberFromScore(score: number) {
  return Math.max(1, Math.floor(score / FLAP_CONFIG.levelUpScore) + 1);
}

function difficultyProgress(score: number) {
  return Math.min(score / FLAP_CONFIG.difficultyRampScore, 1);
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function getDifficulty(score: number) {
  const t = difficultyProgress(score);
  return {
    gapHeight: lerp(
      FLAP_CONFIG.gapHeightStart,
      FLAP_CONFIG.gapHeightMin,
      t,
    ),
    scrollSpeed: lerp(
      FLAP_CONFIG.scrollSpeedStart,
      FLAP_CONFIG.scrollSpeedMax,
      t,
    ),
    pipeSpacing: lerp(
      FLAP_CONFIG.pipeSpacingStart,
      FLAP_CONFIG.pipeSpacingMin,
      t,
    ),
    maxGapCenterDelta: lerp(
      FLAP_CONFIG.maxGapCenterDeltaStart,
      FLAP_CONFIG.maxGapCenterDeltaMax,
      t,
    ),
    edgeMargin: lerp(
      FLAP_CONFIG.edgeMarginStart,
      FLAP_CONFIG.edgeMarginMax,
      t,
    ),
  };
}

function patternForScore(score: number): PipePattern {
  const stage = visualStageIndex(score);
  const patterns: PipePattern[] = ["solid", "horizontal", "diagonal", "cross"];
  return patterns[stage] ?? "solid";
}

function pipeFillStyle(pattern: PipePattern): CSSProperties {
  const line = "color-mix(in oklab, var(--text) 28%, transparent)";
  const base = "var(--brand)";
  switch (pattern) {
    case "horizontal":
      return {
        backgroundColor: base,
        backgroundImage: `repeating-linear-gradient(180deg, ${line} 0px, ${line} 3px, transparent 3px, transparent 14px)`,
      };
    case "diagonal":
      return {
        backgroundColor: base,
        backgroundImage: `repeating-linear-gradient(135deg, ${line} 0px, ${line} 3px, transparent 3px, transparent 12px)`,
      };
    case "cross":
      return {
        backgroundColor: base,
        backgroundImage: [
          `repeating-linear-gradient(0deg, ${line} 0px, ${line} 2px, transparent 2px, transparent 10px)`,
          `repeating-linear-gradient(90deg, ${line} 0px, ${line} 2px, transparent 2px, transparent 10px)`,
        ].join(", "),
      };
    default:
      return { backgroundColor: base };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function OwlFlapGame({
  onPhaseChange,
}: {
  onPhaseChange?: (isPlaying: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 480 });
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getHighScore("owlFlap"));
  const [stageRipples, setStageRipples] = useState<
    { id: number; cx: number; cy: number }[]
  >([]);
  const [, forceRender] = useState(0);

  const sizeRef = useRef(size);
  const owlY = useRef(size.h / 2);
  const velocity = useRef(0);
  const rotation = useRef(0);
  const pipes = useRef<Pipe[]>([]);
  const rafId = useRef<number | null>(null);
  const scoreRef = useRef(0);
  const pipeIdRef = useRef(0);
  const stepRef = useRef<() => void>(() => {});
  const rippleIdRef = useRef(0);
  const lastGapCenterRef = useRef<number | null>(null);

  useEffect(() => {
    onPhaseChange?.(phase === "playing");
  }, [phase, onPhaseChange]);

  useEffect(() => {
    return () => onPhaseChange?.(false);
  }, [onPhaseChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      sizeRef.current = next;
      setSize(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const spawnStageRippleAt = useCallback((cx: number, cy: number) => {
    const id = ++rippleIdRef.current;
    setStageRipples((prev) => [...prev, { id, cx, cy }]);
    window.setTimeout(() => {
      setStageRipples((prev) => prev.filter((r) => r.id !== id));
    }, FLAP_CONFIG.stageRippleMs);
  }, []);

  const triggerStageRipple = useCallback(() => {
    const { owlSize, owlX } = FLAP_CONFIG;
    const cx = owlX + owlSize / 2;
    const cy = owlY.current + owlSize / 2;
    spawnStageRippleAt(cx, cy);
    window.setTimeout(() => spawnStageRippleAt(cx, cy), 110);
  }, [spawnStageRippleAt]);

  const stopLoop = () => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };

  const spawnPipe = useCallback((w: number, h: number, score: number) => {
    const diff = getDifficulty(score);
    const minGapHeight =
      FLAP_CONFIG.owlSize + FLAP_CONFIG.owlClearance * 2;
    const gapHeight = Math.max(minGapHeight, diff.gapHeight);

    const minCenter = diff.edgeMargin + gapHeight / 2;
    const maxCenter = h - diff.edgeMargin - gapHeight / 2;

    let gapCenter: number;
    if (lastGapCenterRef.current == null) {
      gapCenter = h / 2;
    } else {
      const delta = (Math.random() * 2 - 1) * diff.maxGapCenterDelta;
      gapCenter = clamp(
        lastGapCenterRef.current + delta,
        minCenter,
        maxCenter,
      );
    }

    lastGapCenterRef.current = gapCenter;
    const gapY = gapCenter - gapHeight / 2;

    pipes.current.push({
      id: ++pipeIdRef.current,
      x: w + 20,
      gapY,
      gapHeight,
      pattern: patternForScore(score),
      passed: false,
    });
  }, []);

  const endGame = useCallback((finalScore: number) => {
    stopLoop();
    setScore(finalScore);
    setPhase("gameover");
    if (setHighScoreIfBetter("owlFlap", finalScore)) setBest(finalScore);
  }, []);

  const step = useCallback(() => {
    const { w, h } = sizeRef.current;
    const { gravity, owlSize, owlX, pipeWidth } = FLAP_CONFIG;
    const diff = getDifficulty(scoreRef.current);

    velocity.current += gravity;
    owlY.current += velocity.current;
    rotation.current = Math.max(-25, Math.min(70, velocity.current * 4));

    if (owlY.current <= 0 || owlY.current + owlSize >= h) {
      endGame(scoreRef.current);
      return;
    }

    let hit = false;
    let gained = 0;

    for (const pipe of pipes.current) {
      pipe.x -= diff.scrollSpeed;
      const withinX =
        owlX + owlSize > pipe.x && owlX < pipe.x + pipeWidth;
      const withinGap =
        owlY.current >= pipe.gapY + 2 &&
        owlY.current + owlSize <= pipe.gapY + pipe.gapHeight - 2;
      if (withinX && !withinGap) hit = true;
      if (!pipe.passed && pipe.x + pipeWidth < owlX) {
        pipe.passed = true;
        gained += 1;
      }
    }

    if (gained) {
      scoreRef.current += gained;
      const newScore = scoreRef.current;
      setScore(newScore);
      if (newScore > 0 && newScore % FLAP_CONFIG.levelUpScore === 0) {
        triggerStageRipple();
      }
    }

    if (hit) {
      endGame(scoreRef.current);
      return;
    }

    pipes.current = pipes.current.filter((p) => p.x + pipeWidth > -20);
    const last = pipes.current[pipes.current.length - 1];
    if (!last || w - last.x >= diff.pipeSpacing) {
      spawnPipe(w, h, scoreRef.current);
    }

    forceRender((n) => n + 1);
    rafId.current = requestAnimationFrame(() => stepRef.current());
  }, [endGame, spawnPipe, triggerStageRipple]);

  stepRef.current = step;

  const startGame = () => {
    stopLoop();
    setStageRipples([]);
    const el = containerRef.current;
    const w = el?.clientWidth || sizeRef.current.w;
    const h = el?.clientHeight || sizeRef.current.h;
    const { owlSize } = FLAP_CONFIG;
    if (h < owlSize + 8) return;
    sizeRef.current = { w, h };
    setSize({ w, h });
    owlY.current = h / 2 - owlSize / 2;
    velocity.current = 0;
    rotation.current = 0;
    pipeIdRef.current = 0;
    lastGapCenterRef.current = h / 2;

    const startDiff = getDifficulty(0);
    const startGapHeight = Math.max(
      FLAP_CONFIG.owlSize + FLAP_CONFIG.owlClearance * 2,
      startDiff.gapHeight,
    );

    pipes.current = [
      {
        id: ++pipeIdRef.current,
        x: w + 160,
        gapY: h / 2 - startGapHeight / 2,
        gapHeight: startGapHeight,
        pattern: "solid",
        passed: false,
      },
    ];
    scoreRef.current = 0;
    setScore(0);
    setPhase("playing");
    rafId.current = requestAnimationFrame(() => stepRef.current());
  };

  const flap = () => {
    if (phase === "idle" || phase === "gameover") {
      startGame();
      return;
    }
    velocity.current = FLAP_CONFIG.flapImpulse;
  };

  useEffect(
    () => () => {
      stopLoop();
    },
    [],
  );

  const stageIndex = visualStageIndex(score);
  const stage = stageNumberFromScore(score);
  const owlImg = OWL_STAGES[stageIndex];
  const pillScore =
    phase === "idle" ? "–" : score;

  const pillClass = "border-[var(--border)] bg-[var(--surface)]/55";

  const { owlSize, owlX, pipeWidth } = FLAP_CONFIG;

  const centerOverlayClass =
    "absolute inset-0 flex flex-col items-center justify-center gap-3 pt-14 text-[var(--text)]";

  return (
    <div
      ref={containerRef}
      onPointerDown={flap}
      className="relative h-full w-full touch-none select-none overflow-hidden"
    >
      <div className="pointer-events-none absolute left-0 right-0 top-2 z-10 flex justify-center px-3">
        <div
          className={`grid w-[270px] max-w-[calc(100vw-2rem)] grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-full border px-5 py-2 text-[var(--text)] shadow-sm transition-[background-color,border-color,opacity] ${pillClass}`}
          aria-live="polite"
        >
          <span className="justify-self-start text-sm font-medium opacity-85">
            Stage: {stage}
          </span>
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--text)_12%,var(--surface))] text-base font-semibold tabular-nums text-[var(--text)]"
            aria-label={`Score ${pillScore}`}
          >
            {pillScore}
          </span>
          <span className="justify-self-end text-base font-semibold opacity-90">
            Best: {best}
          </span>
        </div>
      </div>

      {phase === "playing" &&
        pipes.current.map((pipe) => {
          const fill = pipeFillStyle(pipe.pattern);
          return (
            <div key={pipe.id}>
              <div
                className="absolute rounded-b-md"
                style={{
                  left: pipe.x,
                  top: 0,
                  width: pipeWidth,
                  height: pipe.gapY,
                  ...fill,
                }}
              />
              <div
                className="absolute rounded-t-md"
                style={{
                  left: pipe.x,
                  top: pipe.gapY + pipe.gapHeight,
                  width: pipeWidth,
                  height: size.h - (pipe.gapY + pipe.gapHeight),
                  ...fill,
                }}
              />
            </div>
          );
        })}

      {stageRipples.map((ripple) => (
        <span
          key={ripple.id}
          className="owl-flap-stage-ripple pointer-events-none absolute z-[6] rounded-full"
          style={{
            left: ripple.cx,
            top: ripple.cy,
            width: owlSize,
            height: owlSize,
          }}
        />
      ))}

      {phase === "playing" && (
        <img
          src={owlImg}
          alt=""
          width={owlSize}
          height={owlSize}
          draggable={false}
          className="pointer-events-none relative z-[7] select-none object-contain"
          style={{
            position: "absolute",
            left: owlX,
            top: owlY.current,
            width: owlSize,
            height: owlSize,
            transform: `rotate(${rotation.current}deg)`,
          }}
        />
      )}

      {phase === "idle" && (
        <div className={centerOverlayClass}>
          <img
            src={owlImg}
            alt=""
            width={56}
            height={56}
            draggable={false}
            className="object-contain"
          />
          <span className="text-sm font-medium">Tap to start</span>
          <p className="max-w-xs px-4 text-center text-sm opacity-70">
            Tap to flap. Don&apos;t hit the pipes.
          </p>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              startGame();
            }}
            className="pointer-events-auto rounded-full bg-[var(--brand)] px-6 py-2 text-sm font-semibold text-[var(--brand-ink)]"
          >
            Start
          </button>
        </div>
      )}

      {phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              startGame();
            }}
            className="pointer-events-auto rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-5 py-2 text-sm font-medium text-[var(--text)] shadow-sm transition hover:bg-[var(--surface)] active:scale-[0.98]"
          >
            Restart
          </button>
        </div>
      )}

      {phase === "gameover" && (
        <div className={centerOverlayClass}>
          <img
            src={owlImg}
            alt=""
            width={56}
            height={56}
            draggable={false}
            className="object-contain opacity-90"
          />
          <span className="text-2xl font-bold tracking-tight">Game over</span>
          <span className="text-lg font-semibold tabular-nums opacity-90">
            Score {score}
          </span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              startGame();
            }}
            className="pointer-events-auto mt-1 rounded-full bg-[var(--brand)] px-8 py-2.5 text-base font-bold text-[var(--brand-ink)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_40%,transparent)]"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
