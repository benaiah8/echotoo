/**
 * Unified Discover character presentation — Echo presets, deterministic Echo,
 * and empty/failed-photo fallbacks. One card; no nested avatar tiles or pills.
 */
import ProfileHeroAvatarAtmosphere from "../profile/ProfileHeroAvatarAtmosphere";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import {
  PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
  PEOPLE_FEED_MEDIA_RADIUS,
  resolvePeopleFeedEchoPreset,
} from "../../lib/people/peopleFeedLayout";
import PeopleDiscoverEchoIdentity from "./PeopleDiscoverEchoIdentity";

const CARD_SCRIM =
  "absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_46%,transparent)] app-dark:bg-[color-mix(in_oklab,var(--bg)_36%,transparent)]";

export default function PeopleDiscoverCharacterCard({
  identitySource,
  displayName,
  onOpenProfile,
  feedNeutralEchoSeed,
}: {
  identitySource: ProfileIdentityMediaSource;
  displayName: string;
  onOpenProfile?: () => void;
  feedNeutralEchoSeed: string;
}) {
  const preset = resolvePeopleFeedEchoPreset(
    {
      profile_photos: identitySource.profile_photos,
      echo_preset: identitySource.echo_preset,
      avatar_url: identitySource.avatar_url,
      user_id: identitySource.user_id,
      profile_id: identitySource.profile_id,
    },
    feedNeutralEchoSeed
  );
  const characterUrl = avatarDisplayUrl(preset);

  return (
    <div
      className="relative w-full overflow-hidden bg-[var(--surface)]"
      style={{
        borderRadius: PEOPLE_FEED_MEDIA_RADIUS,
        maxHeight: "var(--people-discover-character-max-h, 36vh)",
        aspectRatio: "var(--people-discover-character-aspect, 4 / 5)",
        minHeight: "var(--people-discover-character-min-h, min(220px, 52vw))",
        boxShadow: PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
      }}
      data-people-discover-character-card="true"
      data-people-discover-media-mode="character"
    >
      <ProfileHeroAvatarAtmosphere
        avatarPath={preset}
        extendTop="0"
        height="100%"
        horizontalBleed="0"
        washFilter="blur(28px)"
        washOpacityClassName="opacity-[0.52] app-light:opacity-[0.4]"
        scrimClassName={CARD_SCRIM}
        washClassName=""
      />
      <div
        className="relative z-[1] flex h-full min-h-0 w-full flex-col items-center px-4 pb-[var(--people-discover-character-pad-b,1.25rem)] pt-[var(--people-discover-character-pad-t,1rem)]"
        data-people-discover-character-content="true"
      >
        <PeopleDiscoverEchoIdentity
          name={displayName}
          onOpenProfile={onOpenProfile}
          discoverCharacterName
        />
        <div
          className="flex min-h-0 w-full flex-1 items-center justify-center"
          style={{
            marginTop:
              "var(--people-discover-character-name-gap, 0.75rem)",
          }}
          data-people-discover-character-figure="true"
        >
          {characterUrl ? (
            <img
              src={characterUrl}
              alt=""
              className="pointer-events-none max-h-[var(--people-discover-character-figure-max-h,min(11rem,44vw))] w-auto max-w-[min(78%,var(--people-discover-character-figure-max-w,16rem))] object-contain object-center"
              draggable={false}
              decoding="async"
              data-people-discover-character-art="true"
            />
          ) : (
            <div
              className="h-[var(--people-discover-character-figure-max-h,min(11rem,44vw))] w-[min(78%,12rem)]"
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  );
}
