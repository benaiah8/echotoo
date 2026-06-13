/**
 * Create finalize: Date / Location|Places / View / More pills + single shared panel.
 * Pill chrome uses `create-meta-pill` + --create-meta-pill-* (see index.css).
 */
import { useState, type ReactNode } from "react";
import {
  PiCalendar,
  PiEye,
  PiMapPin,
  PiSlidersHorizontal,
} from "react-icons/pi";

import { CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS } from "../../lib/createFlowAdvisoryHighlight";

export type FinalizeMetaPanelKey =
  | "date"
  | "location"
  | "visibility"
  | "more";

/** ~8% shorter than h-8 / h-9; extra horizontal inset so labels/endcaps aren’t flush to the rim. */
const META_TAB_LAYOUT =
  "create-meta-pill relative flex h-[29px] min-h-[29px] min-w-0 items-center rounded-full px-2 py-0.5 text-left sm:h-[33px] sm:min-h-[33px] sm:px-2.5 sm:py-1";

const PILL_LABEL_CLUSTER =
  "flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden pr-4 sm:gap-1 sm:pr-5";

const PILL_ENDCAP_SLOT =
  "pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center sm:right-1.5";

/** Shared open panel — matches caption/hashtag composer shell (soft border, no bold outline). */
const PANEL_CLASS =
  "rounded-[var(--create-radius-panel)] border border-[var(--create-border-composer-shell)] p-3 " +
  "bg-[color-mix(in_oklab,white_94%,var(--surface))] " +
  "shadow-[0_0_0_1px_var(--create-border-composer-shell-ring),0_2px_14px_rgba(0,0,0,0.05)] " +
  "app-dark:border-[var(--create-border-composer-shell)] " +
  "app-dark:bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] " +
  "app-dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]";

const ICON_LABEL = "text-[var(--create-meta-pill-fg)]";

const PILL_LABEL_CLASS =
  "min-w-0 truncate text-[9px] font-semibold leading-none sm:text-[10px] " +
  ICON_LABEL;

const ICON_CLASS = `h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${ICON_LABEL}`;

export type CreateFinalizeMetadataRowProps = {
  /** User-facing label for the location pill: "Location" (Event) or "Places" (Experience). */
  locationPillLabel: string;
  hasSchedule: boolean;
  /** Short visibility endcap, e.g. Pu / Fr */
  visibilityPillEnd: ReactNode;
  locationPillEnd: ReactNode;
  morePillEnd: ReactNode;
  /** When true, emphasize the More pill when optional controls are enabled */
  moreOptionsActive?: boolean;
  /** When true, emphasize the Rate pill styling on More when ratings are enabled */
  rateEnabled?: boolean;
  /** Controlled open panel; omit for uncontrolled local state */
  openPanel?: FinalizeMetaPanelKey | null;
  onOpenPanelChange?: (panel: FinalizeMetaPanelKey | null) => void;
  datePanel: ReactNode;
  locationPanel: ReactNode;
  visibilityPanel: ReactNode;
  morePanel: ReactNode;
  /** Temporary nudge after publish-warning modal Back */
  highlightDatePill?: boolean;
  highlightLocationPill?: boolean;
};

export default function CreateFinalizeMetadataRow({
  locationPillLabel,
  hasSchedule,
  visibilityPillEnd,
  locationPillEnd,
  morePillEnd,
  moreOptionsActive = false,
  rateEnabled = false,
  openPanel: openPanelProp,
  onOpenPanelChange,
  datePanel,
  locationPanel,
  visibilityPanel,
  morePanel,
  highlightDatePill = false,
  highlightLocationPill = false,
}: CreateFinalizeMetadataRowProps) {
  const [internalPanel, setInternalPanel] =
    useState<FinalizeMetaPanelKey | null>(null);
  const panel =
    openPanelProp !== undefined ? openPanelProp : internalPanel;
  const setPanel = onOpenPanelChange ?? setInternalPanel;

  const toggle = (key: FinalizeMetaPanelKey) => {
    const ae = document.activeElement;
    if (ae instanceof HTMLElement) ae.blur();
    setPanel(panel === key ? null : key);
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
    const moreOnRing =
      key === "more" && moreOptionsActive
        ? "ring-2 ring-[var(--create-meta-pill-rsvp-ring)] ring-offset-1 ring-offset-[var(--bg)] sm:ring-offset-2"
        : "";
    const advisoryHighlight =
      (key === "date" && highlightDatePill) ||
      (key === "location" && highlightLocationPill)
        ? CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS
        : "";
    return [META_TAB_LAYOUT, scale, moreOnRing, advisoryHighlight]
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
          <span className={PILL_ENDCAP_SLOT}>
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
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={panel === "location"}
          aria-label={locationPillLabel}
          className={finalizeTabClass("location")}
          onClick={() => toggle("location")}
        >
          <span className={PILL_LABEL_CLUSTER}>
            <PiMapPin className={ICON_CLASS} aria-hidden />
            <span className={PILL_LABEL_CLASS}>{locationPillLabel}</span>
          </span>
          <span className={PILL_ENDCAP_SLOT}>{locationPillEnd}</span>
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
          <span className={PILL_ENDCAP_SLOT}>{visibilityPillEnd}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={panel === "more"}
          className={[
            finalizeTabClass("more"),
            rateEnabled ? "create-meta-pill-rate--on" : "create-meta-pill-rate--off",
          ].join(" ")}
          onClick={() => toggle("more")}
        >
          <span className={PILL_LABEL_CLUSTER}>
            <PiSlidersHorizontal
              className={`${ICON_CLASS} opacity-95`}
              aria-hidden
            />
            <span className={PILL_LABEL_CLASS}>More</span>
          </span>
          <span className={PILL_ENDCAP_SLOT}>{morePillEnd}</span>
        </button>
      </div>

      {panel !== null && (
        <div className={`mt-2 w-full ${PANEL_CLASS}`}>
          {panel === "date" && datePanel}
          {panel === "location" && locationPanel}
          {panel === "visibility" && visibilityPanel}
          {panel === "more" && morePanel}
        </div>
      )}
    </div>
  );
}
