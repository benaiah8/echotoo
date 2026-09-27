/**
 * In-memory bypass for People participation photo prompts (connect, Group Up join).
 * Set when user explicitly Continue anyway with <3 photos; not persisted.
 * Resets when the People tab session ends (tab hidden / close).
 *
 * Event/post Pair Up join (`join:*`) does NOT use this bypass.
 */

let bypassParticipationPrompt = false;

export function isPeoplePhotoPromptBypassed(): boolean {
  return bypassParticipationPrompt;
}

export function setPeoplePhotoPromptBypass(): void {
  bypassParticipationPrompt = true;
}

export function resetPeoplePhotoPromptSession(): void {
  bypassParticipationPrompt = false;
}
