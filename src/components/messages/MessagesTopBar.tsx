/**
 * Messages inbox floating chrome — Search chats + Activities bell.
 */

import { PiBell } from "react-icons/pi";
import { inviteThreadHeaderPillClass } from "../notifications/invite-thread/InviteThreadOverlayLayout";

type Props = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** When true (Requests tab), field stays visible but muted/disabled. */
  searchDisabled?: boolean;
  /** Visit-based: true when there are new eligible Activities since last visit. */
  hasNewActivities: boolean;
  activitiesOpen: boolean;
  onOpenActivities: () => void;
};

/** Inverse circular control — CreateFlow CircleAction language. */
const bellControlClass = [
  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
  "border border-[var(--create-border-top-circle,rgba(0,0,0,0.2))]",
  "bg-neutral-950 text-white",
  "shadow-[0_2px_10px_rgba(0,0,0,0.22),0_1px_3px_rgba(0,0,0,0.14)]",
  "transition hover:brightness-110 active:scale-[0.96]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40",
  "app-dark:bg-white app-dark:text-neutral-950",
  "app-dark:shadow-[0_4px_16px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]",
  "app-dark:hover:brightness-95",
].join(" ");

const bellActiveClass =
  "ring-2 ring-amber-400/55 ring-offset-1 ring-offset-[var(--bg)]";

export default function MessagesTopBar({
  searchQuery,
  onSearchChange,
  searchDisabled = false,
  hasNewActivities,
  activitiesOpen,
  onOpenActivities,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <div
        className={`flex w-full min-w-0 items-center gap-2 ${inviteThreadHeaderPillClass}`}
      >
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search chats"
          value={searchQuery}
          disabled={searchDisabled}
          onChange={(e) => onSearchChange(e.target.value)}
          className={[
            "min-h-0 min-w-0 flex-1 border-0 bg-transparent px-3 text-base outline-none",
            searchDisabled
              ? "cursor-not-allowed text-[var(--text)]/35 placeholder:text-[var(--text)]/30"
              : "text-[var(--text)] placeholder:text-[var(--text)]/45",
          ].join(" ")}
          aria-label="Search chats"
        />

        <button
          type="button"
          onClick={onOpenActivities}
          className={`${bellControlClass} ${activitiesOpen ? bellActiveClass : ""}`}
          aria-label={
            hasNewActivities ? "Activities, new activity" : "Activities"
          }
          aria-pressed={activitiesOpen}
        >
          <PiBell className="h-[18px] w-[18px]" aria-hidden />
          {hasNewActivities ? (
            <span
              className="pointer-events-none absolute right-1 top-1 z-[1] h-2.5 w-2.5 rounded-full bg-amber-400 ring-1 ring-[var(--bg)]"
              aria-hidden
            />
          ) : null}
        </button>
      </div>
    </div>
  );
}
