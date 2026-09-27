/**
 * V4 Finalize canvas blocks: compact Date/Time + Location under the caption.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { IconType } from "react-icons";
import { PiArrowSquareOut, PiCalendarBlank, PiMapPin, PiX } from "react-icons/pi";
import { useLongPressActions } from "../../hooks/useLongPressActions";
import { hapticImpactLight } from "../../lib/hapticsLight";
import { openMapsLocationUrl } from "../../lib/openMapsLocationUrl";
import { hasV4VisibleLocation } from "../../lib/createFlowLocation";
import {
  finalizeMetaRowSurfaceClass,
  finalizeMetaStackGapClass,
} from "../../lib/createFlowFinalizeMetaSurface";

const metaSurfaceClass = finalizeMetaRowSurfaceClass;

/** Shared shell — pill vs rect differs only by radius; padding/typography identical. */
const metaBlockShellBase = `relative w-full min-w-0 overflow-visible px-3 py-2.5 ${metaSurfaceClass} transition active:scale-[0.998]`;

const metaBlockPillClass = `${metaBlockShellBase} rounded-full min-h-[2.375rem]`;
const metaBlockRectClass = `${metaBlockShellBase} rounded-[18px]`;

const metaHitClass =
  "flex w-full min-w-0 gap-2.5 text-left text-[13px] font-medium leading-[1.375] text-[var(--text)]/90 transition hover:opacity-95";

const metaIconClass =
  "h-4 w-4 shrink-0 text-[var(--create-accent-icon-fg)] opacity-85";

const metaIconMultilineClass = `${metaIconClass} mt-[0.1875rem]`;

const metaLabelClass =
  "min-w-0 flex-1 whitespace-normal break-words text-left text-[13px] font-medium leading-[1.375] text-[var(--text)]/90";

const mapsLinkButtonClass =
  "absolute z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--brand-ink)] shadow-none transition hover:bg-white/92 active:scale-[0.96] app-dark:bg-white app-dark:text-[#0b0b0b]";

/** Leave room for the overlapping remove control on the top-right corner. */
const mapsLinkInsetClass = "right-8";
const mapsLinkPillPositionClass = `${mapsLinkInsetClass} top-1/2 -translate-y-1/2`;
const mapsLinkRectPositionClass = `${mapsLinkInsetClass} top-1.5`;

/** Room for remove X; extra when Maps link is present. */
const removeContentPadClass = "pr-8";
const removeAndMapsContentPadClass = "pr-[4.75rem]";

const removeButtonClass =
  "absolute -right-1.5 -top-1.5 z-[2] inline-flex h-7 min-h-7 w-7 min-w-7 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--border)_70%,transparent)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] text-[var(--text)]/72 shadow-none transition hover:bg-[color-mix(in_oklab,var(--surface)_100%,transparent)] hover:text-[var(--text)]/90 active:scale-[0.96] app-dark:border-white/18 app-dark:bg-[color-mix(in_oklab,var(--surface)_88%,black)]";

type Props = {
  showDate: boolean;
  dateSummary: string | null;
  onDateClick: () => void;
  onDateLongPress?: () => void;
  onDateRemove?: () => void;
  showLocation: boolean;
  locationName: string;
  locationUrl: string;
  onLocationClick: () => void;
  onLocationLongPress?: () => void;
  onLocationRemove?: () => void;
};

function useIsMultilineText(label: string) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);

  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;

    const sync = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const resolvedLineHeight =
        Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 18;
      setIsMultiline(el.scrollHeight > resolvedLineHeight * 1.35);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label]);

  return { labelRef, isMultiline };
}

function LocationMapsLink({
  locationUrl,
  isMultiline,
}: {
  locationUrl: string;
  isMultiline: boolean;
}) {
  return (
    <button
      type="button"
      className={`${mapsLinkButtonClass} ${isMultiline ? mapsLinkRectPositionClass : mapsLinkPillPositionClass}`}
      aria-label="Open location in Google Maps"
      onClick={(e) => {
        e.stopPropagation();
        void openMapsLocationUrl(locationUrl);
      }}
    >
      <PiArrowSquareOut className="h-4 w-4 shrink-0" aria-hidden />
    </button>
  );
}

