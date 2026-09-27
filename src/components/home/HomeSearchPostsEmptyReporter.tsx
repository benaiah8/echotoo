/**
 * Mounted only while ProgressiveFeed shows a settled zero-results emptySurface.
 * Reports active/inactive without extra network or ProgressiveFeed API changes.
 */
import { useEffect, type ReactNode } from "react";

export default function HomeSearchPostsEmptyReporter({
  active,
  onActiveChange,
  children,
}: {
  /** When false, never reports active (browse / users / empty query). */
  active: boolean;
  onActiveChange?: (active: boolean) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!active || !onActiveChange) return;
    onActiveChange(true);
    return () => onActiveChange(false);
  }, [active, onActiveChange]);

  return <>{children}</>;
}
