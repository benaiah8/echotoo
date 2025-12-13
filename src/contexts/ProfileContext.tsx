// src/contexts/ProfileContext.tsx
import { createContext, useContext } from "react";

export type Profile = {
  id: string; // profiles PK
  user_id: string; // FK to auth.users.id
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no?: number | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  telegram_url?: string | null;
  is_private?: boolean; // Whether account is private (requires approval to see posts)
  social_media_public?: boolean; // Whether social media links are visible publicly even when account is private
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
