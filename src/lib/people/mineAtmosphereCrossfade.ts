/**
 * Pure Mine atmosphere crossfade state — at most two photo paths.
 * Opacity crossfade only; no background-image interpolation.
 */

export const MINE_ATMOSPHERE_CROSSFADE_MS = 280;

export type MineAtmosphereCrossfadeState = {
  /** Settled / outgoing path. */
  fromPath: string | null;
  /** Incoming path while fading; null when idle or fading to empty. */
  toPath: string | null;
  /** True while a crossfade (or fade-to-empty) is in progress. */
  fading: boolean;
  /** Bumped on every transition start/clear; completion must match. */
  generation: number;
};

export function createMineAtmosphereCrossfadeState(): MineAtmosphereCrossfadeState {
  return {
    fromPath: null,
    toPath: null,
    fading: false,
    generation: 0,
  };
}

export function clearMineAtmosphereCrossfade(
  state: MineAtmosphereCrossfadeState
): MineAtmosphereCrossfadeState {
  if (!state.fromPath && !state.toPath && !state.fading) {
    return state;
  }
  return {
    fromPath: null,
    toPath: null,
    fading: false,
    generation: state.generation + 1,
  };
}

/**
 * Apply a ready atmosphere path for the current identity.
 * - Keeps `fromPath` until a new ready path arrives (no blank clear).
 * - Mid-fade retarget: keep `fromPath`, replace `toPath`, bump generation.
 * - `path: null` → fade to neutral (or snap if reduceMotion / nothing showing).
 */
export function applyMineAtmosphereReady(
  state: MineAtmosphereCrossfadeState,
  path: string | null,
  opts?: { reduceMotion?: boolean }
): MineAtmosphereCrossfadeState {
  const reduceMotion = opts?.reduceMotion === true;

  if (!path) {
    if (!state.fromPath && !state.toPath) return state;
    if (reduceMotion || !state.fromPath) {
      return {
        fromPath: null,
        toPath: null,
        fading: false,
        generation: state.generation + 1,
      };
    }
    // Fade out outgoing; no incoming layer.
    if (state.fading && state.toPath == null) return state;
    return {
      fromPath: state.fromPath,
      toPath: null,
      fading: true,
      generation: state.generation + 1,
    };
  }

  if (reduceMotion) {
    if (state.fromPath === path && !state.fading) return state;
    return {
      fromPath: path,
      toPath: null,
      fading: false,
      generation: state.generation + 1,
    };
  }

  // Already settled on this path.
  if (state.fromPath === path && !state.fading) return state;

  // Already fading toward this path.
  if (state.fading && state.toPath === path) return state;

  // Nothing to crossfade from — show immediately (still one layer).
  if (!state.fromPath) {
    return {
      fromPath: path,
      toPath: null,
      fading: false,
      generation: state.generation + 1,
    };
  }

  // Same as outgoing: cancel any in-flight fade.
  if (state.fromPath === path) {
    return {
      fromPath: path,
      toPath: null,
      fading: false,
      generation: state.generation + 1,
    };
  }

  // Start or retarget fade: keep fromPath, replace toPath.
  return {
    fromPath: state.fromPath,
    toPath: path,
    fading: true,
    generation: state.generation + 1,
  };
}

/**
 * Complete a fade for `generation`. Stale completions are no-ops.
 */
export function completeMineAtmosphereCrossfade(
  state: MineAtmosphereCrossfadeState,
  generation: number
): MineAtmosphereCrossfadeState {
  if (!state.fading) return state;
  if (generation !== state.generation) return state;
  return {
    fromPath: state.toPath,
    toPath: null,
    fading: false,
    generation: state.generation,
  };
}
