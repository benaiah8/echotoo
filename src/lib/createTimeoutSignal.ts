/**
 * AbortSignal that fires after `ms`, matching AbortSignal.timeout when present.
 * Chrome 87 has AbortController but not AbortSignal.timeout (Chrome 103).
 * The fallback timer matches the platform timer: it is not cleared early,
 * and aborting an already-finished request is a no-op.
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  setTimeout(() => {
    try {
      controller.abort(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      );
    } catch {
      controller.abort();
    }
  }, ms);
  return controller.signal;
}
