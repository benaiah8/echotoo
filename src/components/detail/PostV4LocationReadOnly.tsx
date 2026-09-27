import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PiArrowSquareOut, PiLinkSimple, PiMapPin } from "react-icons/pi";
import { hasV4VisibleLocation } from "../../lib/createFlowLocation";
import { openMapsLocationUrl } from "../../lib/openMapsLocationUrl";
import OpenExternalLinkDialog from "../ui/OpenExternalLinkDialog";

/** ~200ms ease-out — matches Share drawer / dock motion conventions. */
const locationMotionClass =
  "duration-200 ease-out motion-reduce:transition-none";

/**
 * Finite radii only — never `rounded-full` (9999px).
 * CSS interpolates 19px→12px/24px smoothly; 9999px→12px stays pill-like until the end.
 *
 * Expanded top-right (24px): wraps the h-8 Maps circle (32px) at right-1 / top-1.5.
 * Other expanded corners: Schedule/Date `rounded-xl` (12px).
 */
const SHELL_RADIUS_PILL = "19px";
const SHELL_RADIUS_COLLAPSED_RECT = "18px";
/** TL TR BR BL — generous TR around Maps action. */
const SHELL_RADIUS_EXPANDED = "12px 24px 12px 12px";

/** Published Detail location shell — transparent + theme border (matches Schedule/Date). */
const metaBlockShellBase = [
  "relative w-full min-w-0 border border-[var(--border)]/70 bg-transparent px-3 py-2.5 app-dark:border-white/22",
  /* Same duration as grid reveal so radius + height morph as one motion. */
  `transition-[border-radius] ${locationMotionClass}`,
].join(" ");
/** Collapsed compact pill (radius via style — see SHELL_RADIUS_PILL). */
const metaBlockPillClass = `${metaBlockShellBase} min-h-[2.375rem]`;
/** Collapsed multiline rect. */
const metaBlockRectClass = metaBlockShellBase;
/** Expanded Schedule-like shell (asymmetric TR radius via style). */
const metaBlockExpandedClass = metaBlockShellBase;

const metaHitClass =
  "flex w-full min-w-0 gap-2.5 text-left text-[13px] font-medium leading-[1.375] text-[var(--text)]/90";

const metaIconClass =
  "h-4 w-4 shrink-0 text-[var(--create-accent-icon-fg)] opacity-85";

const metaIconMultilineClass = `${metaIconClass} mt-[0.1875rem]`;

const metaLabelClass =
  "min-w-0 flex-1 whitespace-normal break-words text-left text-[13px] font-medium leading-[1.375] text-[var(--text)]/90";

const secondaryTextClass =
  "mt-1 whitespace-pre-wrap break-words text-[12px] font-normal leading-snug text-[var(--text)]/68 app-dark:text-white/62";

const mapsLinkButtonClass = [
  "absolute z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--brand-ink)] shadow-none",
  "hover:bg-white/92 active:scale-[0.96] app-dark:bg-white app-dark:text-[#0b0b0b]",
  `transition-[top,transform,background-color] ${locationMotionClass}`,
].join(" ");

const mapsLinkInsetClass = "right-1";
const mapsLinkPillPositionClass = `${mapsLinkInsetClass} top-1/2 -translate-y-1/2`;
const mapsLinkRectPositionClass = `${mapsLinkInsetClass} top-1.5 translate-y-0`;
const mapsLinkContentPadClass = "pr-11";

const expandedSectionLabelClass =
  "text-[11px] font-semibold tracking-wide text-[var(--text)]/58 app-dark:text-white/55";

const expandedBodyClass =
  "mt-0.5 min-w-0 whitespace-pre-wrap break-words text-[12px] leading-snug text-[var(--text)]/90 app-dark:text-white/85";

/** Full stored URL — visible, wrap-safe, opens confirm dialog (not Maps). */
const expandedUrlButtonClass = [
  "mt-1 flex w-full min-w-0 items-start gap-1.5 rounded-sm px-1 py-0.5 text-left",
  "bg-[color-mix(in_oklab,var(--brand-dark)_12%,transparent)]",
  "text-[13px] font-medium leading-snug text-[var(--brand-readable)]",
  "transition-colors hover:bg-[color-mix(in_oklab,var(--brand-dark)_18%,transparent)]",
  "active:scale-[0.99]",
  "app-dark:bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]",
  "app-dark:text-[var(--brand)]",
  "app-dark:hover:bg-[color-mix(in_oklab,var(--brand)_18%,transparent)]",
].join(" ");

function CollapsedLocationContent({
  isMultiline,
  labelRef,
  primaryLabel,
  secondaryLines,
}: {
  isMultiline: boolean;
  labelRef: RefObject<HTMLSpanElement | null>;
  primaryLabel: string;
  secondaryLines: string;
}) {
  return (
    <>
      <PiMapPin
        className={isMultiline ? metaIconMultilineClass : metaIconClass}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span ref={labelRef} className={metaLabelClass}>
          {primaryLabel}
        </span>
        {secondaryLines ? (
          <p className={secondaryTextClass}>{secondaryLines}</p>
        ) : null}
      </span>
    </>
  );
}

type Props = {
  locationName?: string | null;
  locationUrl?: string | null;
  locationDesc?: string | null;
  locationNotes?: string | null;
};

