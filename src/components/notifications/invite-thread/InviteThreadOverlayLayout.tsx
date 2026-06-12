import React from "react";
import { Link, type Location } from "react-router-dom";
import { PiArrowSquareOut } from "react-icons/pi";
import type { InviteThreadBundle } from "../../../api/services/inviteThreads";

export const INVITE_CONTEXT_CARD_MAX_W_CLASS = "max-w-md";

const contextCardBaseClass =
  "rounded-2xl border px-3 py-2.5 text-center shadow-sm backdrop-blur-xl";

const contextCardClass = `${contextCardBaseClass} border-neutral-900/18 bg-[color-mix(in_oklab,var(--surface-2)_42%,transparent)] transition-colors app-dark:border-white/22 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_30%,transparent)]`;

const contextCardLabelClass =
  "text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/40";

const seePostCueClass =
  "mt-2 inline-flex items-center justify-center gap-0.5 text-[10px] font-medium text-[var(--text)]/62 underline decoration-transparent underline-offset-2 transition-colors group-hover:text-primary/85 group-hover:decoration-primary/45 group-hover:underline sm:text-[11px]";

/** Matches invite composer pill-mode outer height (~5% below composer 50px) and inset (6px). */
export const INVITE_HEADER_PILL_INSET_PX = 6;
export const INVITE_HEADER_PILL_OUTER_HEIGHT_PX = 48;

/** Unified invite thread header pill — mirrors NotificationList / CreateFlow glass chrome. */
export const inviteThreadHeaderPillClass = [
  "relative box-border w-full min-w-0 rounded-full",
  "h-[48px] min-h-[48px] max-h-[48px]",
  "border border-[var(--bottom-tab-border)]",
  "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
  "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
  "shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_0_1px_var(--bottom-tab-pill-ring)]",
  "app-dark:shadow-[0_2px_12px_rgba(0,0,0,0.28),0_0_0_1px_var(--bottom-tab-pill-ring)]",
  "p-1.5",
].join(" ");

/** Side control pills (back + personal avatar) — matched pair inside the header lane. */
export const inviteThreadHeaderSidePillSizeClass = "h-[34px] w-[60px]";

/** Between main header chrome and hairline — visible but softer than the outer bar. */
export const inviteThreadHeaderSidePillBorderClass =
  "border border-[color-mix(in_oklab,var(--bottom-tab-border)_52%,transparent)] app-dark:border-[color-mix(in_oklab,var(--bottom-tab-border)_68%,transparent)]";

/** Solid themed back control — pairs with profile pill width. */
export const inviteThreadHeaderBackButtonClass = [
  "flex shrink-0 items-center justify-center rounded-full p-0",
  inviteThreadHeaderSidePillSizeClass,
  inviteThreadHeaderSidePillBorderClass,
  "bg-white text-[var(--text)]/88",
  "shadow-[0_2px_8px_rgba(0,0,0,0.1)]",
  "transition-colors hover:bg-neutral-50",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40",
  "app-dark:bg-[#0b0b0c] app-dark:text-white/92 app-dark:hover:bg-[#151516]",
  "app-dark:shadow-[0_2px_10px_rgba(0,0,0,0.28)]",
].join(" ");

/** Slightly wider than tall so the back chevron reads longer in the pill. */
export const inviteThreadHeaderBackArrowClass = "h-[18px] w-[24px] shrink-0";

const QUOTA_METER_HEIGHT_CLASS = "h-[30px]";

const QUOTA_SEGMENT_ACTIVE_CLASS =
  "bg-gradient-to-b from-amber-300/95 to-amber-200/88 shadow-[0_0_0_1px_rgba(253,224,138,0.55)] app-dark:from-amber-400/82 app-dark:to-amber-400/62 app-dark:shadow-[0_0_0_1px_rgba(251,191,36,0.38)]";

const QUOTA_SEGMENT_INACTIVE_CLASS =
  "border border-amber-900/28 bg-transparent app-dark:border-amber-100/32";

/** Separate segment boxes: pill caps on the ends, rectangular middles. */
function quotaSegmentShapeClass(index: number, segmentTotal: number): string {
  if (segmentTotal <= 1) return "rounded-full";
  if (index === 0) return "rounded-l-full rounded-r-sm";
  if (index === segmentTotal - 1) return "rounded-r-full rounded-l-sm";
  return "rounded-sm";
}

