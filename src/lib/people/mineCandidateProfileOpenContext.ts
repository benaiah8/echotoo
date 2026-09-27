/**
 * Mine / Discover → embedded Profile open context.
 * Captured at open time so Connect targets the opportunity the user viewed,
 * not whichever deck candidate is current later.
 */
import type { PairUpCandidate } from "./types";
import { pairUpPersonKey } from "./pairUpPersonKey";
import { resolvePairUpProfileOpenKey } from "./resolvePairUpProfileOpenKey";

export type MineCandidateProfileOpenScope = "my_plans" | "discover";

export type MineCandidateProfileOpenContext = {
  openKey: string;
  opportunityId: string;
  personKey: string;
  scope: MineCandidateProfileOpenScope;
  /** Snapshot at open — authoritative Connect target. */
  candidate: PairUpCandidate;
};

export function createMineCandidateProfileOpenContext(
  candidate: PairUpCandidate,
  scope: MineCandidateProfileOpenScope = "my_plans"
): MineCandidateProfileOpenContext | null {
  const openKey = resolvePairUpProfileOpenKey(candidate);
  const opportunityId = candidate.opportunity_id?.trim() ?? "";
  if (!openKey || !opportunityId) return null;
  return {
    openKey,
    opportunityId,
    personKey: pairUpPersonKey(candidate),
    scope,
    candidate,
  };
}

export function isMineCandidateProfileOpenContext(
  value: unknown
): value is MineCandidateProfileOpenContext {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.openKey === "string" &&
    o.openKey.length > 0 &&
    typeof o.opportunityId === "string" &&
    o.opportunityId.length > 0 &&
    typeof o.personKey === "string" &&
    o.personKey.length > 0 &&
    (o.scope === "my_plans" || o.scope === "discover") &&
    o.candidate != null &&
    typeof o.candidate === "object"
  );
}
