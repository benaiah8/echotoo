/**
 * Canonical same-person key for Duo Mine/Discover.
 * Opportunity/card identity remains opportunity_id — never merge rows by this key.
 */

export function pairUpPersonKey(row: {
  profile_id?: string | null;
  creator_id: string;
}): string {
  const profileId = row.profile_id?.trim();
  if (profileId) return profileId;
  return row.creator_id;
}
