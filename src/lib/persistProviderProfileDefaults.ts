import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { invalidateProfileByUserIdCache } from "../api/services/follows";
import { pickRandomPresetAvatarValue } from "./avatarPresets";

const USERNAME_MAX = 24;
/** Dedupe concurrent persist for the same auth user (OAuth + SIGNED_IN racing). */
const persistInflight = new Map<string, Promise<void>>();

function stringFromMeta(
  meta: Record<string, unknown>,
  keys: string[],
): string {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function emailDisplayFallback(email: string | undefined): string {
  if (!email) return "Member";
  const local = email.split("@")[0]?.trim();
  if (!local) return "Member";
  const humanized = local.replace(/[._-]+/g, " ").trim();
  return humanized || "Member";
}

function pickHttpsAvatarFromMeta(
  meta: Record<string, unknown>,
): string | null {
  for (const k of ["avatar_url", "picture"] as const) {
    const v = meta[k];
    if (typeof v === "string" && v.trim().toLowerCase().startsWith("https://"))
      return v.trim();
  }
  return null;
}

/** Lowercase [a-z0-9_], capped length; empty if nothing usable. */
function sanitizeUsernameRaw(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return s.slice(0, USERNAME_MAX);
}

function baseUsernameFromDisplayOrEmail(
  displayName: string,
  email: string | undefined,
): string {
  const firstWord = displayName.trim().split(/\s+/)[0] ?? "";
  let base = sanitizeUsernameRaw(firstWord);
  if (!base) base = sanitizeUsernameRaw(displayName.replace(/\s+/g, ""));
  if (!base && email) {
    base = sanitizeUsernameRaw(email.split("@")[0] ?? "");
  }
  if (!base) base = "echo";
  return base.slice(0, USERNAME_MAX);
}

async function isUsernameTaken(
  candidate: string,
  excludeProfileId: string | null,
): Promise<boolean> {
  if (!candidate) return true;
  let q = supabase.from("profiles").select("id").ilike("username", candidate);
  if (excludeProfileId) q = q.neq("id", excludeProfileId);
  const { data } = await q.limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Find a free username: base, base2, base3, … (same pattern as FullScreenProfileCreation).
 */
async function findAvailableUsername(
  base: string,
  excludeProfileId: string | null,
): Promise<string> {
  let b = (base || "echo").slice(0, USERNAME_MAX);
  if (b.length < 3) {
    b = (b + "xxx").slice(0, 3);
  }
  for (let counter = 0; counter <= 9999; counter++) {
    const suffix = counter === 0 ? "" : String(counter);
    const maxBaseLen = USERNAME_MAX - suffix.length;
    if (maxBaseLen < 1) continue;
    const candidate = `${b.slice(0, maxBaseLen)}${suffix}`;
    const taken = await isUsernameTaken(candidate, excludeProfileId);
    if (!taken) return candidate;
  }
  return `u${Date.now().toString(36)}`.slice(0, USERNAME_MAX);
}

async function syncProfileCachesAndDispatch(
  userId: string,
): Promise<void> {
  const { data: row, error } = await supabase
    .from("profiles")
    .select(
      "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public, user_number, onboarding_completed, onboarding_step",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.warn(
      "[persistProviderProfileDefaults] sync after write:",
      error.message,
    );
    return;
  }
  if (!row?.id) return;

  const profilePayload = {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    bio: row.bio ?? null,
    xp: row.xp ?? 0,
    member_no: row.member_no ?? null,
    instagram_url: row.instagram_url ?? null,
    tiktok_url: row.tiktok_url ?? null,
    telegram_url: row.telegram_url ?? null,
    is_private: row.is_private ?? false,
    social_media_public: row.social_media_public ?? false,
    user_number: row.user_number ?? null,
    onboarding_completed: row.onboarding_completed ?? null,
    onboarding_step: row.onboarding_step ?? null,
  };

  const { setCachedProfile } = await import("./profileCache");
  const { setCachedAvatar, preloadAvatar } = await import("./avatarCache");
  const { clearCachedFollowCounts } = await import("./followCountsCache");

  setCachedProfile(profilePayload);
  if (profilePayload.avatar_url) {
    setCachedAvatar(profilePayload.user_id, profilePayload.avatar_url);
    preloadAvatar(profilePayload.avatar_url);
  }
  clearCachedFollowCounts(row.id);

  window.dispatchEvent(
    new CustomEvent("profile:updated", {
      detail: { id: row.id, profile: profilePayload },
    }),
  );
  window.dispatchEvent(
    new CustomEvent("echotoo:profile-defaults-synced", {
      detail: { userId },
    }),
  );
}

async function runPersist(user: User): Promise<void> {
  const userId = user.id;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? undefined;

  const displayFromMeta = stringFromMeta(meta, ["full_name", "name"]);
  let displayName =
    displayFromMeta || emailDisplayFallback(email);
  if (!displayName.trim()) displayName = "Member";

  const metaUsernameCandidate = sanitizeUsernameRaw(
    stringFromMeta(meta, [
      "preferred_username",
      "username",
      "user_name",
    ]),
  );

  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selErr) {
    console.warn(
      "[persistProviderProfileDefaults] profile select:",
      selErr.message,
    );
    return;
  }

  const hasDisplay = Boolean(String(existing?.display_name ?? "").trim());
  const hasUsername = Boolean(String(existing?.username ?? "").trim());
  const hasAvatar = Boolean(String(existing?.avatar_url ?? "").trim());

  let nextDisplay = hasDisplay
    ? null
    : displayName.trim() || emailDisplayFallback(email);
  let nextUsername: string | null = null;
  if (!hasUsername) {
    if (metaUsernameCandidate.length >= 3) {
      const taken = await isUsernameTaken(
        metaUsernameCandidate,
        existing?.id ?? null,
      );
      nextUsername = taken
        ? await findAvailableUsername(
            metaUsernameCandidate,
            existing?.id ?? null,
          )
        : metaUsernameCandidate;
    } else {
      const base = baseUsernameFromDisplayOrEmail(
        displayFromMeta || displayName,
        email,
      );
      nextUsername = await findAvailableUsername(base, existing?.id ?? null);
    }
  }

  let nextAvatar: string | null = null;
  if (!hasAvatar) {
    nextAvatar = pickHttpsAvatarFromMeta(meta) ?? pickRandomPresetAvatarValue();
  }

  const patch: Record<string, string> = {};
  if (!hasDisplay && nextDisplay) patch.display_name = nextDisplay;
  if (!hasUsername && nextUsername) patch.username = nextUsername;
  if (!hasAvatar && nextAvatar) patch.avatar_url = nextAvatar;

  if (!existing) {
    const insertDisplay = nextDisplay ?? displayName.trim();
    const insertUsername =
      nextUsername ??
      (await findAvailableUsername(
        baseUsernameFromDisplayOrEmail(insertDisplay, email),
        null,
      ));
    const insertAvatar =
      nextAvatar ??
      pickHttpsAvatarFromMeta(meta) ??
      pickRandomPresetAvatarValue() ??
      "";

    const { error: insErr } = await supabase.from("profiles").insert({
      user_id: userId,
      display_name: insertDisplay,
      username: insertUsername,
      avatar_url: insertAvatar || null,
      onboarding_completed: false,
      onboarding_step: 0,
    });

    if (insErr) {
      const isDup =
        insErr.code === "23505" ||
        String(insErr.message || "").includes("duplicate");
      if (isDup) {
        const { data: row } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!row?.id) {
          console.warn(
            "[persistProviderProfileDefaults] insert duplicate but row missing:",
            insErr.message,
          );
          return;
        }
        const retryPatch: Record<string, string> = {};
        if (!String(row.display_name ?? "").trim() && insertDisplay)
          retryPatch.display_name = insertDisplay;
        if (!String(row.username ?? "").trim() && insertUsername)
          retryPatch.username = insertUsername;
        if (!String(row.avatar_url ?? "").trim() && insertAvatar)
          retryPatch.avatar_url = insertAvatar;
        if (Object.keys(retryPatch).length > 0) {
          const { error: upErr } = await supabase
            .from("profiles")
            .update(retryPatch)
            .eq("id", row.id);
          if (upErr) {
            console.warn(
              "[persistProviderProfileDefaults] patch after dup insert:",
              upErr.message,
            );
            return;
          }
        }
        invalidateProfileByUserIdCache(userId);
        await syncProfileCachesAndDispatch(userId);
        return;
      }
      console.warn(
        "[persistProviderProfileDefaults] insert:",
        insErr.message,
      );
      return;
    }
    invalidateProfileByUserIdCache(userId);
    await syncProfileCachesAndDispatch(userId);
    return;
  }

  if (Object.keys(patch).length === 0) return;

  const { error: upErr } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", existing.id);

  if (upErr) {
    if (upErr.code === "23505") {
      console.warn(
        "[persistProviderProfileDefaults] username conflict; skipping patch:",
        upErr.message,
      );
    } else {
      console.warn(
        "[persistProviderProfileDefaults] update:",
        upErr.message,
      );
    }
    return;
  }

  invalidateProfileByUserIdCache(userId);
  await syncProfileCachesAndDispatch(userId);
}

/**
 * Idempotent: fills missing profiles.display_name, username, avatar_url from
 * auth user_metadata (and safe fallbacks). Does not overwrite non-empty fields.
 */
export async function persistProviderProfileDefaultsAfterSignIn(
  user: User | null | undefined,
): Promise<void> {
  if (!user?.id) return;
  let p = persistInflight.get(user.id);
  if (p) return p;
  p = runPersist(user).finally(() => {
    if (persistInflight.get(user.id) === p) persistInflight.delete(user.id);
  });
  persistInflight.set(user.id, p);
  return p;
}
