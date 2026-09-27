/**
 * Session-scoped Duo/Group visual attention (no RPCs / onPress).
 *
 * Model: ~10s continuous visible dwell → Duo cue then Group cue, once per
 * source per session, with a global cooldown between cues.
 *
 * Leaf helpers only — no React / overlay store imports.
 */

export const SOCIAL_ATTENTION_DWELL_MS = 10_000;
export const SOCIAL_ATTENTION_PRESS_MS = 170;
export const SOCIAL_ATTENTION_GAP_MS = 380;
export const SOCIAL_ATTENTION_RIPPLE_MS = 400;
export const SOCIAL_ATTENTION_GLOBAL_COOLDOWN_MS = 50_000;
export const SOCIAL_ATTENTION_VISIBLE_RATIO = 0.6;

/** Sources that already received a cue or a real user press this session. */
const noticedSources = new Set<string>();
let lastAutoCueAtMs = 0;

export function hasSocialSourceNoticedThisSession(sourceId: string): boolean {
  return noticedSources.has(sourceId);
}

export function markSocialSourceNoticedThisSession(sourceId: string): void {
  if (!sourceId) return;
  noticedSources.add(sourceId);
}

export function canAutoCueSocialSource(
  sourceId: string,
  now = Date.now()
): boolean {
  if (!sourceId) return false;
  if (noticedSources.has(sourceId)) return false;
  if (
    lastAutoCueAtMs > 0 &&
    now - lastAutoCueAtMs < SOCIAL_ATTENTION_GLOBAL_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

/** Call when an automatic cue actually starts playing. */
export function recordSocialAutoCuePlayed(
  sourceId: string,
  now = Date.now()
): void {
  if (!sourceId) return;
  noticedSources.add(sourceId);
  lastAutoCueAtMs = now;
}

/** @deprecated Prefer hasSocialSourceNoticedThisSession — kept for old tests. */
export function hasSocialAttentionPlayedThisSession(): boolean {
  return noticedSources.size > 0;
}

/** @deprecated Prefer markSocialSourceNoticedThisSession */
export function markSocialAttentionPlayedThisSession(): void {
  /* no-op global latch removed — use per-source APIs */
}

/** Test helper */
export function __resetSocialAttentionSessionForTests(): void {
  noticedSources.clear();
  lastAutoCueAtMs = 0;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.getAttribute("contenteditable") === "true";
}

/**
 * Best-effort: open drawer/modal/overlay via DOM only (no store imports).
 */
export function isBlockingOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  try {
    if (document.querySelector("[data-overlay-open='true']")) return true;
    if (document.querySelector("[role='dialog'][aria-modal='true']")) return true;
    if (document.querySelector("[data-vaul-drawer][data-state='open']")) return true;
  } catch {
    /* noop */
  }
  return false;
}

const ATTENTION_ACTIVE = "social-pill-attention-active";

/**
 * Visual-only press+ripple on a pill button. Never clicks.
 * Returns cleanup that clears classes (also cleared by timers in the hook).
 */
export function applySocialPillVisualCue(pillBtn: HTMLElement | null): void {
  if (!pillBtn) return;
  pillBtn.classList.add(ATTENTION_ACTIVE);
}

export function clearSocialPillVisualCue(pillBtn: HTMLElement | null): void {
  if (!pillBtn) return;
  pillBtn.classList.remove(ATTENTION_ACTIVE);
}

export function clearAllSocialAttentionClasses(root: HTMLElement): void {
  root
    .querySelectorAll(`.${ATTENTION_ACTIVE}`)
    .forEach((el) => el.classList.remove(ATTENTION_ACTIVE));
  root
    .querySelectorAll("[data-social-face].social-pill-attention-press")
    .forEach((el) => el.classList.remove("social-pill-attention-press"));
}
