const inFlightByVideoId = new Map<string, Promise<void>>();

/**
 * Ensures at most one active TUS promise per Bunny videoId in this app instance.
 * Duplicate starts for the same videoId reuse the in-flight promise.
 */
export function runBunnyTusSingleFlight(
  videoId: string,
  run: () => Promise<void>,
): Promise<void> {
  if (!videoId || videoId === "pending" || videoId === "error") {
    return run();
  }

  const existing = inFlightByVideoId.get(videoId);
  if (existing) {
    return existing;
  }

  const promise = run().finally(() => {
    if (inFlightByVideoId.get(videoId) === promise) {
      inFlightByVideoId.delete(videoId);
    }
  });

  inFlightByVideoId.set(videoId, promise);
  return promise;
}

export function clearBunnyTusSingleFlight(videoId: string): void {
  if (!videoId) return;
  inFlightByVideoId.delete(videoId);
}

export function hasBunnyTusSingleFlight(videoId: string): boolean {
  return inFlightByVideoId.has(videoId);
}

/** Test-only reset. */
export function resetBunnyTusSingleFlightForTests(): void {
  inFlightByVideoId.clear();
}
