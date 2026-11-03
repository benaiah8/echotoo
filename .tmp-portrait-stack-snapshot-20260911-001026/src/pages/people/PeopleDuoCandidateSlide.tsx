import type { PairUpCandidate } from "../../lib/people/types";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import {
  PEOPLE_DUO_NOTE_RESERVE_H_PX,
  PEOPLE_DUO_SOURCE_CHROME_H_PX,
  PEOPLE_DUO_STACK_PAD_X,
  PEOPLE_DUO_STACK_PAD_Y,
  PEOPLE_MINE_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX,
  PEOPLE_MINE_SOURCE_SURFACE_PAD_PX,
  PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX,
  PEOPLE_MINE_STACK_PAD_Y_TOP,
  type PeopleDuoPresentationVariant,
} from "../../lib/people/peopleCandidateMediaPresentation";
import PeopleCandidateMedia from "../../components/people/PeopleCandidateMedia";
import { peopleUiCopy } from "./peopleUiCopy";

export type PeopleDuoNeighborSide = "left" | "right" | null;

const CAPTION_CLASS =
  "line-clamp-3 w-full text-center text-[13px] leading-relaxed text-[var(--text)]/80";

const MINE_SURFACE_CLASS =
  "flex w-[88%] max-w-[18rem] flex-col items-center text-center rounded-[1.05rem]";

/**
 * Duo Mine/Discover slide — Profile-parity portrait stack + in-flow chrome.
 *
 * date/caption → portrait (name/bio INSIDE frame) → note below
 */
