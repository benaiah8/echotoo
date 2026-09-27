/**
 * Create finalize: bottom keyboard-aware composer toolbar.
 * In-flow at the bottom of CreateFinalizeComposerShell (not document-fixed).
 * Footer keyboard/safe-area padding is owned by the Finalize page footer wrapper.
 *
 * Controls: Undo | Redo | Tags | Settings in one compact measured group.
 * Optional page-owned trailing slot (e.g. empty-composer exit) sits outside the
 * measured pill — does not affect ResizeObserver / CSS var ownership.
 * Structural chrome (pillRef / CSS vars / composer-chrome) must stay intact.
 */
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  PiArrowClockwiseBold,
  PiArrowCounterClockwiseBold,
  PiGear,
  PiHash,
} from "react-icons/pi";

import { CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS } from "../../lib/createFlowAdvisoryHighlight";
import { FINALIZE_COMPOSER_COLUMN_CLASS } from "../../lib/createFlowChrome";
import { APP_SAFE_BOTTOM_SYNC_EVENT } from "../../lib/appSafeAreaBottom";

const PANEL_TOOLBAR_GAP_PX = 8;
const TOOLBAR_HEIGHT_FALLBACK_PX = 48;
const KEYBOARD_OPEN_INSET_PX = 48;

/**
 * Inner footer wells: short horizontal pills (same height as before, slightly wider).
 * Outer GROUP_PILL_CLASS container is the measured keyboard-aware chrome — do not remove.
 */
const ICON_PILL_BASE =
  "relative flex h-10 min-h-10 min-w-[2.75rem] shrink-0 items-center justify-center rounded-full border-0 px-3 transition-colors " +
  "[&_svg]:h-[19px] [&_svg]:w-[19px] [&_svg]:shrink-0";
const GROUP_PILL_CLASS = [
  "pointer-events-auto inline-flex items-center gap-1 rounded-full p-1.5",
  "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
  "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
  "border border-transparent",
  "shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
].join(" ");

const CHIP_ACTIVE =
  "bg-[var(--bottom-tab-active-bg)] shadow-[var(--glass-active-shadow)] text-[var(--text)]";
const CHIP_SUBTLE =
  "bg-[color-mix(in_oklab,var(--text)_14%,transparent)] text-[var(--text)]";
const CHIP_IDLE =
  "bg-[color-mix(in_oklab,var(--text)_8%,transparent)] text-[var(--text)]/88";

const HISTORY_IDLE = CHIP_IDLE;
const HISTORY_DISABLED =
  "cursor-not-allowed bg-transparent text-[var(--text)]/28";

