/**
 * Mine opportunity note — presentation wrapper around {@link PeopleExpandableNote}.
 * Overflow detection / tap threshold stay shared; Mine uses floating expansion
 * so the carousel/portrait never reflow.
 */
import PeopleExpandableNote from "./PeopleExpandableNote";
import {
  PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX,
  PEOPLE_MINE_NOTE_RESERVE_H_PX,
  PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX,
} from "../../lib/people/peopleCandidateMediaPresentation";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const NOTE_TEXT_CLASS =
  "w-full text-center text-[12.5px] font-medium leading-snug text-[var(--text)]/78";

/** Visible More row — not in collapsed chrome reserve. */
const NOTE_AFFORDANCE_CLASS =
  "mt-1 block text-center text-[11px] font-medium leading-none text-[var(--text)]/48";

export default function MineOpportunityNote({
  note,
  resetKey,
  interactive = true,
  onExpandedChange,
  personDisplayName,
  personAvatarUrl,
  personUserId,
  anonymousIdentity = false,
}: {
  note: string | null;
  /** Collapse when the opportunity changes — also binds floating identity. */
  resetKey: string;
  /** Neighbor slides stay non-interactive. */
  interactive?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Display name for the floating panel header (never an @handle). */
  personDisplayName: string;
  personAvatarUrl?: string | null;
  personUserId?: string | null;
  /** Open Plans pre-accept: floating header without avatar / real identity. */
  anonymousIdentity?: boolean;
}) {
  return (
    <PeopleExpandableNote
      note={note}
      resetKey={resetKey}
      interactive={interactive}
      onExpandedChange={onExpandedChange}
      expansionMode="floating"
      floatingPerson={{
        identityKey: resetKey,
        displayName: personDisplayName,
        avatarUrl: anonymousIdentity ? null : (personAvatarUrl ?? null),
        userId: anonymousIdentity ? null : (personUserId ?? null),
        anonymous: anonymousIdentity,
      }}
      reserveHPx={PEOPLE_MINE_NOTE_RESERVE_H_PX}
      collapsedTextHPx={PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX}
      expandedTextMaxHPx={PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX}
      textClassName={NOTE_TEXT_CLASS}
      affordanceClassName={NOTE_AFFORDANCE_CLASS}
      containerClassName="relative mx-auto flex w-full max-w-full shrink-0 flex-col items-center px-1"
      containerStyle={{
        width: "min(100%, var(--people-mine-frame-w, 100%))",
        maxWidth: "var(--people-mine-frame-w, 100%)",
      }}
      showDivider
      emptyLabel={peopleUiCopy.duoNoteEmpty}
      expandLabel={peopleUiCopy.duoNoteExpand}
      collapseLabel={peopleUiCopy.duoNoteCollapse}
      closeLabel={peopleUiCopy.duoNoteClose}
      noteSectionLabel={peopleUiCopy.duoNoteSectionLabel}
      expandAffordance={peopleUiCopy.duoNoteExpandAffordance}
      collapseAffordance={peopleUiCopy.duoNoteCollapseAffordance}
      hitDataAttr="data-people-mine-note-hit"
      expandedDataAttr="data-people-mine-note-expanded"
      rootDataAttrs={{
        "data-people-mine-note": true,
      }}
    />
  );
}
