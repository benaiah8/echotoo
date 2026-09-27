/**
 * Duo/Group social-action presentation (CSS only).
 * Separate yellow pills on an inverse contrast shelf (Feed/Profile edge-bleed).
 * Skeletal outlined 3D backing — not a solid black slab.
 */

export type SocialPillTone = "inactive" | "active" | "loading" | "disabled";

export function socialPillHitClassName(className = ""): string {
  return [
    "group/social relative inline-flex min-h-9 shrink-0 items-center justify-center",
    /* Room for left/bottom skeletal extrusion */
    "pl-[3px] pr-0.5 py-[3px]",
    "overflow-visible",
    "disabled:pointer-events-none",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export const SOCIAL_PILL_RADIUS = "rounded-[12px_16px_11px_15px]";

const sizeFeed =
  "gap-1 px-2.5 text-[11px] leading-none tracking-[0.01em]";
const sizeCompact =
  "gap-0.5 px-2 text-[10px] leading-none tracking-[0.01em]";
const sizeDock =
  "gap-1 px-2.5 text-[11px] leading-none tracking-[0.01em]";

function sizeClass(size?: "feed" | "compact" | "dock"): string {
  if (size === "compact") return sizeCompact;
  if (size === "dock") return sizeDock;
  return sizeFeed;
}

/** Stable Duo face width — loading and loaded share the same slot. */
export function socialDuoFaceStableWidthClassName(
  size?: "feed" | "compact" | "dock"
): string {
  return size === "compact" ? "min-w-[2.5rem]" : "min-w-[2.75rem]";
}

/**
 * Compact Group face width for the word only (count badge adds width when present).
 */
export function socialGroupFaceStableWidthClassName(
  size?: "feed" | "compact" | "dock"
): string {
  return size === "compact" ? "min-w-[2.75rem]" : "min-w-[3.25rem]";
}

/**
 * Skeletal 3D backing — outlined second layer, fixed on press.
 * Passive: muted yellow, recedes.
 * Active: solid green physical cue (LEFT + BOTTOM), stronger than passive.
 */
export function socialPillExtrusionClassName(tone: SocialPillTone): string {
  const base = [
    "pointer-events-none absolute inset-0 z-0",
    SOCIAL_PILL_RADIUS,
    "border",
    "box-border",
  ];

  if (tone === "active") {
    return [
      ...base,
      "translate-x-[-2.75px] translate-y-[2.75px]",
      "bg-[#21945C]",
      "app-dark:bg-[color-mix(in_oklab,var(--green-text)_90%,#0a0a0a)]",
      "border-[#21945C]",
      "app-dark:border-[#0a0a0a]",
    ].join(" ");
  }

  /**
   * Quiet recessed backing — same yellow family as the face.
   * Light: muted amber under softer inactive yellow.
   * Dark: unchanged brand→text mix.
   */
  return [
    ...base,
    "translate-x-[-2.5px] translate-y-[2.5px]",
    "bg-[#B9944E]",
    "app-dark:bg-[color-mix(in_oklab,var(--brand)_42%,var(--text))]",
    "border-[#29232B]",
    "app-dark:border-[color-mix(in_oklab,#0a0a0a_75%,var(--text))]",
  ].join(" ");
}

/**
 * Local ambient green glow behind an ACTIVE pill only (separate from 3D backing).
 * Paint-only; see `.social-pill-active-glow` in index.css for blur/alpha + press.
 */
export function socialPillActiveGlowClassName(): string {
  return [
    "social-pill-active-glow",
    "pointer-events-none absolute z-0",
    "inset-[-1px]",
    SOCIAL_PILL_RADIUS,
  ].join(" ");
}

/**
 * Face presses into backing via group-active (CSS). Reduced-motion: no transform.
 */
export function socialPillFaceClassName(opts: {
  tone: SocialPillTone;
  size?: "feed" | "compact" | "dock";
  className?: string;
}): string {
  const faceBase = [
    "relative z-[1] inline-flex h-7 items-center justify-center",
    SOCIAL_PILL_RADIUS,
    "border",
    "box-border",
    "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
    "motion-safe:group-active/social:translate-x-[-2px] motion-safe:group-active/social:translate-y-[2px]",
    "motion-safe:group-active/social:duration-75",
    sizeClass(opts.size),
  ];

  if (opts.tone === "active") {
    return [
      ...faceBase,
      "font-bold",
      /* Same yellow family as inactive; green lives in extrusion only */
      "border-[#FFFFFF]",
      "app-dark:border-[#0a0a0a]",
      "bg-[#F7D047] text-[#29232B]",
      "app-dark:bg-[var(--brand)] app-dark:text-[var(--brand-ink)]",
      opts.className ?? "",
    ].join(" ");
  }

  if (opts.tone === "loading" || opts.tone === "disabled") {
    return [
      ...faceBase,
      "font-semibold",
      opts.tone === "loading" ? "opacity-55" : "opacity-40",
      "border-[color-mix(in_oklab,var(--text)_10%,transparent)]",
      "bg-[color-mix(in_oklab,var(--surface)_55%,var(--glass-bg))]",
      "text-[var(--text)]/55",
      "app-dark:bg-[color-mix(in_oklab,var(--surface)_60%,#161618)]",
      "app-dark:border-white/10",
      "app-dark:text-white/50",
      opts.className ?? "",
    ].join(" ");
  }

  /**
   * Passive — same yellow family as active, slightly softer face.
   * Text/border stay full-strength (no whole-button opacity).
   * Dark: brand mixed into shelf (`--text`) — unchanged.
   */
  return [
    ...faceBase,
    "font-semibold",
    "border-[#FFFFFF]",
    "app-dark:border-[#0a0a0a]",
    "bg-[#FFE5A0] text-[#29232B]",
    "app-dark:bg-[color-mix(in_oklab,var(--brand)_68%,var(--text))] app-dark:text-[var(--brand-ink)]",
    opts.className ?? "",
  ].join(" ");
}

export function socialPillStackClassName(): string {
  return "relative inline-flex overflow-visible";
}

/** Expanding tap/attention ripple — always green (reinforces social activation). */
export function socialPillRippleClassName(): string {
  return [
    "pointer-events-none absolute z-0",
    "inset-[-3px]",
    SOCIAL_PILL_RADIUS,
    "border border-solid",
    "opacity-0 scale-[0.88]",
    "origin-center",
    "border-[color-mix(in_oklab,var(--green-text)_55%,transparent)]",
    "bg-[color-mix(in_oklab,var(--green-text)_14%,transparent)]",
    "app-dark:border-[color-mix(in_oklab,var(--green-text)_48%,white)]",
    "app-dark:bg-[color-mix(in_oklab,var(--green-text)_18%,transparent)]",
  ].join(" ");
}

export function socialPillClassName(opts: {
  tone: SocialPillTone;
  size?: "feed" | "compact" | "dock";
  className?: string;
}): string {
  return [socialPillHitClassName(), socialPillFaceClassName(opts)].join(" ");
}

/**
 * Integrated Group count badge — true circle; tone follows Group face.
 * Inactive (muted yellow): white circle / dark number.
 * Active (full yellow): green circle / brand-ink number.
 * Never used for 0.
 */
export function socialCountClassName(opts?: {
  tone?: SocialPillTone;
  /** Digits to render — 10+ uses slightly smaller type, stays circular. */
  value?: number;
}): string {
  const tone = opts?.tone ?? "inactive";
  const value = opts?.value;
  const multiDigit =
    typeof value === "number" && Number.isFinite(value) && value >= 10;

  const shape = [
    "ml-0.5 inline-flex shrink-0 items-center justify-center",
    "h-[18px] w-[18px] aspect-square rounded-full",
    "tabular-nums font-bold leading-none",
    multiDigit ? "text-[9px]" : "text-[10px]",
    "pointer-events-none select-none",
  ];

  if (tone === "active") {
    return [
      ...shape,
      /* Green count reinforces active extrusion on brand-yellow face */
      "bg-[#21945C] text-[#29232B]",
      "app-dark:bg-[var(--green-text)] app-dark:text-[var(--brand-ink)]",
    ].join(" ");
  }

  return [
    ...shape,
    "bg-white text-[#29232B]",
    "app-dark:bg-white app-dark:text-[color:oklch(0.22_0.02_260)]",
  ].join(" ");
}

/**
 * Post Detail dock host — transparent; cluster owns the inverse shelf.
 */
export function socialDockPlateClassName(className = ""): string {
  return ["inline-flex items-center overflow-visible", className]
    .filter(Boolean)
    .join(" ");
}

/* ——— Inverse contrast shelf (decorative) ——— */

export function socialContrastShelfClusterClassName(className = ""): string {
  return [
    "relative inline-flex min-w-0 shrink-0 items-center overflow-visible",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Compact button row on the shelf.
 * Feed/Profile: left breathing room, flush right into bleed.
 * Detail (pill): balanced L/R inset; extra vertical pad so 3D pills sit centered
 * in the capsule (top was tight vs empty bottom under the faces).
 */
export function socialContrastShelfRowClassName(opts?: {
  /** Tighter vertical pad; used for detail dock + compact. */
  compact?: boolean;
  /** Fully rounded detail shelf — match left/right inset. */
  pill?: boolean;
}): string {
  const horizontal = opts?.pill
    ? "pl-2 pr-2"
    : "pl-2 pr-0.5";
  /* Detail pill: slight vertical inset (top a touch tighter than bottom). */
  const vertical = opts?.pill
    ? "pt-[3.4px] pb-[3.6px]"
    : opts?.compact
      ? "py-px"
      : "py-0.5";
  return [
    "relative z-[1] inline-flex shrink-0 items-center overflow-visible",
    "gap-1.5",
    horizontal,
    vertical,
  ].join(" ");
}

/**
 * Home Event rail — Duo/Group pills on the card with no inverse shelf plate.
 * Spread across the row (rail-only); Hangout reserves right padding for the menu.
 */
export function socialRailBareRowClassName(): string {
  return [
    "relative z-[1] flex w-full min-w-0 items-center justify-between overflow-visible",
    "gap-2",
    "py-0",
    "px-0",
  ].join(" ");
}

/**
 * Inverse shelf plate (only where SocialActionCluster mounts a shelf).
 * Light: smoky plum slate `#89818F`.
 * Dark: white via `--text` — unchanged.
 * Feed/Profile bleed: pill LEFT, open RIGHT into viewport edge.
 * Post Detail (no bleed): full `rounded-full` capsule.
 * Home Events rail: no shelf plate (bare row) — do not use this helper there.
 */
export function socialContrastShelfClassName(opts?: {
  bleed?: boolean;
}): string {
  const shape = opts?.bleed
    ? "rounded-l-full rounded-r-none"
    : "rounded-full";
  return [
    "social-action-contrast-shelf",
    "pointer-events-none absolute inset-0 z-0",
    shape,
    "bg-[#89818F]",
    "app-dark:bg-[var(--text)]",
    opts?.bleed ? "social-action-contrast-shelf--bleed" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
