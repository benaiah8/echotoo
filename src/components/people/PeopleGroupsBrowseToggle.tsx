/**
 * Compact New | Yours segmented control for Group Up.
 * Visual tokens match HomeTopBar compact filter chips (Today / Events / Posts).
 * Presentation only — parent owns browseTab and toggle.
 */
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

export type PeopleGroupsBrowseTab = "new" | "yours";

/**
 * Visible shell height: 4px pad + 18px chip + 4px pad.
 * Keep in sync with shell `p-1` + chip `h-[18px]`.
 */
export const PEOPLE_GROUPS_BROWSE_TOGGLE_H_PX = 26;

/**
 * Extra content clearance below the category nav for Groups:
 * 4px under-nav gap + shell height + 6px before first card.
 */
export const PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX =
  4 + PEOPLE_GROUPS_BROWSE_TOGGLE_H_PX + 6;

/**
 * Home-style glass capsule with equal 4px padding on all sides.
 * Hit targets overflow the shell and must not affect its box size.
 */
const SHELL_CLASS = [
  "relative inline-flex w-fit max-w-full flex-nowrap items-center justify-center gap-1",
  "overflow-visible rounded-full p-1",
  "border border-[var(--bottom-tab-border)]",
  "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
  "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
  "shadow-[0_2px_12px_rgba(0,0,0,0.10)]",
  "app-dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)]",
].join(" ");

/**
 * Home `chipButtonClass` visual (HomeTopBar) — 18px solid pills.
 * Selected: brand. Idle: dark (light theme) / near-white (dark theme).
 */
function chipVisualClass(isSelected: boolean): string {
  return [
    "relative z-[1] inline-flex items-center justify-center whitespace-nowrap rounded-full border-0",
    "text-[11px] font-semibold leading-none tracking-tight",
    "h-[18px] min-h-[18px] px-3 py-0",
    "transition-[transform,background-color,color,box-shadow] duration-200",
    "motion-reduce:transition-none",
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
}

/**
 * Layout size matches the visible chip only.
 * A centered absolute 44×44 layer expands the tap target without growing the capsule.
 */
const HIT_CLASS = [
  "relative z-0 inline-flex h-[18px] w-auto shrink-0 items-center justify-center",
  "border-0 bg-transparent p-0",
  "touch-manipulation active:scale-[0.96]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  "focus-visible:outline-[var(--brand)]",
].join(" ");

const HIT_EXPAND_CLASS =
  "pointer-events-auto absolute left-1/2 top-1/2 z-0 h-11 w-11 -translate-x-1/2 -translate-y-1/2";

export type PeopleGroupsBrowseToggleProps = {
  browseTab: PeopleGroupsBrowseTab;
  /** Existing Groups New ↔ Yours toggle (called only when selecting the other tab). */
  onToggle: () => void;
};

export default function PeopleGroupsBrowseToggle({
  browseTab,
  onToggle,
}: PeopleGroupsBrowseToggleProps) {
  const select = (tab: PeopleGroupsBrowseTab) => {
    if (tab === browseTab) return;
    onToggle();
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[32] flex justify-center px-[var(--people-feed-gutter,var(--gutter))]"
      style={{
        top: `calc(var(--safe-area-top-layout, 0px) + var(--people-feed-top-nav-safe-gap, 10px) + var(--people-feed-top-nav-h, 40px) + 4px)`,
      }}
      data-people-groups-browse-toggle="true"
      data-people-groups-browse-toggle-align="center"
      data-people-groups-yours-control="true"
      data-people-groups-yours-slot="under-nav-center"
      data-people-groups-browse-toggle-theme="home-filter-chips"
      data-people-groups-browse-toggle-pad="4"
    >
      <div
        role="tablist"
        aria-label={peopleUiCopy.shellGroups}
        className={`pointer-events-auto ${SHELL_CLASS}`}
        data-people-groups-browse-toggle-shell="true"
      >
        <button
          type="button"
          role="tab"
          aria-selected={browseTab === "new"}
          aria-label={peopleUiCopy.groupUpBrowseTabNew}
          data-people-groups-browse-tab="new"
          data-people-groups-browse-tab-active={
            browseTab === "new" ? "true" : "false"
          }
          className={HIT_CLASS}
          onClick={() => select("new")}
        >
          <span className={HIT_EXPAND_CLASS} aria-hidden data-people-groups-browse-hit="true" />
          <span
            className={chipVisualClass(browseTab === "new")}
            data-people-groups-browse-chip="true"
            aria-hidden
          >
            {peopleUiCopy.groupUpBrowseTabNew}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={browseTab === "yours"}
          aria-label={peopleUiCopy.groupUpYoursControlAria}
          data-people-groups-browse-tab="yours"
          data-people-groups-browse-tab-active={
            browseTab === "yours" ? "true" : "false"
          }
          data-people-groups-yours-active={
            browseTab === "yours" ? "true" : "false"
          }
          className={HIT_CLASS}
          onClick={() => select("yours")}
        >
          <span className={HIT_EXPAND_CLASS} aria-hidden data-people-groups-browse-hit="true" />
          <span
            className={chipVisualClass(browseTab === "yours")}
            data-people-groups-browse-chip="true"
            aria-hidden
          >
            {peopleUiCopy.groupUpBrowseTabYours}
          </span>
        </button>
      </div>
    </div>
  );
}
