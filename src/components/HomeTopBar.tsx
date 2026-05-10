import React from "react";
import {
  PiFunnelSimple,
  PiMagnifyingGlass,
  PiX,
} from "react-icons/pi";
import Logo from "./ui/Logo";
import HomeCategorySection from "../sections/home/HomeCategorySection";
import HomeViewToggleSection from "../sections/home/HomeViewToggleSection";

const TOP_BAR_MAX_WIDTH = 640;

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
  /** When true, hide the top bar (scroll down) */
  isHidden: boolean;
  /** When true (scrollY &lt; 5), main bar is full-width flush; when false, floating pill */
  atTop?: boolean;
  onToggleFilters: () => void;
  onLogoClick: () => void;
  onSearch: (q: string) => void;
  search: string;
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
}

export default function HomeTopBar({
  isHidden,
  atTop = false,
  onToggleFilters,
  onLogoClick,
  onSearch,
  search,
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
}: HomeTopBarProps) {
  const toggleFilterChip = (value: string) => {
    const newSelected = selectedFilters.includes(value)
      ? selectedFilters.filter((v) => v !== value)
      : [...selectedFilters, value];
    onFilterChange(newSelected);
  };

  const hidden = isHidden;
  const transitionClass = hidden
    ? "duration-75 ease-out"
    : "duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]";
  const transformClass = hidden
    ? "-translate-y-full scale-95 origin-top"
    : "translate-y-0 scale-100 origin-top";

  return (
    <>
      {/* Top gradient: solid at top → transparent (theme-aware via var) */}
      <div
        className={[
          "fixed left-0 right-0 top-0 z-[30] pointer-events-none",
          `transition-all ${transitionClass}`,
          transformClass,
        ].join(" ")}
        style={{
          /* top: 0 — do not pull gradient above the viewport (negative inset read as under notch). */
          top: 0,
          height: "calc(66px + var(--safe-area-top-layout))",
          width: "100%",
          background: "var(--gradient-from-top)",
        }}
      />

      {/* Wrapper: floating top bar + quick chips + filter popout */}
      <div
        className={[
          "fixed left-0 right-0 top-0 z-[31] pointer-events-none flex flex-col items-center",
          `transition-all ${transitionClass}`,
          transformClass,
        ].join(" ")}
        style={{
          paddingTop: atTop
            ? "var(--safe-area-top-layout)"
            : "calc(8px + var(--safe-area-top-layout))",
          transitionProperty: hidden ? undefined : "transform, padding-top",
          transitionDuration: hidden ? undefined : "300ms",
          transitionTimingFunction: hidden
            ? undefined
            : "cubic-bezier(0.33, 1, 0.68, 1)",
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
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder="Where To?"
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
          </div>
        </div>

        {/* Quick chips: compact shrink-to-content pill under search row (not full bar width) */}
        <div
          className={[
            "pointer-events-auto mt-1 w-fit max-w-[calc(100vw-1.25rem)]",
            "inline-flex flex-nowrap items-stretch justify-center self-center",
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
              onClick={() => toggleFilterChip("today")}
              className={chipButtonClass(selectedFilters.includes("today"))}
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

        {/* Filter popout: appears below quick chips */}
        {/* When closed: no extra gap. When open: 8px gap from chips. */}
        <div
          className={[
            "w-[80%] pointer-events-auto overflow-hidden transition-all duration-300",
            "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
            "border border-[var(--bottom-tab-border)]",
            "rounded-2xl",
            filtersOpen ? "max-h-[240px] opacity-100" : "max-h-0 opacity-0",
          ].join(" ")}
          style={{
            maxWidth: TOP_BAR_MAX_WIDTH,
            marginTop: filtersOpen ? 8 : 0,
          }}
        >
          <div className="p-3">
            <HomeCategorySection
              selected={selectedTags}
              onTagsChange={onTagsChange}
              onClear={onClearFilters}
            />
            <div className="pt-2">
              <HomeViewToggleSection
                viewMode={viewMode}
                setViewMode={setViewMode}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
