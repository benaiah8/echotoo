import React, { useEffect, useState } from "react";
import {
  PiMagnifyingGlass,
  PiSlidersHorizontal,
  PiX,
} from "react-icons/pi";
import Logo from "./ui/Logo";
import {
  HOME_DATE_FILTER_DRAWER_OPTIONS,
  hasNonShortcutHomeFilters,
  isHomeDateFilterActive,
  isHomeTypeFilterActive,
  isTodayChipActive,
  type HomeDateFilter,
  type HomeDateFilterChip,
  type HomeViewMode,
} from "../lib/homeVerticalFilters";

const TOP_BAR_MAX_WIDTH = 640;

/** Chrome slide: slower hide (slide off), quicker show (settle in). */
const CHROME_HIDE_MS = 620;
const CHROME_SHOW_MS = 340;
const CHROME_HIDE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const CHROME_SHOW_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Browse compact-pill (width / radius / fill / padding-top). Separate from hide/show. */
const COMPACT_MS = 300;
const COMPACT_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";
const COMPACT_RING_DELAY_MS = 100;

/**
 * Solid chip pills for readability over feed imagery.
 * Inactive: dark (light theme) / near-white (dark theme). Selected: brand yellow + ink text.
 * Height (18px) is the visual alignment target for capsule end-cap controls.
 */
const chipButtonClass = (isSelected: boolean) =>
  [
    "shrink-0 inline-flex items-center justify-center whitespace-nowrap rounded-full border-0",
    "text-[11px] font-semibold leading-none tracking-tight",
    "h-[18px] min-h-[18px] px-3 py-0 transition-[transform,background-color,color,box-shadow] duration-200",
    "active:scale-[0.96]",
    isSelected
      ? [
          "bg-[var(--brand)] text-[var(--brand-ink)]",
          "shadow-[0_2px_12px_rgba(0,0,0,0.35)]",
          "border border-[color-mix(in_oklab,var(--brand-ink)_22%,transparent)]",
        ].join(" ")
      : [
          "bg-neutral-800 text-white shadow-sm",
          "hover:bg-neutral-900",
          "app-dark:bg-white/[0.88] app-dark:text-neutral-900 app-dark:shadow-[0_1px_6px_rgba(0,0,0,0.25)]",
          "app-dark:hover:bg-white",
        ].join(" "),
  ].join(" ");

/** End-cap controls: same 18px height as shortcut chips; no heavy chrome border. */
const shortcutEndCapClass = (opts?: {
  active?: boolean;
  destructive?: boolean;
}) => {
  const active = opts?.active === true;
  const destructive = opts?.destructive === true;
  return [
    "relative shrink-0 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-0",
    "transition-[transform,background-color,color] duration-200 active:scale-[0.96]",
    destructive
      ? [
          "text-rose-700/70 hover:bg-rose-500/[0.10] hover:text-rose-700/90",
          "app-dark:text-rose-300/65 app-dark:hover:bg-rose-400/[0.12] app-dark:hover:text-rose-200/85",
        ].join(" ")
      : active
        ? "bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] text-[var(--text)]"
        : [
            "bg-transparent text-[var(--text)]/75",
            "hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] hover:text-[var(--text)]",
            "app-dark:text-white/72 app-dark:hover:bg-white/[0.08] app-dark:hover:text-white/90",
          ].join(" "),
  ].join(" ");
};

const drawerSectionLabelClass =
  "mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text)]/82";

const drawerChipButtonClass = (
  isSelected: boolean,
  options?: { disabled?: boolean }
) => {
  const base =
    "py-1 px-3 rounded-md text-[10px] font-medium leading-none transition-colors whitespace-nowrap border";
  if (options?.disabled) {
    return [
      base,
      "cursor-not-allowed pointer-events-none",
      "border-[color-mix(in_oklab,var(--border)_70%,transparent)]",
      "bg-[color-mix(in_oklab,var(--text)_5%,transparent)]",
      "text-[var(--text)]/38",
      "app-dark:text-white/32 app-dark:border-white/10 app-dark:bg-white/[0.04]",
    ].join(" ");
  }
  if (isSelected) {
    return [
      base,
      "bg-[var(--brand)] text-[var(--brand-ink)]",
      "border-[color-mix(in_oklab,var(--brand-ink)_22%,transparent)]",
      "shadow-[0_1px_8px_rgba(0,0,0,0.22)] app-dark:shadow-[0_2px_10px_rgba(0,0,0,0.45)]",
    ].join(" ");
  }
  return [
    base,
    "text-[var(--text)]/92",
    "border-[color-mix(in_oklab,var(--border)_88%,var(--text))]",
    "bg-[color-mix(in_oklab,var(--surface-2)_55%,var(--bg))]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    "hover:bg-[color-mix(in_oklab,var(--surface-2)_72%,var(--bg))]",
    "app-dark:text-white/90 app-dark:border-white/22",
    "app-dark:bg-[color-mix(in_oklab,#1c1c1f_78%,transparent)]",
    "app-dark:hover:bg-[color-mix(in_oklab,#242428_82%,transparent)]",
  ].join(" ");
};

