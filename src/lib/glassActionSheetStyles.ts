/**
 * Shared frosted action-sheet presentation (Profile Settings / Group Settings).
 * Visual tokens only — no profile or messaging business logic.
 */

export const glassActionSheetPillClass =
  "rounded-full border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_14px_color-mix(in_oklab,var(--brand)_12%,transparent)]";

/** Multi-line frosted block (e.g. group description) — fixed radius, not a pill. */
export const glassActionSheetRoundedBlockClass =
  "rounded-2xl border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_14px_color-mix(in_oklab,var(--brand)_12%,transparent)]";

export const glassActionSheetRowBaseClass = [
  "flex w-full min-w-0 items-center justify-between gap-2 rounded-full",
  glassActionSheetPillClass,
  "px-2.5 pl-3 pr-1.5 text-[var(--text)] text-[11px] font-medium leading-none",
  "transition-[box-shadow,transform,background-color]",
  "hover:bg-[var(--glass-active-bg)] active:scale-[0.99]",
  "disabled:pointer-events-none disabled:opacity-40",
].join(" ");

export const glassActionSheetRowClass = `${glassActionSheetRowBaseClass} h-10`;

export const glassActionSheetSectionLabelClass =
  "w-full pt-4 pb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text)]/42 first:pt-0";

export const glassActionSheetIconWrapClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_55%,transparent)]";

export const glassActionSheetBackdropClass =
  "pointer-events-auto absolute inset-0 cursor-default border-0 bg-black/50 backdrop-blur-md transition-opacity [backdrop-filter:blur(12px)] [-webkit-backdrop-filter:blur(12px)]";

/** Frosted people / participants panel (Invite-direction). */
export const glassPeoplePanelClass =
  "w-full overflow-hidden rounded-2xl border-2 border-neutral-900/26 bg-[color-mix(in_oklab,var(--surface-2)_34%,transparent)] shadow-sm backdrop-blur-xl app-dark:border-white/34 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)]";

/**
 * Edit Profile — static translucent fills (no per-field backdrop-filter).
 * Pair with a single editor-level blur shell in FullScreenProfileCreation.
 */
export const editProfileFieldFillClass =
  "border border-[var(--bottom-tab-border)] bg-[color-mix(in_oklab,var(--surface-2)_58%,transparent)] app-light:bg-[color-mix(in_oklab,var(--surface-2)_76%,var(--surface))] app-dark:bg-[color-mix(in_oklab,var(--surface-2)_52%,transparent)]";

/** Profile social stat tiles — lighter glass so hero/atmosphere shows through. */
export const profileSocialTileFillClass = [
  "border-[1.5px] border-[color-mix(in_oklab,var(--text)_18%,transparent)]",
  "app-light:border-[color-mix(in_oklab,var(--text)_14%,var(--border))]",
  "app-dark:border-white/24",
  "bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)]",
  "app-light:bg-[color-mix(in_oklab,var(--surface)_38%,transparent)]",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_18%,transparent)]",
  "backdrop-blur-[6px] [-webkit-backdrop-filter:blur(6px)]",
  "shadow-[inset_0_1px_0_color-mix(in_oklab,white_8%,transparent)]",
].join(" ");

export const editProfileFieldPillClass = [
  "h-10 w-full rounded-full px-4 text-[16px] text-[var(--text)]",
  editProfileFieldFillClass,
  "focus:outline-none focus:ring-2 focus:ring-[var(--brand)]",
].join(" ");

export const editProfileFieldBlockClass = [
  "w-full rounded-2xl px-4 py-2 text-[16px] text-[var(--text)]",
  editProfileFieldFillClass,
  "focus:outline-none focus:ring-2 focus:ring-[var(--brand)]",
].join(" ");

/** One full-screen frosted wash for the Edit Profile editor shell. */
export const editProfileShellAtmosphereClass = [
  "pointer-events-none absolute inset-0",
  "bg-[color-mix(in_oklab,var(--surface)_84%,var(--bg))]",
  "app-dark:bg-[color-mix(in_oklab,var(--surface)_70%,transparent)]",
  "app-light:bg-[color-mix(in_oklab,var(--surface)_90%,var(--bg))]",
  "backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))]",
].join(" ");

/**
 * Edit Profile identity zone — photo manager + Echo strip (static fill, no blur).
 * Slightly lifted from the frosted editor shell.
 */
export const editProfileIdentityZoneClass = [
  "mb-6 w-full min-w-0 max-w-full overflow-hidden rounded-[22px] px-2 pt-2 pb-3",
  "bg-[color-mix(in_oklab,var(--surface-2)_74%,var(--surface))]",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_88%,var(--bg))]",
  "app-light:bg-[color-mix(in_oklab,var(--surface-2)_62%,var(--border))]",
].join(" ");

/** Horizontal Echo strip + center gap ring — same neutral family, slightly stronger than zone. */
export const editProfileEchoNeutralToneClass =
  "bg-[color-mix(in_oklab,var(--surface-2)_86%,var(--surface))] app-dark:bg-[color-mix(in_oklab,var(--surface-2)_96%,var(--bg))] app-light:bg-[color-mix(in_oklab,var(--surface-2)_76%,var(--border))]";

export const editProfileEchoStripClass = [
  "relative z-0 flex h-12 w-full min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain",
  "rounded-full border border-[var(--border)]/50 px-2 shadow-sm",
  editProfileEchoNeutralToneClass,
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
].join(" ");

/** Outer knockout ring around selected center Echo (~8px neutral gap). */
export const editProfileEchoGapRingClass = [
  "rounded-full p-2",
  editProfileEchoNeutralToneClass,
].join(" ");

/** Inner high-contrast ring around selected Echo image (~3.5px). */
export const editProfileEchoContrastRingClass = [
  "flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full",
  "border-[3.5px] bg-[var(--surface-2)]",
  "app-dark:border-white app-light:border-[color-mix(in_oklab,var(--text)_88%,black)]",
].join(" ");
