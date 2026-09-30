import { SkeletonCircle, SkeletonLine } from "../ui/Skeleton";
import {
  HOME_EVENT_RAIL_CAPTION_SLOT_PX,
  HOME_EVENT_RAIL_CARD_BORDER_BOX_PX,
} from "../../lib/homeEventRailCardGeometry";

/**
 * Calm CSS-only placeholder for the Home Event Hangout rail card.
 * Matches Hangout bordered-shell geometry (194px) — no hooks, images, or network.
 * Action pills are fixed compact widths (left-aligned) so they stay
 * inside the 180px min card with horizontal padding.
 */
export default function HangoutRailCardSkeleton() {
  return (
    <div
      className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0"
      data-hangout-rail-skeleton
      aria-hidden
    >
      <div
        className="relative mb-3 box-border overflow-hidden rounded-[14px] border border-[var(--border)] ui-card pt-2 px-3 pb-2"
        style={{ height: HOME_EVENT_RAIL_CARD_BORDER_BOX_PX }}
        data-hangout-rail-skeleton-shell
      >
        <div className="relative z-10 flex min-w-0 flex-col">
          {/* 1. Date pill */}
          <div
            className="flex h-[26px] w-full min-w-0 items-center justify-center"
            data-hangout-rail-skeleton-date
          >
            <div className="h-full w-full rounded-full bg-[var(--text)]/10 animate-pulse" />
          </div>

          {/* 2. Social pick — circle + short line */}
          <div
            className="mt-2.5 flex min-w-0 items-center gap-1.5"
            data-hangout-rail-skeleton-social
          >
            <SkeletonCircle className="h-6 w-6 shrink-0" />
            <SkeletonLine className="h-3 w-16 max-w-[40%] shrink-0" />
          </div>

          {/* 3. Caption slot — fixed 60px; two visual bars inside */}
          <div
            className="mt-2.5 space-y-2"
            style={{
              minHeight: HOME_EVENT_RAIL_CAPTION_SLOT_PX,
              maxHeight: HOME_EVENT_RAIL_CAPTION_SLOT_PX,
            }}
            data-hangout-rail-skeleton-caption
          >
            <div className="h-3.5 w-[88%] rounded bg-[var(--text)]/10 animate-pulse" />
            <div className="h-3.5 w-[62%] rounded bg-[var(--text)]/10 animate-pulse" />
          </div>

          {/* 4. Action row — min-h-9 slot; visible pills remain h-7 */}
          <div
            className="mt-2.5 flex min-h-9 min-w-0 shrink-0 items-center gap-2"
            data-hangout-rail-skeleton-actions
          >
            <div
              className="h-7 w-10 shrink-0 rounded-[12px_16px_11px_15px] bg-[var(--text)]/10 animate-pulse"
              data-hangout-rail-skeleton-action="duo"
            />
            <div
              className="h-7 w-11 shrink-0 rounded-[12px_16px_11px_15px] bg-[var(--text)]/10 animate-pulse"
              data-hangout-rail-skeleton-action="group"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
