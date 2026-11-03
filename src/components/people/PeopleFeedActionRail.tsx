/**
 * People feed right-rail — heart (Connect/Request) + optional Message.
 * Presentation-only chrome; parents supply handlers and a11y labels.
 */
import { PiChatCircleBold, PiHeartBold, PiHeartFill } from "react-icons/pi";

export type PeopleFeedHeartState =
  | "idle"
  | "active"
  | "pending"
  | "busy"
  | "disabled";

export type PeopleFeedActionRailProps = {
  heartLabel: string;
  heartState: PeopleFeedHeartState;
  onHeart: () => void;
  messageLabel?: string | null;
  messageBusy?: boolean;
  messageDisabled?: boolean;
  onMessage?: (() => void) | null;
  /** Discover opportunity box — neutral gray circles, no blur chrome. */
  discoverNeutralChrome?: boolean;
};

export default function PeopleFeedActionRail({
  heartLabel,
  heartState,
  onHeart,
  messageLabel = null,
  messageBusy = false,
  messageDisabled = false,
  onMessage = null,
  discoverNeutralChrome = false,
}: PeopleFeedActionRailProps) {
  const heartBusy = heartState === "busy";
  const heartDisabled = heartState === "disabled" || heartBusy;
  const heartActive =
    heartState === "active" || heartState === "pending";
  const showMessage = typeof onMessage === "function" && messageLabel;

  const actionBtnBase = discoverNeutralChrome
    ? "inline-flex h-11 w-11 items-center justify-center rounded-full touch-manipulation transition active:scale-[0.92] bg-[var(--text)]/10 text-[var(--text)]/90 app-dark:bg-white/14 app-dark:text-white/90"
    : [
        "inline-flex h-11 w-11 items-center justify-center rounded-full",
        "touch-manipulation transition active:scale-[0.92]",
        "border border-[var(--border)]/40 bg-[var(--surface)]/90",
        "shadow-sm backdrop-blur-sm",
        "text-[var(--text)]/85",
      ].join(" ");

  return (
    <div
      className={
        discoverNeutralChrome
          ? "pointer-events-auto flex w-11 shrink-0 flex-col items-center justify-end gap-2 self-end"
          : "pointer-events-auto flex w-[var(--people-feed-rail-w,52px)] shrink-0 flex-col items-center justify-end gap-2.5 self-end pb-0.5"
      }
      data-people-feed-action-rail="true"
      data-people-feed-action-align="content-bottom"
      data-people-discover-neutral-actions={
        discoverNeutralChrome ? "true" : undefined
      }
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!heartDisabled) onHeart();
        }}
        disabled={heartDisabled}
        aria-label={heartLabel}
        aria-busy={heartBusy || undefined}
        aria-pressed={heartActive || undefined}
        data-people-feed-heart="true"
        data-people-feed-heart-state={heartState}
        className={[
          actionBtnBase,
          heartDisabled ? "opacity-45" : "",
          heartActive
            ? "text-[rgb(225,29,72)]"
            : discoverNeutralChrome
              ? ""
              : "text-[var(--text)]/85",
        ].join(" ")}
      >
        {heartActive ? (
          <PiHeartFill className="h-6 w-6" aria-hidden />
        ) : (
          <PiHeartBold className="h-6 w-6" aria-hidden />
        )}
      </button>

      {showMessage ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!messageDisabled && !messageBusy) onMessage?.();
          }}
          disabled={messageDisabled || messageBusy}
          aria-label={messageLabel}
          aria-busy={messageBusy || undefined}
          data-people-feed-message="true"
          className={[
            actionBtnBase,
            messageDisabled || messageBusy ? "opacity-45" : "",
          ].join(" ")}
        >
          <PiChatCircleBold className="h-6 w-6" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