/** Published post detail: slot-0 carrier location (not a legacy timeline stop). */
export default function PostV4LocationReadOnly({
  locationName,
  locationUrl,
  locationDesc,
  locationNotes,
}: Props) {
  const name = (locationName ?? "").trim();
  const url = (locationUrl ?? "").trim();
  const desc = (locationDesc ?? "").trim();
  const notes = (locationNotes ?? "").trim();
  const hasUrl = hasV4VisibleLocation("", url);
  const primaryLabel =
    name || (hasUrl ? "View location" : "") || desc || notes;
  const secondaryParts: string[] = [];
  if (name && desc) secondaryParts.push(desc);
  if (name && notes) secondaryParts.push(notes);
  if (!name && desc && notes) secondaryParts.push(notes);
  const secondaryLines = secondaryParts.join("\n");
  const hasExpandedBody = !!(desc || notes || hasUrl);

  const labelRef = useRef<HTMLSpanElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = labelRef.current;
    if (!el || !primaryLabel) return;

    const sync = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const resolvedLineHeight =
        Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 18;
      const multilineLabel = el.scrollHeight > resolvedLineHeight * 1.35;
      setIsMultiline(multilineLabel || !!secondaryLines);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [primaryLabel, secondaryLines, expanded]);

  if (!primaryLabel) return null;

  const collapsedUsesRect = isMultiline || !!secondaryLines;
  const shellClass = expanded
    ? metaBlockExpandedClass
    : collapsedUsesRect
      ? metaBlockRectClass
      : metaBlockPillClass;
  const shellBorderRadius = expanded
    ? SHELL_RADIUS_EXPANDED
    : collapsedUsesRect
      ? SHELL_RADIUS_COLLAPSED_RECT
      : SHELL_RADIUS_PILL;

  const openMaps = () => {
    if (hasUrl) void openMapsLocationUrl(url);
  };

  const toggleExpanded = () => {
    setExpanded((v) => !v);
  };

  const headerAlignClass =
    expanded || collapsedUsesRect ? "items-start" : "items-center";

  return (
    <>
      <div
        className={shellClass}
        style={{ borderRadius: shellBorderRadius }}
        data-location-box
        data-expanded={expanded ? "true" : "false"}
        data-location-motion
        data-location-radius={expanded ? "expanded" : collapsedUsesRect ? "rect" : "pill"}
      >
        {/* Main area: expand/collapse only — never opens Maps. */}
        <button
          type="button"
          className={[
            metaHitClass,
            headerAlignClass,
            hasUrl ? mapsLinkContentPadClass : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Collapse location, ${primaryLabel}`
              : `Expand location, ${primaryLabel}`
          }
          data-location-toggle
        >
          {expanded ? (
            <>
              <PiMapPin className={metaIconMultilineClass} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold tracking-wide text-[var(--text)]/88 app-dark:text-white/92">
                  Location
                </span>
                {name ? (
                  <span className="mt-0.5 block text-[13px] font-medium leading-[1.375] text-[var(--text)]/90">
                    {name}
                  </span>
                ) : null}
              </span>
            </>
          ) : (
            <CollapsedLocationContent
              isMultiline={collapsedUsesRect}
              labelRef={labelRef}
              primaryLabel={primaryLabel}
              secondaryLines={secondaryLines}
            />
          )}
        </button>

        {/* Direct Maps action — sibling, not nested in toggle. */}
        {hasUrl ? (
          <button
            type="button"
            className={`${mapsLinkButtonClass} ${
              expanded || collapsedUsesRect
                ? mapsLinkRectPositionClass
                : mapsLinkPillPositionClass
            }`}
            aria-label="Open location in Google Maps"
            data-location-maps-open
            onClick={(e) => {
              e.stopPropagation();
              openMaps();
            }}
          >
            <PiArrowSquareOut className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        ) : null}

        {/*
          Expanded body stays mounted for height animation (grid 0fr→1fr).
          Collapsed: overflow clipped + pointer-events-none on content.
        */}
        {hasExpandedBody ? (
          <div
            className={[
              "grid min-w-0 transition-[grid-template-rows]",
              locationMotionClass,
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            ].join(" ")}
            data-location-expanded
            aria-hidden={!expanded}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={[
                  "min-w-0 space-y-2 pt-2",
                  hasUrl ? mapsLinkContentPadClass : "",
                  `transition-[opacity,transform] ${locationMotionClass}`,
                  expanded
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-1 opacity-0",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {desc ? (
                  <div className="min-w-0">
                    <p className={expandedSectionLabelClass}>Details</p>
                    <p className={expandedBodyClass}>{desc}</p>
                  </div>
                ) : null}
                {notes ? (
                  <div className="min-w-0">
                    <p className={expandedSectionLabelClass}>Notes</p>
                    <p className={expandedBodyClass}>{notes}</p>
                  </div>
                ) : null}
                {hasUrl ? (
                  <div className="min-w-0">
                    <p className={expandedSectionLabelClass}>Location link</p>
                    <button
                      type="button"
                      className={expandedUrlButtonClass}
                      aria-label={`Open link ${url}`}
                      title={url}
                      data-location-url-open
                      tabIndex={expanded ? 0 : -1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLinkDialogOpen(true);
                      }}
                    >
                      <PiLinkSimple
                        className="mt-0.5 h-[0.95em] w-[0.95em] shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 select-all break-all">
                        {url}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {hasUrl ? (
        <OpenExternalLinkDialog
          open={linkDialogOpen}
          href={url}
          onClose={() => setLinkDialogOpen(false)}
        />
      ) : null}
    </>
  );
}
