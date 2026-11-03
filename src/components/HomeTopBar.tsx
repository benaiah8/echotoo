import React, { useEffect, useRef, useState } from "react";
import {
  PiMagnifyingGlass,
  PiSlidersHorizontal,
  PiX,
} from "react-icons/pi";
import Logo from "./ui/Logo";
import HomeFiltersOverlay from "./home/HomeFiltersOverlay";
import {
  buildHomeCompactFilterBarChips,
  hasNonShortcutHomeFilters,
  type HomeDateFilter,
  type HomeDateFilterChip,
  type HomeViewMode,
} from "../lib/homeVerticalFilters";

const TOP_BAR_MAX_WIDTH = 640;
/** Compact filter pill max width (initial + sticky). Search bar keeps its own sizing. */
const FILTER_BAR_MAX_WIDTH = "min(475px, 75vw)";

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

/**
 * Solid circular end caps: near page --bg so they blend in light/dark.
 * No outline; equal size; icon centered.
 */
const filterBarEndCapClass = (opts?: {
  active?: boolean;
  destructive?: boolean;
}) => {
  const active = opts?.active === true;
  const destructive = opts?.destructive === true;
  return [
    "relative z-[2] shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border-0 p-0",
    "transition-[transform,background-color,color] duration-200 active:scale-[0.96]",
    "motion-reduce:transition-none",
    destructive
      ? [
          "bg-[color-mix(in_oklab,var(--bg)_88%,#e11d48)] text-rose-800",
          "hover:bg-[color-mix(in_oklab,var(--bg)_78%,#e11d48)] hover:text-rose-900",
          "app-dark:text-rose-200/90 app-dark:hover:text-rose-100",
        ].join(" ")
      : active
        ? [
            "bg-[color-mix(in_oklab,var(--bg)_82%,var(--brand))] text-[var(--text)]",
            "hover:bg-[color-mix(in_oklab,var(--bg)_72%,var(--brand))]",
          ].join(" ")
        : [
            "bg-[var(--bg)] text-[var(--text)]/78",
            "hover:bg-[color-mix(in_oklab,var(--text)_8%,var(--bg))] hover:text-[var(--text)]",
          ].join(" "),
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
  /** Close full-screen filters without toggling (X / Escape / Android back). */
  onCloseFilters: () => void;
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
  customOccursOn: string | null;
  onToggleDateFilter: (target: HomeDateFilterChip) => void;
  onSelectCustomDate: (occursOn: string) => void;
  onToggleCustomDate: (occursOn: string) => void;
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
  homeRefreshEpoch?: number;
}

export default function HomeTopBar({
  containerRef,
  isHidden,
  atTop = false,
  onToggleFilters,
  onCloseFilters,
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
  customOccursOn,
  onToggleDateFilter,
  onSelectCustomDate,
  onToggleCustomDate,
  onToggleTypeFilter,
  friendsFilter,
  onToggleFriends,
  onSearchFocusChange,
  onSearchInputPointerDown,
  onClearAllFilters,
  selectedTags = [],
  homeRefreshEpoch = 0,
}: HomeTopBarProps) {
  const compactFilterChips = buildHomeCompactFilterBarChips({
    dateFilter,
    customOccursOn,
    viewMode,
    friendsFilter,
  });
  /** Search/tags only — date & Friends are visible chips in the bar. */
  const nonShortcutFiltersActive = hasNonShortcutHomeFilters({
    dateFilter,
    typeFilter: viewMode,
    friendsFilter,
    search,
    selectedTags,
  });

  const chipTrackRef = useRef<HTMLDivElement | null>(null);
  /** Keep newly active (left-grouped) chips visible after reorder. */
  useEffect(() => {
    const track = chipTrackRef.current;
    if (!track) return;
    track.scrollLeft = 0;
  }, [dateFilter, customOccursOn, viewMode, friendsFilter]);

  const showPostFiltersChrome =
    !homePostSearchActive || searchMode === "posts";
  const filtersOverlayOpen = filtersOpen && showPostFiltersChrome;

  const handleCompactChipClick = (
    chip: (typeof compactFilterChips)[number],
  ) => {
    switch (chip.kind) {
      case "today":
      case "date":
        if (chip.customOccursOn) {
          onToggleCustomDate(chip.customOccursOn);
        } else if (chip.dateTarget) {
          onToggleDateFilter(chip.dateTarget);
        }
        break;
      case "events":
        onToggleTypeFilter("hangouts");
        break;
      case "posts":
        onToggleTypeFilter("experiences");
        break;
      case "friends":
        onToggleFriends();
        break;
      default:
        break;
    }
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

        {/* Compact filter pill: fixed ends + horizontally scrolling chips */}
        {!homePostSearchActive ? (
        <div
          data-tour-target="home-filter-shortcuts"
          className="pointer-events-auto mt-1 flex w-fit flex-col items-center self-center"
          style={{ maxWidth: FILTER_BAR_MAX_WIDTH }}
        >
          <div
            data-tour-target="home-filters"
            className={[
              "relative inline-flex w-fit max-w-full flex-nowrap items-center",
              "rounded-full",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              "border border-[var(--bottom-tab-border)]",
              "shadow-[0_2px_12px_rgba(0,0,0,0.10)]",
              "app-dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)]",
            ].join(" ")}
          >
            {/* Left fixed filter control — masks scrolling chips */}
            <div
              className={[
                "relative z-[2] flex shrink-0 items-center self-stretch p-0.5",
                "rounded-l-full bg-[var(--glass-bg)]",
              ].join(" ")}
            >
              <button
                type="button"
                aria-label="Open filters"
                aria-pressed={filtersOpen || undefined}
                onClick={onToggleFilters}
                className={filterBarEndCapClass({
                  active: nonShortcutFiltersActive || filtersOpen,
                })}
              >
                <PiSlidersHorizontal size={13} className="block" aria-hidden />
                {nonShortcutFiltersActive ? (
                  <span
                    className="absolute -top-px -right-px h-1.5 w-1.5 rounded-full bg-[var(--brand)]"
                    aria-hidden
                  />
                ) : null}
              </button>
            </div>

            {/* Middle chip track — only region that scrolls horizontally */}
            <div
              ref={chipTrackRef}
              data-home-filter-chip-track=""
              className={[
                "min-w-0 flex-1 overflow-x-auto overflow-y-hidden scroll-hide",
                "[-webkit-overflow-scrolling:touch] [touch-action:pan-x]",
                "[overscroll-behavior-x:contain]",
                /* Soft edge fade so chips tuck under circular end caps */
                "[mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-8px),transparent_100%)]",
                "[-webkit-mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-8px),transparent_100%)]",
              ].join(" ")}
            >
              <div className="flex w-max flex-nowrap items-center gap-1 px-0.5 py-0.5">
                {compactFilterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => handleCompactChipClick(chip)}
                    className={chipButtonClass(chip.active)}
                    aria-pressed={chip.active || undefined}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right fixed clear — masks scrolling chips; only when filters active */}
            {hasActiveFilters ? (
              <div
                className={[
                  "relative z-[2] flex shrink-0 items-center self-stretch p-0.5",
                  "rounded-r-full bg-[var(--glass-bg)]",
                ].join(" ")}
              >
                <button
                  type="button"
                  aria-label="Clear filters"
                  onClick={onClearAllFilters}
                  className={filterBarEndCapClass({ destructive: true })}
                >
                  <PiX
                    size={13}
                    strokeWidth={2.25}
                    className="block"
                    aria-hidden
                  />
                </button>
              </div>
            ) : (
              <div
                className="shrink-0 self-stretch rounded-r-full bg-[var(--glass-bg)] p-0.5"
                aria-hidden
              />
            )}
          </div>
        </div>
        ) : null}
        </div>

        <HomeFiltersOverlay
          open={filtersOverlayOpen}
          onClose={onCloseFilters}
          viewMode={viewMode}
          dateFilter={dateFilter}
          customOccursOn={customOccursOn}
          friendsFilter={friendsFilter}
          hasActiveFilters={hasActiveFilters}
          onToggleDateFilter={onToggleDateFilter}
          onSelectCustomDate={onSelectCustomDate}
          onToggleTypeFilter={onToggleTypeFilter}
          onToggleFriends={onToggleFriends}
          onClearAllFilters={onClearAllFilters}
          homeRefreshEpoch={homeRefreshEpoch}
        />
      </div>
    </>
  );
}
