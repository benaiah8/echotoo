// src/api/services/xp.ts
// XP service for server-authoritative XP updates
// [PHASE 1] XP integration (persistent, cross-device)

import { supabase } from "../../lib/supabaseClient";
import { getCachedProfile, setCachedProfile } from "../../lib/profileCache";
import { getProfileByUserId } from "./follows";

// [DEBUG] Toggle to enable/disable debug logs
const DEBUG_XP = false;

/**
 * Increment XP for the current authenticated user
 * Uses server-authoritative RPC to ensure consistency across devices
 *
 * @param delta - XP change (positive for increase, negative for decrease)
 * @returns Updated XP value or null if error/not authenticated
 */
export async function incrementMyXp(
  delta: number
): Promise<{ xp: number | null; error: any }> {
  // [DEBUG] Log when XP increment is called
  if (DEBUG_XP) console.log("[XP] incrementMyXp called with delta:", delta);
  
  try {
    // Check authentication
    const {
      data: { session },
      error: sessError,
    } = await supabase.auth.getSession();

    if (sessError || !session) {
      // Not authenticated - fail silently (don't block user actions)
      return { xp: null, error: sessError || new Error("Not authenticated") };
    }

    // Call RPC to increment XP
    const { data, error } = await supabase.rpc("increment_my_xp", {
      p_delta: delta,
    });

    if (error) {
      console.error("[XP] Error incrementing XP:", error);
      // Fail silently - don't block user actions if XP update fails
      return { xp: null, error };
    }

    const newXp = data ?? null;

    // [DEBUG] Log XP increment for debugging
    if (DEBUG_XP) console.log("[XP] Increment successful:", {
      delta,
      newXp,
      userId: session.user.id,
    });

    // [PHASE 1] Update profile cache in-memory (avoid refetch)
    // Why: Keeps XP display up-to-date without extra network requests
    if (newXp !== null) {
      try {
        // Get current user's profile ID
        const profile = await getProfileByUserId(session.user.id);
        if (profile) {
          // Update cache with new XP value
          const cached = getCachedProfile(profile.id);
          if (cached) {
            // Update existing cache entry
            setCachedProfile({
              ...cached,
              xp: newXp,
            });
            console.log("[XP] Updated cached profile XP:", {
              profileId: profile.id,
              oldXp: cached.xp,
              newXp,
            });
          } else {
            // Cache doesn't exist, update full profile
            setCachedProfile({
              ...profile,
              xp: newXp,
            });
            if (DEBUG_XP) console.log("[XP] Set new profile cache with XP:", {
              profileId: profile.id,
              newXp,
            });
          }

          // Dispatch event to update UI (OwnProfilePage listens to this)
          window.dispatchEvent(
            new CustomEvent("profile:updated", { detail: { id: profile.id } })
          );
          if (DEBUG_XP) console.log("[XP] Dispatched profile:updated event for profileId:", profile.id);
        } else {
          console.warn("[XP] Could not fetch profile for userId:", session.user.id);
        }
      } catch (cacheError) {
        // Fail silently - cache update shouldn't block XP increment
        console.warn("[XP] Failed to update profile cache:", cacheError);
      }
    }

    // Return updated XP value
    return { xp: newXp, error: null };
  } catch (error) {
    console.error("[XP] Exception incrementing XP:", error);
    // Fail silently - don't block user actions
    return { xp: null, error };
  }
}
