/**
 * People shell V11.4 — outline-only Duo/Groups frames + minimal center pill.
 * No rotated shelves, SVG wings, or full-bleed side art.
 */

import {
  isAndroid,
  isIOS,
  isNativeApp,
} from "../../lib/storage/utils/capacitorDetection";

/** Back inset from People viewport (optical face; no double gutter). */
export const PEOPLE_BACK_EDGE_INSET_PX = 16;
export const PEOPLE_EDGE_INSET_PX = PEOPLE_BACK_EDGE_INSET_PX;

/** Gap between Connect and nav controls — Connect not redesigned. */
export const PEOPLE_ACTION_TO_NAV_GAP_PX = 30;

/**
 * Duo/Groups outer control height (Feed hit construction):
 * face h-7 (28) + py-[3px]×2 inside min-h-9 (36). Extrusion y≈2.75 stays
 * within the hit box; outer visual/control height = 36.
 */
export const PEOPLE_END_FACE_H_PX = 28; // h-7
export const PEOPLE_END_HIT_MIN_H_PX = 36; // min-h-9
export const PEOPLE_END_HIT_PAD_Y_PX = 3; // py-[3px]
export const PEOPLE_END_HIT_PAD_X_LEFT_PX = 3; // pl-[3px]
export const PEOPLE_END_HIT_PAD_X_RIGHT_PX = 2; // pr-0.5
export const PEOPLE_END_BTN_OUTER_H_PX = PEOPLE_END_HIT_MIN_H_PX;

/**
 * Shared Duo/Groups face — fixed to longer label "Groups".
 * Extra horizontal breathing vs V11 (not font size).
 */
export const PEOPLE_END_FACE_W_CSS = "4.375rem"; // 70px @ 16px root
export const PEOPLE_END_FACE_W_PX = 70;
/** @deprecated Prefer PEOPLE_END_FACE_W_CSS */
export const PEOPLE_END_FACE_MIN_W_CSS = PEOPLE_END_FACE_W_CSS;
export const PEOPLE_END_LABEL_FONT_SIZE_PX = 11;

/** Hit wrapper outer width = face + hit gutters (Duo === Groups). */
export const PEOPLE_END_BTN_OUTER_W_PX =
  PEOPLE_END_FACE_W_PX +
  PEOPLE_END_HIT_PAD_X_LEFT_PX +
  PEOPLE_END_HIT_PAD_X_RIGHT_PX;

/**
 * Local housing padding — thin pill cradle around Feed button (shared L/R).
 * Horizontal 3px · vertical 2px. State does not resize housing.
 */
export const PEOPLE_END_HOUSING_PAD_X_PX = 3;
export const PEOPLE_END_HOUSING_PAD_Y_PX = 2;

/**
 * Simple pill holder — no asymmetry (V11.3).
 * Duo and Groups share the same rounded-full cradle.
 */
export const PEOPLE_PRIMARY_HOUSING_RADIUS_DUO_CSS = "rounded-full";
export const PEOPLE_PRIMARY_HOUSING_RADIUS_GROUPS_CSS = "rounded-full";
/** @deprecated Prefer PEOPLE_PRIMARY_HOUSING_RADIUS_DUO_CSS */
export const PEOPLE_PRIMARY_HOUSING_RADIUS_CSS =
  PEOPLE_PRIMARY_HOUSING_RADIUS_DUO_CSS;

/** Housing outer box (shared Duo/Groups; state does not resize). */
export const PEOPLE_END_HOUSING_H_PX =
  PEOPLE_END_BTN_OUTER_H_PX + PEOPLE_END_HOUSING_PAD_Y_PX * 2;
export const PEOPLE_END_HOUSING_W_PX =
  PEOPLE_END_BTN_OUTER_W_PX + PEOPLE_END_HOUSING_PAD_X_PX * 2;

/**
 * Gap between primary housing outer edge and center pill outer edge.
 * Prefer reducing this before shrinking Duo/Groups when 320 is tight.
 */
export const PEOPLE_PRIMARY_TO_CENTER_GAP_PX = 6;

/** Flat primary nav max width — wider than Home tab pill; bottom baseline unchanged. */
export const PEOPLE_CENTER_W_CSS = "min(440px, calc(100% - 20px))";
/**
 * Uniform outer capsule padding (all sides). Keep X === Y so Back↔left and
 * Groups↔right match top/bottom breathing room.
 */
