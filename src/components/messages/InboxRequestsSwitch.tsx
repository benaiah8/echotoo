/**
 * Centered Messages controls under the top bar:
 * [Inbox] [Requests] [All] [DMs] [Groups]
 * Separate subtle pills — same height, no outer container.
 *
 * Visible chrome is 36px. The button is 44px tall and only as wide as that
 * chrome, so the extra tap area is vertical and does not cross the 4px gap.
 */

import { PiDotsNine, PiUser, PiUsers } from "react-icons/pi";

export type MessagesInboxTab = "inbox" | "requests";
export type MessagesKindFilter = "all" | "dms" | "groups";

type Props = {
  tab: MessagesInboxTab;
  onTabChange: (next: MessagesInboxTab) => void;
  kindFilter: MessagesKindFilter;
  onKindFilterChange: (next: MessagesKindFilter) => void;
  /** When Requests is active, kind icons stay visible but muted/disabled. */
  kindFiltersDisabled?: boolean;
  /** Future anti-spam badge; falsy → omit. */
  requestsBadge?: number | boolean;
};

/** Visible pill / circle. */
const VISIBLE_H = "h-9";
/** Vertical tap target. Width stays on the visible control. */
const HIT_H = "h-11";

const hitButtonBase = [
  HIT_H,
  "inline-flex shrink-0 items-center justify-center bg-transparent p-0",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]",
].join(" ");

const tabPillVisual = [
  VISIBLE_H,
  "inline-flex items-center justify-center gap-0.5 rounded-full px-2.5",
  "whitespace-nowrap text-[12px] font-medium leading-snug tracking-tight",
  "border transition-[color,background-color,border-color,opacity]",
].join(" ");

/** Active: soft elevated gray chip — no amber fill. */
const tabPillActive =
  "border-[var(--text)]/28 bg-[var(--text)]/[0.16] text-[var(--text)]/92 app-dark:border-white/28 app-dark:bg-white/[0.16] app-dark:text-white/92";

/** Idle: quiet outline, a bit more readable than ghost. */
const tabPillIdle =
  "border-[var(--text)]/16 bg-[var(--text)]/[0.04] text-[var(--text)]/58 hover:border-[var(--text)]/24 hover:bg-[var(--text)]/[0.08] hover:text-[var(--text)]/78 app-dark:border-white/18 app-dark:bg-white/[0.05] app-dark:text-white/58 app-dark:hover:border-white/26 app-dark:hover:bg-white/[0.10] app-dark:hover:text-white/80";

const iconVisual = [
  VISIBLE_H,
  "flex w-9 shrink-0 items-center justify-center rounded-full border",
  "transition-[color,background-color,border-color,opacity]",
].join(" ");

const iconChipActive = tabPillActive;
const iconChipIdle = tabPillIdle;

const KIND_ICONS: {
  id: MessagesKindFilter;
  label: string;
  Icon: typeof PiDotsNine;
}[] = [
  { id: "all", label: "All chats", Icon: PiDotsNine },
  { id: "dms", label: "DMs", Icon: PiUser },
  { id: "groups", label: "Groups", Icon: PiUsers },
];

export default function InboxRequestsSwitch({
  tab,
  onTabChange,
  kindFilter,
  onKindFilterChange,
  kindFiltersDisabled = false,
  requestsBadge,
}: Props) {
  const showBadge =
    requestsBadge === true ||
    (typeof requestsBadge === "number" && requestsBadge > 0);

  const badgeLabel =
    typeof requestsBadge === "number"
      ? requestsBadge > 99
        ? "99+"
        : String(requestsBadge)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-nowrap items-center justify-center gap-1 pt-3">
      <div
        role="tablist"
        aria-label="Messages views"
        className="flex shrink-0 flex-nowrap items-center gap-1 overflow-visible"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inbox"}
          onClick={() => onTabChange("inbox")}
          className={hitButtonBase}
        >
          <span
            className={`${tabPillVisual} ${
              tab === "inbox" ? tabPillActive : tabPillIdle
            }`}
          >
            Inbox
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "requests"}
          onClick={() => onTabChange("requests")}
          className={hitButtonBase}
          aria-label={
            showBadge && badgeLabel
              ? `Requests, ${badgeLabel} unread`
              : showBadge
                ? "Requests, unread"
                : undefined
          }
        >
          <span
            className={`relative ${tabPillVisual} ${
              tab === "requests" ? tabPillActive : tabPillIdle
            }`}
          >
            Requests
            {showBadge ? (
              <span
                className={[
                  "pointer-events-none absolute -right-0.5 -top-1 z-[1]",
                  "inline-flex h-[15px] min-w-[15px] items-center justify-center",
                  "rounded-full bg-amber-400 px-[3px]",
                  "text-[9px] font-bold leading-none tabular-nums text-neutral-900",
                  "ring-1 ring-[var(--bg)]",
                  "app-dark:bg-amber-400 app-dark:text-neutral-900",
                ].join(" ")}
                aria-hidden
              >
                {badgeLabel ?? ""}
              </span>
            ) : null}
          </span>
        </button>
      </div>

      <div
        className={[
          "flex shrink-0 flex-nowrap items-center gap-1",
          kindFiltersDisabled ? "opacity-35" : "",
        ].join(" ")}
        role="toolbar"
        aria-label="Filter conversations by type"
        aria-disabled={kindFiltersDisabled || undefined}
      >
        {KIND_ICONS.map(({ id, label, Icon }) => {
          const active = kindFilter === id;
          return (
            <button
              key={id}
              type="button"
              disabled={kindFiltersDisabled}
              aria-pressed={active}
              aria-label={label}
              title={label}
              onClick={() => {
                if (!kindFiltersDisabled) onKindFilterChange(id);
              }}
              className={[
                hitButtonBase,
                "w-9",
                kindFiltersDisabled ? "pointer-events-none" : "",
              ].join(" ")}
            >
              <span
                className={[
                  iconVisual,
                  active ? iconChipActive : iconChipIdle,
                ].join(" ")}
              >
                <Icon size={14} aria-hidden className="opacity-90" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