export interface HomeTopBarProps {
  /** Root wrapper ref for outside-press detection handled by parent. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** When true, hide the top bar (scroll down) */
  isHidden: boolean;
  /** When true (scrollY &lt; 5), main bar is full-width flush; when false, floating pill */
  atTop?: boolean;
  onToggleFilters: () => void;
  onLogoClick: () => void;
  onSearch: (q: string) => void;
  search: string;
  searchMode: "posts" | "users";
  onSearchModeChange: (mode: "posts" | "users") => void;
  /** When true, show Posts / Users segmented toggle under the search field (legacy; keep false on Home). */
  showSearchKindToggle: boolean;
  /** Home search shell: hide browse chips/logo; field + Posts funnel only. */
  homePostSearchActive: boolean;
  searchFieldPlaceholder: string;
  hasActiveFilters: boolean;
  filtersOpen: boolean;
  viewMode: HomeViewMode;
  dateFilter: HomeDateFilter;
  onToggleDateFilter: (target: HomeDateFilterChip) => void;
  onToggleTypeFilter: (target: "hangouts" | "experiences") => void;
  friendsFilter: boolean;
  onToggleFriends: () => void;
  /** Fires when the main search field gains/loses focus (keyboard / IME). Used to pin the bar on native + web. */
  onSearchFocusChange?: (focused: boolean) => void;
  /** Explicit pointer/touch on the search field — clears post-exit focus ignore. */
  onSearchInputPointerDown?: () => void;
  /** Resets date, type, friends, and search. */
  onClearAllFilters: () => void;
  /** Optional; Home may omit while tags UI is unused (defaults to []). */
  selectedTags?: readonly string[];
}

