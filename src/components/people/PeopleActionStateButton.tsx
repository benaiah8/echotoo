/**
 * Presentation-only Heart / Comment circle.
 * Callers own interest, comments, pool membership, and navigation.
 */
import { useState } from "react";
import {
  PiChatCircleBold,
  PiChatCircleFill,
  PiHeartBold,
  PiHeartFill,
} from "react-icons/pi";
import "./PeopleActionStateButton.css";

export type PeopleActionKind = "heart" | "comment";
export type PeopleActionVisualState = "idle" | "pending" | "active" | "disabled";
export type PeopleActionSize = 44 | 52;
export type PeopleActionConfirmedState = "idle" | "active";

export type PeopleActionStateButtonProps = {
  kind: PeopleActionKind;
  state: PeopleActionVisualState;
  size: PeopleActionSize;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel: string;
  /**
   * Icon to keep while `state` is pending. Removal stays on the last
   * confirmed icon instead of flashing idle.
   */
  confirmedState?: PeopleActionConfirmedState;
};

const IDLE_CHROME = [
  "bg-[var(--text)]/10 text-[var(--text)]/90",
  "app-dark:bg-white/14 app-dark:text-white/90",
].join(" ");

function shownState(
  state: PeopleActionVisualState,
  confirmedState: PeopleActionConfirmedState | undefined
): PeopleActionConfirmedState {
  if (state === "active") return "active";
  if (state === "pending") return confirmedState ?? "idle";
  return "idle";
}

function pressBlocked(
  state: PeopleActionVisualState,
  disabled: boolean
): boolean {
  return disabled || state === "disabled" || state === "pending";
}

export default function PeopleActionStateButton({
  kind,
  state,
  size,
  disabled = false,
  onClick,
  ariaLabel,
  confirmedState,
}: PeopleActionStateButtonProps) {
  const [rippling, setRippling] = useState(false);
  const shown = shownState(state, confirmedState);
  const blocked = pressBlocked(state, disabled);
  const activeTone =
    kind === "heart" ? "bg-white text-[rgb(225,29,72)]" : "bg-white text-black";
  const Icon =
    kind === "heart"
      ? shown === "active"
        ? PiHeartFill
        : PiHeartBold
      : shown === "active"
        ? PiChatCircleFill
        : PiChatCircleBold;
  const glyphClass =
    shown === "active"
      ? size === 52
        ? "h-[42px] w-[42px]"
        : "h-9 w-9"
      : size === 52
        ? "h-[26px] w-[26px]"
        : "h-6 w-6";

  return (
    <button
      type="button"
      disabled={blocked}
      aria-label={ariaLabel}
      aria-busy={state === "pending" || undefined}
      aria-pressed={shown === "active"}
      data-people-action-kind={kind}
      data-people-action-state={state}
      data-people-action-visual={shown}
      data-people-action-size={String(size)}
      data-people-action-icon={shown === "active" ? "fill" : "outline"}
      onClick={(event) => {
        event.stopPropagation();
        if (pressBlocked(state, disabled)) return;
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setRippling(true);
        }
        onClick?.();
      }}
      onAnimationEnd={(event) => {
        if (!(event.target instanceof HTMLElement)) return;
        if (!event.target.classList.contains("people-action-ripple--delay")) return;
        setRippling(false);
      }}
      className={[
        "people-action-state-button",
        "inline-flex shrink-0 items-center justify-center rounded-full",
        "touch-manipulation",
        "motion-safe:transition-transform motion-safe:duration-100",
        "motion-safe:active:scale-[0.94] motion-reduce:transition-none",
        size === 52 ? "h-[52px] w-[52px]" : "h-11 w-11",
        shown === "active" ? activeTone : IDLE_CHROME,
        state === "pending" ? "shadow-[inset_0_0_0_1px_currentColor]" : "",
        blocked && state !== "pending" ? "opacity-50" : "",
        rippling ? "is-rippling" : "",
      ].join(" ")}
    >
      <span className="people-action-ripple" aria-hidden />
      <span className="people-action-ripple people-action-ripple--delay" aria-hidden />
      <Icon
        className={["relative z-[1] shrink-0", glyphClass].join(" ")}
        aria-hidden
      />
    </button>
  );
}
