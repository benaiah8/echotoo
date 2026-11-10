/**
 * Home filters — bottom sheet over the Home feed.
 * Presentation / dismissal only; filter transitions stay on HomePage.
 *
 * The sheet is ~78% of the viewport and anchored to the bottom. The band
 * above it is a light dismiss scrim so the feed stays recognizable.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { useOverlayContentSwipeDismiss } from "../../hooks/useOverlayContentSwipeDismiss";
import { useOverlayEdgeSwipeDismiss } from "../../hooks/useOverlayEdgeSwipeDismiss";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  HOME_DATE_FILTER_DRAWER_OPTIONS,
  isHomeDateFilterActive,
  isHomeTypeFilterActive,
  type HomeDateFilter,
  type HomeDateFilterChip,
  type HomeViewMode,
} from "../../lib/homeVerticalFilters";
import HomeFilterCalendarPanel from "./HomeFilterCalendarPanel";

/** Match Profile Settings own-sheet glass (no per-control backdrop-filter). */
const glassPill =
  "rounded-full border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_14px_color-mix(in_oklab,var(--brand)_12%,transparent)]";

const sectionLabelClass =
  "w-full pb-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text)]/42 app-light:text-[var(--text)]/75";

/** Date heading — extra air above shortcut chips (paired with tighter Social→Date divider). */
const dateSectionLabelClass =
  "w-full pb-4 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text)]/42 app-light:text-[var(--text)]/75";

/** Hairline between Date and Calendar (~20px breathing room each side). */
const sectionDividerClass =
  "mx-auto my-5 w-full max-w-[min(100%,22rem)] border-t border-[color-mix(in_oklab,var(--border)_50%,transparent)]";

/** Social→Date only — less space under the hairline; Date heading gains that space. */
const socialToDateDividerClass =
  "mx-auto mt-5 mb-2.5 w-full max-w-[min(100%,22rem)] border-t border-[color-mix(in_oklab,var(--border)_50%,transparent)]";

/** Month nav only — date cells participate in content swipe-to-dismiss. */
const HOME_FILTERS_CONTENT_SWIPE_EXCLUDE =
  ".rdp-button_previous, .rdp-button_next, .rdp-nav";

/**
 * Filters-only dismiss layer. Light enough that the Home feed stays visible.
 * Not the shared action-sheet scrim.
 */
const homeFiltersDismissBackdropClass = [
  "pointer-events-auto absolute inset-0 cursor-default border-0 transition-opacity",
  "bg-black/28 app-light:bg-black/18",
].join(" ");

/** Frosted sheet surface — local to Home Filters. */
const homeFiltersSheetSurfaceClass = [
  "border-t border-[var(--border)]",
  "bg-[color-mix(in_oklab,var(--surface)_84%,transparent)]",
  "backdrop-blur-[18px] [-webkit-backdrop-filter:blur(18px)]",
  "app-dark:bg-[color-mix(in_oklab,var(--surface)_80%,transparent)]",
  "shadow-[0_-10px_36px_rgba(0,0,0,0.18)]",
].join(" ");

/** Anchored footer — no panel chrome; sheet glass stays continuous behind buttons. */
const footerBarClass = [
  "relative z-[1] shrink-0",
  "flex items-center justify-center gap-3",
  "p-3.5",
].join(" ");

/** EchoToo yellow primary — Done always uses brand fill. */
const doneButtonClass = [
  "inline-flex h-8 min-w-[4.5rem] items-center justify-center whitespace-nowrap px-3.5",
  "rounded-full border border-[color-mix(in_oklab,var(--brand-ink)_22%,transparent)]",
  "bg-[var(--brand)] text-[11px] font-medium leading-none text-[var(--brand-ink)]",
  "shadow-[0_2px_10px_rgba(0,0,0,0.18),0_0_14px_color-mix(in_oklab,var(--brand)_28%,transparent)]",
  "transition-[box-shadow,transform,background-color] active:scale-[0.99]",
  "touch-manipulation",
].join(" ");

