import { useCallback, useEffect, useRef, useState } from "react";
import { PiHeart, PiHeartFill } from "react-icons/pi";
import { getHighScore, setHighScoreIfBetter } from "../../lib/gameHighScores";

// Swap IDs here after visual pass — spawn logic reads OWL_VARIANTS only.
import owl02 from "../../assets/avatar-presets/owls/owl_02.png";
import owl03 from "../../assets/avatar-presets/owls/owl_03.png";
import owl04 from "../../assets/avatar-presets/owls/owl_04.png";
import owl06 from "../../assets/avatar-presets/owls/owl_06.png";
import owl07 from "../../assets/avatar-presets/owls/owl_07.png";
import owl09 from "../../assets/avatar-presets/owls/owl_09.png";
import owl11 from "../../assets/avatar-presets/owls/owl_11.png";

const OWL_VARIANTS = [owl02, owl03, owl04, owl06, owl07, owl09, owl11];

/** Single edit surface for gameplay + feedback tuning. */
const WHACK_CONFIG = {
  /** 3×4 grid — smaller cells, more vertical spread than 3×3. */
  gridSize: 12,
  startLives: 3,
  hitsPerRound: 5,
  rampRounds: 6,
  startSpawnMs: 900,
  minSpawnMs: 320,
  startVisibleMs: 850,
  minVisibleMs: 380,
  missBeatMs: 400,
  hitFlashMs: 140,
  roundFlashMs: 700,
  /** Cell gap — compact; board width drives cell size. */
  gridGap: "clamp(0.25rem, 1.5vw, 0.5rem)",
} as const;

type Phase = "idle" | "playing" | "gameover";

function roundFromScore(score: number) {
  return Math.floor(score / WHACK_CONFIG.hitsPerRound) + 1;
}

