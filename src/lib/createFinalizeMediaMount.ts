/**
 * Whether Create/Finalize should mount the hero-bottom media manager dock.
 */
export function shouldMountFinalizeMediaDock(options: {
  composeFinalizeShell: boolean;
  galleryLength: number;
  hasActiveVideo: boolean;
  hasOverlayCta: boolean;
}): boolean {
  if (!options.composeFinalizeShell || !options.hasOverlayCta) {
    return false;
  }
  return options.galleryLength > 0 || options.hasActiveVideo;
}

/** Media strip is visible only while the dock is expanded. */
export function isFinalizeMediaStripVisible(expanded: boolean): boolean {
  return expanded;
}
