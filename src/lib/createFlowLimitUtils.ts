/** Minimal helpers for create-flow limits — keep tiny and reusable. */

import { CREATE_FLOW_LIMITS } from "./createFlowLimits";

export function clampString(value: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen);
}

export function stringLength(value: string): number {
  return value.length;
}

export function charsRemaining(value: string, maxLen: number): number {
  return Math.max(0, maxLen - value.length);
}

export function countAtMax(currentCount: number, max: number): boolean {
  return currentCount >= max;
}

/** "12/80" style for subtle counters */
export function formatCharCount(value: string, maxLen: number): string {
  const n = Math.min(stringLength(value), maxLen);
  return `${n}/${maxLen}`;
}

export type CharLimitTone = "normal" | "warning" | "max";

/** Last ~15% of budget reads as “near limit”; at cap reads as “max”. */
export function charLimitTone(len: number, maxLen: number): CharLimitTone {
  if (maxLen <= 0) return "normal";
  if (len >= maxLen) return "max";
  if (len / maxLen >= 0.85) return "warning";
  return "normal";
}

export function charCounterClassForTone(tone: CharLimitTone): string {
  switch (tone) {
    case "max":
      return "font-semibold text-[color-mix(in_oklab,var(--brand-dark)_82%,var(--text))]";
    case "warning":
      return "font-medium text-[color-mix(in_oklab,var(--brand-dark)_52%,var(--text))]";
    default:
      return "text-[var(--text)]/42 app-dark:text-[var(--text)]/52";
  }
}

/** Optional extra classes for capped fields (border/ring emphasis at max). */
export function charFieldRingClassForTone(tone: CharLimitTone): string {
  switch (tone) {
    case "max":
      return "ring-2 ring-[color-mix(in_oklab,var(--brand)_42%,transparent)] !border-[color-mix(in_oklab,var(--brand)_38%,var(--border))]";
    case "warning":
      return "ring-1 ring-[color-mix(in_oklab,var(--brand)_22%,transparent)]";
    default:
      return "";
  }
}

/** Subtle counter styling (legacy default = normal tone body) */
export const CREATE_FLOW_SUBTLE_COUNTER_CLASS =
  "text-[10px] tabular-nums text-[var(--text)]/38";

export function visibleActivityTagLines(tags: string[]): string[] {
  return tags.filter((t) => t.toLowerCase() !== "custom");
}

/** Max length for the next tag line being composed (first line shorter). */
export function maxCharsForNextActivityTagEntry(tags: string[]): number {
  const visible = visibleActivityTagLines(tags);
  return visible.length === 0
    ? CREATE_FLOW_LIMITS.activities.activityPrimaryLineMaxChars
    : CREATE_FLOW_LIMITS.activities.activityNoteLineMaxChars;
}

/** Max length for an existing line at visible index (0 = primary, 1+ = note lines). */
export function maxCharsForActivityTagLineAtVisibleIndex(
  visibleIndex: number
): number {
  return visibleIndex === 0
    ? CREATE_FLOW_LIMITS.activities.activityPrimaryLineMaxChars
    : CREATE_FLOW_LIMITS.activities.activityNoteLineMaxChars;
}
