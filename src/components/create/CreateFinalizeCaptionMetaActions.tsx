/**
 * Caption-adjacent Finalize compact actions:
 * Add notes | Ratings | Location (if none) | Event date (if none).
 * Presentation only — handlers/state owned by CreateFinalizePage / KeyInfo context.
 * "Add a section" is a sibling below saved metadata (CreateFinalizeAddSectionTrigger).
 */
import { useCallback, type MutableRefObject } from "react";
import { PiCalendar, PiMapPin, PiSparkle, PiStar, PiStarFill } from "react-icons/pi";
import { CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS } from "../../lib/createFlowAdvisoryHighlight";
import { V4_KEY_INFO_MAX_ITEMS } from "../../lib/createFlowV4KeyInfo";
import { V4_SECTION_MAX } from "../../lib/createFlowV4Section";
import { useCreateFinalizeKeyInfo } from "./CreateFinalizeKeyInfoBlock";

/** Border-only pills — transparent fill, subtle outline. Dimensions stay fixed across states. */
const actionPillBase =
  "inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-full border bg-transparent px-2.5 py-1.5 text-[12px] font-medium leading-tight shadow-none transition-[background-color,border-color,color] duration-200 motion-reduce:transition-none active:scale-[0.99] [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0";

const actionPillClass = `${actionPillBase} border-[color-mix(in_oklab,var(--border)_70%,transparent)] text-[var(--text)]/82`;

/** Saved content — ~10% white wash only; same size as inactive. */
const actionPillSavedClass = `${actionPillBase} border-[color-mix(in_oklab,var(--border)_70%,transparent)] bg-white/10 text-[var(--text)]/88`;

const actionPillDisabledClass = `${actionPillBase} cursor-not-allowed border-[color-mix(in_oklab,var(--border)_45%,transparent)] text-[var(--text)]/32`;

const iconOnlyPillBase =
  "inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-full border bg-transparent transition-[background-color,border-color,color,opacity] duration-200 motion-reduce:transition-none active:scale-[0.97] [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0";

const ratingsPillOffClass = `${iconOnlyPillBase} border-[color-mix(in_oklab,var(--border)_70%,transparent)] text-[var(--text)]/55`;

const ratingsPillOnClass = `${iconOnlyPillBase} border-[color-mix(in_oklab,var(--brand)_45%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)]`;

const sectionTextClass =
  "inline-flex min-h-9 items-center justify-start px-0 py-1 text-left text-[13px] font-medium leading-snug text-[var(--text)]/48 transition hover:text-[var(--text)]/68 active:opacity-80";

const sectionTextActiveClass =
  "inline-flex min-h-9 items-center justify-start px-0 py-1 text-left text-[13px] font-medium leading-snug text-[var(--brand)] transition";

const sectionTextDisabledClass =
  "inline-flex min-h-9 cursor-not-allowed items-center justify-start px-0 py-1 text-left text-[13px] font-medium leading-snug text-[var(--text)]/28";

function blurThen(fn: () => void) {
  const ae = document.activeElement;
  if (ae instanceof HTMLElement) ae.blur();
  fn();
}

export type CreateFinalizeCaptionMetaActionsProps = {
  skipSectionBlurRef: MutableRefObject<boolean>;
  onBeforeDetailOpen?: () => void;
  hasSchedule: boolean;
  hasLocation: boolean;
  onDateClick: () => void;
  dateSheetOpen?: boolean;
  onLocationClick: () => void;
  locationSheetOpen?: boolean;
  highlightDatePill?: boolean;
  highlightLocationPill?: boolean;
  /** Existing page-owned ratings flag — indicator only; never toggled here. */
  ratingEnabled: boolean;
  /** Opens Settings and highlights Ratings; must not flip ratingEnabled. */
  onRatingsClick: () => void;
};

