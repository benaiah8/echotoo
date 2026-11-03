/**
 * Open Plans vertical card — Discover-style portrait + info box.
 * Presentation only. Parent owns request handlers and status.
 * Anonymous: no profile chip, no See Post, no profile open.
 */
import { PiHeartBold, PiHeartFill } from "react-icons/pi";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import {
  PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
  PEOPLE_FEED_CAPTION_TEXT_CLASS,
  PEOPLE_FEED_MEDIA_RADIUS,
  PEOPLE_PERSONAL_NOTE_ACCENT_CLASS,
  PEOPLE_PERSONAL_NOTE_TEXT_CLASS,
} from "../../lib/people/peopleFeedLayout";
import PeopleCandidateMedia from "./PeopleCandidateMedia";
import type { PeopleFeedHeartState } from "./PeopleFeedActionRail";

/** Source-post caption: at least three visible lines with or without a plan note. */
const CAPTION_CLAMP =
  "min-h-0 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-3";

const DATE_PILL_CLASS = [
  "inline-flex h-5 min-w-0 max-w-full items-center truncate rounded-md border px-1.5",
  "text-[10px] font-semibold leading-none tracking-tight",
  "border-black/12 bg-white/92 text-[var(--text)]",
  "app-dark:border-[var(--brand-glass-border)] app-dark:bg-[var(--brand-glass-bg)]",
].join(" ");

const PLAN_TYPE_CLASS = [
  "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5",
  "text-[10px] font-semibold leading-none tracking-tight",
  "border-orange-600/18 bg-orange-500/[0.07] text-orange-900/85",
  "app-dark:border-orange-400/22 app-dark:bg-orange-400/[0.08] app-dark:text-orange-200/80",
].join(" ");

/** Matches Discover/feed neutral idle circle (size 44). Glyph scales on active. */
const HEART_BTN = [
  "inline-flex h-11 w-11 items-center justify-center rounded-full",
  "touch-manipulation motion-safe:transition-colors motion-safe:duration-150",
  "motion-safe:active:scale-[0.92] motion-reduce:transition-none",
  "bg-[var(--text)]/10 text-[var(--text)]/90",
  "app-dark:bg-white/14 app-dark:text-white/90",
].join(" ");

const HEART_GLYPH_IDLE = "h-6 w-6";
const HEART_GLYPH_ACTIVE = "h-8 w-8";
const HEART_GLYPH_MOTION =
  "shrink-0 motion-safe:transition-[width,height,color] motion-safe:duration-150 motion-reduce:transition-none";

export type PeopleOpenPlanFeedCardProps = {
  opportunityId: string;
  identitySource: ProfileIdentityMediaSource;
  /** Neutral Echo seed — opportunity id; never a restricted creator id. */
  feedNeutralEchoSeed: string;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  isCurrent: boolean;
  caption: string | null;
  scheduleLabel: string | null;
  /** Plan note (opportunity description). */
  note: string | null;
  isUnseen?: boolean;
  heartLabel: string;
  heartState: PeopleFeedHeartState;
  onHeart: () => void;
};

