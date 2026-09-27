import { supabase } from "./supabaseClient";
import {
  normalizeEchoPreset,
  uniqueOrderedProfilePhotos,
} from "./profilePhotos";

/** Shared identity select for profile photo / echo updates. */
export const IDENTITY_PROFILE_SELECT =
  "id, user_id, username, display_name, avatar_url, profile_photos, echo_preset, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public, p2p_discover_enabled";

export type ProfileIdentityRow = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_photos?: string[] | null;
  echo_preset?: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
  p2p_discover_enabled?: boolean | null;
};

export type ProfileIdentityCachePayload = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
  xp: number;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private: boolean | null;
  social_media_public: boolean | null;
  p2p_discover_enabled: boolean | null;
};

export function buildProfileIdentityCachePayload(
  row: ProfileIdentityRow,
): ProfileIdentityCachePayload {
  const photos = uniqueOrderedProfilePhotos(row.profile_photos);
  const echo = normalizeEchoPreset(row.echo_preset);
  const avatar = row.avatar_url ?? null;

  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    display_name: row.display_name ?? null,
    avatar_url: avatar,
    profile_photos: photos,
    echo_preset: echo,
    bio: row.bio ?? null,
    xp: row.xp ?? 0,
    member_no: row.member_no ?? null,
    instagram_url: row.instagram_url ?? null,
    tiktok_url: row.tiktok_url ?? null,
    telegram_url: row.telegram_url ?? null,
    is_private: row.is_private ?? null,
    social_media_public: row.social_media_public ?? null,
    p2p_discover_enabled: row.p2p_discover_enabled ?? null,
  };
}

/** Publish authoritative identity row to profile cache, avatar cache, and profile:updated. */
export async function publishProfileIdentityToCaches(
  row: ProfileIdentityRow,
): Promise<ProfileIdentityCachePayload> {
  const payload = buildProfileIdentityCachePayload(row);
  const avatar = payload.avatar_url;

  const { setCachedProfile } = await import("./profileCache");
  const { setCachedAvatar, preloadAvatar } = await import("./avatarCache");

  setCachedProfile(payload as Parameters<typeof setCachedProfile>[0]);
  if (avatar) {
    setCachedAvatar(row.user_id, avatar);
    preloadAvatar(avatar);
    try {
      localStorage.setItem("my_avatar_url", avatar);
    } catch {
      /* ignore */
    }
  }

  window.dispatchEvent(
    new CustomEvent("profile:updated", {
      detail: { id: row.id, profile: payload },
    }),
  );

  return payload;
}

/** Update profile_photos and publish returned identity row (avatar_url from DB trigger). */
export async function updateProfilePhotosInDb(
  profileId: string,
  nextPhotos: string[],
): Promise<ProfileIdentityRow> {
  const unique = uniqueOrderedProfilePhotos(nextPhotos);
  const { data, error: upErr } = await supabase
    .from("profiles")
    .update({ profile_photos: unique })
    .eq("id", profileId)
    .select(IDENTITY_PROFILE_SELECT)
    .maybeSingle();
  if (upErr) throw upErr;
  if (!data) throw new Error("Profile update returned no row.");
  await publishProfileIdentityToCaches(data as ProfileIdentityRow);
  return data as ProfileIdentityRow;
}
