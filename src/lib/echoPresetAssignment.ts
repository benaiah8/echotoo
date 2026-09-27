/**
 * Canonical Echo assignment — deterministic FNV-1a over a stable identity key.
 * Shared by Profile display fallback, signup defaults, and P5 backfill parity.
 */

import { AVATAR_PRESET_PREFIX, getAvatarPresets } from "./avatarPresets";
import {
  normalizeEchoPreset,
  normalizeProfilePhotos,
} from "./profilePhotos";

/** Ordered owl stems — must match bundled assets + SQL backfill. */
export const CANONICAL_ECHO_OWL_IDS = [
  "owl_01",
  "owl_02",
  "owl_03",
  "owl_04",
  "owl_05",
  "owl_06",
  "owl_07",
  "owl_08",
  "owl_09",
  "owl_10",
  "owl_11",
  "owl_12",
  "owl_13",
  "owl_14",
  "owl_15",
  "owl_16",
  "owl_17",
  "owl_18",
] as const;

export type CanonicalEchoOwlId = (typeof CANONICAL_ECHO_OWL_IDS)[number];

export const CANONICAL_ECHO_PRESET_VALUES: readonly string[] =
  CANONICAL_ECHO_OWL_IDS.map((id) => `${AVATAR_PRESET_PREFIX}${id}`);

export function isCanonicalEchoPreset(
  value: string | null | undefined,
): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return (CANONICAL_ECHO_PRESET_VALUES as readonly string[]).includes(trimmed);
}

/** FNV-1a 32-bit — stable across runtimes for the same string. */
export function stableIdentityHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic Echo preset for a stable identity key (user_id preferred).
 * Uses bundled owl presets only — never random, never time-based.
 */
export function deterministicEchoPresetForIdentity(
  identityKey: string,
): string | null {
  const key = identityKey.trim();
  if (!key) return null;

  const presets = getAvatarPresets();
  if (presets.length === 0) return null;

  const index = stableIdentityHash(key) % presets.length;
  return `${AVATAR_PRESET_PREFIX}${presets[index]!.id}`;
}

/** Hash → index → preset for SQL/TS parity documentation and tests. */
export function echoAssignmentParityForIdentity(identityKey: string): {
  hash: number;
  index: number;
  preset: string | null;
} {
  const key = identityKey.trim();
  if (!key) return { hash: 0, index: 0, preset: null };
  const hash = stableIdentityHash(key);
  const index = hash % CANONICAL_ECHO_OWL_IDS.length;
  return {
    hash,
    index,
    preset: `${AVATAR_PRESET_PREFIX}${CANONICAL_ECHO_OWL_IDS[index]}`,
  };
}

export type MissingEchoIdentityPatch = {
  echo_preset?: string;
  profile_photos?: string[];
};

/**
 * Pure patch for missing Echo (+ optional provider HTTPS photo seed).
 * Never overwrites existing echo_preset or non-empty profile_photos.
 */
export function buildMissingEchoIdentityPatch(args: {
  userId: string;
  echo_preset?: string | null;
  profile_photos?: unknown;
  /** Real provider image (https only). Seeded only when photos are empty. */
  providerHttpsAvatar?: string | null;
}): MissingEchoIdentityPatch {
  const patch: MissingEchoIdentityPatch = {};
  const photos = normalizeProfilePhotos(args.profile_photos);
  const echo = normalizeEchoPreset(args.echo_preset);

  if (!echo) {
    const assigned = deterministicEchoPresetForIdentity(args.userId);
    if (assigned) patch.echo_preset = assigned;
  }

  const https =
    typeof args.providerHttpsAvatar === "string"
      ? args.providerHttpsAvatar.trim()
      : "";
  if (
    photos.length === 0 &&
    https.toLowerCase().startsWith("https://")
  ) {
    patch.profile_photos = [https];
  }

  return patch;
}
