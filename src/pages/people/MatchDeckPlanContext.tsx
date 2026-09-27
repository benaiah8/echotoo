import { PiArrowSquareOutBold } from "react-icons/pi";
import {
  PEOPLE_CANDIDATE_TEXT_TRANSITION_MS,
  prefersPeopleMotionReduce,
} from "../../lib/people/peopleCandidateMediaPresentation";
import { peopleUiCopy } from "./peopleUiCopy";

/** Caption: 2–3 lines at 13px / leading-snug. */
const CAPTION_TEXT_CLASS =
  "line-clamp-3 w-full max-w-[22rem] text-center text-[13px] leading-snug text-[var(--text)]/70";

/**
 * Source context above the carousel. Height is reserved so caption length
 * cannot resize the portrait card.
 */
export default function MatchDeckPlanContext({
  opportunityId,
  scheduleLabel,
  caption,
  onSeePost,
}: {
  /** Active candidate opportunity — keys text transition (not source_post_id). */
  opportunityId?: string | null;
  scheduleLabel: string | null;
  caption: string | null;
  onSeePost?: () => void;
}) {
  const captionText = caption?.trim() || "";
  const reduceMotion = prefersPeopleMotionReduce();
  const transitionKey = opportunityId?.trim() || "none";

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 px-1 pb-2 pt-1 text-center">
      <div
        key={transitionKey}
        className="flex w-full flex-col items-center gap-1.5"
        style={{
          animation: reduceMotion
            ? undefined
            : `peopleDiscoverTextIn ${PEOPLE_CANDIDATE_TEXT_TRANSITION_MS}ms ease-out`,
        }}
      >
        <div className="flex min-h-7 items-center justify-center gap-1.5">
          {scheduleLabel ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-2.5 text-[12px] font-semibold leading-none tracking-tight text-[var(--text)]">
              {scheduleLabel}
            </span>
          ) : null}
          {onSeePost ? (
            <button
              type="button"
              onClick={onSeePost}
              aria-label={peopleUiCopy.deckSeePost}
              title={peopleUiCopy.deckSeePost}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--text)]/20 bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] text-[var(--text)]/80 transition hover:text-[var(--text)] active:scale-[0.94]"
            >
              <PiArrowSquareOutBold className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {onSeePost && captionText ? (
          <button
            type="button"
            onClick={onSeePost}
            className={`${CAPTION_TEXT_CLASS} cursor-pointer rounded-md px-1 py-0.5 transition hover:text-[var(--text)]/90 active:scale-[0.99]`}
            aria-label={`${peopleUiCopy.deckSeePost}: ${captionText}`}
          >
            {captionText}
          </button>
        ) : (
          <p className={`${CAPTION_TEXT_CLASS} min-h-[2.5em]`}>{captionText}</p>
        )}
      </div>
    </div>
  );
}
