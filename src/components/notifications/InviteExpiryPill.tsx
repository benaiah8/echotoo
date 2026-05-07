import React from "react";

const DEFAULT_WINDOW_MS = 48 * 60 * 60 * 1000;

export type InviteExpiryActiveState = {
  label: string;
  fillRatio: number;
};

/** Active countdown: label + shrink fill ratio. Past window → null. Invalid date → null. */
export function inviteExpiryActive(
  windowStartAt: string,
  nowMs: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): InviteExpiryActiveState | null {
  const start = new Date(windowStartAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = start + windowMs;
  const msLeft = end - nowMs;
  if (msLeft <= 0) return null;
  const fillRatio = Math.min(1, Math.max(0, msLeft / windowMs));
  const minsCeil = Math.ceil(msLeft / 60_000);
  const minsClamp = Math.max(1, minsCeil);
  if (minsClamp < 60) {
    return { label: `${minsClamp}m left`, fillRatio };
  }
  const hoursCeil = Math.ceil(minsClamp / 60);
  return { label: `${hoursCeil}h left`, fillRatio };
}

/** Composer capsule: explicit lines + smoother battery fill semantics. Invalid date → null. */
export function getInviteExpiryComposerState(
  windowStartAt: string,
  nowMs: number,
  windowMs: number = DEFAULT_WINDOW_MS,
):
  | { status: "active"; mainLine: string; fillRatio: number }
  | "expired"
  | null {
  const start = new Date(windowStartAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = start + windowMs;
  const msLeft = end - nowMs;
  if (msLeft <= 0) return "expired";
  const fillRatio = Math.min(1, Math.max(0, msLeft / windowMs));
  const minsCeil = Math.ceil(msLeft / 60_000);
  const minsClamp = Math.max(1, minsCeil);
  if (minsClamp < 60) {
    return { status: "active", mainLine: `${minsClamp}m`, fillRatio };
  }
  const hoursCeil = Math.ceil(minsClamp / 60);
  return { status: "active", mainLine: `${hoursCeil}h`, fillRatio };
}

export type InviteExpiryPillProps = {
  windowStartAt: string;
  /** Defaults to 48 hours. Expiry = windowStartAt + windowMs. */
  windowMs?: number;
  compact?: boolean;
  className?: string;
  /** Wider capsule, two-line time + muted "left", battery-style smooth fill (composer bar). */
  variant?: "row" | "composer";
};

/**
 * Countdown pill for invite display window (e.g. from notification.created_at).
 * Expired (`variant === "row"` only) → null — parent renders muted "Expired" or other fallback.
 * `variant === "composer"` shows a deactivated pill when expired.
 */
export default function InviteExpiryPill({
  windowStartAt,
  windowMs = DEFAULT_WINDOW_MS,
  compact = false,
  className = "",
  variant = "row",
}: InviteExpiryPillProps) {
  const nowMs = Date.now();

  if (variant === "composer") {
    const composer = getInviteExpiryComposerState(
      windowStartAt,
      nowMs,
      windowMs,
    );
    const baseShell =
      "relative flex h-full min-h-0 min-w-[4rem] shrink-0 flex-col items-center justify-center overflow-hidden rounded-full border px-2 py-0.5 text-center";

    if (composer === "expired") {
      return (
        <div
          className={`${baseShell} border-[var(--text)]/15 bg-[color-mix(in_oklab,var(--surface-2)_55%,transparent)] opacity-70 ${className}`.trim()}
          aria-label="Invite window expired"
        >
          <span className="text-[11px] font-semibold leading-tight text-[var(--text)]/45">
            Expired
          </span>
          <span className="text-[9px] leading-tight text-[var(--text)]/35">
            window
          </span>
        </div>
      );
    }

    if (composer == null) return null;

    const { mainLine, fillRatio } = composer;
    const fillW = `${Math.round(fillRatio * 10000) / 100}%`;

    return (
      <div
        className={`${baseShell} border-amber-500/42 bg-[color-mix(in_oklab,var(--surface-2)_52%,transparent)] app-dark:border-amber-400/40 app-dark:bg-amber-400/[0.12] ${className}`.trim()}
        aria-label={`${mainLine} left`}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-amber-200/75 via-amber-100/55 to-yellow-50/38 app-dark:from-amber-400/45 app-dark:via-amber-300/33 app-dark:to-amber-200/22"
          style={{ width: fillW, maxWidth: "100%" }}
          aria-hidden
        />
        <div className="relative z-[1] flex w-full flex-col items-center justify-center gap-px text-center leading-none">
          <span className="text-[13px] font-bold tabular-nums tracking-tight text-amber-900/93 app-dark:text-amber-50/96">
            {mainLine}
          </span>
          <span className="text-[8px] font-semibold uppercase tracking-wide text-amber-900/78 app-dark:text-white/92">
            left
          </span>
        </div>
      </div>
    );
  }

  const active = inviteExpiryActive(windowStartAt, nowMs, windowMs);

  if (active == null) return null;

  const sizing = compact
    ? "max-w-[4.75rem] px-1.5 py-px"
    : "max-w-[5.5rem] px-2 py-0.5";

  const textSizing = compact ? "text-[9px]" : "text-[10px]";

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full border border-amber-500/42 bg-amber-100/[0.22] app-dark:border-amber-400/40 app-dark:bg-amber-400/[0.12] ${sizing} ${className}`.trim()}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-200/80 via-amber-100/52 to-yellow-50/42 app-dark:from-amber-400/50 app-dark:via-amber-300/38 app-dark:to-amber-200/26"
        style={{
          width: `${Math.round(active.fillRatio * 10000) / 100}%`,
        }}
        aria-hidden
      />
      <span
        className={`relative z-[1] font-semibold leading-none tabular-nums text-amber-900/90 app-dark:text-amber-50/94 ${textSizing}`}
      >
        {active.label}
      </span>
    </span>
  );
}
