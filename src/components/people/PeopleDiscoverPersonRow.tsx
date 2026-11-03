/**
 * Discover person appearance — profile media + up to three opportunity boxes.
 * Presentation-only; parent owns grouping, seen, and mutations.
 */
import type { ReactNode } from "react";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import {
  PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
  PEOPLE_FEED_MEDIA_RADIUS,
  discoverPersonUsesCharacterCard,
  discoverPersonUsesPhotoFrame,
} from "../../lib/people/peopleFeedLayout";
import { discoverPersonPhotoLoadFallbackToCharacter } from "../../lib/people/mergeDiscoverPersonIdentity";
import PeopleCandidateMedia from "./PeopleCandidateMedia";
import MinePortraitIdentityOverlay from "./MinePortraitIdentityOverlay";
import PeopleDiscoverCharacterCard from "./PeopleDiscoverCharacterCard";

export type PeopleDiscoverPersonRowProps = {
  appearanceKey: string;
  personKey: string;
  displayName: string;
  identitySource: ProfileIdentityMediaSource;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  /** Prefer true when this appearance is the scroll focus; photo cycle works while visible regardless. */
  isFocused?: boolean;
  withPhoto?: boolean;
  onOpenProfile?: () => void;
  /** Neutral Echo seed when no assigned Echo (stable per person). */
  feedNeutralEchoSeed: string;
  /** Person-scoped failed photo paths (Discover parent). */
  failedPhotoPaths?: ReadonlySet<string>;
  onPhotoLoadFailure?: (failedPath: string | null) => void;
  children: ReactNode;
};

export default function PeopleDiscoverPersonRow({
  appearanceKey,
  personKey,
  displayName,
  identitySource,
  photoIndex,
  onPhotoIndexChange,
  isFocused = false,
  withPhoto = true,
  onOpenProfile,
  feedNeutralEchoSeed,
  failedPhotoPaths,
  onPhotoLoadFailure,
  children,
}: PeopleDiscoverPersonRowProps) {
  const failed = failedPhotoPaths ?? new Set<string>();
  const usesPhotoFrame = discoverPersonUsesPhotoFrame(identitySource);
  const usesCharacterCard = discoverPersonUsesCharacterCard(identitySource);
  const photoLoadFallback = discoverPersonPhotoLoadFallbackToCharacter(
    identitySource,
    failed
  );

  const showCharacterCard = usesCharacterCard || photoLoadFallback;
  const showPhotoFrame = usesPhotoFrame && !photoLoadFallback;

  const photoIdentityOverlay = (
    <MinePortraitIdentityOverlay
      name={displayName}
      bio={null}
      resetKey={`${personKey}:${photoIndex}:${appearanceKey}`}
      interactive
      onOpenProfile={onOpenProfile}
      feedLayout
    />
  );

  return (
    <article
      className="w-full border-t border-[var(--border)] first:border-t-0"
      style={{
        paddingTop: "var(--people-discover-person-pad-y, 20px)",
        paddingBottom: "var(--people-discover-person-pad-y, 20px)",
      }}
      data-people-discover-person-row="true"
      data-people-discover-appearance={appearanceKey}
      data-people-discover-person={personKey}
      data-people-discover-focused={isFocused ? "true" : "false"}
      data-people-discover-media-mode={
        showCharacterCard ? "character" : "photos"
      }
      data-people-discover-identity-merged="true"
    >
      <div className="min-w-0" data-people-discover-identity="true">
        {showCharacterCard ? (
          <PeopleDiscoverCharacterCard
            identitySource={identitySource}
            displayName={displayName}
            onOpenProfile={onOpenProfile}
            feedNeutralEchoSeed={feedNeutralEchoSeed}
          />
        ) : showPhotoFrame ? (
          <div
            className="flex w-full justify-center"
            data-people-discover-portrait="true"
          >
            <div
              className="relative w-full overflow-hidden [&_[data-people-duo-photo-frame]]:!rounded-none [&_[data-people-feed-legacy]]:!rounded-none [&_[data-people-feed-single-frame]]:!rounded-none [&_[data-people-mine-card]]:!rounded-none [&_[data-people-mine-identity-plate]]:!rounded-none"
              style={{
                width:
                  "min(100%, var(--people-discover-photo-max-w, 26rem))",
                aspectRatio: "var(--people-discover-photo-aspect, 4 / 5)",
                borderRadius: PEOPLE_FEED_MEDIA_RADIUS,
              }}
              data-people-discover-photo-clip="true"
            >
              <PeopleCandidateMedia
                source={identitySource}
                activeIndex={photoIndex}
                onActiveIndexChange={onPhotoIndexChange}
                withPhoto={withPhoto}
                isCurrent={isFocused}
                enableTapCycle
                presentation="mine"
                peekDirection="up"
                identityOverlay={photoIdentityOverlay}
                tapIdentityKey={`${appearanceKey}:${personKey}`}
                feedLayout
                feedNeutralEchoSeed={feedNeutralEchoSeed}
                onFeedCharacterFallback={onPhotoLoadFailure}
              />
              <div
                className="pointer-events-none absolute inset-0 z-20"
                style={{
                  borderRadius: PEOPLE_FEED_MEDIA_RADIUS,
                  boxShadow: PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
                }}
                data-people-discover-photo-border="true"
                aria-hidden
              />
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="mt-3 flex min-w-0 flex-col gap-2"
        data-people-discover-opp-stack="true"
      >
        {children}
      </div>
    </article>
  );
}
