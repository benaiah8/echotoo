/**
 * Groups → Group presentation adapter (Plans-style thin mapping).
 */
import type { GroupUpCandidate } from "../../lib/people/types";
import type { PublishedMediaItem } from "../../lib/publishedMedia";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import { groupUpDeckRowId } from "../../lib/groupUpDeckRowId";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import type { PeopleMineAtmosphereReport } from "./PeopleCandidateMedia";
import PeopleGroupUpCandidatePresentation from "./PeopleGroupUpCandidatePresentation";

export default function PeopleGroupUpCandidateSlide({
  candidate,
  mediaItems,
  mediaIndex,
  onMediaIndexChange,
  isCurrent,
  withPhoto,
  scheduleLabel,
  scheduleLabelKind = null,
  onSeePost,
  onOpenHostProfile,
  onAtmosphereChange,
}: {
  candidate: GroupUpCandidate;
  mediaItems: readonly PublishedMediaItem[];
  mediaIndex: number;
  onMediaIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto: boolean;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  onSeePost?: () => void;
  onOpenHostProfile?: () => void;
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
}) {
  const hostDisplayName =
    candidate.organizer_display_name?.trim() ||
    candidate.organizer_username?.trim() ||
    "Host";
  const groupTitle =
    candidate.group_title?.trim() || peopleUiCopy.groupUpFallbackTitle;
  const sourceGone = candidate.source_unavailable === true;

  return (
    <PeopleGroupUpCandidatePresentation
      mediaItems={mediaItems}
      mediaIndex={mediaIndex}
      onMediaIndexChange={onMediaIndexChange}
      isCurrent={isCurrent}
      withPhoto={withPhoto}
      caption={sourceGone ? null : candidate.source_caption?.trim() || null}
      scheduleLabel={sourceGone ? null : scheduleLabel}
      scheduleLabelKind={sourceGone ? null : scheduleLabelKind}
      onSeePost={sourceGone ? undefined : onSeePost}
      groupTitle={groupTitle}
      groupDescription={candidate.group_description?.trim() || null}
      noteResetKey={groupUpDeckRowId(candidate)}
      hostDisplayName={hostDisplayName}
      hostAvatarUrl={candidate.organizer_avatar_url}
      onOpenHostProfile={onOpenHostProfile}
      onAtmosphereChange={onAtmosphereChange}
    />
  );
}
