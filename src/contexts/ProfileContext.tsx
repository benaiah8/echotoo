// src/contexts/ProfileContext.tsx
import { createContext, useContext } from "react";

export type Profile = {
  id: string; // profiles PK
  user_id: string; // FK to auth.users.id
  username: string | null;
  display_name: string | null;
  /** Compatibility primary face (Photo 1 ?? Echo). Prefer this for circular avatars. */
  avatar_url: string | null;
  /** Ordered real profile photos (0–3). Index 0 = primary (= DB profile_photos[1]). */
  profile_photos: string[];
  /** Independent Echo companion (`preset:owl_NN`). Not cleared by photo uploads. */
  echo_preset: string | null;
  bio: string | null;
  xp: number | null;
  member_no?: number | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  telegram_url?: string | null;
  is_private?: boolean; // Whether account is private (requires approval to see posts)
  social_media_public?: boolean; // Whether social media links are visible publicly even when account is private
  /** Own-profile only. Reciprocal Discover preference. */
  p2p_discover_enabled?: boolean | null;
};

type Ctx = {
  profile: Profile | null;
  loading: boolean;
};

const ProfileContext = createContext<Ctx>({ profile: null, loading: true });

export const useProfile = () => useContext(ProfileContext);

export function ProfileProvider({
  value,
  children,
}: {
  value: Ctx;
  children: React.ReactNode;
}) {
  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