export const PEOPLE_CENTER_PAD_Y_PX = 5;
export const PEOPLE_CENTER_PAD_X_PX = PEOPLE_CENTER_PAD_Y_PX;
/** Outer frosted nav height = pad*2 + control height. */
export const PEOPLE_ACTIVE_PILL_MIN_H_PX = 40;
export const PEOPLE_CENTER_H_PX =
  PEOPLE_ACTIVE_PILL_MIN_H_PX + PEOPLE_CENTER_PAD_Y_PX * 2;
/** Horizontal padding inside each content-sized destination pill. */
export const PEOPLE_DEST_PAD_X_PX = 11;
/** Gap between Back and destinations inside the shared frosted pill. */
export const PEOPLE_NAV_ITEM_GAP_PX = 3;
/** @deprecated Back is inside the nav; kept for content-pad math aliases. */
export const PEOPLE_BACK_TO_NAV_GAP_PX = PEOPLE_NAV_ITEM_GAP_PX;

/** @deprecated Aliases for content-pad estimates */
export const PEOPLE_PILL_NAV_H_PX = PEOPLE_CENTER_H_PX;
export const PEOPLE_FLUID_NAV_H_PX = PEOPLE_CENTER_H_PX;
export const PEOPLE_FLUID_CENTER_H_PX = PEOPLE_CENTER_H_PX;
export const PEOPLE_FLUID_CENTER_RAISE_PX = 0;
/** BottomTab-style ring extends 2px outside the center pill box. */
export const PEOPLE_CENTER_RING_PX = 2;
export const PEOPLE_END_PILL_W_PX = PEOPLE_END_FACE_W_PX;
export const PEOPLE_END_PILL_H_PX = PEOPLE_END_FACE_H_PX;
export const PEOPLE_FLUID_DUO_W_PX = PEOPLE_END_PILL_W_PX;
export const PEOPLE_FLUID_GROUPS_W_PX = PEOPLE_END_PILL_W_PX;
export const PEOPLE_PILL_GAP_PX = PEOPLE_PRIMARY_TO_CENTER_GAP_PX;
export const PEOPLE_CLUSTER_SIDE_GUTTER_PX = 0;

/** Nominal nav chrome height for content bottom pad. */
export const PEOPLE_NAV_CHROME_H_PX = Math.round(
  Math.max(PEOPLE_CENTER_H_PX, PEOPLE_END_HOUSING_H_PX) + 16
);

export const PEOPLE_ACTION_CIRCLE_PX = 72;
export const PEOPLE_ACTION_CIRCLE_MAX_PX = PEOPLE_ACTION_CIRCLE_PX;
export const PEOPLE_ACTION_CAPSULE_H_PX = PEOPLE_ACTION_CIRCLE_PX;

/** Mine compact Connect height — single source for button AND shell reservation. */
export const PEOPLE_MINE_CONNECT_H_PX = 46;
/** @deprecated Prefer {@link PEOPLE_MINE_CONNECT_H_PX}. */
export const PEOPLE_MINE_CONNECT_PILL_H_PX = PEOPLE_MINE_CONNECT_H_PX;
/** Horizontal padding inside the Mine Connect pill. */
export const PEOPLE_MINE_CONNECT_PILL_PAD_X_PX = 18;
/** Tighter action→nav gap under the Mine pill. */
export const PEOPLE_MINE_ACTION_TO_NAV_GAP_PX = 16;
/**
 * Sole visible blank band between Mine note/content and Connect.
 * Owned by {@link peopleShellMineContentBottomPad} — not a second deck spacer.
 */
export const PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX = 22;

export const PEOPLE_BACK_SIZE_PX = 40;

/** Extra gap below the Back control inside `peopleShellContentTopPad`. */
export const PEOPLE_SHELL_CONTENT_BELOW_BACK_GAP_PX = 8;

/**
 * Mine reclaim: drop Back row from content top pad so the carousel starts at
 * Back top. Must match `PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX` (chrome +host).
 */
export const PEOPLE_SHELL_MINE_TOP_RECLAIM_PX =
  PEOPLE_BACK_SIZE_PX + PEOPLE_SHELL_CONTENT_BELOW_BACK_GAP_PX;

