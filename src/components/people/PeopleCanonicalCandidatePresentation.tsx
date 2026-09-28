/**
 * Canonical People candidate presentation — extracted from the approved Mine UI.
 *
 * Mine / Discover / Plans will share this component. Visual geometry, layout,
 * note, identity chrome, and media stack live here exactly as Mine rendered them.
 * Modes supply data/behavior adapters; they must not fork this JSX.
 *
 * Golden master: pixel-equivalent to former PeopleDuoCandidateSlide Mine branch.
 */
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import {
  PEOPLE_DUO_STACK_PAD_X,
  PEOPLE_DUO_STACK_PAD_Y,
  PEOPLE_MINE_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX,
  PEOPLE_MINE_STACK_PAD_Y_TOP,
  PEOPLE_MINE_TOP_GAP_PX,
} from "../../lib/people/peopleCandidateMediaPresentation";
import {
  PEOPLE_BACK_EDGE_INSET_PX,
  PEOPLE_BACK_SIZE_PX,
} from "../../pages/people/peopleShellLayout";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import PeopleCandidateMedia, {
  type PeopleMineAtmosphereReport,
} from "./PeopleCandidateMedia";
import MinePortraitIdentityOverlay from "./MinePortraitIdentityOverlay";
import MineOpportunityNote from "./MineOpportunityNote";
import PeopleSeePostControl from "./PeopleSeePostControl";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/** 16px from right edge; clear Back width + 32px separation. */
const SOURCE_EDGE_INSET_PX = PEOPLE_BACK_EDGE_INSET_PX;
const SOURCE_BACK_CLEARANCE_PX = 32;
const SOURCE_PAD_LEFT_PX =
  PEOPLE_BACK_EDGE_INSET_PX + PEOPLE_BACK_SIZE_PX + SOURCE_BACK_CLEARANCE_PX;
/** Small internal pad so glyph tops sit in Back's upper band (not flush to edge). */
const SOURCE_CAPTION_OPTICAL_PAD_TOP_PX = 2;

const CAPTION_CLASS =
  // leading-tight (1.25): readable multi-line without growing chrome reserve.
  // Light: full --text over the atmosphere top fade; dark keeps soft /82.
  // min-h-0: flex item must shrink to the 3-line chrome slot (min-height:auto would not).
  `line-clamp-3 min-h-0 overflow-hidden w-full max-w-[min(18rem,calc(100%-${SOURCE_PAD_LEFT_PX}px))] text-right text-[13px] leading-tight text-[var(--text)]/82 app-light:text-[var(--text)]`;

/** Clamp lives on the inner span. `block` is omitted: it overrides line-clamp's display and the clamp does not hold. */
const CAPTION_CLAMP_CLASS = "min-h-0 overflow-hidden line-clamp-3";

const DATE_PILL_BASE =
  "inline-flex h-7 max-w-full items-center truncate rounded-full px-2.5 text-[12px] font-semibold leading-none tracking-tight";

/**
 * Date chips — light: opaque frosted bases + dark semantic ink.
 * Dark: prior rail hues. Shared feed/rail tokens unchanged.
 */
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

export type PeopleCanonicalCandidatePresentationProps = {
  identitySource: ProfileIdentityMediaSource;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto: boolean;
  /** Source caption (top-right). */
  caption: string | null;
  /** Date / status label. */
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  /** When set with caption + isCurrent, caption/date are a See-post control. */
  onSeePost?: () => void;
  /** Opportunity / candidate note (floating expandable). */
  note: string | null;
  noteResetKey: string;
  /** Identity chip + floating-note header. */
  displayName: string;
  bio: string | null;
  avatarUrl?: string | null;
  personKey: string;
  /**
   * When false, omit portrait identity overlay (future Plans anonymity).
   * Mine always passes true — exact current treatment.
   */
  identityVisible?: boolean;
  /** Profile affordance; omit when unavailable or anonymity requires it. */
  onOpenProfile?: () => void;
  /** Atmosphere report from current slide media (Mine shell consumes today). */
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
  /** Duo/Discover unseen opportunity — brand-accent photo edge. */
  isUnseen?: boolean;
};

/**
 * Top-right caption/date → surplus → portrait stack → floating note.
 * Nav wrappers (`data-people-mine-nav-motion` / `nav-portrait`) stay for carousel.
 */