export default function WhackAnOwlGame() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [activeOwl, setActiveOwl] = useState(OWL_VARIANTS[0]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState<number>(WHACK_CONFIG.startLives);
  const [best, setBest] = useState(() => getHighScore("whackAnOwl"));
  const [hitFlashCell, setHitFlashCell] = useState<number | null>(null);
  const [missFlashCell, setMissFlashCell] = useState<number | null>(null);
  const [roundFlashActive, setRoundFlashActive] = useState(false);
  const [roundTransitioning, setRoundTransitioning] = useState(false);

  const spawnTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const hitFlashTimer = useRef<number | null>(null);
  const missFlashTimer = useRef<number | null>(null);
  const roundFlashTimer = useRef<number | null>(null);
  const missBeatTimer = useRef<number | null>(null);

  const livesRef = useRef(WHACK_CONFIG.startLives);
  const scoreRef = useRef(0);
  const activeCellRef = useRef<number | null>(null);
  const lastCellRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const roundTransitioningRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    roundTransitioningRef.current = roundTransitioning;
  }, [roundTransitioning]);

  const clearFlashTimers = useCallback(() => {
    if (hitFlashTimer.current) clearTimeout(hitFlashTimer.current);
    if (missFlashTimer.current) clearTimeout(missFlashTimer.current);
    if (roundFlashTimer.current) clearTimeout(roundFlashTimer.current);
    if (missBeatTimer.current) clearTimeout(missBeatTimer.current);
    hitFlashTimer.current = null;
    missFlashTimer.current = null;
    roundFlashTimer.current = null;
    missBeatTimer.current = null;
  }, []);

  const clearAll = useCallback(() => {
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    spawnTimer.current = null;
    hideTimer.current = null;
    clearFlashTimers();
  }, [clearFlashTimers]);

  useEffect(() => () => clearAll(), [clearAll]);

  const triggerRoundFlash = useCallback(() => {
    if (roundFlashTimer.current) clearTimeout(roundFlashTimer.current);
    setRoundFlashActive(true);
    roundFlashTimer.current = window.setTimeout(() => {
      setRoundFlashActive(false);
      roundFlashTimer.current = null;
    }, WHACK_CONFIG.roundFlashMs);
  }, []);

  const endGame = useCallback(() => {
    clearAll();
    activeCellRef.current = null;
    lastCellRef.current = null;
    roundTransitioningRef.current = false;
    phaseRef.current = "gameover";
    setActiveCell(null);
    setHitFlashCell(null);
    setMissFlashCell(null);
    setRoundFlashActive(false);
    setRoundTransitioning(false);
    setPhase("gameover");
    if (setHighScoreIfBetter("whackAnOwl", scoreRef.current)) {
      setBest(scoreRef.current);
    }
  }, [clearAll]);

  const scheduleSpawn = useCallback(() => {
    if (phaseRef.current !== "playing" || roundTransitioningRef.current) {
      return;
    }

    const currentRound = Math.floor(
      scoreRef.current / WHACK_CONFIG.hitsPerRound,
    );
    const progress = Math.min(currentRound / WHACK_CONFIG.rampRounds, 1);
    const spawnDelay =
      WHACK_CONFIG.startSpawnMs -
      (WHACK_CONFIG.startSpawnMs - WHACK_CONFIG.minSpawnMs) * progress;
    const visibleFor =
      WHACK_CONFIG.startVisibleMs -
      (WHACK_CONFIG.startVisibleMs - WHACK_CONFIG.minVisibleMs) * progress;

    spawnTimer.current = window.setTimeout(() => {
      if (phaseRef.current !== "playing" || roundTransitioningRef.current) {
        return;
      }

      let cell = Math.floor(Math.random() * WHACK_CONFIG.gridSize);
      if (lastCellRef.current != null && WHACK_CONFIG.gridSize > 1) {
        while (cell === lastCellRef.current) {
          cell = Math.floor(Math.random() * WHACK_CONFIG.gridSize);
        }
      }
      lastCellRef.current = cell;

      const owl = OWL_VARIANTS[Math.floor(Math.random() * OWL_VARIANTS.length)];
      activeCellRef.current = cell;
      setActiveCell(cell);
      setActiveOwl(owl);

      hideTimer.current = window.setTimeout(() => {
        if (activeCellRef.current !== cell) {
          scheduleSpawn();
          return;
        }

        activeCellRef.current = null;
        setActiveCell(null);

        setMissFlashCell(cell);
        if (missFlashTimer.current) clearTimeout(missFlashTimer.current);
        missFlashTimer.current = window.setTimeout(() => {
          setMissFlashCell(null);
          missFlashTimer.current = null;
        }, WHACK_CONFIG.missBeatMs);

        livesRef.current -= 1;
        setLives(livesRef.current);

        if (livesRef.current <= 0) {
          endGame();
          return;
        }

        missBeatTimer.current = window.setTimeout(() => {
          missBeatTimer.current = null;
          scheduleSpawn();
        }, WHACK_CONFIG.missBeatMs);
      }, visibleFor);
    }, spawnDelay);
  }, [endGame]);

  const startNextRound = useCallback(() => {
    if (!roundTransitioningRef.current) return;
    roundTransitioningRef.current = false;
    setRoundTransitioning(false);
    setRoundFlashActive(false);
    if (roundFlashTimer.current) {
      clearTimeout(roundFlashTimer.current);
      roundFlashTimer.current = null;
    }
    scheduleSpawn();
  }, [scheduleSpawn]);

  const startGame = useCallback(() => {
    clearAll();
    scoreRef.current = 0;
    livesRef.current = WHACK_CONFIG.startLives;
    activeCellRef.current = null;
    lastCellRef.current = null;
    roundTransitioningRef.current = false;
    phaseRef.current = "playing";
    setScore(0);
    setLives(WHACK_CONFIG.startLives);
    setActiveCell(null);
    setHitFlashCell(null);
    setMissFlashCell(null);
    setRoundFlashActive(false);
    setRoundTransitioning(false);
    setPhase("playing");
    scheduleSpawn();
  }, [clearAll, scheduleSpawn]);

  const handleHit = (cell: number) => {
    if (
      phaseRef.current !== "playing" ||
      roundTransitioningRef.current ||
      activeCellRef.current !== cell
    ) {
      return;
    }

    activeCellRef.current = null;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setActiveCell(null);

    setHitFlashCell(cell);
    if (hitFlashTimer.current) clearTimeout(hitFlashTimer.current);
    hitFlashTimer.current = window.setTimeout(() => {
      setHitFlashCell(null);
      hitFlashTimer.current = null;
    }, WHACK_CONFIG.hitFlashMs);

    scoreRef.current += 1;
    const newScore = scoreRef.current;
    setScore(newScore);

    if (newScore > 0 && newScore % WHACK_CONFIG.hitsPerRound === 0) {
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
      spawnTimer.current = null;
      triggerRoundFlash();
      roundTransitioningRef.current = true;
      setRoundTransitioning(true);
      return;
    }

    scheduleSpawn();
  };

  const round = phase === "idle" ? 1 : roundFromScore(score);
  const counterValue = phase === "playing" ? score : "–";

  const gridStateClass = roundTransitioning
    ? "opacity-70 scale-95"
    : phase === "idle"
    ? "opacity-40 scale-100"
    : phase === "gameover"
    ? "opacity-70 scale-100"
    : "opacity-100 scale-100";

  const pillClass = roundFlashActive
    ? "animate-pulse border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_14%,var(--surface))]"
    : roundTransitioning
    ? "border-[color-mix(in_oklab,var(--brand)_52%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_8%,var(--surface))]"
    : "border-[var(--border)] bg-[var(--surface)]/55";

  /** Width-first board; 4 rows — height cap only on genuinely short viewports. */
  const boardWidthClass =
    "w-[min(86vw,22.5rem,calc(58vh*0.75))] max-w-full";

  return (
    <div className="flex h-full min-h-0 flex-col items-center px-3 py-1">
      <div className={`flex shrink-0 flex-col items-center gap-1 ${boardWidthClass}`}>
        <div
          className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1.5 rounded-full border px-4 py-1.5 text-[var(--text)] shadow-sm transition-[background-color,border-color,opacity] ${pillClass}`}
          aria-live="polite"
        >
          <span className="justify-self-start text-sm font-medium opacity-85">
            Round: {round}
          </span>
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--text)_12%,var(--surface))] text-sm font-semibold tabular-nums text-[var(--text)]"
            aria-label={phase === "playing" ? `Score ${score}` : "Score"}
          >
            {counterValue}
          </span>
          <span className="justify-self-end text-sm font-semibold opacity-90">
            Best: {best}
          </span>
        </div>

        <div
          className="flex items-center gap-2"
          aria-label={`${lives} lives remaining`}
        >
          {Array.from({ length: WHACK_CONFIG.startLives }).map((_, i) =>
            i < lives ? (
              <PiHeartFill
                key={i}
                size={22}
                className="text-[var(--brand-readable)]"
                aria-hidden
              />
            ) : (
              <PiHeart
                key={i}
                size={22}
                className="text-[var(--text)] opacity-30"
                aria-hidden
              />
            ),
          )}
        </div>

        {phase === "idle" && (
          <p className="text-center text-xs leading-snug text-[var(--text)] opacity-70">
            Tap the owl before it disappears. Miss {WHACK_CONFIG.startLives} and
            it's over.
          </p>
        )}
      </div>

      <div className="flex min-h-0 w-full flex-1 items-center justify-center py-0.5">
        <div
          className={`grid ${boardWidthClass} grid-cols-3 transition-all duration-300 ease-out ${gridStateClass}`}
          style={{ gap: WHACK_CONFIG.gridGap }}
        >
          {Array.from({ length: WHACK_CONFIG.gridSize }).map((_, i) => {
            const isActive = activeCell === i;
            const isHitFlash = hitFlashCell === i;
            const isMissFlash = missFlashCell === i;
            return (
              <button
                key={i}
                type="button"
                disabled={phase !== "playing" || roundTransitioning}
                onClick={() => handleHit(i)}
                aria-label={`Cell ${i + 1}`}
                className={`flex aspect-square w-full items-center justify-center rounded-xl border transition-all duration-150 ${
                  isHitFlash
                    ? "scale-90 border-[var(--brand)] bg-[var(--brand)]"
                    : isMissFlash
                      ? "border-red-400/60 bg-red-500/15"
                      : "border-[var(--border)] bg-[var(--surface)]/60"
                }`}
              >
                {isActive && (
                  <img
                    src={activeOwl}
                    alt=""
                    className="w-[58%] max-w-10 animate-[pop_120ms_ease-out] object-contain"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 min-h-[44px] items-center justify-center pt-1.5">
        {phase === "idle" && (
          <button
            type="button"
            onClick={startGame}
            className="rounded-full bg-[var(--brand)] px-6 py-2 text-sm font-semibold text-[var(--brand-ink)]"
          >
            Start
          </button>
        )}

        {phase === "playing" && (
          <div className="flex items-center gap-3">
            {roundTransitioning && (
              <button
                type="button"
                onClick={startNextRound}
                className="rounded-full bg-[var(--brand)] px-9 py-3 text-base font-bold tracking-wide text-[var(--brand-ink)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_45%,transparent)] transition active:scale-[0.97]"
              >
                Next
              </button>
            )}
            <button
              type="button"
              onClick={startGame}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-5 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)] active:scale-[0.98]"
            >
              Restart
            </button>
          </div>
        )}

        {phase === "gameover" && (
          <div className="flex flex-row items-center gap-3">
            <span className="text-sm text-[var(--text)]">
              Game over — {score}
            </span>
            <button
              type="button"
              onClick={startGame}
              className="rounded-full bg-[var(--brand)] px-6 py-2 text-sm font-semibold text-[var(--brand-ink)]"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
