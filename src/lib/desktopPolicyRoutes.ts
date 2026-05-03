/**
 * Public policy/help paths for desktop marketing links and desktop full-page detection.
 * Mirrors `Paths` — no new routes.
 */

import { Paths } from "../router/Paths";

export type DesktopPolicyNavItem = {
  path: string;
  /** Link label in nav lists */
  navLabel: string;
};

/** Stable order for policy/help cross-links (e.g. desktop marketing panel) */
export const DESKTOP_POLICY_NAV: DesktopPolicyNavItem[] = [
  {
    path: Paths.privacy,
    navLabel: "Privacy Policy",
  },
  {
    path: Paths.terms,
    navLabel: "Terms of Service",
  },
  {
    path: Paths.communityGuidelines,
    navLabel: "Community Guidelines",
  },
  {
    path: Paths.childSafety,
    navLabel: "Child Safety",
  },
  {
    path: Paths.reporting,
    navLabel: "Reporting",
  },
  {
    path: Paths.support,
    navLabel: "Support",
  },
  {
    path: Paths.safety,
    navLabel: "Safety Tips",
  },
  {
    path: Paths.deleteAccount,
    navLabel: "Delete Account",
  },
];

export function isDesktopPolicyHelpPath(pathname: string): boolean {
  return DESKTOP_POLICY_NAV.some((item) => pathname === item.path);
}
