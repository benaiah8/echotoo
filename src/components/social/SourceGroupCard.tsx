/**
 * Frosted source-browse Group card — vertical list item.
 * Request/Requested: compact slider toggle (transform + color; aria-pressed).
 */

import {
  PiCalendarBlank,
  PiChatCircle,
  PiCheck,
  PiClock,
  PiProhibit,
  PiUserPlus,
} from "react-icons/pi";
import { socialUiCopy } from "../../lib/social/socialUiCopy";
import { GROUP_ACTIVE_MEMBER_CAP } from "../../lib/groupActiveMemberCap";
import type { SourceGroupRow } from "../../lib/social/sourceGroupTypes";

/** Softer than glassPeoplePanelClass — frosted surface + light edge, no heavy outline. */
const sourceGroupCardGlassClass = [
  "w-full overflow-hidden rounded-2xl",
  "border border-[color-mix(in_oklab,var(--text)_10%,transparent)]",
  "app-light:border-[color-mix(in_oklab,var(--text)_8%,var(--border))]",
  "app-dark:border-white/14",
  "bg-[color-mix(in_oklab,var(--surface-2)_38%,transparent)]",
  "app-light:bg-[color-mix(in_oklab,var(--surface)_48%,transparent)]",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)]",
  "backdrop-blur-xl [-webkit-backdrop-filter:blur(16px)]",
  "shadow-[0_2px_12px_rgba(0,0,0,0.08),0_0_14px_color-mix(in_oklab,var(--brand)_8%,transparent)]",
].join(" ");

/** Thumb travels left↔right via `left` calc (interpolates; no left/right swap jump). */
const requestThumbClass = [
  "pointer-events-none absolute top-1/2 z-[1] flex h-7 w-7 -translate-y-1/2",
  "items-center justify-center rounded-full",
  "motion-safe:transition-[left,background-color,color,box-shadow] motion-safe:duration-200 motion-safe:ease-out",
  "motion-reduce:transition-none",
].join(" ");