export default function PeopleCanonicalCandidatePresentation({
  identitySource,
  photoIndex,
  onPhotoIndexChange,
  isCurrent,
  withPhoto,
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
  identityVisible = true,
  onOpenProfile,
  onAtmosphereChange,
  isUnseen = false,
}: PeopleCanonicalCandidatePresentationProps) {
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const captionInteractive = Boolean(onSeePost && captionText && isCurrent);
  const showSeePost = Boolean(onSeePost);
  const datePillClass = schedulePillClass(scheduleLabelKind ?? null);
  const showIdentity = identityVisible !== false;

  const identityOverlay = showIdentity ? (
    <MinePortraitIdentityOverlay
      name={displayName}
      bio={bio}
      resetKey={`${personKey}:${photoIndex}`}
      interactive={isCurrent}
      onOpenProfile={isCurrent ? onOpenProfile : undefined}
    />
  ) : null;

  const dateRow = (
    <div
      className="relative z-[1] flex max-w-full items-center justify-end gap-1.5"
      data-people-source-date-row="true"
    >
      {showSeePost ? <PeopleSeePostControl onClick={() => onSeePost?.()} /> : null}
      {dateText ? (
        <span className={`${datePillClass} relative`}>{dateText}</span>
      ) : showSeePost ? null : (
        <span className="h-7" aria-hidden />
      )}
    </div>
  );

  /** Visible caption/date at slide top:0 — independent of surplus padTop. */
  const sourceCaption = (
    <div
      className="absolute top-0 right-0 z-[2] flex w-full flex-col items-end justify-start text-right"
      style={{
        paddingTop: SOURCE_CAPTION_OPTICAL_PAD_TOP_PX,
        paddingRight: SOURCE_EDGE_INSET_PX,
        paddingLeft: SOURCE_PAD_LEFT_PX,
        gap: PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX,
      }}
      data-people-duo-source-caption="true"
      data-people-duo-source-surface="mine-top-right"
    >
      {captionInteractive ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSeePost?.();
          }}
          className={`${CAPTION_CLASS} relative z-[1] bg-transparent p-0 text-right transition hover:brightness-[1.03] active:scale-[0.99]`}
          aria-label={`${peopleUiCopy.deckSeePost}: ${captionText}`}
          data-people-duo-source-hit="true"
        >
          <span
            className={CAPTION_CLAMP_CLASS}
            data-people-source-caption-clamp="true"
          >
            {captionText}
          </span>
        </button>
      ) : (
        <span
          className={`${CAPTION_CLASS} relative ${captionText ? "" : "min-h-[2.4em]"}`}
          aria-hidden={!captionText}
        >
          <span
            className={CAPTION_CLAMP_CLASS}
            data-people-source-caption-clamp="true"
          >
            {captionText}
          </span>
        </span>
      )}
      {dateRow}
    </div>
  );

  /** Empty layout reserve — portrait Y; top gap as padding (not a spacer). */
  const sourceReserve = (
    <div
      className="relative w-full shrink-0"
      style={{
        minHeight: PEOPLE_MINE_SOURCE_CHROME_H_PX,
        paddingBottom: PEOPLE_MINE_TOP_GAP_PX,
        boxSizing: "content-box",
      }}
      aria-hidden
      data-people-duo-source="true"
      data-people-duo-source-reserve="true"
      data-people-mine-top-gap="true"
    />
  );

  const portrait = (
    <div
      className="relative mx-auto min-h-0 shrink-0 overflow-visible"
      style={{
        width: "var(--people-mine-portrait-w, 100%)",
        height: "var(--people-mine-portrait-h, auto)",
        paddingTop: PEOPLE_MINE_STACK_PAD_Y_TOP,
        paddingBottom: PEOPLE_DUO_STACK_PAD_Y,
        paddingLeft: PEOPLE_DUO_STACK_PAD_X,
        paddingRight: PEOPLE_DUO_STACK_PAD_X,
        boxSizing: "border-box",
      }}
      data-people-duo-portrait="true"
    >
      {/* Inner: DEV portrait nav writes translate + scale + tilt (incoming + outgoing). */}
      <div
        className="relative z-[1] h-full w-full"
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
          tapIdentityKey={`${noteResetKey}:${personKey}`}
          onMineAtmosphereChange={onAtmosphereChange}
          isUnseen={isUnseen}
        />
      </div>
    </div>
  );

  const opportunityNote = (
    <MineOpportunityNote
      note={note}
      resetKey={noteResetKey}
      interactive={isCurrent}
      personDisplayName={displayName}
      personAvatarUrl={showIdentity ? avatarUrl : null}
      personUserId={showIdentity ? personKey : null}
      anonymousIdentity={!showIdentity}
    />
  );

  return (
    <div
      className="relative box-border flex h-full w-full flex-col overflow-visible"
      data-people-canonical-candidate="true"
    >
      {/* Outer: identity only (caption/note stay upright). */}
      <div
        className="relative flex h-full w-full flex-col overflow-visible"
        data-people-mine-nav-motion="true"
      >
        {sourceCaption}
        {sourceReserve}
        {/* Extra top surplus after min TOP_GAP — centers portrait+note.
            Floating note never reclaim/reflow this spacer. */}
        <div
          className="w-full shrink-0"
          style={{
            height: "var(--people-mine-surplus-pad-top, 0px)",
          }}
          aria-hidden
          data-people-mine-surplus-pad-top="true"
        />
        {portrait}
        {opportunityNote}
      </div>
    </div>
  );
}
