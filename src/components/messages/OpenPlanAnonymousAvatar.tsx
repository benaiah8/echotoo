/**
 * Anonymous Open Plan requester media. Never resolves a profile by id.
 * Photo → Echo preset → '?' — no names, no profile lookup.
 */

import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import { resolveProfileIdentityMedia } from "../../lib/profileIdentityMedia";

type Props = {
  avatarUrl: string | null;
  profilePhotos: string[];
  echoPreset: string | null;
  size: number;
  className?: string;
};

export default function OpenPlanAnonymousAvatar({
  avatarUrl,
  profilePhotos,
  echoPreset,
  size,
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
  } else if (resolved.kind === "echo" && resolved.echoPreset) {
    src = avatarDisplayUrl(resolved.echoPreset) ?? null;
    isPreset = true;
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
