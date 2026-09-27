import type { ReactNode } from "react";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import { getPostScheduleLabelTextClass } from "../../lib/postScheduleLabelStyles";

/**
 * Lightweight emphasis helpers for Home Tour copy.
 * Prefer composing React nodes in step config — no markdown parsing.
 *
 * Accent text uses `--brand-readable` (EchoToo theme token):
 * - dark: bright `--brand` yellow
 * - light: deeper `--brand-dark` amber/gold for contrast on light glass
 * Do NOT use raw `--brand` for tour text on light surfaces.
 */
export const TOUR_BRAND_TEXT_CLASS =
  "font-semibold text-[var(--brand-readable)]";

export function tourBrand(children: ReactNode): ReactNode {
  return <span className={TOUR_BRAND_TEXT_CLASS}>{children}</span>;
}

export function tourStrong(children: ReactNode): ReactNode {
  return (
    <span className="font-semibold text-[var(--text)]">{children}</span>
  );
}

/** People step: green (Duos) — theme-safe, tour-local. */
export function tourGreen(children: ReactNode): ReactNode {
  return (
    <span className="font-semibold text-green-600 app-dark:text-green-400">
      {children}
    </span>
  );
}

/** People step: blue (Groups) — reuse app blue tokens. */
export function tourBlue(children: ReactNode): ReactNode {
  return (
    <span className="font-semibold text-[var(--blue-text)]">{children}</span>
  );
}

/** Soft italic emphasis (HomeTour-local only). */
export function tourItalic(children: ReactNode): ReactNode {
  return <span className="italic">{children}</span>;
}

/** Brand + italic for short tour phrases. */
export function tourBrandItalic(children: ReactNode): ReactNode {
  return (
    <span className={`${TOUR_BRAND_TEXT_CLASS} italic`}>{children}</span>
  );
}

/** Alias for brand/strong combo copy. */
export function tourEmphasis(children: ReactNode): ReactNode {
  return tourBrand(children);
}

/**
 * Reuse feed/detail schedule text hues for tour date labels.
 * today → green, tomorrow → blue, week family → violet.
 */
export function tourScheduleLabel(
  label: string,
  kind: PostScheduleLabelKind
): ReactNode {
  return (
    <span className={getPostScheduleLabelTextClass(kind)}>{label}</span>
  );
}

/** Compact wrapping row of schedule labels (Date & Time step). */
export function tourScheduleLabelRow(
  ...items: Array<{ label: string; kind: PostScheduleLabelKind }>
): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="leading-snug">
          {tourScheduleLabel(item.label, item.kind)}
        </span>
      ))}
    </div>
  );
}

/**
 * Concise date preview for Step 3 — real panel already lists every option.
 * Today · Tomorrow · This Week · and more
 */
export function tourDatePreview(): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-snug">
      {tourScheduleLabel("Today", "today")}
      <span className="text-[var(--text)]/35" aria-hidden>
        ·
      </span>
      {tourScheduleLabel("Tomorrow", "tomorrow")}
      <span className="text-[var(--text)]/35" aria-hidden>
        ·
      </span>
      {tourScheduleLabel("This Week", "next_weekday")}
      <span className="text-[var(--text)]/35" aria-hidden>
        ·
      </span>
      <span
        className={`${getPostScheduleLabelTextClass("next_weekday")} opacity-65`}
      >
        and more
      </span>
    </div>
  );
}

/** Stack short scanable rows (body thoughts). */
export function tourStack(...rows: ReactNode[]): ReactNode {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, i) => (
        <div key={i} className="leading-snug">
          {row}
        </div>
      ))}
    </div>
  );
}

/** Mini block: label on its own line, then description. */
export function tourMiniBlock(
  label: ReactNode,
  description: ReactNode
): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 leading-snug">
      <div>{label}</div>
      <div className="text-[var(--text)]/80">{description}</div>
    </div>
  );
}

/** One labeled example row: label — description */
export function tourExampleRow(
  label: ReactNode,
  description: string
): ReactNode {
  return (
    <div className="leading-snug">
      {label}
      <span className="text-[var(--text)]/80"> — {description}</span>
    </div>
  );
}
