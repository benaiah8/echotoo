/**
 * Publish → own-profile → Created tab trace. Flip to false to silence.
 */

export const DEBUG_PUBLISH_PROFILE_TRACE = true;

const PREFIX = "[PUBLISH_PROFILE_TRACE]";

/**
 * Exactly one lifecycle label per line; keep payloads small — see task spec for labels.
 */
export function publishProfileTrace(
  label: string,
  data?: Record<string, unknown>
): void {
  if (!DEBUG_PUBLISH_PROFILE_TRACE) return;
  const payload =
    data === undefined ? { t: Date.now() } : { t: Date.now(), ...data };
  console.log(`${PREFIX} ${label}`, payload);
}
