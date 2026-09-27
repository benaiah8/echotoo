/**
 * Group description note — PeopleExpandableNote with Group floating header.
 * Same geometry/tokens as MineOpportunityNote; does not alter Mine defaults.
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

const NOTE_AFFORDANCE_CLASS =
  "mt-1 block text-center text-[11px] font-medium leading-none text-[var(--text)]/48";

export default function PeopleGroupNote({
  note,
  resetKey,
  interactive = true,
  groupDisplayName,
  hostAvatarUrl,
}: {
  note: string | null;
  resetKey: string;
  interactive?: boolean;
  /** Floating header primary line (group name). */
  groupDisplayName: string;
  hostAvatarUrl?: string | null;
}) {
  return (
    <PeopleExpandableNote
      note={note}
      resetKey={resetKey}
      interactive={interactive}
      expansionMode="floating"
      floatingPerson={{
        identityKey: resetKey,
        displayName: groupDisplayName.trim() || peopleUiCopy.groupUpFallbackTitle,
        avatarUrl: hostAvatarUrl ?? null,
        userId: null,
        anonymous: false,
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
      emptyLabel={peopleUiCopy.groupUpNoteEmpty}
      expandLabel={peopleUiCopy.duoNoteExpand}
      collapseLabel={peopleUiCopy.duoNoteCollapse}
      closeLabel={peopleUiCopy.duoNoteClose}
      noteSectionLabel={peopleUiCopy.groupUpNoteSectionLabel}
      expandAffordance={peopleUiCopy.duoNoteExpandAffordance}
      collapseAffordance={peopleUiCopy.duoNoteCollapseAffordance}
      hitDataAttr="data-people-group-note-hit"
      expandedDataAttr="data-people-group-note-expanded"
      rootDataAttrs={{
        "data-people-group-note": true,
      }}
    />
  );
}
