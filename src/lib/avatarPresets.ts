/**
 * Owl preset avatars — bundled via Vite glob (no DB / no Supabase for assets).
 * Profile field value: preset:{filename stem}, e.g. owl_01.png → preset:owl_01
 */

export const AVATAR_PRESET_PREFIX = "preset:" as const;

/** Stem from glob key …/owl_01.png → owl_01 */
function presetIdFromModulePath(modulePath: string): string | null {
  const m = modulePath.match(/\/([^/]+)\.(png|jpg|jpeg|webp|svg)$/i);
  return m?.[1] ?? null;
}

const SORT_OWL_NUM = /^owl_(\d+)$/i;

export function presetIdSortComparator(a: string, b: string): number {
  const ma = SORT_OWL_NUM.exec(a);
  const mb = SORT_OWL_NUM.exec(b);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]);
  return a.localeCompare(b);
}

/** id (stem) → resolved absolute URL string from build (Vite globs must be literal strings per pattern). */
const owlUrlById: Record<string, string> = (() => {
  const map: Record<string, string> = {};

  const merge = (modules: Record<string, string>) => {
    for (const [modulePath, url] of Object.entries(modules)) {
      const id = presetIdFromModulePath(modulePath);
      if (id && url) {
        map[id] = url;
      }
    }
  };

  merge(
    import.meta.glob<string>("../assets/avatar-presets/owls/*.png", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  );
  merge(
    import.meta.glob<string>("../assets/avatar-presets/owls/*.jpg", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  );
  merge(
    import.meta.glob<string>("../assets/avatar-presets/owls/*.jpeg", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  );
  merge(
    import.meta.glob<string>("../assets/avatar-presets/owls/*.webp", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  );
  merge(
    import.meta.glob<string>("../assets/avatar-presets/owls/*.svg", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  );

  return map;
})();

export function isAvatarPresetValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(AVATAR_PRESET_PREFIX);
}

/**
 * Resolved dev/prod URL for a stored preset value (`preset:owl_01`).
 * Undefined if unknown id or malformed.
 */
export function getAvatarPresetUrl(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!isAvatarPresetValue(value)) return undefined;
  const id = value.slice(AVATAR_PRESET_PREFIX.length).trim();
  if (!id) return undefined;
  return owlUrlById[id];
}

export type AvatarPresetInfo = { id: string; url: string };

/** All owl presets discovered at build time, sorted by owl_N number when possible else lexically. */
export function getAvatarPresets(): AvatarPresetInfo[] {
  return Object.entries(owlUrlById)
    .map(([id, url]) => ({ id, url }))
    .sort((a, b) => presetIdSortComparator(a.id, b.id));
}