export default function HomeTopBar({
  containerRef,
  isHidden,
  atTop = false,
  onToggleFilters,
  onLogoClick,
  onSearch,
  search,
  searchMode,
  onSearchModeChange,
  showSearchKindToggle,
  homePostSearchActive,
  searchFieldPlaceholder,
  hasActiveFilters,
  filtersOpen,
  viewMode,
  dateFilter,
  onToggleDateFilter,
  onToggleTypeFilter,
  friendsFilter,
  onToggleFriends,
  onSearchFocusChange,
  onSearchInputPointerDown,
  onClearAllFilters,
  selectedTags = [],
}: HomeTopBarProps) {
  const todayActive = isTodayChipActive(dateFilter);
  const eventsSelected =
    isHomeTypeFilterActive(viewMode, "hangouts") && dateFilter === "none";
  const placesSelected = isHomeTypeFilterActive(viewMode, "experiences");
  /** Drawer-only / non-chip filters — subtle active on the in-pill funnel. */
  const nonShortcutFiltersActive = hasNonShortcutHomeFilters({
    dateFilter,
    typeFilter: viewMode,
    friendsFilter,
    search,
    selectedTags,
  });

  const showPostFiltersChrome =
    !homePostSearchActive || searchMode === "posts";
  const filtersDrawerExpanded =
    filtersOpen && showPostFiltersChrome;

  const handleFriendsFilterClick = () => {
    onToggleFriends();
  };

  const hidden = isHidden;
  /** Duration/easing follow `hidden` so hiding uses a longer window than showing. */
  const chromeMs = hidden ? CHROME_HIDE_MS : CHROME_SHOW_MS;
  const chromeEase = hidden ? CHROME_HIDE_EASING : CHROME_SHOW_EASING;

  /**
   * Search shell: always the clean at-top presentation — ignore browse
   * compact-pill / scroll-hide chrome so the still-mounted feed cannot bleed through.
   */
  const searchChrome = homePostSearchActive;
  const [compactBlurActive, setCompactBlurActive] = useState(false);

  useEffect(() => {
    if (searchChrome || atTop) {
      setCompactBlurActive(false);
      return;
    }
    const id = window.setTimeout(() => setCompactBlurActive(true), COMPACT_MS);
    return () => window.clearTimeout(id);
  }, [searchChrome, atTop]);

  const compactShellTransition = [
    `width ${COMPACT_MS}ms ${COMPACT_EASING}`,
    `max-width ${COMPACT_MS}ms ${COMPACT_EASING}`,
  ].join(", ");
  const compactVisualTransition = [
    `border-radius ${COMPACT_MS}ms ${COMPACT_EASING}`,
    `background-color ${COMPACT_MS}ms ${COMPACT_EASING}`,
    `box-shadow ${COMPACT_MS}ms ${COMPACT_EASING} ${
      atTop ? 0 : COMPACT_RING_DELAY_MS
    }ms`,
  ].join(", ");
  const transformClass =
    searchChrome || !hidden
      ? "translate-y-0 scale-100 origin-top"
      : "-translate-y-[110%] scale-[0.98] origin-top";

  const chromeTransformTransition = searchChrome
    ? {
        transition: "none",
        transitionProperty: "none" as const,
        transitionDuration: "0ms",
      }
    : {
        transitionProperty: "transform" as const,
        transitionDuration: `${chromeMs}ms`,
        transitionTimingFunction: chromeEase,
      };

  /** Opaque band under search field — matches overlay start (~58px + safe-area). */
  const searchBandHeight = "calc(58px + var(--safe-area-top-layout))";

  return (
    <>
      {/* Top gradient: solid at top → transparent (theme-aware via var).
          Search: solid --app-canvas band so browse feed cannot show through. */}
      <div
        className={[
          "fixed left-0 right-0 top-0 z-[30] pointer-events-none",
          transformClass,
        ].join(" ")}
        style={{
          /* top: 0 — do not pull gradient above the viewport (negative inset read as under notch). */
          top: 0,
          height: searchChrome
            ? searchBandHeight
            : "calc(66px + var(--safe-area-top-layout))",
          width: "100%",
          background: searchChrome
            ? "var(--app-canvas)"
            : "var(--gradient-from-top)",
          ...chromeTransformTransition,
        }}
      />

      {/* Wrapper: floating top bar + quick chips + filter popout */}
      <div
        ref={containerRef}
        className={[
          "fixed left-0 right-0 top-0 z-[31] pointer-events-none flex flex-col items-center",
          transformClass,
        ].join(" ")}
        style={{
          paddingTop: searchChrome || atTop
            ? "var(--safe-area-top-layout)"
            : "calc(8px + var(--safe-area-top-layout))",
          ...(searchChrome
            ? {
                transition: "none",
                transitionProperty: "none" as const,
                transitionDuration: "0ms",
              }
            : {
                transitionProperty: "transform, padding-top",
                transitionDuration: `${chromeMs}ms, ${COMPACT_MS}ms`,
                transitionTimingFunction: `${chromeEase}, ${COMPACT_EASING}`,
              }),
        }}
      >
        {/* Tour Step 2: smallest wrapper covering search + filter shortcut row */}
        <div
          data-tour-target="home-search-filters"
          className="flex w-full flex-col items-center"
        >
        {/* Main bar: at top = full-width flush; scrolled = pill (80%, rounded).
            Search: always full-width solid — snap, no compact→expanded animation. */}
        <div
          className="pointer-events-auto"
          style={{
            width: searchChrome || atTop ? "100%" : "80%",
            maxWidth: searchChrome || atTop ? "100vw" : TOP_BAR_MAX_WIDTH,
            transition: searchChrome ? "none" : compactShellTransition,
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        >
          <div
            className={[
              searchChrome
                ? "bg-[var(--app-canvas)]"
                : compactBlurActive
                  ? "backdrop-blur-[var(--glass-blur)]"
                  : "",
              /* Floating pill: same outer ring as bottom tab. Full-width / search: no outer ring. */
              searchChrome || atTop
                ? "border border-transparent shadow-none"
                : "border border-transparent shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
            ].join(" ")}
            style={{
              /* Full stadium pill when floated (radius ≥ half height); 24px was slightly shy on ~50px chrome. */
              borderRadius: searchChrome || atTop ? 0 : 9999,
              backgroundColor: searchChrome
                ? "var(--app-canvas)"
                : atTop
                  ? "transparent"
                  : "var(--glass-bg)",
              transition: searchChrome ? "none" : compactVisualTransition,
              ...(searchChrome
                ? {
                    backdropFilter: "none",
                    WebkitBackdropFilter: "none",
                    boxShadow: "none",
                  }
                : null),
              backfaceVisibility: "hidden",
            }}
          >
            <div className="py-[7px] px-[9px] flex items-center gap-2">
              {homePostSearchActive ? null : (
                <Logo size={28} onClick={onLogoClick} className="shrink-0" />
              )}
              <div className="relative flex items-center h-9 flex-1 rounded-full px-3 bg-transparent border border-[var(--border)] text-[var(--text)] focus-within:border-[color-mix(in_oklab,var(--text)_40%,transparent)] min-w-0">
                <PiMagnifyingGlass size={18} className="shrink-0" />
                <input
                  type="text"
                  data-home-search-input=""
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder={searchFieldPlaceholder}
                  className={`w-full pl-2 border-none text-[var(--text)] text-[16px] leading-none font-normal bg-transparent outline-none min-w-0 ${
                    search.trim() ? "pr-[2.125rem]" : "pr-2"
                  }`}
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  onPointerDown={() => onSearchInputPointerDown?.()}
                  onFocus={() => onSearchFocusChange?.(true)}
                  onBlur={() => onSearchFocusChange?.(false)}
                />
                {search.trim() ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className={[
                      /* h-9 field (36px): h-6 chip + right-1.5 (6px) = equal ~6px inset top/right/bottom */
                      "absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full p-0.5",
                      "border transition-[transform,box-shadow,background-color,border-color] active:scale-[0.96]",
                      /* Light: raised neutral chip */
                      "border-neutral-900/10 bg-[color-mix(in_oklab,#ffffff_92%,var(--surface-2))] text-neutral-700",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_6px_rgba(0,0,0,0.12),0_1px_0_rgba(0,0,0,0.04)]",
                      "hover:border-neutral-900/16 hover:bg-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_3px_10px_rgba(0,0,0,0.14)]",
                      /* Dark: soft lift + inner highlight */
                      "app-dark:border-white/14 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_55%,#1a1a1c)] app-dark:text-white/78",
                      "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_3px_10px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.06)]",
                      "app-dark:hover:border-white/22 app-dark:hover:bg-[color-mix(in_oklab,var(--surface-2)_70%,#222)] app-dark:hover:text-white/92",
                      "app-dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_14px_rgba(0,0,0,0.5)]",
                    ].join(" ")}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                    }}
                    onClick={() => {
                      onSearch("");
                    }}
                  >
                    <PiX className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
                  </button>
                ) : null}
              </div>
              {showPostFiltersChrome ? (
                <button
                  type="button"
                  aria-label="Open filters"
                  data-tour-target="home-filter-trigger"
                  onClick={onToggleFilters}
                  className="relative shrink-0 w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]"
                >
                  <PiSlidersHorizontal size={16} className="block" aria-hidden />
                  {hasActiveFilters && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--brand)]" />
                  )}
                </button>
              ) : null}
            </div>
            {showSearchKindToggle ? (
              <div className="flex justify-center px-[9px] pb-[6px] pt-0.5">
                <div
                  className="inline-flex items-center rounded-full border border-[var(--border)] p-[2px] gap-0.5 bg-[color-mix(in_oklab,var(--surface)_35%,transparent)]"
                  role="group"
                  aria-label="Search type"
                >
                  <button
                    type="button"
                    aria-pressed={searchMode === "posts"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSearchModeChange("posts")}
                    className={[
                      "rounded-full px-2.5 py-0.5 text-[9px] font-medium leading-none transition-colors",
                      searchMode === "posts"
                        ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-sm"
                        : "text-[var(--text)]/65 hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    Posts
                  </button>
                  <button
                    type="button"
                    aria-pressed={searchMode === "users"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSearchModeChange("users")}
                    className={[
                      "rounded-full px-2.5 py-0.5 text-[9px] font-medium leading-none transition-colors",
                      searchMode === "users"
                        ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-sm"
                        : "text-[var(--text)]/65 hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    Users
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Quick chips + optional Today-empty banner (hidden during Home post search mode) */}
        {!homePostSearchActive ? (
        <div
          data-tour-target="home-filter-shortcuts"
          className={[
            "pointer-events-auto mt-1 flex w-fit max-w-[calc(100vw-1.25rem)] flex-col items-center gap-1.5",
            "self-center",
          ].join(" ")}
        >
          <div
            data-tour-target="home-filters"
            className={[
              "inline-flex w-fit flex-nowrap items-stretch justify-center",
              "rounded-full",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              "border border-[var(--bottom-tab-border)]",
              "shadow-[0_2px_12px_rgba(0,0,0,0.10)]",
              "app-dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)]",
            ].join(" ")}
          >
            <div className="flex flex-nowrap items-center justify-center gap-1 p-1 min-w-0">
              <button
                type="button"
                aria-label="Open filters"
                aria-pressed={filtersOpen || undefined}
                onClick={onToggleFilters}
                className={shortcutEndCapClass({
                  active: nonShortcutFiltersActive,
                })}
              >
                <PiSlidersHorizontal size={11} className="block" aria-hidden />
                {nonShortcutFiltersActive ? (
                  <span
                    className="absolute -top-px -right-px h-1.5 w-1.5 rounded-full bg-[var(--brand)]"
                    aria-hidden
                  />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onToggleDateFilter("today")}
                className={chipButtonClass(todayActive)}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => onToggleTypeFilter("hangouts")}
                className={chipButtonClass(eventsSelected)}
              >
                Events
              </button>
              <button
                type="button"
                onClick={() => onToggleTypeFilter("experiences")}
                className={chipButtonClass(placesSelected)}
              >
                Posts
              </button>
              {hasActiveFilters ? (
                <button
                  type="button"
                  aria-label="Clear filters"
                  onClick={onClearAllFilters}
                  className={shortcutEndCapClass({ destructive: true })}
                >
                  <PiX size={11} strokeWidth={2.25} className="block" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
        ) : null}
        </div>

        {/* Filter popout: appears below quick chips */}
        {/* When closed: no extra gap. When open: 8px gap from chips. */}
        <div
          data-tour-target="home-filter-panel"
          className={[
            "w-[80%] pointer-events-auto overflow-hidden transition-all duration-300",
            "backdrop-blur-[var(--glass-blur)] backdrop-saturate-150",
            "bg-[color-mix(in_oklab,var(--bg)_78%,var(--glass-bg))]",
            "app-dark:bg-[color-mix(in_oklab,#0c0c0e_88%,var(--glass-bg))]",
            "border border-[color-mix(in_oklab,var(--bottom-tab-border)_85%,var(--text))]",
            "app-dark:border-white/16",
            "shadow-[0_8px_28px_rgba(0,0,0,0.22)] app-dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]",
            "rounded-2xl",
            filtersDrawerExpanded
              ? "max-h-[min(420px,72vh)] opacity-100 flex flex-col"
              : "max-h-0 opacity-0",
          ].join(" ")}
          style={{
            maxWidth: TOP_BAR_MAX_WIDTH,
            marginTop: filtersDrawerExpanded ? 8 : 0,
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div data-tour-target="home-filter-dates">
              <p className={drawerSectionLabelClass}>Date / Time</p>
              <div className="flex flex-wrap gap-1.5">
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
                      title={option.enabled ? undefined : "Coming soon"}
                      onClick={() => {
                        if (!option.enabled) return;
                        onToggleDateFilter(option.value);
                      }}
                      className={drawerChipButtonClass(isSelected, {
                        disabled: !option.enabled,
                      })}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={drawerSectionLabelClass}>Social</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleFriendsFilterClick}
                  className={drawerChipButtonClass(friendsFilter)}
                >
                  Friends
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTypeFilter("hangouts")}
                  className={drawerChipButtonClass(eventsSelected)}
                >
                  Events
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTypeFilter("experiences")}
                  className={drawerChipButtonClass(placesSelected)}
                >
                  Posts
                </button>
              </div>
            </div>

            <div className="pt-0.5">
              <button
                type="button"
                onClick={onClearAllFilters}
                className={[
                  "flex h-7 w-full items-center justify-center rounded-full px-4",
                  "text-[10px] font-medium leading-none tracking-tight",
                  "border border-rose-500/28 bg-rose-500/10 text-rose-700",
                  "transition-colors hover:bg-rose-500/16 hover:border-rose-500/38",
                  "app-dark:border-rose-400/24 app-dark:bg-rose-500/14 app-dark:text-rose-200",
                  "app-dark:hover:bg-rose-500/22 app-dark:hover:border-rose-400/34",
                ].join(" ")}
              >
                Clear all filters
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