export default function SourceGroupCard({
  row,
  occursLabel,
  occursTimeExplicit,
  busy,
  onPrimary,
}: {
  row: SourceGroupRow;
  occursLabel: string | null;
  occursTimeExplicit?: boolean;
  busy?: boolean;
  onPrimary: () => void;
}) {
  const title = row.group_title?.trim() || socialUiCopy.group;
  const description = row.group_description?.trim() || null;
  const isFull =
    row.viewer_state === "none" &&
    row.member_count >= GROUP_ACTIVE_MEMBER_CAP;
  const isPending = row.viewer_state === "pending";
  const isRequestable = row.viewer_state === "none" && !isFull;
  const isRequestToggle = isPending || isRequestable;

  const showClock = occursTimeExplicit === true;

  return (
    <article
      className={[sourceGroupCardGlassClass, "flex flex-col gap-2.5 p-3.5"].join(
        " "
      )}
      data-source-group-card
      data-viewer-state={row.viewer_state}
    >
      <div className="min-w-0 space-y-1.5">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug tracking-[-0.01em] text-[var(--text)]">
          {title}
        </h3>
        {description ? (
          <p className="line-clamp-4 text-[13px] leading-snug text-[var(--text)]/72">
            {description}
          </p>
        ) : null}
      </div>

      <div className="mt-0.5 flex min-w-0 items-center gap-2">
        {occursLabel ? (
          <div
            className={[
              "inline-flex w-fit max-w-[44%] shrink-0 items-center gap-1.5 rounded-full",
              "border border-[var(--border)]/40",
              "bg-[color-mix(in_oklab,var(--surface)_55%,transparent)]",
              "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
              "px-2 py-1.5",
            ].join(" ")}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--text)_10%,transparent)] text-[var(--text)]/70"
              aria-hidden
            >
              {showClock ? (
                <PiClock className="h-3 w-3" />
              ) : (
                <PiCalendarBlank className="h-3 w-3" />
              )}
            </span>
            <span className="min-w-0 truncate text-[11px] font-semibold leading-none text-[var(--text)]/80">
              {occursLabel}
            </span>
          </div>
        ) : null}

        {isRequestToggle ? (
          <button
            type="button"
            aria-pressed={isPending}
            aria-busy={busy === true}
            aria-label={
              isPending
                ? socialUiCopy.groupWithdrawRequestAria
                : socialUiCopy.groupRequest
            }
            onClick={(e) => {
              e.stopPropagation();
              if (busy) return;
              onPrimary();
            }}
            className={[
              "group/req relative inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center overflow-hidden rounded-full",
              "motion-safe:transition-[background-color,border-color,box-shadow,color] motion-safe:duration-200",
              "motion-reduce:transition-none",
              "motion-safe:active:scale-[0.985]",
              busy ? "cursor-wait" : "",
              isPending
                ? [
                    "border border-[color-mix(in_oklab,var(--green-text)_48%,var(--border))]",
                    "bg-[color-mix(in_oklab,var(--green-text)_24%,var(--surface))]",
                    "text-[var(--text)]",
                    "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--green-text)_12%,transparent)]",
                    "hover:bg-[color-mix(in_oklab,var(--green-text)_30%,var(--surface))]",
                    "motion-safe:active:bg-[color-mix(in_oklab,var(--green-text)_34%,var(--surface))]",
                  ].join(" ")
                : [
                    "border border-[color-mix(in_oklab,var(--brand)_42%,transparent)]",
                    /* Solid brand CTA yellow — no surface mix (avoids muddy olive/brown). */
                    "bg-[var(--brand)]",
                    "text-[var(--brand-ink)]",
                    "hover:brightness-[1.04]",
                    "motion-safe:active:brightness-[0.97]",
                  ].join(" "),
            ].join(" ")}
            data-request-toggle={isPending ? "requested" : "request"}
          >
            {/* Sliding thumb — left interpolates Request (right) ↔ Requested (left). */}
            <span
              className={[
                requestThumbClass,
                isPending
                  ? [
                      "left-1",
                      "bg-[color-mix(in_oklab,var(--green-text)_82%,var(--bg))]",
                      "text-[var(--bg)] app-dark:text-[#0a0a0a]",
                      "shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
                    ].join(" ")
                  : [
                      "left-[calc(100%-1.75rem-0.25rem)]",
                      "bg-[color-mix(in_oklab,var(--brand-ink)_14%,transparent)]",
                      "text-[var(--brand-ink)]",
                    ].join(" "),
              ].join(" ")}
              aria-hidden
            >
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <PiUserPlus
                  className={[
                    "absolute h-3.5 w-3.5",
                    "motion-safe:transition-opacity motion-safe:duration-150",
                    "motion-reduce:transition-none",
                    isPending ? "opacity-0" : "opacity-100",
                  ].join(" ")}
                />
                <PiCheck
                  className={[
                    "absolute h-3.5 w-3.5",
                    "motion-safe:transition-opacity motion-safe:duration-150",
                    "motion-reduce:transition-none",
                    isPending ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                />
              </span>
            </span>

            <span
              className={[
                "relative z-0 w-full truncate px-9 text-center text-[12px] font-semibold leading-none tracking-tight",
                "motion-safe:transition-opacity motion-safe:duration-200",
                "motion-reduce:transition-none",
              ].join(" ")}
            >
              {isPending
                ? socialUiCopy.groupRequested
                : socialUiCopy.groupRequest}
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isFull}
            aria-disabled={isFull}
            onClick={(e) => {
              e.stopPropagation();
              if (isFull) return;
              onPrimary();
            }}
            className={[
              "inline-flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5",
              "text-[12px] font-semibold leading-none",
              "motion-safe:transition-transform motion-safe:duration-100",
              isFull
                ? "pointer-events-none border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] text-[var(--text)]/45"
                : [
                    "border border-[color-mix(in_oklab,var(--text)_22%,transparent)]",
                    "bg-[var(--text)] text-[var(--bg)]",
                    "motion-safe:active:scale-[0.98]",
                  ].join(" "),
            ].join(" ")}
          >
            <span
              className={[
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                isFull
                  ? "bg-[color-mix(in_oklab,var(--text)_10%,transparent)] text-[var(--text)]/45"
                  : "bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] text-[var(--text)]",
              ].join(" ")}
              aria-hidden
            >
              {isFull ? (
                <PiProhibit className="h-3.5 w-3.5" />
              ) : (
                <PiChatCircle className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-center tracking-tight">
              {isFull ? socialUiCopy.groupFull : socialUiCopy.groupOpen}
            </span>
          </button>
        )}
      </div>
    </article>
  );
}
