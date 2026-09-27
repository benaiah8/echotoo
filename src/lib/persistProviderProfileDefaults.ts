import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { invalidateProfileByUserIdCache } from "../api/services/follows";
import { isUsernameMissingOrPlaceholder } from "./profileUsername";
import { buildMissingEchoIdentityPatch } from "./echoPresetAssignment";

const USERNAME_MAX = 24;
/** Dedupe concurrent persist for the same auth user (OAuth + SIGNED_IN racing). */
const persistInflight = new Map<string, Promise<void>>();

export const PROFILE_DEFAULTS_STARTED_EVENT = "echotoo:profile-defaults-started";
export const PROFILE_DEFAULTS_FINISHED_EVENT =
  "echotoo:profile-defaults-finished";

/** Set before email/OAuth login so App.tsx can persist on real SIGNED_IN only. */
export const PROFILE_DEFAULTS_LOGIN_PENDING_KEY =
  "echotoo:profile-defaults-login-pending";

export function markProfileDefaultsLoginPending(): void {
  try {
    sessionStorage.setItem(PROFILE_DEFAULTS_LOGIN_PENDING_KEY, "1");
  } catch {
    /* private browsing */
  }
}

export function consumeProfileDefaultsLoginPending(): boolean {
  try {
    const v = sessionStorage.getItem(PROFILE_DEFAULTS_LOGIN_PENDING_KEY);
    if (v) {
      sessionStorage.removeItem(PROFILE_DEFAULTS_LOGIN_PENDING_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function dispatchProfileDefaultsStarted(userId: string): void {
  window.dispatchEvent(
    new CustomEvent(PROFILE_DEFAULTS_STARTED_EVENT, {
      detail: { userId },
    }),
  );
}

function dispatchProfileDefaultsFinished(userId: string): void {
  window.dispatchEvent(
    new CustomEvent(PROFILE_DEFAULTS_FINISHED_EVENT, {
      detail: { userId },
    }),
  );
}

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

/** Exported for unit tests — https avatar/picture from auth user_metadata. */
export function pickHttpsAvatarFromMeta(
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
  const d = displayName.trim();
  // Prefer compact slug: "Ben 10" → ben10, "John Doe" → johndoe (matches first-time editor intent).
  const compact = sanitizeUsernameRaw(d.replace(/\s+/g, ""));
  if (compact.length >= 3) return compact.slice(0, USERNAME_MAX);
  const firstWord = d.split(/\s+/)[0] ?? "";
  let base = sanitizeUsernameRaw(firstWord);
  if (!base) base = sanitizeUsernameRaw(d.replace(/\s+/g, ""));
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
      "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public, user_number, onboarding_completed, onboarding_step, profile_photos, echo_preset",
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
    profile_photos: row.profile_photos ?? [],
    echo_preset: row.echo_preset ?? null,
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

type ProfileDefaultsRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_photos: string[] | null;
  echo_preset: string | null;
};

/**
 * @returns true if progress events (started/finished) were emitted for this run.
 */
async function runPersist(user: User): Promise<boolean> {
  const userId = user.id;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? undefined;
  const providerHttps = pickHttpsAvatarFromMeta(meta);

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
    .select(
      "id, display_name, username, avatar_url, profile_photos, echo_preset",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selErr) {
    console.warn(
      "[persistProviderProfileDefaults] profile select:",
      selErr.message,
    );
    return false;
  }

  const row = (existing ?? null) as ProfileDefaultsRow | null;

  const hasDisplay = Boolean(String(row?.display_name ?? "").trim());
  const needsUsernameFill =
    !row || isUsernameMissingOrPlaceholder(row.username);

  const nextDisplay = hasDisplay
    ? null
    : displayName.trim() || emailDisplayFallback(email);
  let nextUsername: string | null = null;
  if (needsUsernameFill) {
    const explicitDisplay =
      String(row?.display_name ?? "").trim() || displayFromMeta;
    const weakMeta =
      metaUsernameCandidate.length < 3 ||
      /^[0-9]+$/.test(metaUsernameCandidate);

    if (explicitDisplay) {
      nextUsername = await findAvailableUsername(
        baseUsernameFromDisplayOrEmail(explicitDisplay, email),
        row?.id ?? null,
      );
    } else if (metaUsernameCandidate.length >= 3 && !weakMeta) {
      const taken = await isUsernameTaken(
        metaUsernameCandidate,
        row?.id ?? null,
      );
      nextUsername = taken
        ? await findAvailableUsername(
            metaUsernameCandidate,
            row?.id ?? null,
          )
        : metaUsernameCandidate;
    } else {
      nextUsername = await findAvailableUsername(
        baseUsernameFromDisplayOrEmail(displayName.trim(), email),
        row?.id ?? null,
      );
    }
  }

  const echoPhotoPatch = buildMissingEchoIdentityPatch({
    userId,
    echo_preset: row?.echo_preset ?? null,
    profile_photos: row?.profile_photos ?? [],
    providerHttpsAvatar: providerHttps,
  });

  const patch: Record<string, string | string[] | null> = {};
  if (!hasDisplay && nextDisplay) patch.display_name = nextDisplay;
  if (needsUsernameFill && nextUsername) patch.username = nextUsername;
  if (echoPhotoPatch.echo_preset) {
    patch.echo_preset = echoPhotoPatch.echo_preset;
  }
  if (echoPhotoPatch.profile_photos) {
    patch.profile_photos = echoPhotoPatch.profile_photos;
  }

  const willWrite = !row || Object.keys(patch).length > 0;
  if (!willWrite) return false;

  dispatchProfileDefaultsStarted(userId);

  if (!row) {
    const insertDisplay = nextDisplay ?? displayName.trim();
    const insertUsername =
      nextUsername ??
      (await findAvailableUsername(
        baseUsernameFromDisplayOrEmail(insertDisplay, email),
        null,
      ));
    const insertEchoPatch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
      providerHttpsAvatar: providerHttps,
    });

    const { error: insErr } = await supabase.from("profiles").insert({
      user_id: userId,
      display_name: insertDisplay,
      username: insertUsername,
      // Do not write HTTPS to avatar_url alone with echo — seed photos + echo
      // so trg_profiles_sync_avatar_url keeps avatar_url = photos[1].
      profile_photos: insertEchoPatch.profile_photos ?? [],
      echo_preset: insertEchoPatch.echo_preset ?? null,
      avatar_url: null,
      onboarding_completed: false,
      onboarding_step: 0,
    });

    if (insErr) {
      const isDup =
        insErr.code === "23505" ||
        String(insErr.message || "").includes("duplicate");
      if (isDup) {
        const { data: dupRow } = await supabase
          .from("profiles")
          .select(
            "id, display_name, username, avatar_url, profile_photos, echo_preset",
          )
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!dupRow?.id) {
          console.warn(
            "[persistProviderProfileDefaults] insert duplicate but row missing:",
            insErr.message,
          );
          return true;
        }
        const retryEcho = buildMissingEchoIdentityPatch({
          userId,
          echo_preset: dupRow.echo_preset ?? null,
          profile_photos: dupRow.profile_photos ?? [],
          providerHttpsAvatar: providerHttps,
        });
        const retryPatch: Record<string, string | string[] | null> = {};
        if (!String(dupRow.display_name ?? "").trim() && insertDisplay)
          retryPatch.display_name = insertDisplay;
        if (
          isUsernameMissingOrPlaceholder(dupRow.username) &&
          insertUsername
        )
          retryPatch.username = insertUsername;
        if (retryEcho.echo_preset) retryPatch.echo_preset = retryEcho.echo_preset;
        if (retryEcho.profile_photos)
          retryPatch.profile_photos = retryEcho.profile_photos;
        if (Object.keys(retryPatch).length > 0) {
          const { error: upErr } = await supabase
            .from("profiles")
            .update(retryPatch)
            .eq("id", dupRow.id);
          if (upErr) {
            console.warn(
              "[persistProviderProfileDefaults] patch after dup insert:",
              upErr.message,
            );
            return true;
          }
        }
        invalidateProfileByUserIdCache(userId);
        await syncProfileCachesAndDispatch(userId);
        return true;
      }
      console.warn(
        "[persistProviderProfileDefaults] insert:",
        insErr.message,
      );
      return true;
    }
    invalidateProfileByUserIdCache(userId);
    await syncProfileCachesAndDispatch(userId);
    return true;
  }

  const { error: upErr } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", row.id);

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
    return true;
  }

  invalidateProfileByUserIdCache(userId);
  await syncProfileCachesAndDispatch(userId);
  return true;
}

/**
 * Idempotent: fills missing profiles.display_name, username, echo_preset
 * (and seeds provider HTTPS into profile_photos when photos are empty)
 * from auth user_metadata. Does not overwrite non-empty identity fields,
 * existing Echo, or non-empty profile_photos.
 * Username: also replaces DB placeholders matching `user_<digits>` when a
 * display-derived username can be assigned.
 */
export async function persistProviderProfileDefaultsAfterSignIn(
  user: User | null | undefined,
): Promise<void> {
  if (!user?.id) return;
  const existing = persistInflight.get(user.id);
  if (existing) return existing;

  const work = (async () => {
    let emittedStarted = false;
    try {
      emittedStarted = await runPersist(user);
    } finally {
      if (emittedStarted) dispatchProfileDefaultsFinished(user.id);
    }
  })();

  persistInflight.set(user.id, work);
  return work.finally(() => {
    if (persistInflight.get(user.id) === work) persistInflight.delete(user.id);
  });
}