const chipButtonClass = (
  isSelected: boolean,
  options?: { disabled?: boolean }
) => {
  const base = [
    "inline-flex h-8 items-center justify-center whitespace-nowrap px-3.5",
    "text-[11px] font-medium leading-none transition-[box-shadow,transform,background-color]",
    "active:scale-[0.99]",
  ].join(" ");
  if (options?.disabled) {
    return [
      base,
      glassPill,
      "cursor-not-allowed pointer-events-none opacity-40",
    ].join(" ");
  }
  if (isSelected) {
    return [
      base,
      "rounded-full border border-[color-mix(in_oklab,var(--brand-ink)_22%,transparent)]",
      "bg-[var(--brand)] text-[var(--brand-ink)]",
      "shadow-[0_2px_10px_rgba(0,0,0,0.18),0_0_14px_color-mix(in_oklab,var(--brand)_28%,transparent)]",
    ].join(" ");
  }
  return [
    base,
    glassPill,
    "text-[var(--text)] hover:bg-[var(--glass-active-bg)]",
  ].join(" ");
};

const HOME_FILTERS_EDGE_MAX_WIDTH_VW = 0.32;
const HOME_FILTERS_EDGE_MAX_WIDTH_PX = 128;

export type HomeFiltersOverlayProps = {
  open: boolean;
  onClose: () => void;
  viewMode: HomeViewMode;
  dateFilter: HomeDateFilter;
  customOccursOn: string | null;
  friendsFilter: boolean;
  /** Canonical active filters (includes search) — drives Clear selected styling. */
  hasActiveFilters: boolean;
  onToggleDateFilter: (target: HomeDateFilterChip) => void;
  onSelectCustomDate: (occursOn: string) => void;
  onToggleTypeFilter: (target: "hangouts" | "experiences") => void;
  onToggleFriends: () => void;
  onClearAllFilters: () => void;
  homeRefreshEpoch?: number;
};

