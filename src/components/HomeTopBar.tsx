import React from "react";
import {
  PiFunnelSimple,
  PiMagnifyingGlass,
  PiX,
} from "react-icons/pi";
import Logo from "./ui/Logo";
import HomeCategorySection from "../sections/home/HomeCategorySection";

const TOP_BAR_MAX_WIDTH = 640;

/** Chrome slide: slower hide (slide off), quicker show (settle in). */
const CHROME_HIDE_MS = 620;
const CHROME_SHOW_MS = 340;
const CHROME_HIDE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const CHROME_SHOW_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Solid chip pills for readability over feed imagery.
 * Inactive: dark (light theme) / near-white (dark theme). Selected: brand yellow + ink text.
 */
const chipButtonClass = (isSelected: boolean) =>
  [
    "shrink-0 inline-flex items-center justify-center whitespace-nowrap rounded-full border-0",
    "text-[9px] font-medium leading-none tracking-tight",
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
  /** When true, show Posts / Users toggle under the search field. */
  showSearchKindToggle: boolean;
  searchFieldPlaceholder: string;
  hasActiveFilters: boolean;
  filtersOpen: boolean;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  onClearFilters: () => void;
  viewMode: "all" | "hangouts" | "experiences";
  setViewMode: (m: "all" | "hangouts" | "experiences") => void;
  selectedFilters: string[];
  onFilterChange: (filters: string[]) => void;
  /** Fires when the main search field gains/loses focus (keyboard / IME). Used to pin the bar on native + web. */
  onSearchFocusChange?: (focused: boolean) => void;
  /** Inline notice below quick chips when Today filter matches nothing on the current rail slice (client-side). */
  noTodayInlineBannerVisible?: boolean;
  /** Preflight before activating Today (inactive chip only). Active Today still uses onFilterChange to remove. */
  onTodayChipClick?: () => void;
  /** Dim/disable Today while preflight fetch runs */
  todayPreflightPending?: boolean;
  /** Inline notice below quick chips when Friends preflight finds no matches (client-side). */
  noFriendsInlineBannerVisible?: boolean;
  /** Preflight before activating Friends (inactive chip only). Active Friends still uses onFilterChange to remove. */
  onFriendsChipClick?: () => void;
  /** Dim/disable Friends while preflight fetch runs */
  friendsPreflightPending?: boolean;
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
  searchFieldPlaceholder,
  hasActiveFilters,
  filtersOpen,
  selectedTags,
  onTagsChange,
  onClearFilters,
  viewMode,
  setViewMode,
  selectedFilters,
  onFilterChange,
  onSearchFocusChange,
  noTodayInlineBannerVisible = false,
  onTodayChipClick,
  todayPreflightPending = false,
  noFriendsInlineBannerVisible = false,
  onFriendsChipClick,
  friendsPreflightPending = false,
}: HomeTopBarProps) {
  const handleTodayChipClick = () => {
    if (selectedFilters.includes("today")) {
      onFilterChange(selectedFilters.filter((v) => v !== "today"));
      return;
    }
    if (todayPreflightPending) return;
    onTodayChipClick?.();
  };

  /** Visual only: match banner during empty preflight without putting "today" in selectedFilters. */
  const todayIsVisuallyActive =
    selectedFilters.includes("today") || noTodayInlineBannerVisible;

  const friendsFilterActive = selectedFilters.includes("friends");
  /** Visual only: match banner during empty Friends preflight without putting "friends" in selectedFilters. */
  const friendsIsVisuallyActive =
    friendsFilterActive || noFriendsInlineBannerVisible;

  const handleFriendsFilterClick = () => {
    if (friendsFilterActive) {
      onFilterChange(selectedFilters.filter((f) => f !== "friends"));
      return;
    }
    if (friendsPreflightPending) return;
    onFriendsChipClick?.();
  };

  const hidden = isHidden;
  /** Duration/easing follow `hidden` so hiding uses a longer window than showing. */
  const chromeMs = hidden ? CHROME_HIDE_MS : CHROME_SHOW_MS;
  const chromeEase = hidden ? CHROME_HIDE_EASING : CHROME_SHOW_EASING;
  const transformClass = hidden
    ? "-translate-y-[110%] scale-[0.98] origin-top"
    : "translate-y-0 scale-100 origin-top";

  const chromeTransformTransition = {
    transitionProperty: "transform" as const,
    transitionDuration: `${chromeMs}ms`,
    transitionTimingFunction: chromeEase,
  };

  return (
    <>
      {/* Top gradient: solid at top → transparent (theme-aware via var) */}
      <div
        className={[
          "fixed left-0 right-0 top-0 z-[30] pointer-events-none",
          transformClass,
        ].join(" ")}
        style={{
          /* top: 0 — do not pull gradient above the viewport (negative inset read as under notch). */
          top: 0,
          height: "calc(66px + var(--safe-area-top-layout))",
          width: "100%",
          background: "var(--gradient-from-top)",
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
          paddingTop: atTop
            ? "var(--safe-area-top-layout)"
            : "calc(8px + var(--safe-area-top-layout))",
          transitionProperty: "transform, padding-top",
          transitionDuration: `${chromeMs}ms`,
          transitionTimingFunction: chromeEase,
        }}
      >
        {/* Main bar: at top = full-width flush; scrolled = pill (80%, rounded) */}
        <div
          className="pointer-events-auto"
          style={{
            width: atTop ? "100%" : "80%",
            maxWidth: atTop ? "100vw" : TOP_BAR_MAX_WIDTH,
            transition:
              "width 300ms cubic-bezier(0.33, 1, 0.68, 1), max-width 300ms cubic-bezier(0.33, 1, 0.68, 1)",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        >
          <div
            className={[
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              /* Floating pill: same outer ring as bottom tab. Full-width: subtle hairline only. */
              atTop
                ? "border border-[var(--bottom-tab-border)] shadow-none"
                : "border border-transparent shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
            ].join(" ")}
            style={{
              borderRadius: atTop ? 0 : 24,
              transition:
                "border-radius 300ms cubic-bezier(0.33, 1, 0.68, 1), box-shadow 300ms cubic-bezier(0.33, 1, 0.68, 1)",
              backfaceVisibility: "hidden",
            }}
          >
            <div className="py-[7px] px-[9px] flex items-center gap-2">
              <Logo size={28} onClick={onLogoClick} className="shrink-0" />
              <div className="relative flex items-center h-9 flex-1 rounded-full px-3 bg-transparent border border-[var(--border)] text-[var(--text)] focus-within:border-[color-mix(in_oklab,var(--text)_40%,transparent)] min-w-0">
                <PiMagnifyingGlass size={18} className="shrink-0" />
                <input
                  type="text"
                  data-home-search-input=""
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder={searchFieldPlaceholder}
                  className={`w-full pl-2 border-none text-[var(--text)] text-[10px] font-normal bg-transparent outline-none min-w-0 ${
                    search.trim() ? "pr-[2.125rem]" : "pr-2"
                  }`}
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
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
              <button
                type="button"
                onClick={onToggleFilters}
                aria-label="Open filters"
                className="relative shrink-0 w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]"
              >
                <PiFunnelSimple size={16} />
                {hasActiveFilters && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--brand)]" />
                )}
              </button>
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

        {/* Quick chips + optional Today-empty banner: one centered shrink-to-content column */}
        <div
          className={[
            "pointer-events-auto mt-1 flex w-fit max-w-[calc(100vw-1.25rem)] flex-col items-center gap-1.5",
            "self-center",
          ].join(" ")}
        >
          <div
            className={[
              "inline-flex w-fit flex-nowrap items-stretch justify-center",
              "rounded-full",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              "border border-[var(--bottom-tab-border)]",
              "shadow-[0_2px_12px_rgba(0,0,0,0.10)]",
              "app-dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)]",
            ].join(" ")}
          >
            <div className="flex flex-nowrap items-center justify-center gap-0.5 px-1 py-1 min-w-0">
              <button
                type="button"
                onClick={handleTodayChipClick}
                disabled={todayPreflightPending}
                aria-busy={todayPreflightPending || undefined}
                className={[
                  chipButtonClass(todayIsVisuallyActive),
                  todayPreflightPending
                    ? "opacity-60 pointer-events-none"
                    : "",
                ].join(" ")}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() =>
                  setViewMode(viewMode === "hangouts" ? "all" : "hangouts")
                }
                className={chipButtonClass(viewMode === "hangouts")}
              >
                Hangouts
              </button>
              <button
                type="button"
                onClick={() =>
                  setViewMode(viewMode === "experiences" ? "all" : "experiences")
                }
                className={chipButtonClass(viewMode === "experiences")}
              >
                Experiences
              </button>
            </div>
          </div>

          {noTodayInlineBannerVisible ? (
            <div
              className={[
                "w-full rounded-xl px-3 py-1.5",
                "bg-[var(--brand)] text-[var(--brand-ink)]",
                "text-[10px] font-medium leading-snug text-center tracking-tight",
                "shadow-[0_2px_10px_rgba(0,0,0,0.18)]",
                "border border-[color-mix(in_oklab,var(--brand-ink)_18%,transparent)]",
              ].join(" ")}
              role="status"
            >
              Nothing happening today
            </div>
          ) : null}
          {noFriendsInlineBannerVisible ? (
            <div
              className={[
                "w-full rounded-xl px-3 py-1.5",
                "bg-[var(--brand)] text-[var(--brand-ink)]",
                "text-[10px] font-medium leading-snug text-center tracking-tight",
                "shadow-[0_2px_10px_rgba(0,0,0,0.18)]",
                "border border-[color-mix(in_oklab,var(--brand-ink)_18%,transparent)]",
              ].join(" ")}
              role="status"
            >
              No friends posts yet
            </div>
          ) : null}
        </div>

        {/* Filter popout: appears below quick chips */}
        {/* When closed: no extra gap. When open: 8px gap from chips. */}
        <div
          className={[
            "w-[80%] pointer-events-auto overflow-hidden transition-all duration-300",
            "bg-[color-mix(in_oklab,var(--glass-bg)_88%,var(--bg))] backdrop-blur-[var(--glass-blur)]",
            "border border-[var(--bottom-tab-border)]",
            "shadow-[0_6px_18px_rgba(0,0,0,0.16)] app-dark:shadow-[0_10px_22px_rgba(0,0,0,0.36)]",
            "rounded-2xl",
            filtersOpen
              ? "max-h-[240px] opacity-100 flex flex-col"
              : "max-h-0 opacity-0",
          ].join(" ")}
          style={{
            maxWidth: TOP_BAR_MAX_WIDTH,
            marginTop: filtersOpen ? 8 : 0,
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div>
              <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-[var(--text)]/65">
                Popular tags
              </p>
              <HomeCategorySection
                selected={selectedTags}
                onTagsChange={onTagsChange}
                onClear={onClearFilters}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-[var(--text)]/65">
                Social
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleFriendsFilterClick}
                  disabled={friendsPreflightPending}
                  aria-busy={friendsPreflightPending || undefined}
                  className={`py-1 px-3 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap border ${
                    friendsIsVisuallyActive
                      ? "bg-[var(--brand)] text-[var(--brand-ink)] border-[color-mix(in_oklab,var(--brand-ink)_22%,transparent)] shadow-[var(--glass-active-shadow)]"
                      : "text-[var(--text)] bg-transparent border-white/25 hover:bg-[rgba(255,255,255,0.08)]"
                  } ${friendsPreflightPending ? "opacity-60 pointer-events-none" : ""}`}
                >
                  Friends
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