const QUOTA_METER_GAP_CLASS = "gap-1";

/**
 * Hard cap on drawn segments so very large server quotas do not explode layout.
 * Typical caps (e.g. 8) render 1:1; larger caps scale into this max.
 */
const QUOTA_METER_MAX_DISPLAY_SEGMENTS = 16;

/**
 * At or below this count, the meter uses compact fixed-width tiles; above it,
 * stretches to half header width with flex segments (fits 8-segment quota).
 */
const QUOTA_METER_COMPACT_SEGMENT_THRESHOLD = 4;

/**
 * Default segment count for loading / empty bundle (matches common 8-message cap).
 * Call sites should prefer {@link personalQuotaSegmentTotal} when `bundle` exists.
 */
export const PERSONAL_QUOTA_SEGMENT_TOTAL = 8;

function quotaMeterWrapperWidthClass(segmentTotal: number): string {
  return segmentTotal <= QUOTA_METER_COMPACT_SEGMENT_THRESHOLD
    ? "w-auto max-w-[108px]"
    : "w-1/2";
}

function quotaSegmentWidthClass(segmentTotal: number): string {
  return segmentTotal <= QUOTA_METER_COMPACT_SEGMENT_THRESHOLD
    ? "w-8 shrink-0"
    : "min-w-0 flex-1";
}

export function inviteThreadMessageStatusLabel(
  bundle: InviteThreadBundle,
): string {
  if (bundle.is_expired) return "Expired";
  if (bundle.my_messages_remaining === 1) return "1 message left";
  return `${bundle.my_messages_remaining} messages left`;
}

/** Total segments for personal viewer meter (from used + remaining, capped). */
export function personalQuotaSegmentTotal(bundle: InviteThreadBundle): number {
  const cap = bundle.my_messages_used + bundle.my_messages_remaining;
  return Math.min(QUOTA_METER_MAX_DISPLAY_SEGMENTS, Math.max(1, cap));
}

/** Lit segment count for personal threads (remaining quota vs cap). */
export function personalQuotaActiveSegmentsCount(
  bundle: InviteThreadBundle,
): number {
  const totalSeg = personalQuotaSegmentTotal(bundle);
  const cap = bundle.my_messages_used + bundle.my_messages_remaining;
  if (cap <= totalSeg) {
    return Math.min(totalSeg, Math.max(0, bundle.my_messages_remaining));
  }
  return Math.min(
    totalSeg,
    Math.max(
      0,
      Math.round((bundle.my_messages_remaining / cap) * totalSeg),
    ),
  );
}

/** Total pill segments for group viewer quota (same cap logic as personal). */
export function groupQuotaSegmentTotal(bundle: InviteThreadBundle): number {
  const cap = bundle.my_messages_used + bundle.my_messages_remaining;
  return Math.min(QUOTA_METER_MAX_DISPLAY_SEGMENTS, Math.max(1, cap));
}

/** Lit segments (remaining quota) for group threads. */
export function groupQuotaActiveSegmentsCount(
  bundle: InviteThreadBundle,
  totalSegments: number,
): number {
  const cap = bundle.my_messages_used + bundle.my_messages_remaining;
  if (cap <= totalSegments) {
    return Math.min(totalSegments, Math.max(0, bundle.my_messages_remaining));
  }
  return Math.min(
    totalSegments,
    Math.max(
      0,
      Math.round((bundle.my_messages_remaining / cap) * totalSegments),
    ),
  );
}

