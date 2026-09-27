import React from "react";
import { PiPlus } from "react-icons/pi";
import { useCreateChooser } from "../../context/CreateChooserContext";
import { getOwlLogoPath } from "../../lib/assets";

export type HomeFilterEndStateProps = {
  variant: "zero" | "exhausted";
  heading: string;
  createPrompt: string;
  primaryLabel: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  onSecondary: () => void;
  onTertiary: () => void;
};

/** Same family as Home Today / Events / Places chips: 11px semibold pill, compact height. */
const chipClass = [
  "min-w-0 inline-flex items-center justify-center whitespace-nowrap rounded-full",
  "text-[11px] font-semibold leading-none tracking-tight",
  "h-7 min-h-7 px-2.5",
  "border border-[color-mix(in_oklab,var(--text)_18%,transparent)]",
  "text-[var(--text)]/80",
  "hover:text-[var(--text)]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
].join(" ");

const createChipClass = [
  "inline-flex h-7 w-7 min-h-7 shrink-0 items-center justify-center rounded-full px-0",
  "border-0 bg-[var(--text)] text-[var(--bg)]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
].join(" ");

export default function HomeFilterEndState({
  heading,
  createPrompt,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  onSecondary,
  onTertiary,
}: HomeFilterEndStateProps) {
  const { openChooser } = useCreateChooser();

  return (
    <div className="w-full mt-4 border-t border-[var(--border)] px-0 pt-4 pb-3">
      <div className="flex gap-3">
        <div className="shrink-0 pt-1">
          <div className="relative h-10 w-10">
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-full bg-amber-400/22 blur-[5px]"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 translate-x-[-2.5px] translate-y-[2.5px] rounded-full border border-[color-mix(in_oklab,#0a0a0a_70%,#b45309)] bg-amber-800/90"
            />
            <div
              className="relative z-[1] flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] ring-2 ring-amber-400/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.28),0_2px_6px_rgba(0,0,0,0.28)]"
              role="img"
              aria-label="EchoToo"
            >
              <img
                src={getOwlLogoPath()}
                alt=""
                width={40}
                height={40}
                className="h-full w-full object-contain p-1"
                draggable={false}
              />
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-left text-xs font-medium text-amber-500 app-dark:text-amber-300">
            {heading}
          </p>
          <p className="mt-2 text-left text-[13px] leading-snug text-[var(--text)]/70">
            {createPrompt}
          </p>
          <div className="mt-2.5 flex w-full min-w-0 flex-nowrap items-center gap-1.5 max-[280px]:flex-wrap">
            <button type="button" className={chipClass} onClick={onSecondary}>
              {secondaryLabel}
            </button>
            <button
              type="button"
              className={createChipClass}
              aria-label={primaryLabel}
              onClick={() => openChooser()}
            >
              <PiPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
            <button type="button" className={chipClass} onClick={onTertiary}>
              {tertiaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
