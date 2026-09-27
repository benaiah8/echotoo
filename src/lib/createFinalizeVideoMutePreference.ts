/**
 * Session mute preference for Create finalize video.
 * Defaults unmuted; survives swipe remounts within the same draft video session.
 * Reset when a new video is successfully added/replaced.
 */

let createVideoMutedPreference = false;

export function getCreateVideoMutedPreference(): boolean {
  return createVideoMutedPreference;
}

export function setCreateVideoMutedPreference(muted: boolean): void {
  createVideoMutedPreference = muted;
}

/** New Create video starts with sound on. */
export function resetCreateVideoMutedPreference(): void {
  createVideoMutedPreference = false;
}
