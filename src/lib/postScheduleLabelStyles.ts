import type { PostScheduleLabelKind } from "./postScheduleLabel";

export type PostScheduleLabelSurface = "feed" | "rail" | "railCover";

const FEED_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today:
    "px-2 py-0.5 rounded-md font-semibold bg-green-500/20 text-green-600 border border-green-500/30",
  tomorrow:
    "px-2 py-0.5 rounded-md font-medium bg-amber-500/20 text-amber-600 border border-amber-500/30",
  next_weekday:
    "px-2 py-0.5 rounded-md font-medium bg-[var(--text)]/8 text-[var(--text)]/85 border border-[var(--border)]",
  in_days: "text-[var(--text)]/70 font-normal",
  posted_ago: "text-[var(--text)]/45 font-normal",
  passed: "text-[var(--text)]/40 font-normal italic",
};

const RAIL_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today: "bg-green-500/20 text-green-600 border-green-500/30",
  tomorrow: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  next_weekday:
    "bg-[var(--text)]/10 text-[var(--text)]/85 border-[var(--border)]",
  in_days: "bg-[var(--text)]/5 text-[var(--text)]/65 border-[var(--border)]/80",
  posted_ago: "text-[var(--text)]/45 font-normal",
  passed: "bg-gray-500/10 text-[var(--text)]/40 border-gray-500/25 italic",
};

const RAIL_COVER_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today:
    "border-green-500/55 ring-1 ring-inset ring-green-500/35 text-[var(--text)]",
  tomorrow:
    "border-amber-400/65 ring-1 ring-inset ring-amber-400/45 text-[var(--text)]",
  next_weekday:
    "border-[var(--border)] text-[var(--text)]/90 ring-1 ring-inset ring-[var(--text)]/10",
  in_days: "border-[var(--border)]/90 text-[var(--text)]/70",
  posted_ago: "text-[var(--text)]/45 font-normal",
  passed: "border-gray-500/30 text-[var(--text)]/40 italic",
};

const RAIL_COVER_BASE =
  "backdrop-blur-[var(--glass-blur)] bg-[var(--glass-bg)] shadow-[var(--rail-card-pill-shadow)] border";

/** Rail/cover: schedule kinds use pill/chip treatment; posted-age is plain metadata text. */
export function railScheduleLabelUsesPill(kind: PostScheduleLabelKind): boolean {
  return kind !== "posted_ago";
}

/**
 * Tailwind classes for schedule/date labels by urgency kind and surface.
 */
export function getPostScheduleLabelClasses(
  kind: PostScheduleLabelKind,
  surface: PostScheduleLabelSurface
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
