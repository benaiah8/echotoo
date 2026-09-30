/**
 * Home reconnect/resume decisions only.
 * Does not fetch, queue requests, or talk to the network.
 */
import { HOME_FEED_DISPLAY_TTL_MS } from "./homeFeedListCache";

export const HOME_RECOVERY_BACKGROUND_MS = HOME_FEED_DISPLAY_TTL_MS;

/**
 * Lifecycle signals for one return (online + resume + visibility) that arrive
 * inside this window share one recovery cycle.
 */
export const HOME_RECOVERY_COALESCE_MS = 300;

export type HomeRecoveryFlags = {
  emptyErrorRetry: boolean;
  filteredSoftRefresh: boolean;
};

export type HomeRecoveryPublish = HomeRecoveryFlags & {
  epoch: number;
};

export type HomeRecoveryState = {
  epoch: number;
  wasOffline: boolean;
  backgroundStartedAt: number | null;
  cycle: {
    at: number;
    emptyErrorRetry: boolean;
    filteredSoftRefresh: boolean;
  } | null;
  pending: HomeRecoveryFlags | null;
};

export type HomeRecoveryEvent =
  | { type: "offline" }
  | { type: "online"; now: number; homeVisible: boolean }
  | { type: "background-start"; now: number }
  | { type: "foreground"; now: number; homeVisible: boolean }
  | { type: "home-visible"; now: number };

export function createHomeRecoveryState(online = true): HomeRecoveryState {
  return {
    epoch: 0,
    wasOffline: !online,
    backgroundStartedAt: null,
    cycle: null,
    pending: null,
  };
}

export function loadGenerationStillOwns(
  generation: number,
  currentGeneration: number,
  mounted: boolean,
): boolean {
  return mounted && generation === currentGeneration;
}

function orFlags(
  current: HomeRecoveryFlags | null,
  next: HomeRecoveryFlags,
): HomeRecoveryFlags {
  return {
    emptyErrorRetry: Boolean(current?.emptyErrorRetry || next.emptyErrorRetry),
    filteredSoftRefresh: Boolean(
      current?.filteredSoftRefresh || next.filteredSoftRefresh,
    ),
  };
}

function hasWork(flags: HomeRecoveryFlags): boolean {
  return flags.emptyErrorRetry || flags.filteredSoftRefresh;
}

function publishCycle(
  state: HomeRecoveryState,
  now: number,
  flags: HomeRecoveryFlags,
): { state: HomeRecoveryState; publish: HomeRecoveryPublish | null } {
  if (!hasWork(flags)) {
    return { state: { ...state, pending: null }, publish: null };
  }

  if (state.cycle && now - state.cycle.at < HOME_RECOVERY_COALESCE_MS) {
    const extraEmpty = flags.emptyErrorRetry && !state.cycle.emptyErrorRetry;
    const extraSoft =
      flags.filteredSoftRefresh && !state.cycle.filteredSoftRefresh;
    if (!extraEmpty && !extraSoft) {
      return { state: { ...state, pending: null }, publish: null };
    }
    return {
      state: {
        ...state,
        pending: null,
        cycle: {
          at: state.cycle.at,
          emptyErrorRetry: state.cycle.emptyErrorRetry || extraEmpty,
          filteredSoftRefresh: state.cycle.filteredSoftRefresh || extraSoft,
        },
      },
      publish: {
        epoch: state.epoch,
        emptyErrorRetry: extraEmpty,
        filteredSoftRefresh: extraSoft,
      },
    };
  }

  if (state.cycle) {
    return { state: { ...state, pending: null }, publish: null };
  }

  const epoch = state.epoch + 1;
  return {
    state: {
      ...state,
      epoch,
      pending: null,
      cycle: { at: now, emptyErrorRetry: flags.emptyErrorRetry, filteredSoftRefresh: flags.filteredSoftRefresh },
    },
    publish: { epoch, ...flags },
  };
}

export function reduceHomeRecovery(
  state: HomeRecoveryState,
  event: HomeRecoveryEvent,
): { state: HomeRecoveryState; publish: HomeRecoveryPublish | null } {
  switch (event.type) {
    case "offline":
      return {
        state: { ...state, wasOffline: true, cycle: null },
        publish: null,
      };
    case "background-start":
      if (state.backgroundStartedAt != null) {
        return { state, publish: null };
      }
      return {
        state: {
          ...state,
          backgroundStartedAt: event.now,
          cycle: null,
        },
        publish: null,
      };
    case "online": {
      if (!state.wasOffline) return { state, publish: null };
      const next: HomeRecoveryState = { ...state, wasOffline: false };
      const flags = orFlags(next.pending, {
        emptyErrorRetry: true,
        filteredSoftRefresh: false,
      });
      if (!event.homeVisible) {
        return { state: { ...next, pending: flags }, publish: null };
      }
      return publishCycle(next, event.now, flags);
    }
    case "foreground": {
      const started = state.backgroundStartedAt;
      const long =
        started != null &&
        event.now - started >= HOME_RECOVERY_BACKGROUND_MS;
      const next: HomeRecoveryState = { ...state, backgroundStartedAt: null };
      const flags = orFlags(next.pending, {
        emptyErrorRetry: long,
        filteredSoftRefresh: long,
      });
      if (!hasWork(flags)) {
        return { state: { ...next, pending: null }, publish: null };
      }
      if (!event.homeVisible) {
        return { state: { ...next, pending: flags }, publish: null };
      }
      return publishCycle(next, event.now, flags);
    }
    case "home-visible":
      if (!state.pending || !hasWork(state.pending)) {
        return { state, publish: null };
      }
      return publishCycle(state, event.now, state.pending);
    default:
      return { state, publish: null };
  }
}