export const PEOPLE_EXTRUSION_PX = 2;
export const PEOPLE_PRESS_DURATION_MS = 100;

/** Interactive lift above BottomTab-equivalent safe baseline. */
export const PEOPLE_SHELL_VISUAL_LIFT_PX = 20;

export const PEOPLE_SHELL_IS_2D = true;
export const PEOPLE_SHELL_HAS_EXTRUSION = true;
export const PEOPLE_SHELL_HAS_EDGE_WINGS = false;
export const PEOPLE_SHELL_HAS_SVG_WINGS = false;
export const PEOPLE_SHELL_HAS_PRIMARY_SHELVES = false;
export const PEOPLE_SHELL_HAS_END_HOUSINGS = false;
/** Dock gradient still uses art-bottom; interactive controls use dock bottom. */
export const PEOPLE_SHELL_HAS_SEPARATE_ART_CONTROL_BOTTOM = true;
export const PEOPLE_SHELL_WINGS_POINTER_EVENTS = "none" as const;
export const PEOPLE_SHELL_RIGHT_WING_MIRRORS_LEFT = false;
export const PEOPLE_SHELL_HAS_OUTER_DOCK = false;
export const PEOPLE_SHELL_HAS_PROTRUDING_ACTION = false;
export const PEOPLE_SHELL_HAS_HOME = false;
export const PEOPLE_SHELL_SHOWS_PREV_NEXT = false;
export const PEOPLE_SHELL_HAS_FLUID_NAV = true;
export const PEOPLE_SHELL_HAS_THREE_PILL_NAV = false;
export const PEOPLE_SHELL_HAS_FLAT_PRIMARY_NAV = true;
export const PEOPLE_SHELL_HAS_FLUID_CONNECTOR_SPANS = false;
export const PEOPLE_SHELL_BACK_IN_FLUID_NAV = true;
export const PEOPLE_SHELL_ACTION_IN_FLUID_NAV = false;
export const PEOPLE_SHELL_DUO_GROUPS_HAS_ICONS = false;
export const PEOPLE_SHELL_CONTENT_OVERLAP = false;
export const PEOPLE_SHELL_CONNECT_SHAPE = "circle" as const;
export const PEOPLE_SHELL_HAS_SELECTED_UNDERLINE = false;
export const PEOPLE_SHELL_HAS_SELECTED_GRADIENT = false;
export const PEOPLE_SHELL_ACTION_DETACHED = true;
export const PEOPLE_SHELL_ACTION_ALWAYS_CIRCLE = true;
export const PEOPLE_SHELL_STABLE_END_WIDTH = false;
export const PEOPLE_SHELL_STABLE_CENTER_COLUMN = true;
export const PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB = 45;
export const PEOPLE_SHELL_BACK_USES_VIEWPORT_INSET = true;
export const PEOPLE_SHELL_PROPORTIONAL_GEOMETRY = true;

/** Flat People primary destinations (UI). Internal scopes stay my_plans / discover / open_plans / groups. */
export const PEOPLE_FLAT_DESTINATION_ORDER = [
  "duo",
  "discover",
  "plans",
  "groups",
] as const;

export type PeopleFlatDestination =
  (typeof PEOPLE_FLAT_DESTINATION_ORDER)[number];

export const DUO_SUBMODE_ORDER = [
  "my_plans",
  "discover",
  "open_plans",
] as const;

export type DuoSubmode = (typeof DUO_SUBMODE_ORDER)[number];

/** Browse-tab order for Groups Yours secondary control (not primary nav). */
export const GROUPS_SUBMODE_ORDER = ["new", "yours"] as const;

export type GroupsSubmode = (typeof GROUPS_SUBMODE_ORDER)[number];

export function stepDuoSubmode(
  current: DuoSubmode,
  direction: 1 | -1
): DuoSubmode {
  const i = DUO_SUBMODE_ORDER.indexOf(current);
  const next = Math.max(0, Math.min(DUO_SUBMODE_ORDER.length - 1, i + direction));
  return DUO_SUBMODE_ORDER[next]!;
}

