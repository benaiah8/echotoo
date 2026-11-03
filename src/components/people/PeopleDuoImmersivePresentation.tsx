/**
 * Duo-only immersive slide — portrait stack first, source context below, full note.
 * Reuses PeopleCandidateMedia (Mine stack), MinePortraitIdentityOverlay, MineOpportunityNote.
 */
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import { postTypeCompactLabel } from "../../lib/postTypeLabels";
import {
  PEOPLE_DUO_STACK_PAD_X,
  PEOPLE_DUO_STACK_PAD_Y,
  PEOPLE_MINE_STACK_PAD_Y_TOP,
} from "../../lib/people/peopleCandidateMediaPresentation";
import PeopleCandidateMedia, {
  type PeopleMineAtmosphereReport,
} from "./PeopleCandidateMedia";
import MinePortraitIdentityOverlay from "./MinePortraitIdentityOverlay";
import MineOpportunityNote from "./MineOpportunityNote";
import PeopleSeePostControl from "./PeopleSeePostControl";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const DATE_PILL_BASE =
  "inline-flex h-7 max-w-full items-center truncate rounded-full px-2.5 text-[12px] font-semibold leading-none tracking-tight";

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
  posted_ago:
    "border-transparent bg-transparent text-[var(--text)]/55 font-normal",
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
  "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none tracking-tight";

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

export type PeopleDuoImmersivePresentationProps = {
  identitySource: ProfileIdentityMediaSource;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto: boolean;
  atmosphereIdentityKey: string;
  postType: "hangout" | "experience" | null;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  onSeePost?: () => void;
  note: string | null;
  noteResetKey: string;
  displayName: string;
  bio: string | null;
  avatarUrl?: string | null;
  personKey: string;
  onOpenProfile?: () => void;
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
  isUnseen?: boolean;
};

export default function PeopleDuoImmersivePresentation({
  identitySource,
  photoIndex,
  onPhotoIndexChange,
  isCurrent,
  withPhoto,
  atmosphereIdentityKey,
  postType,
  caption,
  scheduleLabel,
  scheduleLabelKind = null,
  onSeePost,
  note,
  noteResetKey,
  displayName,
  bio,
  avatarUrl = null,
  personKey,
  onOpenProfile,
  onAtmosphereChange,
  isUnseen = false,
}: PeopleDuoImmersivePresentationProps) {
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const typeLabel = postType ? postTypeCompactLabel(postType) : null;
  const datePillClass = schedulePillClass(scheduleLabelKind ?? null);

  const identityOverlay = (
    <MinePortraitIdentityOverlay
      name={displayName}
      bio={bio}
      resetKey={`${personKey}:${photoIndex}`}
      interactive={isCurrent}
      onOpenProfile={isCurrent ? onOpenProfile : undefined}
    />
  );

  return (
    <div
      className="relative box-border flex h-full w-full min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
      data-people-duo-immersive="true"
    >
      <div
        className="relative mx-auto w-full shrink-0 overflow-visible"
        style={{
          width: "var(--people-mine-portrait-w, 100%)",
          paddingTop: PEOPLE_MINE_STACK_PAD_Y_TOP,
          paddingBottom: PEOPLE_DUO_STACK_PAD_Y,
          paddingLeft: PEOPLE_DUO_STACK_PAD_X,
          paddingRight: PEOPLE_DUO_STACK_PAD_X,
          boxSizing: "border-box",
        }}
        data-people-duo-portrait="true"
      >
        {!isCurrent ? (
          <div
            className="pointer-events-none absolute inset-0 z-[6] rounded-[1.65rem]"
            style={{
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--text) 28%, transparent)`,
              background:
                "color-mix(in oklab, var(--surface) 55%, transparent)",
            }}
            aria-hidden
          />
        ) : null}
        <div
          className="relative z-[1] mx-auto"
          style={{
            width: "var(--people-mine-portrait-w, 100%)",
            height: "var(--people-mine-portrait-h, auto)",
          }}
          data-people-mine-nav-portrait="true"
        >
          <PeopleCandidateMedia
            source={identitySource}
            activeIndex={photoIndex}
            onActiveIndexChange={onPhotoIndexChange}
            withPhoto={withPhoto}
            isCurrent={isCurrent}
            enableTapCycle={isCurrent}
            presentation="mine"
            peekDirection="up"
            identityOverlay={identityOverlay}
            tapIdentityKey={atmosphereIdentityKey}
            onMineAtmosphereChange={onAtmosphereChange}
            isUnseen={isUnseen}
          />
        </div>
      </div>

      <div
        className="mx-auto flex w-full max-w-full shrink-0 flex-col gap-2 px-3 pb-2 pt-1"
        style={{
          width: "min(100%, var(--people-mine-frame-w, 100%))",
        }}
        data-people-duo-source="true"
        data-people-duo-source-surface="below-portrait"
      >
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {typeLabel ? (
            <span className={typeLabelClass(postType!)}>{typeLabel}</span>
          ) : null}
          {dateText ? (
            <span className={`${datePillClass} relative`}>{dateText}</span>
          ) : null}
          {onSeePost ? (
            <PeopleSeePostControl onClick={() => onSeePost()} />
          ) : null}
        </div>

        {captionText ? (
          <p
            className="whitespace-pre-wrap break-words text-center text-[13px] leading-snug text-[var(--text)]/82 [overflow-wrap:anywhere]"
            data-people-duo-source-caption="true"
          >
            {onSeePost && isCurrent ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeePost();
                }}
                className="w-full bg-transparent p-0 text-center transition hover:brightness-[1.03] active:scale-[0.99]"
                data-people-duo-source-hit="true"
                aria-label={`${peopleUiCopy.deckSeePost}: ${captionText}`}
              >
                {captionText}
              </button>
            ) : (
              captionText
            )}
          </p>
        ) : null}

        {note?.trim() ? (
          <div
            className="mt-1 border-t border-[var(--border)]/35 pt-2"
            data-people-duo-note-divider="true"
            aria-hidden
          />
        ) : null}
      </div>

      <MineOpportunityNote
        note={note}
        resetKey={noteResetKey}
        interactive={isCurrent}
        personDisplayName={displayName}
        personAvatarUrl={avatarUrl}
        personUserId={personKey}
      />
    </div>
  );
}
