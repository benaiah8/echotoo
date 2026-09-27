/**
 * Shared gray surface for finalize canvas meta: date, location, key details.
 * Light mode: soft light gray on white. Dark mode: lifted gray (between prior too-light / too-dark).
 */
export const finalizeMetaSurfaceClass =
  "border border-[var(--border)]/40 bg-[color-mix(in_oklab,var(--surface-2)_52%,white)] shadow-[0_2px_8px_rgba(247,208,71,0.08),0_4px_14px_rgba(247,208,71,0.05)] app-dark:border-white/[0.09] app-dark:bg-[color-mix(in_oklab,var(--surface)_76%,var(--surface-2))] app-dark:shadow-[0_2px_8px_rgba(247,208,71,0.1),0_4px_16px_rgba(247,208,71,0.06)]";

/**
 * Create Finalize saved Date / Location rows — subtle border + light wash, no amber glow.
 * Relates to compact action “saved” treatment (bg-white/10), not the filled chip surface.
 */
export const finalizeMetaRowSurfaceClass =
  "border border-[color-mix(in_oklab,var(--border)_70%,transparent)] bg-white/5 shadow-none app-dark:border-white/[0.12] app-dark:bg-white/[0.05]";

/**
 * Create Finalize saved note chips only — quiet border + wash, no amber glow.
 * Do not use for Feed / Post Detail / Profile (those keep finalizeMetaSurfaceClass).
 */
export const finalizeMetaChipSurfaceClass =
  "border border-[color-mix(in_oklab,var(--border)_70%,transparent)] bg-white/5 shadow-none app-dark:border-white/[0.12] app-dark:bg-white/[0.05]";

/**
 * Decorative empty note preview inside the open KeyInfo composer (zero saved notes).
 * Quieter than a real chip; not interactive / not persisted.
 */
export const finalizeMetaChipGhostSurfaceClass =
  "pointer-events-none h-[1.625rem] w-20 shrink-0 rounded-[14px] border border-[color-mix(in_oklab,var(--border)_45%,transparent)] bg-white/[0.03] shadow-none app-dark:border-white/[0.08] app-dark:bg-white/[0.025]";

/**
 * Temporary note-editing panel while KeyInfo editor is open.
 * Border-only / light wash; no amber glow.
 */
export const finalizeMetaNotesComposerSurfaceClass =
  "rounded-[16px] border border-[color-mix(in_oklab,var(--border)_70%,transparent)] bg-white/[0.03] p-2.5 shadow-none app-dark:border-white/[0.12] app-dark:bg-white/[0.03]";

/** Equal vertical gap: notes area ↔ date ↔ location (~12px). */
export const finalizeMetaStackGapClass = "gap-3";

/** Below-caption stack gap when Date/Location meta is visible (~16px). */
export const finalizeMetaToSectionsGapClass = "gap-4";

/** Below-caption stack gap when no Date/Location pills — slightly closer to Add a section (~12px). */
export const finalizeMetaToSectionsGapCompactClass = "gap-3";
