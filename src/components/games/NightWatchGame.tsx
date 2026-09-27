import { useCallback, useEffect, useRef, useState } from "react";
import {
  PiMoon,
  PiMoonStars,
  PiStar,
  PiSparkle,
  PiCloudMoon,
  PiCloud,
  PiEye,
  PiCircleDashed,
  PiStarFour,
} from "react-icons/pi";
import { getHighScore, setHighScoreIfBetter } from "../../lib/gameHighScores";

const TILES = [
  { id: 0, icon: <PiMoon size={34} /> },
  { id: 1, icon: <PiMoonStars size={34} /> },
  { id: 2, icon: <PiStar size={34} /> },
  { id: 3, icon: <PiSparkle size={34} /> },
  { id: 4, icon: <PiCloudMoon size={34} /> },
  { id: 5, icon: <PiCloud size={34} /> },
  { id: 6, icon: <PiEye size={34} /> },
  { id: 7, icon: <PiCircleDashed size={34} /> },
  { id: 8, icon: <PiStarFour size={34} /> },
] as const;

const SHOW_MS = 450;
const GAP_MS = 200;
const START_DELAY_MS = 500;
const TAP_FLASH_MS = 140;
const LEVEL_FLASH_MS = 700;
const INPUT_LIMIT_MS = 30000;
const TICK_MS = 100;
/** Manual Next pause every N levels (before level 5, 10, 15, …). */
const BREAK_EVERY_LEVELS = 5;

type Phase = "idle" | "showing" | "input" | "gameover";

