/**
 * Preserve locally-known positive video dimensions when later RPC/patch
 * rows still have null width/height (Bunny ready not yet written).
 */

export function isPositivePublishedDimension(
  value: number | null | undefined,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  );
}

export function mergePublishedDimensionField(
  existing: number | null | undefined,
  incoming: number | null | undefined,
): number | null {
  if (isPositivePublishedDimension(incoming)) return incoming;
  if (isPositivePublishedDimension(existing)) return existing;
  if (typeof incoming === "number" && Number.isFinite(incoming)) return incoming;
  if (typeof existing === "number" && Number.isFinite(existing)) return existing;
  return null;
}

export function mergePublishedVideoDimensions(options: {
  existingWidth: number | null | undefined;
  existingHeight: number | null | undefined;
  incomingWidth: number | null | undefined;
  incomingHeight: number | null | undefined;
}): { width: number | null; height: number | null } {
  return {
    width: mergePublishedDimensionField(
      options.existingWidth,
      options.incomingWidth,
    ),
    height: mergePublishedDimensionField(
      options.existingHeight,
      options.incomingHeight,
    ),
  };
}
