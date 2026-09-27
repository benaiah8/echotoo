/**
 * Groups → embedded Profile open context (Back-only footer).
 * Reuses MineCandidateProfileOverlay / OtherProfilePage without PairUp Connect.
 */
import type { GroupUpCandidate } from "./types";
import { resolveGroupHostProfileOpenKey } from "./resolveGroupHostProfileOpenKey";

export type GroupHostProfileOpenContext = {
  openKey: string;
  opportunityId: string;
  personKey: string;
  scope: "groups";
};

export function createGroupHostProfileOpenContext(
  candidate: GroupUpCandidate,
): GroupHostProfileOpenContext | null {
  const openKey = resolveGroupHostProfileOpenKey(candidate);
  const opportunityId = candidate.opportunity_id?.trim() ?? "";
  const personKey =
    candidate.organizer_user_id?.trim() ||
    candidate.organizer_username?.trim() ||
    "";
  if (!openKey || !opportunityId || !personKey) return null;
  return {
    openKey,
    opportunityId,
    personKey,
    scope: "groups",
  };
}

export function isGroupHostProfileOpenContext(
  value: unknown,
): value is GroupHostProfileOpenContext {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.openKey === "string" &&
    o.openKey.length > 0 &&
    typeof o.opportunityId === "string" &&
    o.opportunityId.length > 0 &&
    typeof o.personKey === "string" &&
    o.personKey.length > 0 &&
    o.scope === "groups"
  );
}

/** Union consumed by MineCandidateProfileOverlay (Mine/Discover + Groups host). */
export type PeopleEmbeddedProfileOpen =
  | import("./mineCandidateProfileOpenContext").MineCandidateProfileOpenContext
  | GroupHostProfileOpenContext;
