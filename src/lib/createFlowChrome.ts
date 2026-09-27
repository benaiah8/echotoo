import { Paths } from "../router/Paths";

/** Vertical gap under the notch before the main create pill (matches CreateFlowTopBar). */
export const CREATE_FLOW_TOP_GAP_BELOW_SAFE_AREA_PX = 12;

/** Matches create header / notice max width when BottomTab is visually hidden. */
export const CREATE_FLOW_COMPOSER_MAX_WIDTH_PX = 640;

/**
 * Finalize shell stacks above BottomTab (z-40) so the shared tab need not hide.
 * Leave ConfirmDialog (z-[200]) and blocking modals stay above this layer.
 */
export const CREATE_FINALIZE_SHELL_Z_CLASS = "z-[41]";

/**
 * Create notice pills sit above the finalize shell, still below leave dialogs.
 */
export const CREATE_FLOW_NOTICE_STACK_Z_CLASS = "z-[42]";

/**
 * Finalize-only column width cap (640px centered). Edge breathing room is mostly
 * from horizontal padding on chrome vs canvas column classes below.
 */
const FINALIZE_COMPOSER_COLUMN_BASE =
  "w-full max-w-[min(640px,calc(100vw-10px))]";

/**
 * Top/bottom chrome (X, Media, Publish, WritingToolbar, MetadataRow).
 * Prior: px-1.5 (6px) on calc(100vw-8px) — ~20% more inset → px-2 (8px).
 */
export const FINALIZE_COMPOSER_CHROME_COLUMN_CLASS = `${FINALIZE_COMPOSER_COLUMN_BASE} px-2`;

/**
 * EditingCanvas scroll column (caption, sections, key details, hero content).
 * Prior: px-2.5 (10px) — ~80% more inset → px-[18px].
 * mx-auto: max-w calc(100vw-10px) must center inside the shell (top bar centers via justify-center).
 */
export const FINALIZE_COMPOSER_CANVAS_COLUMN_CLASS = `${FINALIZE_COMPOSER_COLUMN_BASE} mx-auto px-[18px]`;

/** Alias for {@link FINALIZE_COMPOSER_CHROME_COLUMN_CLASS} (top/bottom chrome). */
export const FINALIZE_COMPOSER_COLUMN_CLASS =
  FINALIZE_COMPOSER_CHROME_COLUMN_CLASS;

/** Keeps strip width stable across route changes (CreateFlowTopBar + CreateFlowNoticeStack). */
export let lastCreateFlowBottomTabWidthPx = 0;

export function isCreateFinalizeComposerPath(pathname: string): boolean {
  return (
    pathname === Paths.createFinalize ||
    pathname.startsWith(`${Paths.createFinalize}/`)
  );
}

export function readCreateFlowBottomTabWidthPx(): number {
  if (typeof document === "undefined") return lastCreateFlowBottomTabWidthPx;
  const el = document.getElementById("bottom-tab");
  if (!el) return lastCreateFlowBottomTabWidthPx;
  const w = Math.round(el.getBoundingClientRect().width);
  if (w > 0) lastCreateFlowBottomTabWidthPx = w;
  return lastCreateFlowBottomTabWidthPx;
}

/**
 * Header/notice column width. Prefers last measured tab width so hiding BottomTab
 * on Finalize does not collapse chrome to 0.
 */
export function readCreateFlowComposerWidthPx(): number {
  const fromTab = readCreateFlowBottomTabWidthPx();
  if (fromTab > 0) return fromTab;
  if (lastCreateFlowBottomTabWidthPx > 0) return lastCreateFlowBottomTabWidthPx;
  if (typeof window === "undefined") return 0;
  return Math.min(
    CREATE_FLOW_COMPOSER_MAX_WIDTH_PX,
    Math.max(0, window.innerWidth - 24)
  );
}
