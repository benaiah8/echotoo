import { useEffect, useState } from "react";
import { FiSearch, FiFilter, FiSun, FiMoon } from "react-icons/fi";
import {
  getInitialTheme,
  toggleTheme,
  applyTheme,
  type Theme,
} from "../../lib/theme";
import ThemeSwitch from "../../components/ui/ThemeSwitch";
import Logo from "../../components/ui/Logo";

export default function HomeSearchSection({
  onSearch,
  onToggleFilters,
  hasActiveFilters = false,
  collapseFilters = false,
  onLogoClick,
  onFilterChange,
}: {
  onSearch?: (q: string) => void;
  onToggleFilters?: () => void;
  hasActiveFilters?: boolean;
  collapseFilters?: boolean;
  onLogoClick?: () => void;
  onFilterChange?: (filters: string[]) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  // ✅ UI-only chips
  const [selected, setSelected] = useState<string[]>([]);
  const items = [
    { label: "Friends", value: "friends" },
    { label: "Today", value: "today" },
    { label: "Anonymous", value: "anonymous" },
  ];
  const toggleFilterChip = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    setSelected(newSelected);
    onFilterChange?.(newSelected);
  };

  // ✅ theme state for icon
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    const t = getInitialTheme();
    setThemeState(t);
    applyTheme(t);
  }, []);
  const handleThemeToggle = () => setThemeState(toggleTheme());

  return (
    <div className="w-full h-fit flex flex-col">
      {/* Row 1: logo | search | filter (unchanged) */}
      <div className="flex items-center gap-2">
        <Logo size={28} onClick={onLogoClick} className="shrink-0" />

        <div className="relative flex items-center h-9 flex-1 rounded-xl px-3 bg-transparent border border-[var(--border)] text-[var(--text)] focus-within:border-[color-mix(in_oklab,var(--text)_40%,transparent)]">
          <FiSearch size={18} />
          <input
            type="text"
            placeholder="Where To?"
            className="w-full pl-2 pr-2 border-none text-[var(--text)] text-[10px] font-normal bg-transparent outline-none"
            value={searchQuery}
            onChange={(e) => {
              const q = e.target.value;
              setSearchQuery(q);
              onSearch?.(q);
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => onToggleFilters?.()}
          aria-label="Open filters"
          className="relative shrink-0 w-9 h-9 rounded-xl border border-[var(--border)] text-[var(--text)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]"
        >
          <FiFilter size={16} />
          {hasActiveFilters && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* Row 2: chips (left) | theme toggle (right) */}
      <div
        className={`flex w-full items-center gap-2 px-2 py-2 mt-1 rounded-xl overflow-x-auto scroll-hide transition-all duration-300 ${
          collapseFilters ? "max-h-0 opacity-0 py-0" : "max-h-14 opacity-100"
        }`}
      >
        <div className="flex gap-2">
          {items.map((item) => {
            const isSelected = selected.includes(item.value);
            return (
              <button
                key={item.value}
                onClick={() => toggleFilterChip(item.value)}
                className={`text-[10px] font-medium whitespace-nowrap px-2 py-1 rounded-full transition-all duration-200 ${
                  isSelected
                    ? "text-black bg-yellow-400" // Active state: full yellow background with black text
                    : "text-[var(--text)] border border-yellow-400 bg-transparent" // Inactive state: yellow border with transparent background
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* spacer pushes the toggle to the far right */}
        <div className="flex-1" />

        {/* theme toggle (right end) */}
        <ThemeSwitch />
      </div>
    </div>
  );
}