export default function PeopleDuoCandidateSlide({
  candidate,
  identitySource,
  photoIndex,
  onPhotoIndexChange,
  isCurrent,
  withPhoto,
  scheduleLabel,
  caption,
  onSeePost,
  about,
  presentation = "discover",
}: {
  candidate: PairUpCandidate;
  identitySource: ProfileIdentityMediaSource;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto: boolean;
  neighborSide?: PeopleDuoNeighborSide;
  scheduleLabel: string | null;
  caption: string | null;
  onSeePost?: () => void;
  about?: string | null;
  /** Mine gets upward peeks + restrained source surface; Discover keeps legacy peeks. */
  presentation?: PeopleDuoPresentationVariant;
}) {
  const isMine = presentation === "mine";
  const name = candidate.display_name?.trim() || "Someone";
  const bio = about?.trim() || candidate.bio?.trim() || null;
  const duoNote = candidate.description?.trim() || null;
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const sourceInteractive = Boolean(onSeePost && captionText && isCurrent);
  const padTop = isMine ? PEOPLE_MINE_STACK_PAD_Y_TOP : PEOPLE_DUO_STACK_PAD_Y;

  const identityOverlay = (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] flex flex-col gap-1 px-[18px] pb-4 pt-14"
      style={{
        background:
          "linear-gradient(to top, color-mix(in oklab, var(--bg) 78%, transparent) 0%, color-mix(in oklab, var(--bg) 40%, transparent) 50%, transparent 100%)",
      }}
      data-people-duo-identity="true"
    >
      <span className="min-w-0 truncate text-[20px] font-semibold leading-tight tracking-tight text-[var(--text)]">
        {name}
      </span>
      {bio ? (
        <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--text)]/68">
          {bio}
        </p>
      ) : null}
    </div>
  );

  const mineSurfaceStyle = {
    padding: PEOPLE_MINE_SOURCE_SURFACE_PAD_PX,
    gap: PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX,
    background: "color-mix(in oklab, var(--text) 6%, transparent)",
  } as const;

  const mineDateLabel = dateText ? (
    <span className="text-[11.5px] font-semibold leading-[15px] tracking-wide text-[var(--text)]/62">
      {dateText}
    </span>
  ) : null;

  const mineCaption = (
    <span
      className={`${CAPTION_CLASS} ${captionText ? "" : "min-h-[2.4em]"}`}
      aria-hidden={!captionText}
    >
      {captionText}
    </span>
  );

  const mineSourceInner = (
    <>
      {mineDateLabel}
      {mineCaption}
    </>
  );

  return (
    <div className="relative box-border flex h-full w-full flex-col overflow-visible">
      {isMine ? (
        <div
          className="flex w-full shrink-0 flex-col items-center justify-end px-3 pt-0"
          style={{
            minHeight: PEOPLE_MINE_SOURCE_CHROME_H_PX,
            paddingBottom: PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX,
          }}
          data-people-duo-source="true"
          data-people-duo-source-surface="mine"
        >
          {sourceInteractive ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeePost?.();
              }}
              className={`${MINE_SURFACE_CLASS} cursor-pointer transition hover:brightness-[1.03] active:scale-[0.99]`}
              style={mineSurfaceStyle}
              aria-label={`${peopleUiCopy.deckSeePost}: ${captionText}`}
              data-people-duo-source-hit="true"
            >
              {mineSourceInner}
            </button>
          ) : (
            <div
              className={MINE_SURFACE_CLASS}
              style={mineSurfaceStyle}
              aria-hidden={!captionText && !dateText}
            >
              {mineSourceInner}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex shrink-0 flex-col items-center justify-end gap-1 px-3 pb-1.5 pt-0 text-center"
          style={{ minHeight: PEOPLE_DUO_SOURCE_CHROME_H_PX }}
          data-people-duo-source="true"
        >
          <div className="flex min-h-7 items-center justify-center">
            {dateText ? (
              <span className="inline-flex h-7 items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-2.5 text-[12px] font-semibold leading-none tracking-tight text-[var(--text)]">
                {dateText}
              </span>
            ) : null}
          </div>
          {sourceInteractive ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeePost?.();
              }}
              className={`${CAPTION_CLASS} max-w-[20rem] cursor-pointer rounded-md px-1 py-0.5 transition hover:text-[var(--text)] active:scale-[0.99]`}
              aria-label={`${peopleUiCopy.deckSeePost}: ${captionText}`}
            >
              {captionText}
            </button>
          ) : (
            <p
              className={`${CAPTION_CLASS} max-w-[20rem] min-h-[2.4em] px-1`}
              aria-hidden={!captionText}
            >
              {captionText}
            </p>
          )}
        </div>
      )}

      <div
        className="relative min-h-0 w-full flex-1 overflow-visible"
        style={{
          paddingTop: padTop,
          paddingBottom: PEOPLE_DUO_STACK_PAD_Y,
          paddingLeft: PEOPLE_DUO_STACK_PAD_X,
          paddingRight: PEOPLE_DUO_STACK_PAD_X,
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
        <PeopleCandidateMedia
          source={identitySource}
          activeIndex={photoIndex}
          onActiveIndexChange={onPhotoIndexChange}
          withPhoto={withPhoto}
          isCurrent={isCurrent}
          enableTapCycle={isCurrent}
          peekDirection={isMine ? "up" : "down"}
          identityOverlay={identityOverlay}
        />
      </div>

      <div
        className="flex shrink-0 flex-col items-center justify-center px-4 pb-0.5 pt-2.5"
        style={{ minHeight: PEOPLE_DUO_NOTE_RESERVE_H_PX }}
        data-people-duo-note="true"
        data-people-duo-note-empty={duoNote ? "false" : "true"}
      >
        {duoNote ? (
          <p className="line-clamp-2 w-full text-[12.5px] leading-snug text-[var(--text)]/62">
            <span className="mr-1.5 inline-flex translate-y-[-1px] items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--text)]/80">
              {peopleUiCopy.p2pNoteLabel}
            </span>
            {duoNote}
          </p>
        ) : (
          <>
            <span
              className="block h-px w-10 rounded-full"
              style={{
                background:
                  "color-mix(in oklab, var(--text) 18%, transparent)",
              }}
              aria-hidden
              data-people-duo-note-divider="true"
            />
            <span className="sr-only">{peopleUiCopy.duoNoteEmpty}</span>
          </>
        )}
      </div>
    </div>
  );
}
