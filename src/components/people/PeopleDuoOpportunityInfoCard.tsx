/**
 * Duo below-portrait opportunity surface — Discover box typography, no action rail.
 */
import type { MouseEvent, MouseEventHandler } from "react";
import { PiArrowSquareOutBold, PiNotePencilBold } from "react-icons/pi";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import { postTypeCompactLabel } from "../../lib/postTypeLabels";
import { PEOPLE_FEED_CAPTION_TEXT_CLASS } from "../../lib/people/peopleFeedLayout";
import { PEOPLE_DUO_MODERN_FRAME_RADIUS } from "../../lib/people/peopleCandidateMediaPresentation";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import { shouldDuoCaptionClickOpenPost } from "../../lib/people/peopleDuoCaptionClick";
import PostCaptionText from "../PostCaptionText";

/** Source caption: three-line preview with ellipsis (matches Discover / Plans / Groups). */
const CAPTION_CLASS =
  "min-h-0 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-3";

const DATE_PILL_BASE =
  "inline-flex h-5 max-w-full items-center truncate rounded-md px-1.5 text-[10px] font-semibold leading-none tracking-tight";

const DATE_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today:
    "bg-green-100 text-green-900 border-green-800/35 app-dark:bg-green-500/20 app-dark:text-green-600 app-dark:border-green-500/30",
  tomorrow:
    "bg-sky-100 text-sky-950 border-sky-800/35 app-dark:bg-[var(--blue-bg)] app-dark:text-[var(--blue-text)] app-dark:border-[var(--blue-border)]",
  next_weekday:
    "bg-violet-100 text-violet-950 border-violet-800/35 app-dark:bg-violet-400/15 app-dark:text-violet-300 app-dark:border-violet-400/35",
  in_days:
    "bg-white/92 text-[var(--text)] border-black/12 app-dark:bg-[var(--text)]/8 app-dark:text-[var(--text)]/65 app-dark:border-[var(--border)]",
  passed:
    "bg-gray-100 text-gray-800 border-gray-500/40 italic app-dark:bg-gray-500/10 app-dark:text-[var(--text)]/40 app-dark:border-gray-500/25",
  posted_ago: "border-transparent bg-transparent text-[var(--text)]/55 font-normal",
};

function schedulePillClass(kind: PostScheduleLabelKind | null): string {
  if (!kind) {
    return [
      DATE_PILL_BASE,
      "border border-black/12 bg-white/92 text-[var(--text)]",
      "app-dark:border-[var(--brand-glass-border)] app-dark:bg-[var(--brand-glass-bg)]",
    ].join(" ");
  }
  return `${DATE_PILL_BASE} border ${DATE_KIND_CLASSES[kind]}`;
}

const TYPE_LABEL_CLASS =
  "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[10px] font-semibold leading-none tracking-tight";

function typeLabelClass(type: "hangout" | "experience"): string {
  return type === "hangout"
    ? [
        TYPE_LABEL_CLASS,
        "border-emerald-600/18 bg-emerald-500/[0.07] text-emerald-900/85",
        "app-dark:border-emerald-400/22 app-dark:bg-emerald-400/[0.08] app-dark:text-emerald-200/80",
      ].join(" ")
    : [
        TYPE_LABEL_CLASS,
        "border-orange-600/18 bg-orange-500/[0.07] text-orange-900/85",
        "app-dark:border-orange-400/22 app-dark:bg-orange-400/[0.08] app-dark:text-orange-200/80",
      ].join(" ");
}

/** Align with front portrait frame (`--people-mine-frame-w`). */
const DUO_INFO_WIDTH_STYLE = {
  width: "min(100%, var(--people-mine-frame-w, 100%))",
  maxWidth: "var(--people-mine-frame-w, 100%)",
  borderRadius: PEOPLE_DUO_MODERN_FRAME_RADIUS,
} as const;

