// src/sections/create/CreateActivityLocationSection.tsx
import { useMemo, useState } from "react";
import PrimaryInput from "../../components/input/PrimaryInput";
import { ActivityType } from "../../types/post";
import { PiArrowSquareOut, PiCaretDown, PiQuestion } from "react-icons/pi";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";
import {
  charFieldRingClassForTone,
  charLimitTone,
} from "../../lib/createFlowLimitUtils";

type LocationSubPanel = "maps" | "details" | null;

interface Props {
  activity: ActivityType;
  activityIndex: number; // kept for future use if needed
  handleChange: (field: string, value: any) => void;
  /** When true, no outer section margin — used in shared add-on panel */
  embedded?: boolean;
}

/**
 * Section-scoped field skin only (PrimaryInput unchanged globally).
 */
const LOCATION_FIELD_CLASS =
  "!box-border !min-h-[42px] !w-full !rounded-xl !border !border-solid !border-[var(--border)] " +
  "!bg-[var(--surface)]/18 !px-3 !py-2.5 !text-xs !font-normal !leading-snug !text-[var(--text)] " +
  "!shadow-none !transition-[border-color,box-shadow] " +
  "!placeholder:text-[var(--text)]/38 !placeholder:font-normal " +
  "focus-visible:!outline-none focus-visible:!ring-1 focus-visible:!ring-[var(--ring)]/45 " +
  "focus-visible:!border-[var(--ring)]";

const PILL_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[11px] whitespace-nowrap transition active:scale-[0.99]";

/** Mini tabs under place field — compact height, stronger border-2 outline */
const SUB_TAB_BASE =
  "flex h-8 min-h-0 min-w-0 flex-1 items-center justify-center rounded-full border-2 px-2 py-0.5 text-center text-[10px] font-semibold leading-none " +
  "transition active:scale-[0.99] sm:text-[11px]";
const SUB_TAB_ACTIVE =
  "border-[color-mix(in_oklab,var(--brand)_55%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--text)]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
const SUB_TAB_IDLE =
  "border-[var(--border)]/65 bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] text-[var(--text)]/80 hover:border-[var(--border)]/80 hover:bg-[color-mix(in_oklab,var(--surface)_34%,transparent)] dark:border-[var(--border)]/55";

const L = CREATE_FLOW_LIMITS.activities;

