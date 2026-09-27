import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PiMoonStars, PiHandTap, PiBirdBold } from "react-icons/pi";
import { getHighScore, type GameId } from "../../lib/gameHighScores";

const GAMES: { id: GameId; label: string; icon: ReactNode }[] = [
  { id: "nightWatch", label: "Night Watch", icon: <PiMoonStars size={48} /> },
  { id: "whackAnOwl", label: "Whack-an-Owl", icon: <PiHandTap size={48} /> },
  { id: "owlFlap", label: "Owl Flap", icon: <PiBirdBold size={48} /> },
];

export default function OwlGamesMenu({
  onSelect,
}: {
  onSelect: (id: GameId) => void;
}) {
  const [scores, setScores] = useState<Record<GameId, number> | null>(null);

  useEffect(() => {
    setScores({
      nightWatch: getHighScore("nightWatch"),
      whackAnOwl: getHighScore("whackAnOwl"),
      owlFlap: getHighScore("owlFlap"),
    });
  }, []);

  return (
    <div className="flex w-full flex-col items-center justify-center gap-8">
      {GAMES.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onSelect(g.id)}
          aria-label={`Play ${g.label}`}
          className="flex flex-col items-center gap-1.5 text-[var(--text)]"
        >
          <span className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-[color-mix(in_oklab,var(--brand-readable)_58%,var(--border))] bg-[var(--surface)] shadow-sm app-light:shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform active:scale-90">
            {g.icon}
          </span>
          <span className="text-[13px] font-medium leading-tight text-[var(--text)]">
            {g.label}
          </span>
          <span className="text-[15px] font-semibold text-[var(--brand-readable)]">
            Best: {scores ? scores[g.id] : "…"}
          </span>
        </button>
      ))}
    </div>
  );
}
