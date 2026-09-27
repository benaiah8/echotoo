/**
 * Narrow z-index tiers for social-action surfaces vs photo-gate prompts.
 * Keep in sync with BottomDrawer portalClassName / PairUpPhotoPromptMount.
 *
 * Hierarchy (low → high):
 * - social create/manage drawers (~130)
 * - source browse / pair-up note (~140)
 * - contextual Group Manage conversation (~145)
 * - social photo gate prompt (~150)
 * - photo gate media acquisition (~160)
 * - full-screen Edit Profile (~170)
 * - Edit Profile media acquisition chooser (~180)
 * - AvatarCropModal (~205)
 * - FrostedCenterModal dialog (~200+)
 * - social-action toaster (10040 — chrome, not a sheet)
 */

export const SOCIAL_OVERLAY_LAYER = {
  /** Group create/manage, Open Plan, requesters. */
  createManage: "z-[130]",
  /** Source Groups browse, Pair Up note sheet. */
  browseOrNote: "z-[140]",
  /**
   * Routed conversation opened from Group Manage (above browse/manage,
   * below photo gate). Normal Messages conversations stay at z-[110].
   */
  socialConversation: "z-[145]",
  /**
   * Profile photo / completion gate — must sit above every social-action sheet
   * that can open it (including Source Groups at browseOrNote and contextual chat).
   */
  photoGate: "z-[150]",
  /** MediaAcquisitionSheet opened from the photo gate. */
  photoGateAcquisition: "z-[160]",
  /** Full-screen Edit Profile opened from the photo gate (or profile). */
  editProfile: "z-[170]",
  /**
   * MediaAcquisitionSheet opened from Edit Profile (native).
   * Must sit above editProfile so the chooser is not buried under the editor.
   * Remains below AvatarCropModal (z-[205]).
   */
  editProfileAcquisition: "z-[180]",
} as const;

export type SocialOverlayLayerKey = keyof typeof SOCIAL_OVERLAY_LAYER;

/** CSS custom property: bottom offset for the social-action toaster. */
export const SOCIAL_TOAST_BOTTOM_CSS_VAR = "--social-action-toast-bottom";

/**
 * When Source Groups browse is open: sit just above the fixed footer tray
 * (BottomDrawer transparent bottom pad + footer pb-3 + tray ≈ 3rem + gap).
 * Replaces the Feed bottom-tab default (72px + safe).
 */
export const SOURCE_GROUPS_SOCIAL_TOAST_BOTTOM =
  "calc(max(0.75rem, calc(0.5rem + var(--safe-area-bottom-layout, 0px))) + 0.75rem + 3rem + 0.5rem)";

export const DEFAULT_SOCIAL_TOAST_BOTTOM =
  "calc(72px + var(--safe-area-bottom-layout, 0px))";