function readKeyboardInsetPx(): number {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--create-keyboard-inset")
      .trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export type CreateFinalizeMetadataRowProps = {
  hasTags?: boolean;
  onTagsClick?: () => void;
  tagsSheetOpen?: boolean;
  onSettingsClick?: () => void;
  settingsSheetOpen?: boolean;
  highlightTagsPill?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Page-owned control (e.g. empty-composer exit); not part of measured toolbar pill. */
  trailingAction?: ReactNode;
};

export default function CreateFinalizeMetadataRow({
  hasTags = false,
  onTagsClick,
  tagsSheetOpen = false,
  onSettingsClick,
  settingsSheetOpen = false,
  highlightTagsPill = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  trailingAction,
}: CreateFinalizeMetadataRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const closedChromePxRef = useRef(TOOLBAR_HEIGHT_FALLBACK_PX + 16);

  const blurThen = (fn: () => void) => {
    const ae = document.activeElement;
    if (ae instanceof HTMLElement) ae.blur();
    fn();
  };

  const publishToolbarChrome = useCallback(() => {
    const pill = pillRef.current;
    if (!pill) return;
    const height = Math.max(
      TOOLBAR_HEIGHT_FALLBACK_PX,
      Math.round(pill.getBoundingClientRect().height),
    );
    document.documentElement.style.setProperty(
      "--create-finalize-toolbar-height",
      `${height}px`,
    );

    const inset = readKeyboardInsetPx();
    if (inset <= KEYBOARD_OPEN_INSET_PX) {
      const rect = pill.getBoundingClientRect();
      const clearance = Math.max(
        TOOLBAR_HEIGHT_FALLBACK_PX,
        Math.round(window.innerHeight - rect.top),
      );
      closedChromePxRef.current = clearance;
    }

    document.documentElement.style.setProperty(
      "--create-actions-total-bottom",
      `${closedChromePxRef.current}px`,
    );
  }, []);

  useLayoutEffect(() => {
    publishToolbarChrome();
    const pill = pillRef.current;
    const ro = new ResizeObserver(() => publishToolbarChrome());
    if (pill) ro.observe(pill);

    const vv = window.visualViewport;
    window.addEventListener("resize", publishToolbarChrome);
    window.addEventListener(APP_SAFE_BOTTOM_SYNC_EVENT, publishToolbarChrome);
    vv?.addEventListener("resize", publishToolbarChrome);
    vv?.addEventListener("scroll", publishToolbarChrome);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publishToolbarChrome);
      window.removeEventListener(
        APP_SAFE_BOTTOM_SYNC_EVENT,
        publishToolbarChrome,
      );
      vv?.removeEventListener("resize", publishToolbarChrome);
      vv?.removeEventListener("scroll", publishToolbarChrome);
    };
  }, [publishToolbarChrome]);

  const tagsClass = [
    ICON_PILL_BASE,
    tagsSheetOpen ? CHIP_ACTIVE : hasTags ? CHIP_SUBTLE : CHIP_IDLE,
    highlightTagsPill ? CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS : "",
  ]
    .filter(Boolean)
    .join(" ");

  const settingsClass = [
    ICON_PILL_BASE,
    settingsSheetOpen ? CHIP_ACTIVE : CHIP_IDLE,
  ].join(" ");

  return (
    <div
      ref={rootRef}
      data-create-finalize-composer-chrome
      className={`pointer-events-none relative z-[39] mx-auto flex shrink-0 flex-col-reverse items-stretch ${FINALIZE_COMPOSER_COLUMN_CLASS}`}
      style={{
        gap: PANEL_TOOLBAR_GAP_PX,
      }}
    >
      <div className="relative isolate z-[1] flex w-full items-center justify-between gap-2">
        <div
          ref={pillRef}
          className="flex min-w-0 items-center justify-start"
          role="toolbar"
          aria-label="Post composer"
        >
          <div className={GROUP_PILL_CLASS}>
            <button
              type="button"
              className={`${ICON_PILL_BASE} ${
                canUndo ? HISTORY_IDLE : HISTORY_DISABLED
              }`}
              aria-label="Undo last structural change"
              aria-disabled={!canUndo}
              disabled={!canUndo}
              onClick={() => {
                if (!canUndo) return;
                onUndo?.();
              }}
            >
              <PiArrowCounterClockwiseBold aria-hidden />
            </button>

            <button
              type="button"
              className={`${ICON_PILL_BASE} ${
                canRedo ? HISTORY_IDLE : HISTORY_DISABLED
              }`}
              aria-label="Redo last structural change"
              aria-disabled={!canRedo}
              disabled={!canRedo}
              onClick={() => {
                if (!canRedo) return;
                onRedo?.();
              }}
            >
              <PiArrowClockwiseBold aria-hidden />
            </button>

            <button
              type="button"
              aria-pressed={tagsSheetOpen}
              aria-label="Tags"
              title="Tags"
              className={tagsClass}
              onClick={() => {
                blurThen(() => {
                  onTagsClick?.();
                });
              }}
            >
              <PiHash aria-hidden />
            </button>

            <button
              type="button"
              className={settingsClass}
              aria-expanded={settingsSheetOpen}
              aria-label="Post settings"
              title="Settings"
              onClick={() => {
                blurThen(() => {
                  onSettingsClick?.();
                });
              }}
            >
              <PiGear aria-hidden />
            </button>
          </div>
        </div>
        {trailingAction ? (
          <div className="pointer-events-auto shrink-0">{trailingAction}</div>
        ) : null}
      </div>
    </div>
  );
}
