/**
 * Create finalize: Date / Visibility / RSVP pills + single shared panel.
 * Matches CreateActivityDetailSection add-on pills (white on dark, neutral on light).
 */
import { useState, type ReactNode } from "react";
import { PiCalendar, PiEye, PiUsers } from "react-icons/pi";

export type FinalizeMetaPanelKey = "date" | "visibility" | "rsvp";

/** Same idea as Activities “Location / Images / More details” row */
const ADDON_TAB_BASE =
  "relative flex h-9 min-h-0 min-w-0 items-center justify-between gap-1 rounded-full border-0 px-2.5 py-1.5 text-left " +
  "bg-white text-neutral-950 shadow-sm transition-transform duration-200 ease-out " +
  "hover:bg-neutral-100 active:scale-[0.99] " +
  "dark:bg-white dark:text-neutral-950 dark:shadow-[0_1px_8px_rgba(0,0,0,0.35)] dark:hover:bg-neutral-100";

/** Date + Visibility panels: strong white frame on dark (matches Activities composer card) */
const PANEL_CLASS_DATE_VISIBILITY =
  "rounded-xl border border-[var(--border)]/55 bg-[var(--surface)]/24 p-3 " +
  "shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_18%,transparent),0_2px_14px_rgba(0,0,0,0.05)] " +
  "dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_12%,transparent)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]";

/** RSVP panel: slightly softer chrome when expanded */
const PANEL_CLASS_RSVP =
  "rounded-xl border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] p-3 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:border-white/22 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

export type CreateFinalizeMetadataRowProps = {
  hasSchedule: boolean;
  visibilityShort: string;
  rsvpPillEnd: ReactNode;
  /** When true (hangout + RSVP on), emphasize the RSVP pill with a visible ring */
  rsvpEnabled?: boolean;
  datePanel: ReactNode;
  visibilityPanel: ReactNode;
  rsvpPanel: ReactNode;
};

export default function CreateFinalizeMetadataRow({
  hasSchedule,
  visibilityShort,
  rsvpPillEnd,
  rsvpEnabled = false,
  datePanel,
  visibilityPanel,
  rsvpPanel,
}: CreateFinalizeMetadataRowProps) {
  const [panel, setPanel] = useState<FinalizeMetaPanelKey | null>(null);

  const toggle = (key: FinalizeMetaPanelKey) => {
    const ae = document.activeElement;
    if (ae instanceof HTMLElement) ae.blur();
    setPanel((p) => (p === key ? null : key));
  };

  const finalizeTabClass = (key: FinalizeMetaPanelKey) => {
    const selected = panel === key;
    const anyOpen = panel !== null;
    const scale =
      selected && anyOpen
        ? "z-10 scale-[1.06] shadow-md dark:shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
        : anyOpen
        ? "scale-[0.96] opacity-[0.88]"
        : "";
    const rsvpOnRing =
      key === "rsvp" && rsvpEnabled
        ? "ring-2 ring-neutral-900/85 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-950"
        : "";
    return [ADDON_TAB_BASE, scale, rsvpOnRing].filter(Boolean).join(" ");
  };

  return (
    <div className="w-full">
      <div
        className="grid grid-cols-3 gap-1.5"
        role="tablist"
        aria-label="Post metadata"
      >
        <button
          type="button"
          role="tab"
          aria-selected={panel === "date"}
          className={finalizeTabClass("date")}
          onClick={() => toggle("date")}
        >
          <span className="flex min-w-0 items-center gap-1">
            <PiCalendar
              className="h-3.5 w-3.5 shrink-0 text-neutral-950"
              aria-hidden
            />
            <span className="truncate text-[11px] font-semibold leading-none text-neutral-950 sm:text-[12px]">
              Date
            </span>
          </span>
          {hasSchedule ? (
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
              role="img"
              aria-label="Schedule set"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-950 ring-1 ring-neutral-950/15" />
            </span>
          ) : (
            <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={panel === "visibility"}
          className={finalizeTabClass("visibility")}
          onClick={() => toggle("visibility")}
        >
          <span className="flex min-w-0 items-center gap-1">
            <PiEye
              className="h-3.5 w-3.5 shrink-0 text-neutral-950"
              aria-hidden
            />
            <span className="truncate text-[10px] font-semibold leading-tight text-neutral-950 sm:text-[11px]">
              Visibility
            </span>
          </span>
          <span className="max-w-[3.25rem] truncate text-[9px] font-semibold leading-none text-neutral-950/75 sm:max-w-[4rem] sm:text-[10px]">
            {visibilityShort}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={panel === "rsvp"}
          className={finalizeTabClass("rsvp")}
          onClick={() => toggle("rsvp")}
        >
          <span className="flex min-w-0 items-center gap-1">
            <PiUsers
              className="h-3.5 w-3.5 shrink-0 text-neutral-950"
              aria-hidden
            />
            <span className="truncate text-[11px] font-semibold leading-none text-neutral-950 sm:text-[12px]">
              RSVP
            </span>
          </span>
          {rsvpPillEnd}
        </button>
      </div>

      {panel !== null && (
        <div
          className={`mt-2 w-full ${
            panel === "rsvp" ? PANEL_CLASS_RSVP : PANEL_CLASS_DATE_VISIBILITY
          }`}
        >
          {panel === "date" && datePanel}
          {panel === "visibility" && visibilityPanel}
          {panel === "rsvp" && rsvpPanel}
        </div>
      )}
    </div>
  );
}