export default function CreateFinalizeCaptionMetaActions({
  skipSectionBlurRef,
  onBeforeDetailOpen,
  hasSchedule,
  hasLocation,
  onDateClick,
  dateSheetOpen = false,
  onLocationClick,
  locationSheetOpen = false,
  highlightDatePill = false,
  highlightLocationPill = false,
  ratingEnabled,
  onRatingsClick,
}: CreateFinalizeCaptionMetaActionsProps) {
  const {
    values,
    editorOpen,
    openAddEditor,
    closeEditor,
    editingIndex,
    skipBlurCommitRef,
  } = useCreateFinalizeKeyInfo();

  const atDetailMax = values.length >= V4_KEY_INFO_MAX_ITEMS;
  const hasSavedNotes = values.length > 0;

  const armSkipSectionBlur = useCallback(() => {
    skipSectionBlurRef.current = true;
    window.setTimeout(() => {
      skipSectionBlurRef.current = false;
    }, 120);
  }, [skipSectionBlurRef]);

  const armDetailPointerDown = useCallback(() => {
    armSkipSectionBlur();
    skipBlurCommitRef.current = true;
    window.setTimeout(() => {
      skipBlurCommitRef.current = false;
    }, 120);
  }, [armSkipSectionBlur, skipBlurCommitRef]);

  const locationClass = [
    iconOnlyPillBase,
    hasLocation || locationSheetOpen
      ? "border-[color-mix(in_oklab,var(--border)_70%,transparent)] bg-white/10 text-[var(--text)]/88"
      : "border-[color-mix(in_oklab,var(--border)_70%,transparent)] text-[var(--text)]/82",
    highlightLocationPill ? CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS : "",
  ]
    .filter(Boolean)
    .join(" ");

  const dateClass = [
    hasSchedule || dateSheetOpen ? actionPillSavedClass : actionPillClass,
    highlightDatePill ? CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS : "",
  ]
    .filter(Boolean)
    .join(" ");

  const notesClass = atDetailMax
    ? actionPillDisabledClass
    : hasSavedNotes
      ? actionPillSavedClass
      : actionPillClass;

  return (
    <div
      className="flex w-full min-w-0 flex-wrap items-center gap-1.5"
      role="toolbar"
      aria-label="Post details"
      data-create-caption-meta-actions
      onPointerDown={armSkipSectionBlur}
    >
      <button
        type="button"
        className={notesClass}
        aria-label={
          atDetailMax ? "Key detail limit reached (4 items)" : "Add notes"
        }
        aria-pressed={editorOpen}
        aria-disabled={atDetailMax}
        disabled={atDetailMax}
        onPointerDown={armDetailPointerDown}
        onClick={() => {
          if (atDetailMax) return;
          if (editorOpen && editingIndex == null) {
            closeEditor();
            return;
          }
          onBeforeDetailOpen?.();
          openAddEditor();
        }}
      >
        <PiSparkle aria-hidden />
        <span>Add notes</span>
      </button>

      <button
        type="button"
        data-create-ratings-indicator
        aria-label={
          ratingEnabled
            ? "Ratings on. Open settings"
            : "Ratings off. Open settings"
        }
        aria-pressed={ratingEnabled}
        title={ratingEnabled ? "Ratings on" : "Ratings off"}
        className={ratingEnabled ? ratingsPillOnClass : ratingsPillOffClass}
        onClick={() => {
          blurThen(() => {
            onRatingsClick();
          });
        }}
      >
        <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <PiStar
            aria-hidden
            className={`absolute inset-0 h-[18px] w-[18px] transition-opacity duration-200 motion-reduce:transition-none ${
              ratingEnabled ? "opacity-0" : "opacity-100"
            }`}
          />
          <PiStarFill
            aria-hidden
            className={`absolute inset-0 h-[18px] w-[18px] transition-opacity duration-200 motion-reduce:transition-none ${
              ratingEnabled ? "opacity-100" : "opacity-0"
            }`}
          />
        </span>
      </button>

      {!hasLocation ? (
        <button
          type="button"
          aria-pressed={locationSheetOpen}
          aria-label="Location"
          title="Location"
          className={locationClass}
          onClick={() => {
            blurThen(() => {
              onLocationClick();
            });
          }}
        >
          <PiMapPin aria-hidden />
        </button>
      ) : null}

      {!hasSchedule ? (
        <button
          type="button"
          aria-pressed={dateSheetOpen}
          aria-label="Event date"
          title="Event date"
          className={dateClass}
          onClick={() => {
            blurThen(() => {
              onDateClick();
            });
          }}
        >
          <PiCalendar aria-hidden />
          <span>Event date</span>
        </button>
      ) : null}
    </div>
  );
}

export type CreateFinalizeAddSectionTriggerProps = {
  sectionCount: number;
  onAddSection: () => void;
  skipSectionBlurRef: MutableRefObject<boolean>;
  sectionActive?: boolean;
};

/** Quiet text trigger between post-level metadata and Section editors. */
export function CreateFinalizeAddSectionTrigger({
  sectionCount,
  onAddSection,
  skipSectionBlurRef,
  sectionActive = false,
}: CreateFinalizeAddSectionTriggerProps) {
  const atSectionMax = sectionCount >= V4_SECTION_MAX;

  const armSkipSectionBlur = useCallback(() => {
    skipSectionBlurRef.current = true;
    window.setTimeout(() => {
      skipSectionBlurRef.current = false;
    }, 120);
  }, [skipSectionBlurRef]);

  return (
    <div
      className="flex w-full min-w-0 flex-wrap items-center gap-2.5"
      data-create-section-add
      onPointerDown={armSkipSectionBlur}
    >
      <button
        type="button"
        className={
          atSectionMax
            ? sectionTextDisabledClass
            : sectionActive
              ? sectionTextActiveClass
              : sectionTextClass
        }
        aria-label={
          atSectionMax
            ? "Section limit reached (5 sections)"
            : "Add a section"
        }
        aria-pressed={sectionActive}
        aria-disabled={atSectionMax}
        disabled={atSectionMax}
        onClick={() => {
          if (atSectionMax) return;
          onAddSection();
        }}
      >
        Add a section
      </button>
      <span
        aria-hidden
        className="h-px w-8 shrink-0 bg-[color-mix(in_oklab,var(--text)_18%,transparent)]"
      />
    </div>
  );
}
