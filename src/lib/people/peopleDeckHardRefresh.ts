/**
 * People deck hard-refresh helpers — orchestration contracts for MatchDeckOverlay.
 * Keeps generation / scope / account guards testable without mounting Embla.
 */

import type { PairUpSeenScope } from "./peoplePairUpSeenHistory";

export type PeopleHardRefreshScope = PairUpSeenScope;

export type PeopleHardRefreshResult =
  | "refreshed"
  | "candidate_failed"
  | "stale"
  | "skipped"
  | "busy";

let hardRefreshGeneration = 0;
const hardRefreshInFlight = new Map<string, Promise<PeopleHardRefreshResult>>();

export function bumpPeopleHardRefreshGeneration(): number {
  hardRefreshGeneration += 1;
  return hardRefreshGeneration;
}

export function getPeopleHardRefreshGeneration(): number {
  return hardRefreshGeneration;
}

export function resetPeopleHardRefreshForTests(): void {
  hardRefreshGeneration += 1;
  hardRefreshInFlight.clear();
}

function flightKey(userId: string, scope: PeopleHardRefreshScope): string {
  return `${userId.trim()}:${scope}`;
}

export function isPeopleHardRefreshScope(
  value: string | null | undefined
): value is PeopleHardRefreshScope {
  return (
    value === "my_plans" ||
    value === "discover" ||
    value === "open_plans" ||
    value === "groups_new"
  );
}

/**
 * Single-flight hard refresh runner. Callers supply flush/hydrate/candidate
 * and applyDeckReset; this only owns generation + concurrency + stale checks.
 */
export async function runPeopleDeckHardRefresh(options: {
  userId: string;
  scope: PeopleHardRefreshScope;
  /** Captured at start; stale if bumped elsewhere (logout / leave). */
  expectedGeneration?: number;
  flushOutbox: () => Promise<unknown>;
  forceHydrateSeen: () => Promise<unknown>;
  hardRefreshCandidates: () => Promise<unknown>;
  /** Called only after candidates succeed and generation/user/scope still match. */
  applyDeckReset: () => void;
  isStillActive: () => boolean;
}): Promise<PeopleHardRefreshResult> {
  const uid = options.userId.trim();
  if (!uid) return "skipped";
  const key = flightKey(uid, options.scope);
  const existing = hardRefreshInFlight.get(key);
  if (existing) return "busy";

  const gen = options.expectedGeneration ?? hardRefreshGeneration;
  const expectedScope = options.scope;
  const expectedUser = uid;

  const work = (async (): Promise<PeopleHardRefreshResult> => {
    // Best-effort outbox — never block refresh on failure.
    try {
      await Promise.race([
        options.flushOutbox(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      /* keep outbox; continue */
    }

    if (
      gen !== hardRefreshGeneration ||
      !options.isStillActive()
    ) {
      return "stale";
    }

    const hydrateP = options.forceHydrateSeen().catch(() => "hydrate_failed");
    let candidatesOk = false;
    try {
      await options.hardRefreshCandidates();
      candidatesOk = true;
    } catch {
      candidatesOk = false;
    }

    await hydrateP;

    if (
      gen !== hardRefreshGeneration ||
      !options.isStillActive() ||
      expectedUser !== uid ||
      expectedScope !== options.scope
    ) {
      return "stale";
    }

    if (!candidatesOk) return "candidate_failed";

    options.applyDeckReset();
    return "refreshed";
  })();

  hardRefreshInFlight.set(key, work);
  try {
    return await work;
  } finally {
    if (hardRefreshInFlight.get(key) === work) {
      hardRefreshInFlight.delete(key);
    }
  }
}
