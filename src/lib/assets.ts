/**
 * Centralized asset configuration
 * 
 * TO UPDATE THE OWL LOGO:
 * 1. Replace the file at: /public/owlicon.svg
 * 2. The change will automatically appear everywhere after a page refresh
 * 3. If you see the old logo, do a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
 * 
 * All logo references in the app use this constant, so updating the file
 * in /public/owlicon.svg will update it everywhere.
 */

// Owl logo path - update the filename here if you rename the file
export const OWL_LOGO_PATH = "/owlicon.svg";

// Add cache-busting query parameter based on build time or version
// This ensures browsers pick up updated images
// You can increment this number when you update the logo to force cache refresh
const LOGO_VERSION = "1";

export const getOwlLogoPath = (): string => {
  return `${OWL_LOGO_PATH}?v=${LOGO_VERSION}`;
};

