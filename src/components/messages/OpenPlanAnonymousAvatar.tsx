/**
 * Anonymous Open Plan requester media. Never resolves a profile by id.
 * Photo → Echo preset / legacy preset → deterministic Echo (neutral seed) → '?'.
 * Prefer Echo over '?' whenever presets are available.
 */

import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import { resolvePeopleFeedEchoPreset } from "../../lib/people/peopleFeedLayout";
import { resolveProfileIdentityMedia } from "../../lib/profileIdentityMedia";

type Props = {
  avatarUrl: string | null;
  profilePhotos: string[];
  echoPreset: string | null;
  size: number;
  /**
   * Stable non-PII seed (e.g. request row id) for approved deterministic Echo
   * when the profile has no photo and no stored echo_preset. Do not pass a
   * gated user/profile id for undisclosed hosts.
   */
  neutralEchoSeed?: string | null;
  className?: string;
};

export default function OpenPlanAnonymousAvatar({
  avatarUrl,
  profilePhotos,
  echoPreset,
  size,
  neutralEchoSeed = null,
  className,
}: Props) {
  const resolved = resolveProfileIdentityMedia({
    avatar_url: avatarUrl,
    profile_photos: profilePhotos,
    echo_preset: echoPreset,
  });

  let src: string | null = null;
  let isPreset = false;
  if (resolved.kind === "photos" || resolved.kind === "legacy-photo") {
    src = avatarDisplayUrl(resolved.primaryPhoto) ?? null;
    isPreset = isAvatarPresetValue(resolved.primaryPhoto);
  } else {
    const echo = resolvePeopleFeedEchoPreset(
      {
        echo_preset: echoPreset,
        avatar_url: avatarUrl,
      },
      neutralEchoSeed
    );
    src = avatarDisplayUrl(echo) ?? null;
    isPreset = Boolean(src);
  }

  return (
    <span
      className={[
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/40",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src && !isPreset ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          decoding="async"
        />
      ) : src && isPreset ? (
        <span className="flex h-full w-full items-center justify-center bg-[var(--surface)]">
          <img
            src={src}
            alt=""
            className="h-[78%] w-[78%] object-contain"
            draggable={false}
            decoding="async"
          />
        </span>
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-[var(--brand)] font-semibold text-[var(--brand-ink)]">
          <span className="text-[18px] leading-none">?</span>
        </span>
      )}
    </span>
  );
}
