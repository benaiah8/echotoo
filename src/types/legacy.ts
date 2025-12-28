/**
 * Legacy Type Definitions
 *
 * These types were extracted from the obsolete batchDataLoader.ts
 * They are temporarily kept for backward compatibility with existing components
 * that haven't been migrated to the new PostgreSQL-based system yet.
 *
 * TODO: Remove these types as components are refactored to use new data structures
 *
 * @deprecated Use PostgreSQL RPC response types instead
 */

// RSVP User interface (matches rsvpCache.ts)
export interface RSVPUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "going" | "maybe" | "not_going";
  created_at: string;
}

// Profile interface (matches profileCache.ts)
export interface Profile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
}

// RSVP Data structure
export interface RSVPData {
  users: RSVPUser[];
  currentUserStatus: string | null;
}

// Batch load result (now obsolete - PostgreSQL functions return structured data)
export interface BatchLoadResult {
  followStatuses: Map<string, "none" | "pending" | "following" | "friends">;
  likeStatuses: Map<string, boolean>;
  saveStatuses: Map<string, boolean>;
  rsvpData: Map<string, RSVPData>;
  profiles: Map<string, Profile>;
}