const DUO_INFO_SURFACE_CLASS = [
  "mx-auto shrink-0 border bg-transparent px-2.5 py-2.5",
  "border-black/14 app-dark:border-white/[0.22]",
].join(" ");

/** Badge-height See Post — Duo-local; shared 28px control stays on other surfaces. */
const DUO_SEE_POST_CLASS = [
  "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-md border",
  "border-[var(--text)]/15 bg-[color-mix(in_oklab,var(--surface)_72%,transparent)]",
  "px-1.5 text-[10px] font-semibold leading-none tracking-tight text-[var(--text)]/70",
  "touch-manipulation",
].join(" ");

const NOTE_STRIP_CLASS = [
  "-mx-2.5 mt-4 flex items-start gap-1.5 px-2.5 py-2",
  "rounded-none border-0 shadow-none",
  "bg-[color-mix(in_oklab,var(--text)_94%,var(--bg))] text-[var(--bg)]",
].join(" ");

const SECTION_GAP_CLASS = "mt-4";

export default function PeopleDuoOpportunityInfoCard({
  postType,
  caption,
  scheduleLabel,
  scheduleLabelKind = null,
  note,
  onSeePost,
}: {
  postType: "hangout" | "experience" | null;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  note: string | null;
  onSeePost?: () => void;
}) {
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const noteText = note?.trim() || null;
  const typeLabel = postType ? postTypeCompactLabel(postType) : null;
  const captionOpensPost = Boolean(onSeePost);
  const onCaptionClick: MouseEventHandler<HTMLParagraphElement> | undefined =
    captionOpensPost
      ? (event: MouseEvent<HTMLParagraphElement>) => {
          if (!shouldDuoCaptionClickOpenPost(event.target)) return;
          event.stopPropagation();
          onSeePost?.();
        }
      : undefined;
  return (
    <div
      className={DUO_INFO_SURFACE_CLASS}
      style={DUO_INFO_WIDTH_STYLE}
      data-people-duo-opportunity-info="true"
    >
      <div
        className="flex min-w-0 flex-wrap items-center gap-1.5"
        data-people-duo-opportunity-meta="true"
      >
        {postType && typeLabel ? (
          <span className={typeLabelClass(postType)}>{typeLabel}</span>
        ) : null}
        {dateText ? (
          <span className={schedulePillClass(scheduleLabelKind ?? null)}>
            {dateText}
          </span>
        ) : null}
        {onSeePost ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeePost();
            }}
            className={DUO_SEE_POST_CLASS}
            aria-label={peopleUiCopy.deckSeePost}
            title={peopleUiCopy.deckSeePost}
            data-people-see-post="true"
            data-people-duo-see-post="true"
          >
            <PiArrowSquareOutBold className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{peopleUiCopy.deckSeePost}</span>
          </button>
        ) : null}
      </div>

      {noteText ? (
        <div
          className={NOTE_STRIP_CLASS}
          data-people-duo-opportunity-note-strip="true"
        >
          <PiNotePencilBold
            className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--bg)]"
            aria-hidden
            data-people-duo-opportunity-note-icon="true"
          />
          <p
            className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12.5px] leading-snug text-[var(--bg)] [overflow-wrap:anywhere]"
            data-people-duo-opportunity-note="true"
          >
            {noteText}
          </p>
        </div>
      ) : null}

      {captionText ? (
        <p
          className={`${SECTION_GAP_CLASS} ${PEOPLE_FEED_CAPTION_TEXT_CLASS} ${CAPTION_CLASS}${
            captionOpensPost ? " cursor-pointer" : ""
          }`}
          data-people-duo-opportunity-caption="true"
          data-people-duo-opportunity-caption-lines="3"
          data-people-duo-opportunity-caption-action={
            captionOpensPost ? "see-post" : undefined
          }
          onClick={onCaptionClick}
        >
          <PostCaptionText text={captionText} stopLinkPropagation />
        </p>
      ) : null}
    </div>
  );
}
