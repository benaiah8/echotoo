/**
 * Create Finalize caption canvas layout helpers (presentation only).
 */

/** Spacious empty vs compact writing min-height selection. */
export function isCreateFinalizeCaptionCompact(input: {
  caption: string;
  focused: boolean;
}): boolean {
  return input.focused || input.caption.trim().length > 0;
}
