/**
 * Match deck carousel host size resolution.
 * Once a positive measure exists, ignore transient ≤0 ResizeObserver flashes
 * (Chrome DevTools device-preset switches) so Embla is not unmounted.
 */

export type MatchDeckHostSize = { w: number; h: number };

export type MatchDeckHostSizeResolve = {
  /** Size to keep in React state. */
  next: MatchDeckHostSize;
  /** Raw observation from the host element. */
  observed: MatchDeckHostSize;
  /** True when a ≤0 observation was ignored because a valid size already exists. */
  ignoredTransientZero: boolean;
  /** True when `next` differs from `prev` in either axis. */
  changed: boolean;
};

export function isMatchDeckHostSizeValid(size: MatchDeckHostSize): boolean {
  return size.w > 0 && size.h > 0;
}

/**
 * Resolve host size for carousel metrics.
 * - Initial mount: stay at 0×0 until a genuine positive measure.
 * - After a valid size: keep last valid on transient zero; accept positive updates.
 */
export function resolveMatchDeckHostSize(
  prev: MatchDeckHostSize,
  observedW: number,
  observedH: number
): MatchDeckHostSizeResolve {
  const observed: MatchDeckHostSize = { w: observedW, h: observedH };
  const observedValid = isMatchDeckHostSizeValid(observed);
  const hadValid = isMatchDeckHostSizeValid(prev);

  if (!observedValid) {
    if (hadValid) {
      return {
        next: prev,
        observed,
        ignoredTransientZero: true,
        changed: false,
      };
    }
    // Still waiting for first positive measure — normalize to 0×0.
    if (prev.w === 0 && prev.h === 0) {
      return {
        next: prev,
        observed,
        ignoredTransientZero: false,
        changed: false,
      };
    }
    return {
      next: { w: 0, h: 0 },
      observed,
      ignoredTransientZero: false,
      changed: true,
    };
  }

  if (prev.w === observedW && prev.h === observedH) {
    return {
      next: prev,
      observed,
      ignoredTransientZero: false,
      changed: false,
    };
  }

  return {
    next: observed,
    observed,
    ignoredTransientZero: false,
    changed: true,
  };
}

/** DEV-only: transition logs for host resize / zero-size / recovery. */
export function logMatchDeckHostSizeTransition(args: {
  prev: MatchDeckHostSize;
  result: MatchDeckHostSizeResolve;
}): void {
  if (!import.meta.env.DEV) return;

  const { prev, result } = args;
  const { observed, next, ignoredTransientZero, changed } = result;

  if (ignoredTransientZero) {
    console.info("[echoMatchDeckHostSize]", {
      kind: "ignored-transient-zero",
      observed,
      retained: next,
    });
    return;
  }

  if (!changed) return;

  const prevValid = isMatchDeckHostSizeValid(prev);
  const nextValid = isMatchDeckHostSizeValid(next);

  let kind: string;
  if (!prevValid && nextValid) {
    kind = "first-positive";
  } else if (prevValid && nextValid) {
    kind = "positive-resize";
  } else if (prevValid && !nextValid) {
    kind = "cleared-to-zero";
  } else {
    kind = "size-change";
  }

  console.info("[echoMatchDeckHostSize]", {
    kind,
    from: prev,
    to: next,
    observed,
  });
}

/** DEV-only: deckReady / Embla viewport mount gates. */
export function logMatchDeckReadyTransition(args: {
  prevReady: boolean;
  nextReady: boolean;
  host: MatchDeckHostSize;
}): void {
  if (!import.meta.env.DEV) return;
  if (args.prevReady === args.nextReady) return;

  console.info("[echoMatchDeckHostSize]", {
    kind: args.nextReady ? "deck-ready" : "deck-not-ready",
    emblaViewport: args.nextReady ? "mount" : "unmount",
    host: args.host,
  });
}