export default function HomeFiltersOverlay({
  open,
  onClose,
  viewMode,
  dateFilter,
  customOccursOn,
  friendsFilter,
  hasActiveFilters,
  onToggleDateFilter,
  onSelectCustomDate,
  onToggleTypeFilter,
  onToggleFriends,
  onClearAllFilters,
  homeRefreshEpoch = 0,
}: HomeFiltersOverlayProps) {
  const playAnimatedDismissRef = useRef<() => void>(() => {});

  useOverlayBackgroundScrollLock(open);

  const { overlayMotionStyle, edgeStripProps, playAnimatedDismiss } =
    useOverlayEdgeSwipeDismiss({
      active: open,
      engageSwipe: open,
      edgeStripLeftInsetPx: isNativeApp() ? 8 : 12,
      edgeMaxWidthVw: HOME_FILTERS_EDGE_MAX_WIDTH_VW,
      edgeMaxWidthPx: HOME_FILTERS_EDGE_MAX_WIDTH_PX,
      edgeStripZClass: "z-[5]",
      onDismiss: onClose,
    });

  playAnimatedDismissRef.current = playAnimatedDismiss;

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: open,
      engageSwipe: open,
      gestureDisabled: false,
      // Full panel — calendar mid/right cells must be able to start dismiss.
      startZoneMaxXVw: 1,
      startZoneMaxPx: 10000,
      leftInsetPx: isNativeApp() ? 8 : 12,
      excludeSelector: HOME_FILTERS_CONTENT_SWIPE_EXCLUDE,
      allowButtonTargets: true,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: playAnimatedDismiss,
    });

  const effectiveOverlayMotionStyle = contentSwipeMotionStyle
    ? { ...overlayMotionStyle, ...contentSwipeMotionStyle }
    : overlayMotionStyle;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        playAnimatedDismissRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const unsubAndroid = subscribeAndroidHardwareBack(() => {
      playAnimatedDismissRef.current();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubAndroid();
    };
  }, [open]);

  if (!open) return null;

  const eventsSelected =
    isHomeTypeFilterActive(viewMode, "hangouts") &&
    dateFilter === "none" &&
    !customOccursOn;
  const placesSelected = isHomeTypeFilterActive(viewMode, "experiences");

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overscroll-none pointer-events-none"
      style={effectiveOverlayMotionStyle}
      data-home-filters-overlay="true"
      data-tour-target="home-filter-panel"
      role="presentation"
    >
      <button
        type="button"
        className={homeFiltersDismissBackdropClass}
        aria-label="Dismiss filters"
        data-home-filters-backdrop="true"
        onClick={() => playAnimatedDismiss()}
      />

      {/* Bottom-anchored sheet. The open band above is the dismiss scrim. */}
      <div
        role="presentation"
        data-home-filters-shell="true"
        className="relative z-10 flex h-full w-full items-end justify-center pointer-events-none"
      >
        <div
          {...panelSwipeProps}
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          data-home-filters-content="true"
          data-home-filters-sheet="true"
          className={[
            "pointer-events-auto flex h-[78%] w-full max-w-[640px] flex-col",
            "overflow-hidden rounded-t-[28px]",
            "px-4",
            homeFiltersSheetSurfaceClass,
          ].join(" ")}
          style={{
            paddingBottom: "var(--safe-area-bottom-layout, 0px)",
            maxHeight:
              "calc(100% - env(safe-area-inset-top, 0px) - 12px)",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            data-home-filters-scroll="true"
            className={[
              "min-h-0 flex-1",
              "overflow-y-auto overflow-x-hidden overscroll-contain scroll-hide",
              "pt-6 pb-2 [-webkit-overflow-scrolling:touch]",
            ].join(" ")}
            style={{ touchAction: "pan-y" }}
          >
            <section aria-labelledby="home-filters-social-heading">
              <h3 id="home-filters-social-heading" className={sectionLabelClass}>
                Social
              </h3>
              <div className="mx-auto flex max-w-[min(100%,22rem)] flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleFriends}
                  className={chipButtonClass(friendsFilter)}
                  aria-pressed={friendsFilter || undefined}
                >
                  Friends
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTypeFilter("hangouts")}
                  className={chipButtonClass(eventsSelected)}
                  aria-pressed={eventsSelected || undefined}
                >
                  Events
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTypeFilter("experiences")}
                  className={chipButtonClass(placesSelected)}
                  aria-pressed={placesSelected || undefined}
                >
                  Posts
                </button>
              </div>
            </section>

            <div
              className={socialToDateDividerClass}
              role="separator"
              aria-hidden
              data-home-filters-divider="social-date"
            />

            <section
              data-tour-target="home-filter-dates"
              aria-labelledby="home-filters-date-heading"
            >
              <h3
                id="home-filters-date-heading"
                className={dateSectionLabelClass}
              >
                Date
              </h3>
              <div className="mx-auto flex max-w-[min(100%,26rem)] flex-wrap items-center justify-center gap-1.5">
                {HOME_DATE_FILTER_DRAWER_OPTIONS.map((option) => {
                  const isSelected =
                    option.enabled &&
                    isHomeDateFilterActive(dateFilter, option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!option.enabled}
                      aria-disabled={!option.enabled || undefined}
                      aria-pressed={isSelected || undefined}
                      title={option.enabled ? undefined : "Coming soon"}
                      onClick={() => {
                        if (!option.enabled) return;
                        onToggleDateFilter(option.value);
                      }}
                      className={chipButtonClass(isSelected, {
                        disabled: !option.enabled,
                      })}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <div
              className={sectionDividerClass}
              role="separator"
              aria-hidden
              data-home-filters-divider="date-calendar"
            />

            <section aria-labelledby="home-filters-calendar-heading">
              <h3
                id="home-filters-calendar-heading"
                className={sectionLabelClass}
              >
                Calendar
              </h3>
              <div className="w-full min-w-0">
                <HomeFilterCalendarPanel
                  customOccursOn={customOccursOn}
                  onSelectCustomDate={onSelectCustomDate}
                  calendarVisible={open}
                  friendsFilter={friendsFilter}
                  homeRefreshEpoch={homeRefreshEpoch}
                  resetToken={open}
                />
              </div>
              <p
                className="mx-auto mt-2.5 max-w-[22rem] text-center text-[10px] leading-snug text-[var(--text)]/55"
                role="note"
              >
                Numbers show how many events are available on that day.
              </p>
            </section>
          </div>

          <div
            className={footerBarClass}
            data-home-filters-bottom-actions="true"
          >
            <button
              type="button"
              onClick={onClearAllFilters}
              aria-pressed={hasActiveFilters || undefined}
              className={chipButtonClass(hasActiveFilters)}
            >
              Clear all filters
            </button>
            <button
              type="button"
              className={doneButtonClass}
              aria-label="Done"
              onClick={() => playAnimatedDismiss()}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <div {...edgeStripProps} />
    </div>,
    document.body
  );
}
