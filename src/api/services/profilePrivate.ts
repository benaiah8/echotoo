/**
 * Owner-only private Profile metadata (Migration B: profile_private).
 * Not part of public Profile reads — use only from Edit Profile / own-user flows.
 */

import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import { getViewerAuthUserId } from "./follows";

export type ProfileGender = "male" | "female" | "prefer_not_to_say";

export type ProfilePrivate = {
  user_id: string;
  date_of_birth: string | null;
  gender: ProfileGender | null;
  created_at?: string;
  updated_at?: string;
};

export type SaveProfilePrivateInput = {
  date_of_birth: string | null;
  gender: ProfileGender | null;
};

const PROFILE_PRIVATE_SELECT =
  "user_id, date_of_birth, gender, created_at, updated_at";

const PROFILE_GENDER_VALUES: readonly ProfileGender[] = [
  "male",
  "female",
  "prefer_not_to_say",
];

/** Postgres DATE over PostgREST is YYYY-MM-DD. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isProfileGender(value: unknown): value is ProfileGender {
  return (
    typeof value === "string" &&
    (PROFILE_GENDER_VALUES as readonly string[]).includes(value)
  );
}

function normalizeProfilePrivateRow(row: unknown): ProfilePrivate | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.user_id !== "string") return null;

  let gender: ProfileGender | null = null;
  if (r.gender != null) {
    if (!isProfileGender(r.gender)) return null;
    gender = r.gender;
  }

  let date_of_birth: string | null = null;
  if (r.date_of_birth != null) {
    if (typeof r.date_of_birth !== "string" || !DATE_ONLY_RE.test(r.date_of_birth)) {
      return null;
    }
    date_of_birth = r.date_of_birth;
  }

  const out: ProfilePrivate = {
    user_id: r.user_id,
    date_of_birth,
    gender,
  };
  if (typeof r.created_at === "string") out.created_at = r.created_at;
  if (typeof r.updated_at === "string") out.updated_at = r.updated_at;
  return out;
}

function assertSaveInput(input: SaveProfilePrivateInput): void {
  if (input.date_of_birth != null && !DATE_ONLY_RE.test(input.date_of_birth)) {
    throw new Error("date_of_birth must be YYYY-MM-DD or null");
  }
  if (input.gender != null && !isProfileGender(input.gender)) {
    throw new Error("Invalid gender value");
  }
}

function throwRequestError(error: unknown): never {
  if (error instanceof Error) throw error;
  throw new Error(typeof error === "string" ? error : "Request failed");
}

/**
 * Read the authenticated user's private Profile row.
 * Missing row → null (normal for users who never saved private metadata).
 * Does not INSERT on read.
 */
export async function getMyProfilePrivate(): Promise<ProfilePrivate | null> {
  const userId = await getViewerAuthUserId();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const dedupeKey = `get_my_profile_private:${userId}`;
  const result = await requestManager.execute(dedupeKey, async () => {
    const { data, error } = await supabase
      .from("profile_private")
      .select(PROFILE_PRIVATE_SELECT)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) return null;

    const normalized = normalizeProfilePrivateRow(data);
    if (!normalized) {
      throw new Error("Invalid profile_private row shape");
    }
    return normalized;
  });

  if (result.error) throwRequestError(result.error);
  return result.data;
}

/**
 * Upsert private Profile metadata for the authenticated user.
 * user_id always comes from session — never from caller input.
 */
export async function saveMyProfilePrivate(
  input: SaveProfilePrivateInput,
): Promise<ProfilePrivate> {
  assertSaveInput(input);

  const userId = await getViewerAuthUserId();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("profile_private")
    .upsert(
      {
        user_id: userId,
        date_of_birth: input.date_of_birth,
        gender: input.gender,
      },
      { onConflict: "user_id" },
    )
    .select(PROFILE_PRIVATE_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const normalized = normalizeProfilePrivateRow(data);
  if (!normalized) {
    throw new Error("Invalid profile_private row shape after save");
  }
  return normalized;
}
