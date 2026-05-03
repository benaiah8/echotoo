/**
 * Create finalize: Date / View / RSVP / Rate pills + single shared panel.
 * Pill chrome uses `create-meta-pill` + --create-meta-pill-* (see index.css).
 */
import { useState, type ReactNode } from "react";
import { PiCalendar, PiEye, PiStar, PiUsers } from "react-icons/pi";

export type FinalizeMetaPanelKey = "date" | "visibility" | "rsvp" | "rate";

/** ~8% shorter than h-8 / h-9; extra horizontal inset so labels/endcaps aren’t flush to the rim. */
const META_TAB_LAYOUT =
  "create-meta-pill relative flex h-[29px] min-h-[29px] min-w-0 items-center gap-0.5 rounded-full px-2.5 py-0.5 text-left sm:h-[33px] sm:min-h-[33px] sm:gap-1 sm:px-3 sm:py-1";

const PILL_LABEL_CLUSTER =
  "flex min-w-0 flex-1 items-center gap-0.5 sm:gap-0.5";

/** Date + Visibility panels (frame matches Activities composer card) */
const PANEL_CLASS_DATE_VISIBILITY =
  "rounded-[var(--create-radius-panel)] border-2 border-[var(--create-border-frame)] bg-white/95 p-3 " +
  "shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_12%,transparent),0_2px_14px_rgba(0,0,0,0.05)] " +
  "app-dark:bg-[color-mix(in_oklab,var(--surface)_12%,transparent)] app-dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]";

/** RSVP / Rate panels: slightly softer frame when expanded */
const PANEL_CLASS_SECONDARY =
  "rounded-[var(--create-radius-panel)] border-2 border-[var(--create-border-frame-muted)] bg-white/95 p-3 " +
  "shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] app-dark:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

const ICON_LABEL = "text-[var(--create-meta-pill-fg)]";

const PILL_LABEL_CLASS =
  "truncate text-[10px] font-semibold leading-none sm:text-[11px] " + ICON_LABEL;

const ICON_CLASS = `h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${ICON_LABEL}`;

export type CreateFinalizeMetadataRowProps = {
  hasSchedule: boolean;
  /** Short visibility endcap, e.g. Pu / Fr */
  visibilityPillEnd: ReactNode;
  rsvpPillEnd: ReactNode;
  /** On / Off endcap for Rate */
  ratePillEnd: ReactNode;
  /** When true (hangout + RSVP on), emphasize the RSVP pill with a visible ring */
  rsvpEnabled?: boolean;
  /** When true, emphasize the Rate pill when ratings are enabled */
  rateEnabled?: boolean;
  datePanel: ReactNode;
  visibilityPanel: ReactNode;
  rsvpPanel: ReactNode;
  ratePanel: ReactNode;
};

export default function CreateFinalizeMetadataRow({
  hasSchedule,
  visibilityPillEnd,
  rsvpPillEnd,
  ratePillEnd,
  rsvpEnabled = false,
  rateEnabled = false,
  datePanel,
  visibilityPanel,
  rsvpPanel,
  ratePanel,
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
        ? "z-10 scale-[1.06] shadow-md shadow-black/45"
        : anyOpen
        ? "scale-[0.96] opacity-[0.88]"
        : "";
    const rsvpOnRing =
      key === "rsvp" && rsvpEnabled
        ? "ring-2 ring-[var(--create-meta-pill-rsvp-ring)] ring-offset-1 ring-offset-[var(--bg)] sm:ring-offset-2"
        : "";
    const rateOnRing =
      key === "rate" && rateEnabled
        ? "ring-2 ring-[var(--create-meta-pill-rsvp-ring)] ring-offset-1 ring-offset-[var(--bg)] sm:ring-offset-2"
        : "";
    return [META_TAB_LAYOUT, scale, rsvpOnRing, rateOnRing]
      .filter(Boolean)
      .join(" ");
  };

  return (
    <div className="w-full">
      <div
        className="grid grid-cols-4 gap-1 sm:gap-1.5"
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
          <span className={PILL_LABEL_CLUSTER}>
            <PiCalendar className={ICON_CLASS} aria-hidden />
            <span className={PILL_LABEL_CLASS}>Date</span>
          </span>
          {hasSchedule ? (
            <span
              className="inline-flex h-3 w-3 shrink-0 items-center justify-center sm:h-3.5 sm:w-3.5"
              role="img"
              aria-label="Schedule set"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--create-meta-pill-schedule-dot-bg)] ring-1 ring-[var(--create-meta-pill-schedule-dot-ring)]" />
            </span>
          ) : (
            <span className="inline-flex h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={panel === "visibility"}
          aria-label="View"
          className={finalizeTabClass("visibility")}
          onClick={() => toggle("visibility")}
        >
          <span className={PILL_LABEL_CLUSTER}>
            <PiEye className={ICON_CLASS} aria-hidden />
            <span className={PILL_LABEL_CLASS}>View</span>
          </span>
          <span className="flex shrink-0 items-center">{visibilityPillEnd}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={panel === "rsvp"}
          className={finalizeTabClass("rsvp")}
          onClick={() => toggle("rsvp")}
        >
          <span className={PILL_LABEL_CLUSTER}>
            <PiUsers className={ICON_CLASS} aria-hidden />
            <span className={PILL_LABEL_CLASS}>RSVP</span>
          </span>
          <span className="flex shrink-0 items-center">{rsvpPillEnd}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={panel === "rate"}
          className={[
            finalizeTabClass("rate"),
            rateEnabled ? "create-meta-pill-rate--on" : "create-meta-pill-rate--off",
          ].join(" ")}
          onClick={() => toggle("rate")}
        >
          <span className={PILL_LABEL_CLUSTER}>
            <PiStar className={ICON_CLASS} aria-hidden />
            <span className={PILL_LABEL_CLASS}>Rate</span>
          </span>
          <span className="flex shrink-0 items-center">{ratePillEnd}</span>
        </button>
      </div>

      {panel !== null && (
        <div
          className={`mt-2 w-full ${
            panel === "rsvp" || panel === "rate"
              ? PANEL_CLASS_SECONDARY
              : PANEL_CLASS_DATE_VISIBILITY
          }`}
        >
          {panel === "date" && datePanel}
          {panel === "visibility" && visibilityPanel}
          {panel === "rsvp" && rsvpPanel}
          {panel === "rate" && ratePanel}
        </div>
      )}
    </div>
  );
}
