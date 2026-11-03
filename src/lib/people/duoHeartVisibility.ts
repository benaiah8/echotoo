/**
 * Duo one-way Heart visibility.
 * The server list is the eligibility source. A confirmed interest stays
 * visible. A row the server omits, or a confirmed match the deck already
 * removed, does not come back from client memory.
 */

export function pairUpIngestExcludesExpressedInterest(
  scope: string,
  expressedByMe: boolean
): boolean {
  if (!expressedByMe) return false;
  if (scope === "discover" || scope === "my_plans") return false;
  return true;
}

/** An active Duo Heart is not another Connect. */
export function duoHeartPressStartsConnect(expressedByMe: boolean): boolean {
  return expressedByMe !== true;
}

export function markDuoInterestExpressed<
  T extends { opportunity_id: string; expressed_by_me: boolean },
>(rows: T[], opportunityId: string): T[] {
  return rows.map((row) =>
    row.opportunity_id === opportunityId
      ? { ...row, expressed_by_me: true }
      : row
  );
}

/** Clears one Duo Heart and leaves every other row in place. */
export function markDuoInterestCleared<
  T extends { opportunity_id: string; expressed_by_me: boolean },
>(rows: T[], opportunityId: string): T[] {
  return rows.map((row) =>
    row.opportunity_id === opportunityId
      ? { ...row, expressed_by_me: false }
      : row
  );
}

export function visibleDuoCandidates<
  T extends { opportunity_id: string; expressed_by_me: boolean },
>(serverRows: T[], removedIds: ReadonlySet<string>): T[] {
  return serverRows.filter(
    (row) =>
      !removedIds.has(row.opportunity_id) &&
      !pairUpIngestExcludesExpressedInterest("my_plans", row.expressed_by_me)
  );
}
