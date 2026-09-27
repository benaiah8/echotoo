/**
 * Open Plans → canonical People presentation adapter.
 *
 * Visual path is {@link PeopleCanonicalCandidatePresentation} (Mine golden master).
 * Host identity stays hidden before accept; note/media use Open Plan fields only.
 */
import type { OpenPlanCandidate } from "../../lib/people/types";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import type { PeopleMineAtmosphereReport } from "./PeopleCandidateMedia";
import PeopleCanonicalCandidatePresentation from "./PeopleCanonicalCandidatePresentation";
import { formatOpenPlanSchedule } from "../../lib/openPlanSchedule";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

export default function PeopleOpenPlanCandidateSlide({
  candidate,
  identitySource,
  photoIndex,
  onPhotoIndexChange,
  isCurrent,
  withPhoto,
  onAtmosphereChange,
}: {
  candidate: OpenPlanCandidate;
  identitySource: ProfileIdentityMediaSource;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto: boolean;
  /** @deprecated Unused — candidate card rotation removed. */
  neighborSide?: "left" | "right" | null;
  /** @deprecated Prefer schedule from occurs_at inside this adapter. */
  occursLabel?: string | null;
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
}) {
  const note = candidate.description?.trim() || null;
  const caption = candidate.source_caption?.trim() || null;
  const scheduleLabel = candidate.occurs_at
    ? formatOpenPlanSchedule(
        candidate.occurs_at,
        candidate.occurs_time_explicit !== false
      ) || null
    : null;

  return (
    <PeopleCanonicalCandidatePresentation
      identitySource={identitySource}
      photoIndex={photoIndex}
      onPhotoIndexChange={onPhotoIndexChange}
      isCurrent={isCurrent}
      withPhoto={withPhoto}
      caption={caption}
      scheduleLabel={scheduleLabel}
      scheduleLabelKind={null}
      note={note}
      noteResetKey={candidate.opportunity_id}
      // Anonymous: do not invent a name; floating note uses anonymous header.
      displayName={peopleUiCopy.openPlanRequesterNameHidden}
      bio={null}
      avatarUrl={null}
      personKey={candidate.opportunity_id}
      identityVisible={false}
      onOpenProfile={undefined}
      onAtmosphereChange={onAtmosphereChange}
    />
  );
}
