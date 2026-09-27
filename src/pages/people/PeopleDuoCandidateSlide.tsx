import type { PairUpCandidate } from "../../lib/people/types";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import type { PeopleDuoPresentationVariant } from "../../lib/people/peopleCandidateMediaPresentation";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import type { PeopleMineAtmosphereReport } from "../../components/people/PeopleCandidateMedia";
import PeopleCanonicalCandidatePresentation from "../../components/people/PeopleCanonicalCandidatePresentation";
import { pairUpPersonKey } from "../../lib/people/pairUpPersonKey";

export type PeopleDuoNeighborSide = "left" | "right" | null;

/**
 * Duo Mine/Discover slide — always the canonical Mine presentation.
 *
 * Discover no longer has a separate visual branch; both modes adapt
 * PairUpCandidate into {@link PeopleCanonicalCandidatePresentation}.
 *
 * `presentation` is retained for call-site compatibility; visual output is
 * always canonical (Mine golden master). Plans does not use this slide.
 */
export default function PeopleDuoCandidateSlide({
  candidate,
  identitySource,
  photoIndex,
  onPhotoIndexChange,
  isCurrent,
  withPhoto,
  scheduleLabel,
  scheduleLabelKind = null,
  caption,
  onSeePost,
  about,
  presentation: _presentation = "mine",
  onOpenProfile,
  onMineAtmosphereChange,
}: {
  candidate: PairUpCandidate;
  identitySource: ProfileIdentityMediaSource;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto: boolean;
  neighborSide?: PeopleDuoNeighborSide;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  caption: string | null;
  onSeePost?: () => void;
  about?: string | null;
  /** @deprecated Visual path is always canonical; kept for call-site compat. */
  presentation?: PeopleDuoPresentationVariant;
  onOpenProfile?: () => void;
  onMineAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
}) {
  void _presentation;
  const name = candidate.display_name?.trim() || "Someone";
  const bio = about?.trim() || candidate.bio?.trim() || null;
  const note = candidate.description?.trim() || null;
  const personKey = pairUpPersonKey(candidate);

  return (
    <PeopleCanonicalCandidatePresentation
      identitySource={identitySource}
      photoIndex={photoIndex}
      onPhotoIndexChange={onPhotoIndexChange}
      isCurrent={isCurrent}
      withPhoto={withPhoto}
      caption={caption}
      scheduleLabel={scheduleLabel}
      scheduleLabelKind={scheduleLabelKind}
      onSeePost={onSeePost}
      note={note}
      noteResetKey={candidate.opportunity_id}
      displayName={name}
      bio={bio}
      avatarUrl={candidate.avatar_url}
      personKey={personKey}
      identityVisible
      onOpenProfile={onOpenProfile}
      onAtmosphereChange={onMineAtmosphereChange}
    />
  );
}
