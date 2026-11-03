import type { PostScheduleLabelKind } from "./postScheduleLabel";

export type PostScheduleLabelSurface = "feed" | "rail" | "railCover";

/**
 * Semantic date-color buckets (presentation only):
 * - today → green (strong)
 * - tomorrow → blue (avoids clash with brand-yellow location)
 * - next_weekday → violet (This/Next named weekdays)
 * - in_days → violet (same upcoming-event treatment as next_weekday)
 * - passed → muted gray
 * - posted_ago → plain muted text (never a colored event chip)
 */

const FEED_UPCOMING_VIOLET =
  "px-2 py-0.5 rounded-md font-medium bg-violet-500/15 text-violet-700 border border-violet-500/30 app-dark:bg-violet-400/15 app-dark:text-violet-300 app-dark:border-violet-400/35";

const FEED_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today:
    "px-2 py-0.5 rounded-md font-semibold bg-green-500/20 text-green-600 border border-green-500/30",
  tomorrow:
    "px-2 py-0.5 rounded-md font-medium bg-[var(--blue-bg)] text-[var(--blue-text)] border border-[var(--blue-border)]",
  next_weekday: FEED_UPCOMING_VIOLET,
  in_days: FEED_UPCOMING_VIOLET,
  passed:
    "px-2 py-0.5 rounded-md font-normal italic bg-gray-500/10 text-[var(--text)]/45 border border-gray-500/25",
  posted_ago: "text-[var(--text)]/45 font-normal",
};

const RAIL_UPCOMING_VIOLET =
  "bg-violet-500/15 text-violet-700 border-violet-500/30 app-dark:bg-violet-400/15 app-dark:text-violet-300 app-dark:border-violet-400/35";

const RAIL_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today: "bg-green-500/20 text-green-600 border-green-500/30",
  tomorrow:
    "bg-[var(--blue-bg)] text-[var(--blue-text)] border-[var(--blue-border)]",
  next_weekday: RAIL_UPCOMING_VIOLET,
  in_days: RAIL_UPCOMING_VIOLET,
  passed: "bg-gray-500/10 text-[var(--text)]/40 border-gray-500/25 italic",
  posted_ago: "text-[var(--text)]/45 font-normal",
};

const RAIL_COVER_UPCOMING_VIOLET =
  "border-violet-500/45 ring-1 ring-inset ring-violet-500/30 text-[var(--text)] app-dark:border-violet-400/45 app-dark:ring-violet-400/30";

const RAIL_COVER_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today:
    "border-green-500/55 ring-1 ring-inset ring-green-500/35 text-[var(--text)]",
  tomorrow:
    "border-[var(--blue-border)] ring-1 ring-inset ring-[var(--blue-text)]/35 text-[var(--text)]",
  next_weekday: RAIL_COVER_UPCOMING_VIOLET,
  in_days: RAIL_COVER_UPCOMING_VIOLET,
  passed: "border-gray-500/30 text-[var(--text)]/40 italic",
  posted_ago: "text-[var(--text)]/45 font-normal",
};

const TEXT_UPCOMING_VIOLET =
  "font-medium text-violet-700 app-dark:text-violet-300";

/** Detail header / plain text: same semantic hues, no pill chrome. */
const TEXT_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today: "font-medium text-green-600",
  tomorrow: "font-medium text-[var(--blue-text)]",
  next_weekday: TEXT_UPCOMING_VIOLET,
  in_days: TEXT_UPCOMING_VIOLET,
  passed: "italic text-[var(--text)]/50",
  posted_ago: "text-[var(--text)]/45 font-normal",
};

const RAIL_COVER_BASE =
  "backdrop-blur-[var(--glass-blur)] bg-[var(--glass-bg)] shadow-[var(--rail-card-pill-shadow)] border";

/** Rail/cover: schedule kinds use pill/chip treatment; posted-age is plain metadata text. */
export function railScheduleLabelUsesPill(
  kind: PostScheduleLabelKind,
): boolean {
  return kind !== "posted_ago";
}

/** Feed header: Event/schedule date uses the date chip; posted-age stays plain text. */
export function feedScheduleLabelUsesPill(
  kind: PostScheduleLabelKind,
): boolean {
  return railScheduleLabelUsesPill(kind);
}

/**
 * Text-only semantic classes for Post Detail header (and similar sublines).
 * Same hue buckets as feed/rail chips; never adds pill padding/borders.
 */
export function getPostScheduleLabelTextClass(
  kind: PostScheduleLabelKind,
): string {
  return TEXT_KIND_CLASSES[kind];
}

/**
 * Tailwind classes for schedule/date labels by urgency kind and surface.
 */
export function getPostScheduleLabelClasses(
  kind: PostScheduleLabelKind,
  surface: PostScheduleLabelSurface,
): string {
  if (surface === "feed") {
    return FEED_KIND_CLASSES[kind];
  }
  if (kind === "posted_ago") {
    return RAIL_KIND_CLASSES.posted_ago;
  }
  if (surface === "railCover") {
    return `${RAIL_COVER_BASE} ${RAIL_COVER_KIND_CLASSES[kind]}`;
  }
  return RAIL_KIND_CLASSES[kind];
}
