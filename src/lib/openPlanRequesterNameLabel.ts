/**
 * Host-visible Open Plan requester name label.
 * Distinguishes intentional privacy from disclosed-but-empty display_name.
 */

import { peopleUiCopy } from "../pages/people/peopleUiCopy";

export type OpenPlanRequesterNameKind = "named" | "anonymous" | "missing";

/**
 * - named: permitted display_name
 * - anonymous: intentional privacy (no disclosed open key) → "Name hidden"
 * - missing: disclosed identity (open key) but empty display_name → "Someone"
 */
export function resolveOpenPlanRequesterNameLabel(request: {
  display_name: string | null;
  profile_open_key: string | null;
}): { label: string; kind: OpenPlanRequesterNameKind } {
  const name = request.display_name?.trim() || null;
  if (name) return { label: name, kind: "named" };
  const disclosed = Boolean(request.profile_open_key?.trim());
  if (disclosed) {
    return {
      label: peopleUiCopy.openPlanRequesterNameMissing,
      kind: "missing",
    };
  }
  return {
    label: peopleUiCopy.openPlanRequesterNameHidden,
    kind: "anonymous",
  };
}