function InviteThreadQuotaSegments({
  bundle,
  segmentTotal,
  segmentActive,
}: {
  bundle: InviteThreadBundle | null;
  segmentTotal: number;
  segmentActive: number;
}) {
  const meterClass = `flex ${segmentTotal <= QUOTA_METER_COMPACT_SEGMENT_THRESHOLD ? "w-auto" : "w-full"} ${QUOTA_METER_HEIGHT_CLASS} items-stretch ${QUOTA_METER_GAP_CLASS}`;
  const segmentWidth = quotaSegmentWidthClass(segmentTotal);

  if (!bundle) {
    return (
      <div className={`${meterClass} opacity-40`} aria-hidden>
        {Array.from({ length: segmentTotal }, (_, i) => (
          <div
            key={i}
            className={`${segmentWidth} ${quotaSegmentShapeClass(i, segmentTotal)} ${QUOTA_SEGMENT_INACTIVE_CLASS}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={meterClass}
      role="img"
      aria-label={`${bundle.my_messages_remaining} messages remaining in your quota`}
    >
      {Array.from({ length: segmentTotal }, (_, i) => {
        const isActive = i < segmentActive;
        return (
          <div
            key={i}
            className={`${segmentWidth} transition-colors ${quotaSegmentShapeClass(i, segmentTotal)} ${
              isActive
                ? QUOTA_SEGMENT_ACTIVE_CLASS
                : QUOTA_SEGMENT_INACTIVE_CLASS
            }`}
          />
        );
      })}
    </div>
  );
}

export function InviteThreadTopHeader({
  bundle,
  loading,
  segmentTotal,
  segmentActive,
  back,
  right,
}: {
  bundle: InviteThreadBundle | null;
  loading?: boolean;
  segmentTotal: number;
  segmentActive: number;
  back: React.ReactNode;
  right: React.ReactNode;
}) {
  const statusText =
    loading && !bundle
      ? "Loading…"
      : bundle
      ? inviteThreadMessageStatusLabel(bundle)
      : "";

  return (
    <div className="flex w-full flex-col items-center">
      <div className={inviteThreadHeaderPillClass}>
        <div className="relative flex h-full min-h-[32px] w-full items-center justify-between">
          <div className="relative z-10 shrink-0">{back}</div>
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 ${quotaMeterWrapperWidthClass(segmentTotal)}`}
          >
            <InviteThreadQuotaSegments
              bundle={bundle}
              segmentTotal={segmentTotal}
              segmentActive={segmentActive}
            />
          </div>
          <div className="relative z-10 flex shrink-0 justify-end">{right}</div>
        </div>
      </div>
      {statusText ? (
        <p
          className={`mt-2 whitespace-nowrap text-center text-[10px] leading-none tabular-nums ${
            bundle?.is_expired
              ? "font-semibold text-rose-800/88 app-dark:text-rose-200/92"
              : "text-[var(--text)]/45 app-dark:text-[var(--text)]/50"
          }`}
        >
          {statusText}
        </p>
      ) : null}
    </div>
  );
}

export function InviteThreadScrollContext({
  bundle,
  linkToPost,
  backgroundLocation,
  inviteNoteFooter,
}: {
  bundle: InviteThreadBundle;
  linkToPost: string | null;
  backgroundLocation: Location;
  inviteNoteFooter?: React.ReactNode;
}) {
  const caption = bundle.post_peek.post_caption?.trim() || "Untitled";
  const noteRaw =
    bundle.invite.invite_note != null
      ? String(bundle.invite.invite_note).trim()
      : "";
  const hasNote = noteRaw.length > 0;

  const postBody = (
    <>
      <p className={contextCardLabelClass}>Post</p>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-snug text-[var(--text)]/75">
        {caption}
      </p>
      {linkToPost ? (
        <span className={seePostCueClass}>
          See post
          <PiArrowSquareOut
            className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3"
            aria-hidden
          />
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={`mx-auto flex w-full ${INVITE_CONTEXT_CARD_MAX_W_CLASS} flex-col gap-2.5`}
    >
      {linkToPost ? (
        <Link
          to={linkToPost}
          state={{ backgroundLocation }}
          className={`group block ${contextCardClass} hover:bg-[color-mix(in_oklab,var(--surface-2)_52%,transparent)] app-dark:hover:bg-[color-mix(in_oklab,var(--surface-2)_38%,transparent)]`}
          aria-label="See post"
        >
          {postBody}
        </Link>
      ) : (
        <div className={`${contextCardClass} opacity-60`}>{postBody}</div>
      )}

      <div className={contextCardClass}>
        <p className={contextCardLabelClass}>Invite note</p>
        <p
          className={`mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug ${
            hasNote ? "text-[var(--text)]/75" : "text-[var(--text)]/45 italic"
          }`}
        >
          {hasNote ? noteRaw : "No invite note added."}
        </p>
        {inviteNoteFooter}
      </div>
    </div>
  );
}