export default function CreateActivityLocationSection({
  activity,
  handleChange,
  embedded = false,
}: Props) {
  const [showMapsHelp, setShowMapsHelp] = useState(false);

  const locationNotes = activity.locationNotes || "";
  const locationUrl = activity.locationUrl || "";

  const [subPanel, setSubPanel] = useState<LocationSubPanel>(() => {
    const hasUrl = !!(activity.locationUrl || "").trim();
    const hasNotes = !!(activity.locationNotes || "").trim();
    if (hasUrl) return "maps";
    if (hasNotes) return "details";
    return null;
  });

  const toggleMapsTab = () => {
    setSubPanel((p) => (p === "maps" ? null : "maps"));
  };
  const toggleDetailsTab = () => {
    setSubPanel((p) => (p === "details" ? null : "details"));
  };

  const mapsUrl = useMemo(() => {
    const q = (activity.location || "").trim();
    const base = "https://www.google.com/maps/search/?api=1";
    return q
      ? `${base}&query=${encodeURIComponent(q)}`
      : "https://maps.google.com";
  }, [activity.location]);

  return (
    <section className={embedded ? "w-full" : "w-full mt-3"}>
      <div
        className={[
          "rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/20 px-3 py-3",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:border-white",
        ].join(" ")}
      >
        <div className="flex flex-col gap-0">
          <div className="w-full">
            <PrimaryInput
              label="Place name or address"
              placeholder="Hotel, cafe, landmark, or street address"
              value={activity.location || ""}
              maxLength={L.placeNameMaxChars}
              counterMax={L.placeNameMaxChars}
              onChange={(e) => handleChange("location", e.target.value)}
              className={`${LOCATION_FIELD_CLASS} ${charFieldRingClassForTone(
                charLimitTone(
                  (activity.location || "").length,
                  L.placeNameMaxChars
                )
              )}`}
            />
          </div>

          <div className="mt-2.5">
            <div
              className="grid grid-cols-2 gap-1.5"
              role="tablist"
              aria-label="Location options"
            >
              <button
                type="button"
                role="tab"
                aria-selected={subPanel === "maps"}
                id="location-maps-tab"
                title="Google Maps link"
                className={`${SUB_TAB_BASE} min-w-0 truncate ${
                  subPanel === "maps" ? SUB_TAB_ACTIVE : SUB_TAB_IDLE
                }`}
                onClick={toggleMapsTab}
              >
                <span className="truncate px-0.5">Google Maps link</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subPanel === "details"}
                id="location-details-tab"
                className={`${SUB_TAB_BASE} min-w-0 truncate ${
                  subPanel === "details" ? SUB_TAB_ACTIVE : SUB_TAB_IDLE
                }`}
                onClick={toggleDetailsTab}
              >
                <span className="truncate px-0.5">Extra details</span>
              </button>
            </div>

            {subPanel === "maps" && (
              <div
                className="mt-2 flex flex-col gap-2"
                role="tabpanel"
                aria-labelledby="location-maps-tab"
                id="location-maps-panel"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text)]/58 sm:text-sm">
                    Link &amp; open in Maps
                  </span>
                  <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1.5">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${PILL_BASE} h-6 border border-[var(--border-contrast)]/25 bg-[var(--button-primary-bg)] font-semibold text-[var(--button-primary-text)] hover:opacity-95`}
                    >
                      <span>Open Maps</span>
                      <PiArrowSquareOut
                        className="h-3.5 w-3.5 shrink-0 opacity-90"
                        aria-hidden
                      />
                    </a>
                    <button
                      type="button"
                      className={
                        "inline-flex h-6 shrink-0 items-center justify-center gap-0.5 rounded-full px-2 " +
                        "text-[11px] whitespace-nowrap transition active:scale-[0.99] " +
                        "border border-[var(--border)] bg-[var(--surface)]/35 font-medium text-[var(--text)]/50 " +
                        "hover:bg-[var(--surface)]/55 hover:text-[var(--text)]/70"
                      }
                      onClick={() => setShowMapsHelp((s) => !s)}
                      aria-label="How to use Google Maps link"
                      aria-expanded={showMapsHelp}
                      aria-controls="maps-link-help"
                    >
                      <PiQuestion
                        className="h-3.5 w-3.5 shrink-0 opacity-90"
                        aria-hidden
                      />
                      <PiCaretDown
                        className={`text-[10px] opacity-80 transition-transform ${
                          showMapsHelp ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </button>
                  </div>
                </div>

                <div className="w-full">
                  <PrimaryInput
                    placeholder="Paste Google Maps share link"
                    value={locationUrl}
                    maxLength={L.googleMapsLinkMaxChars}
                    counterMax={L.googleMapsLinkMaxChars}
                    onChange={(e) =>
                      handleChange("locationUrl", e.target.value)
                    }
                    className={`${LOCATION_FIELD_CLASS} ${charFieldRingClassForTone(
                      charLimitTone(
                        locationUrl.length,
                        L.googleMapsLinkMaxChars
                      )
                    )}`}
                  />
                </div>

                {showMapsHelp && (
                  <div
                    id="maps-link-help"
                    className="space-y-1.5 rounded-lg border border-[var(--border)]/40 bg-[var(--surface)]/12 px-3 py-2 text-[11px] leading-relaxed text-[var(--text)]/58"
                  >
                    <p className="font-medium text-[var(--text)]/70">Steps</p>
                    <ol className="list-decimal space-y-0.5 pl-4">
                      <li>Open Google Maps (use Open Maps if helpful).</li>
                      <li>Search and select the place.</li>
                      <li>Tap Share.</li>
                      <li>Copy the link and paste it in the field above.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {subPanel === "details" && (
              <div
                className="mt-2"
                role="tabpanel"
                aria-labelledby="location-details-tab"
                id="location-details-panel"
              >
                <div className="w-full">
                  <PrimaryInput
                    label="Details (optional)"
                    placeholder="Floor, room, parking, entrance, etc."
                    value={locationNotes}
                    maxLength={L.locationExtraDetailsMaxChars}
                    counterMax={L.locationExtraDetailsMaxChars}
                    onChange={(e) =>
                      handleChange("locationNotes", e.target.value)
                    }
                    className={`${LOCATION_FIELD_CLASS} ${charFieldRingClassForTone(
                      charLimitTone(
                        locationNotes.length,
                        L.locationExtraDetailsMaxChars
                      )
                    )}`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
