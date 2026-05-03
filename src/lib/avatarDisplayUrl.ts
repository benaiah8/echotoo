import { imgUrlPublic } from "./img";
import { getAvatarPresetUrl, isAvatarPresetValue } from "./avatarPresets";

/**
 * Resolves `profiles.avatar_url` (and similar) for display/load:
 * - `preset:*` → bundled owl asset URL
 * - otherwise existing storage / URL semantics via imgUrlPublic
 */
export function avatarDisplayUrl(
  path?: string | null,
  bucket?: string,
): string | undefined {
  if (path == null || path === "") return undefined;

  if (isAvatarPresetValue(path)) {
    return getAvatarPresetUrl(path);
  }

  return imgUrlPublic(path, bucket);
}