export function stepGroupsSubmode(
  current: GroupsSubmode,
  direction: 1 | -1
): GroupsSubmode {
  const i = GROUPS_SUBMODE_ORDER.indexOf(current);
  const next = Math.max(
    0,
    Math.min(GROUPS_SUBMODE_ORDER.length - 1, i + direction)
  );
  return GROUPS_SUBMODE_ORDER[next]!;
}

export function stepPeopleFlatDestination(
  current: PeopleFlatDestination,
  direction: 1 | -1
): PeopleFlatDestination {
  const i = PEOPLE_FLAT_DESTINATION_ORDER.indexOf(current);
  const next = Math.max(
    0,
    Math.min(PEOPLE_FLAT_DESTINATION_ORDER.length - 1, i + direction)
  );
  return PEOPLE_FLAT_DESTINATION_ORDER[next]!;
}

/**
 * Interactive controls bottom — EXACT same band as Home `BottomTab`
 * (`bottomTabBottomOffset` in BottomTab.tsx). No People-only visual lift.
 */
export function peopleShellDockBottomOffset(): string {
  if (isNativeApp() && isAndroid()) {
    return "max(14px, calc(var(--safe-area-bottom-layout, 0px) + 6px))";
  }
  if (isIOS()) {
    return "max(5px, min(22px, calc(var(--safe-area-bottom-layout, 0px) - 14px)))";
  }
  return "8px";
}

/** Same as {@link peopleShellDockBottomOffset} (Home BottomTab baseline). */
export function peopleShellSafeBottomBaseline(): string {
  return peopleShellDockBottomOffset();
}

/**
 * Decorative dock gradient full-bleed bottom (BottomTab-equivalent).
 * Not used for side shelf art (removed in V11).
 */
export function peopleShellArtBottomOffset(): string {
  return "calc(-1px + -1 * var(--safe-area-bottom-layout, 0px))";
}

export function peopleShellContentBottomPad(): string {
  const chromeH =
    PEOPLE_ACTION_CIRCLE_PX +
    PEOPLE_ACTION_TO_NAV_GAP_PX +
    PEOPLE_NAV_CHROME_H_PX;
  return `calc(${chromeH}px + var(--safe-area-bottom-layout, 0px) + 12px)`;
}

/**
 * Mine — content clears Connect + the single note→Connect gap + dock chrome.
 *
 *   reservation =
 *     PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX
 *     + PEOPLE_MINE_CONNECT_H_PX
 *     + PEOPLE_MINE_ACTION_TO_NAV_GAP_PX
 *     + PEOPLE_NAV_CHROME_H_PX
 *     + safe-area
 *
 * No separate deck-column visual spacer; no extra +12px fudge band.
 */
export function peopleShellMineContentBottomPad(): string {
  const chromeH =
    PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX +
    PEOPLE_MINE_CONNECT_H_PX +
    PEOPLE_MINE_ACTION_TO_NAV_GAP_PX +
    PEOPLE_NAV_CHROME_H_PX;
  return `calc(${chromeH}px + var(--safe-area-bottom-layout, 0px))`;
}

/** Discover / Plans / Groups — reserve Back row above the deck. */
export function peopleShellContentTopPad(): string {
  return `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_BACK_EDGE_INSET_PX}px + ${PEOPLE_BACK_SIZE_PX}px + ${PEOPLE_SHELL_CONTENT_BELOW_BACK_GAP_PX}px)`;
}

/** Mine — content/carousel starts at Back top (safe-area + 16). */
export function peopleShellMineContentTopPad(): string {
  return `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_BACK_EDGE_INSET_PX}px)`;
}

export const PEOPLE_SHELL_STACK_ORDER = [
  "deck",
  "action",
  "pill-nav",
  "safe-area",
] as const;

export function peopleShellActionUsesCircle(
  ..._args: Array<string | null | undefined>
): boolean {
  void _args;
  return true;
}

export function peopleCenterWidthPctAt(viewportPx: number): number {
  const raw = viewportPx * 0.46;
  const clamped = Math.min(196, Math.max(152, raw));
  return (clamped / viewportPx) * 100;
}

/** Housing outer width % of viewport (docs/tests). */
export function peopleEndHousingWidthPctAt(viewportPx: number): number {
  return (PEOPLE_END_HOUSING_W_PX / viewportPx) * 100;
}
