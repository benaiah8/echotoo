/**
 * Compact People metadata “See post” control — icon + label, h-7 row.
 * Shared by Duo / Discover / Groups (and Plans only when source rules allow).
 */
import { PiArrowSquareOutBold } from "react-icons/pi";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const CONTROL_CLASS = [
  "inline-flex h-7 max-w-full shrink-0 items-center gap-1 rounded-full",
  "border border-[var(--text)]/15",
  "bg-[color-mix(in_oklab,var(--surface)_72%,transparent)]",
  "px-2.5 text-[12px] font-semibold tracking-tight text-[var(--text)]/70",
  "transition hover:text-[var(--text)] active:scale-[0.97]",
  "touch-manipulation",
].join(" ");

export default function PeopleSeePostControl({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[CONTROL_CLASS, className].filter(Boolean).join(" ")}
      aria-label={peopleUiCopy.deckSeePost}
      title={peopleUiCopy.deckSeePost}
      data-people-see-post="true"
      data-people-see-post-control="true"
    >
      <PiArrowSquareOutBold className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{peopleUiCopy.deckSeePost}</span>
    </button>
  );
}