function MetaRowBlock({
  label,
  Icon,
  onClick,
  onLongPress,
  onRemove,
  removeAriaLabel,
  ariaLabel,
  trailing,
}: {
  label: string;
  Icon: IconType;
  onClick: () => void;
  onLongPress?: () => void;
  onRemove?: () => void;
  removeAriaLabel?: string;
  ariaLabel: string;
  trailing?: (isMultiline: boolean) => ReactNode;
}) {
  const { labelRef, isMultiline } = useIsMultilineText(label);
  const shellClass = isMultiline ? metaBlockRectClass : metaBlockPillClass;
  const trailingNode = trailing?.(isMultiline);
  const showRemove = typeof onRemove === "function" && !!removeAriaLabel;

  const handleLongPress = useCallback(() => {
    void hapticImpactLight();
    onLongPress?.();
  }, [onLongPress]);

  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu,
    allowClick,
    pressed,
  } = useLongPressActions({
    onLongPress: handleLongPress,
    disabled: !onLongPress,
  });

  const handleClick = useCallback(() => {
    if (onLongPress && !allowClick()) return;
    onClick();
  }, [allowClick, onClick, onLongPress]);

  return (
    <div className={shellClass}>
      <button
        type="button"
        className={[
          metaHitClass,
          isMultiline ? "items-start" : "items-center",
          showRemove && trailingNode
            ? removeAndMapsContentPadClass
            : showRemove
              ? removeContentPadClass
              : trailingNode
                ? "pr-11"
                : "",
          "transition-[transform] duration-100",
          pressed ? "scale-[0.99]" : "",
        ].join(" ")}
        onClick={handleClick}
        onPointerDown={onLongPress ? onPointerDown : undefined}
        onPointerMove={onLongPress ? onPointerMove : undefined}
        onPointerUp={onLongPress ? onPointerUp : undefined}
        onPointerCancel={onLongPress ? onPointerCancel : undefined}
        onContextMenu={onLongPress ? onContextMenu : undefined}
        aria-label={ariaLabel}
      >
        <Icon
          className={isMultiline ? metaIconMultilineClass : metaIconClass}
          aria-hidden
        />
        <span ref={labelRef} className={metaLabelClass}>
          {label}
        </span>
      </button>
      {trailingNode}
      {showRemove ? (
        <button
          type="button"
          className={removeButtonClass}
          aria-label={removeAriaLabel}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <PiX className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export default function CreateFinalizeStructuredMetaBlocks({
  showDate,
  dateSummary,
  onDateClick,
  onDateLongPress,
  onDateRemove,
  showLocation,
  locationName,
  locationUrl,
  onLocationClick,
  onLocationLongPress,
  onLocationRemove,
}: Props) {
  const name = locationName.trim();
  const hasUrl = hasV4VisibleLocation("", locationUrl);
  const locationLabel = name || (hasUrl ? "View location" : "");

  if (!showDate && !showLocation) return null;

  return (
    <div
      className={`flex w-full min-w-0 flex-col overflow-visible ${finalizeMetaStackGapClass}`}
    >
      {showDate && dateSummary ? (
        <MetaRowBlock
          label={dateSummary}
          Icon={PiCalendarBlank}
          onClick={onDateClick}
          onLongPress={onDateLongPress}
          onRemove={onDateRemove}
          removeAriaLabel="Remove date"
          ariaLabel={`Date and time, ${dateSummary}`}
        />
      ) : null}

      {showLocation && locationLabel ? (
        <MetaRowBlock
          label={locationLabel}
          Icon={PiMapPin}
          onClick={onLocationClick}
          onLongPress={onLocationLongPress}
          onRemove={onLocationRemove}
          removeAriaLabel="Remove location"
          ariaLabel={`Location, ${locationLabel}`}
          trailing={(isMultiline) =>
            hasUrl ? (
              <LocationMapsLink
                locationUrl={locationUrl}
                isMultiline={isMultiline}
              />
            ) : null
          }
        />
      ) : null}
    </div>
  );
}