export default function PeopleOpenPlanFeedCard({
  opportunityId,
  identitySource,
  feedNeutralEchoSeed,
  photoIndex,
  onPhotoIndexChange,
  isCurrent,
  caption,
  scheduleLabel,
  note,
  isUnseen = false,
  heartLabel,
  heartState,
  onHeart,
}: PeopleOpenPlanFeedCardProps) {
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const noteText = note?.trim() || null;
  const heartBusy = heartState === "busy";
  const heartDisabled = heartState === "disabled" || heartBusy;
  const heartActive =
    heartState === "active" || heartState === "pending";

  return (
    <article
      className="w-full border-t border-[var(--border)] first:border-t-0"
      style={{
        paddingTop: "var(--people-discover-person-pad-y, 20px)",
        paddingBottom: "var(--people-discover-person-pad-y, 20px)",
      }}
      data-people-open-plan-feed-card="true"
      data-people-feed-opportunity={opportunityId}
      data-people-feed-current={isCurrent ? "true" : "false"}
      data-people-open-plan-anonymous="true"
    >
      <div
        className="flex w-full justify-center"
        data-people-open-plan-portrait="true"
      >
        <div
          className="relative w-full overflow-hidden [&_[data-people-duo-photo-frame]]:!rounded-none [&_[data-people-feed-legacy]]:!rounded-none [&_[data-people-feed-single-frame]]:!rounded-none [&_[data-people-mine-card]]:!rounded-none [&_[data-people-mine-identity-plate]]:!rounded-none"
          style={{
            width: "min(100%, var(--people-discover-photo-max-w, 26rem))",
            aspectRatio: "var(--people-discover-photo-aspect, 4 / 5)",
            borderRadius: PEOPLE_FEED_MEDIA_RADIUS,
          }}
          data-people-open-plan-photo-clip="true"
        >
          <PeopleCandidateMedia
            source={identitySource}
            activeIndex={photoIndex}
            onActiveIndexChange={onPhotoIndexChange}
            withPhoto
            isCurrent={isCurrent}
            enableTapCycle={isCurrent}
            presentation="mine"
            peekDirection="up"
            identityOverlay={null}
            tapIdentityKey={opportunityId}
            isUnseen={isUnseen}
            feedLayout
            feedNeutralEchoSeed={feedNeutralEchoSeed}
          />
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              borderRadius: PEOPLE_FEED_MEDIA_RADIUS,
              boxShadow: PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
            }}
            data-people-open-plan-photo-border="true"
            aria-hidden
          />
        </div>
      </div>

      <div
        className="mt-3 flex min-w-0 flex-col gap-2"
        data-people-open-plan-info-stack="true"
      >
        <div
          className="flex min-w-0 items-start gap-1.5 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/40 py-2.5 pl-3 pr-2"
          data-people-open-plan-info-card="true"
          data-people-discover-opp-pad="px-3"
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5"
              data-people-open-plan-meta="true"
            >
              <span
                className={PLAN_TYPE_CLASS}
                data-people-open-plan-type="true"
              >
                Plan
              </span>
              {dateText ? (
                <span
                  className={DATE_PILL_CLASS}
                  data-people-open-plan-date="true"
                >
                  {dateText}
                </span>
              ) : null}
            </div>

            {captionText ? (
              <p
                className={`mt-1.5 w-full text-left ${PEOPLE_FEED_CAPTION_TEXT_CLASS} ${CAPTION_CLAMP}`}
                data-people-open-plan-caption="true"
                data-people-open-plan-caption-lines="3"
              >
                {captionText}
              </p>
            ) : null}

            {noteText ? (
              <p
                className={`${PEOPLE_PERSONAL_NOTE_ACCENT_CLASS} ${PEOPLE_PERSONAL_NOTE_TEXT_CLASS} line-clamp-4`}
                data-people-open-plan-note="true"
                data-people-personal-note-accent="true"
              >
                {noteText}
              </p>
            ) : null}
          </div>

          <div
            className="pointer-events-auto flex w-11 shrink-0 flex-col items-center gap-2 self-start pt-0.5"
            data-people-open-plan-actions="true"
            data-people-discover-opp-actions-align="top-right"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!heartDisabled) onHeart();
              }}
              disabled={heartDisabled}
              aria-label={heartLabel}
              aria-busy={heartBusy || undefined}
              aria-pressed={heartActive || undefined}
              data-people-feed-heart="true"
              data-people-feed-heart-state={heartState}
              data-people-open-plan-heart="true"
              className={[
                HEART_BTN,
                heartDisabled ? "opacity-45" : "",
                heartActive ? "text-[rgb(225,29,72)]" : "",
              ].join(" ")}
            >
              {heartActive ? (
                <PiHeartFill
                  className={[HEART_GLYPH_MOTION, HEART_GLYPH_ACTIVE].join(" ")}
                  aria-hidden
                />
              ) : (
                <PiHeartBold
                  className={[HEART_GLYPH_MOTION, HEART_GLYPH_IDLE].join(" ")}
                  aria-hidden
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
