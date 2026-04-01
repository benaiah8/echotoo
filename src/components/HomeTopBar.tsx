import React, { useEffect } from "react";
import { PiDotsThree, PiFunnelSimple, PiMagnifyingGlass } from "react-icons/pi";
import Logo from "./ui/Logo";
import ThemeSwitch from "./ui/ThemeSwitch";
import HomeCategorySection from "../sections/home/HomeCategorySection";
import HomeViewToggleSection from "../sections/home/HomeViewToggleSection";

const TOP_BAR_MAX_WIDTH = 640;

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
}: HomeTopBarProps) {
  const [threeDotOpen, setThreeDotOpen] = React.useState(false);

  // Close three-dot when scroll hides the bar
  useEffect(() => {
    if (isHidden) setThreeDotOpen(false);
  }, [isHidden]);

  const toggleFilterChip = (value: string) => {
    const newSelected = selectedFilters.includes(value)
      ? selectedFilters.filter((v) => v !== value)
      : [...selectedFilters, value];
    onFilterChange(newSelected);
  };

  const filterItems = [
    { label: "Friends", value: "friends" },
    { label: "Today", value: "today" },
  ];

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
          top: "calc(-1px + -1 * env(safe-area-inset-top, 0px))",
          height: "calc(66px + env(safe-area-inset-top, 0px))",
          width: "100%",
          background: "var(--gradient-from-top)",
        }}
      />

      {/* Wrapper: floating top bar + filter popout + three-dot menu */}
      <div
        className={[
          "fixed left-0 right-0 top-0 z-[31] pointer-events-none flex flex-col items-center",
          `transition-all ${transitionClass}`,
          transformClass,
        ].join(" ")}
        style={{
          paddingTop: atTop
            ? "env(safe-area-inset-top, 0px)"
            : "calc(8px + env(safe-area-inset-top, 0px))",
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
              "border border-[var(--bottom-tab-border)]",
            ].join(" ")}
            style={{
              borderRadius: atTop ? 0 : 24,
              transition: "border-radius 300ms cubic-bezier(0.33, 1, 0.68, 1)",
              backfaceVisibility: "hidden",
            }}
          >
            <div className="py-[7px] px-[9px] flex items-center gap-2">
              <Logo size={28} onClick={onLogoClick} className="shrink-0" />
              <div className="relative flex items-center h-9 flex-1 rounded-full px-3 bg-transparent border border-[var(--border)] text-[var(--text)] focus-within:border-[color-mix(in_oklab,var(--text)_40%,transparent)] min-w-0">
                <PiMagnifyingGlass size={18} className="shrink-0" />
                <input
                  type="text"
                  placeholder="Where To?"
                  className="w-full pl-2 pr-2 border-none text-[var(--text)] text-[10px] font-normal bg-transparent outline-none min-w-0"
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                />
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

        {/* Filter popout: appears below main pill, pushes three-dot down when open */}
        {/* When closed: 2px gap. When open: 8px gap from main pill. */}
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

        {/* Three-dot: below filter popout; dots stay visible (z-10), pill opens below */}
        {/* When filter closed: 2px gap from main pill. When filter open: 8px from filter. */}
        <div
          className={[
            "pointer-events-auto flex flex-col items-center w-full relative",
            threeDotOpen ? "z-[50]" : "",
          ].join(" ")}
          style={{ marginTop: 0 }}
        >
          <button
            type="button"
            onClick={() => setThreeDotOpen((v) => !v)}
            aria-label={threeDotOpen ? "Close more options" : "More options"}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className={[
              "relative z-10 flex items-center justify-center h-4 px-1.5 py-0 text-[var(--text)] shrink-0 align-bottom",
              "focus:outline-none focus:ring-0 active:bg-transparent hover:bg-transparent",
            ].join(" ")}
          >
            <PiDotsThree size={22} />
          </button>
          {/* Pill: absolute, floats over content; scaleY animation (no overflow-hidden = no clip) */}
          <div
            className={[
              "absolute left-1/2 -translate-x-1/2 top-full -translate-y-[28px] w-fit",
              "origin-top transition-all duration-200 ease-out",
              threeDotOpen
                ? "scale-y-100 opacity-100"
                : "scale-y-0 opacity-0 pointer-events-none",
            ].join(" ")}
            style={{ top: "35px" }}
          >
            <div
              className={[
                "rounded-full",
                "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
                "border border-[var(--bottom-tab-border)]",
              ].join(" ")}
            >
              <div className="flex flex-nowrap items-center justify-center gap-2 px-[9px] py-[7px]">
                {filterItems.map((item) => {
                  const isSelected = selectedFilters.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => toggleFilterChip(item.value)}
                      className={`shrink-0 text-[10px] font-medium whitespace-nowrap rounded-full px-2 py-1 transition-all duration-200 ${
                        isSelected
                          ? "text-black bg-yellow-400"
                          : "text-[var(--text)] border border-yellow-400 bg-transparent"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
                <ThemeSwitch className="shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