export default function NightWatchGame() {
  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const [tappedTile, setTappedTile] = useState<number | null>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [best, setBest] = useState(() => getHighScore("nightWatch"));
  const [roundTransitioning, setRoundTransitioning] = useState(false);
  const [awaitingManualNext, setAwaitingManualNext] = useState(false);
  const [levelFlashActive, setLevelFlashActive] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  const timers = useRef<number[]>([]);
  const flashTimer = useRef<number | null>(null);
  const levelFlashTimer = useRef<number | null>(null);
  const pendingSequence = useRef<number[] | null>(null);
  const inputInterval = useRef<number | null>(null);
  const inputDeadline = useRef(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const clearInputInterval = useCallback(() => {
    if (inputInterval.current != null) {
      clearInterval(inputInterval.current);
      inputInterval.current = null;
    }
  }, []);

  const clearLevelFlash = useCallback(() => {
    if (levelFlashTimer.current != null) {
      clearTimeout(levelFlashTimer.current);
      levelFlashTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      clearInputInterval();
      clearLevelFlash();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [clearInputInterval, clearLevelFlash, clearTimers]);

  const endGame = useCallback(
    (finalScore: number) => {
      clearTimers();
      clearInputInterval();
      clearLevelFlash();
      pendingSequence.current = null;
      setActiveTile(null);
      setRoundTransitioning(false);
      setAwaitingManualNext(false);
      setLevelFlashActive(false);
      setPhase("gameover");
      if (setHighScoreIfBetter("nightWatch", finalScore)) {
        setBest(finalScore);
      }
    },
    [clearInputInterval, clearLevelFlash, clearTimers],
  );

  const playSequence = useCallback((seq: number[]) => {
    clearTimers();
    clearInputInterval();
    clearLevelFlash();
    pendingSequence.current = null;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = null;
    setActiveTile(null);
    setTappedTile(null);
    setRoundTransitioning(false);
    setAwaitingManualNext(false);
    setLevelFlashActive(false);
    setRemainingMs(0);
    setPhase("showing");
    setInputIndex(0);
    seq.forEach((tile, i) => {
      const t = START_DELAY_MS + i * (SHOW_MS + GAP_MS);
      timers.current.push(
        window.setTimeout(() => setActiveTile(tile), t),
        window.setTimeout(() => setActiveTile(null), t + SHOW_MS),
      );
    });
    timers.current.push(
      window.setTimeout(
        () => setPhase("input"),
        START_DELAY_MS + seq.length * (SHOW_MS + GAP_MS),
      ),
    );
  }, [clearInputInterval, clearLevelFlash, clearTimers]);

  useEffect(() => {
    if (phase !== "input" || roundTransitioning) return;
    const limit = INPUT_LIMIT_MS;
    inputDeadline.current = Date.now() + limit;
    setRemainingMs(limit);
    inputInterval.current = window.setInterval(() => {
      const left = inputDeadline.current - Date.now();
      if (left <= 0) {
        clearInputInterval();
        endGame(Math.max(sequence.length - 1, 0));
        return;
      }
      setRemainingMs(left);
    }, TICK_MS);
    return clearInputInterval;
  }, [
    clearInputInterval,
    endGame,
    phase,
    roundTransitioning,
    sequence.length,
  ]);

  const startGame = useCallback(() => {
    clearTimers();
    clearInputInterval();
    clearLevelFlash();
    pendingSequence.current = null;
    setRoundTransitioning(false);
    setAwaitingManualNext(false);
    setLevelFlashActive(false);
    setRemainingMs(0);
    const first = [Math.floor(Math.random() * TILES.length)];
    setSequence(first);
    playSequence(first);
  }, [
    clearInputInterval,
    clearLevelFlash,
    clearTimers,
    playSequence,
  ]);

  const handleTap = (tileId: number) => {
    if (phase !== "input" || roundTransitioning) return;

    setTappedTile(tileId);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(
      () => setTappedTile(null),
      TAP_FLASH_MS,
    );

    if (tileId !== sequence[inputIndex]) {
      endGame(Math.max(sequence.length - 1, 0));
      return;
    }
    if (inputIndex + 1 === sequence.length) {
      clearInputInterval();
      const next = [...sequence, Math.floor(Math.random() * TILES.length)];
      const upcomingLevel = next.length;
      const needsManualBreak =
        upcomingLevel % BREAK_EVERY_LEVELS === 0;

      pendingSequence.current = next;
      setRoundTransitioning(true);
      setAwaitingManualNext(needsManualBreak);
      setLevelFlashActive(true);
      setRemainingMs(0);
      clearLevelFlash();
      levelFlashTimer.current = window.setTimeout(() => {
        levelFlashTimer.current = null;
        setLevelFlashActive(false);
      }, LEVEL_FLASH_MS);

      if (!needsManualBreak) {
        timers.current.push(
          window.setTimeout(() => {
            if (pendingSequence.current == null) return;
            const seq = pendingSequence.current;
            pendingSequence.current = null;
            setAwaitingManualNext(false);
            setSequence(seq);
            playSequence(seq);
          }, LEVEL_FLASH_MS),
        );
      }
    } else {
      setInputIndex(inputIndex + 1);
    }
  };

  const startNextLevel = () => {
    if (!roundTransitioning || pendingSequence.current == null) return;
    const next = pendingSequence.current;
    pendingSequence.current = null;
    setAwaitingManualNext(false);
    setSequence(next);
    playSequence(next);
  };

  const level = Math.max(1, sequence.length + (roundTransitioning ? 1 : 0));
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  const counterValue =
    phase === "input" && !roundTransitioning
      ? secondsLeft
      : phase === "idle"
        ? INPUT_LIMIT_MS / 1000
        : 0;
  const gridStateClass =
    roundTransitioning
      ? "opacity-70 scale-95"
      : phase === "idle"
      ? "opacity-40 scale-100"
      : phase === "showing"
        ? "opacity-70 scale-95"
        : "opacity-100 scale-100";

  /** Width-first board; height cap only on genuinely short viewports. */
  const boardWidthClass =
    "w-[min(86vw,22.5rem,calc(62vh*0.75))] max-w-full";

  return (
    <div className="flex h-full min-h-0 flex-col items-center px-3 py-1">
      <div className={`shrink-0 ${boardWidthClass}`}>
        <div
          className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1.5 rounded-full border px-4 py-1.5 text-[var(--text)] shadow-sm transition-[background-color,border-color,opacity] ${
            levelFlashActive
              ? "animate-pulse border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_14%,var(--surface))]"
              : roundTransitioning
                ? "border-[color-mix(in_oklab,var(--brand)_52%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_8%,var(--surface))]"
              : "border-[var(--border)] bg-[var(--surface)]/55"
          }`}
          aria-live="polite"
        >
          <span className="justify-self-start text-sm font-medium opacity-85">
            Level: {level}
          </span>
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--text)_12%,var(--surface))] text-sm font-semibold tabular-nums text-[var(--text)]"
            aria-label={`${counterValue} seconds remaining`}
          >
            {counterValue}
          </span>
          <span className="justify-self-end text-sm font-semibold opacity-90">
            Best: {best}
          </span>
        </div>

        {phase === "idle" && (
          <p className="mt-1 text-center text-xs leading-snug text-[var(--text)] opacity-70">
            Watch the pattern, then repeat it.
          </p>
        )}
      </div>

      <div className="flex min-h-0 w-full flex-1 items-center justify-center py-0.5">
        <div
          className={`grid ${boardWidthClass} grid-cols-3 gap-[clamp(0.375rem,2vw,0.625rem)] transition-all duration-300 ease-out ${gridStateClass}`}
        >
          {TILES.map((tile) => {
            const isActive = activeTile === tile.id;
            const isTapped = tappedTile === tile.id;
            return (
              <button
                key={tile.id}
                type="button"
                disabled={
                  phase === "idle" ||
                  phase === "showing" ||
                  phase === "gameover" ||
                  roundTransitioning
                }
                onClick={() => handleTap(tile.id)}
                aria-label={`Tile ${tile.id + 1}`}
                className={`flex aspect-square w-full items-center justify-center rounded-2xl border transition-all duration-150 [&_svg]:!size-[clamp(1.25rem,7.5vw,2.125rem)] ${
                  isActive || isTapped
                    ? "scale-90 border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]"
                    : "border-[var(--border)] bg-[var(--surface)]/60 text-[var(--text)]"
                }`}
              >
                {tile.icon}
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

        {phase !== "idle" && phase !== "gameover" && (
          <div className="flex items-center gap-3">
            {roundTransitioning && awaitingManualNext && (
              <button
                type="button"
                onClick={startNextLevel}
                className="rounded-full bg-[var(--brand)] px-7 py-2 text-sm font-semibold text-[var(--brand-ink)]"
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
            <span className="text-sm text-[var(--text)]">Game over</span>
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
