import {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import { getConfirmDialogButtonClass } from "./ConfirmDialog";

export type FeedLoadErrorStateProps = {
  title?: string;
  body?: string;
  onRetry: () => void;
  /** Tighter layout for horizontal rails and narrow slots. */
  compact?: boolean;
};

export default function FeedLoadErrorState({
  title = "We couldn't load posts right now",
  body = "Check your connection and try again.",
  onRetry,
  compact = false,
}: FeedLoadErrorStateProps) {
  return (
    <div
      className={`flex w-full justify-center px-3 ${compact ? "py-4" : "py-8"}`}
      role="alert"
      aria-live="polite"
    >
      <div
        className={`${frostedModalPanelClassName} text-center ${compact ? "!p-3" : ""}`}
        style={{
          ...frostedModalPanelStyle,
          maxWidth: compact
            ? "min(300px, 100%)"
            : frostedModalPanelStyle.maxWidth,
        }}
      >
        <h2
          className={`font-semibold text-[var(--text)] ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {title}
        </h2>
        <p
          className={`mt-1 text-[var(--text)]/70 ${
            compact ? "text-[11px] leading-snug" : "text-xs"
          }`}
        >
          {body}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={`${getConfirmDialogButtonClass(
            "primary",
            compact ? "intrinsic" : "full",
          )} mt-3`}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
