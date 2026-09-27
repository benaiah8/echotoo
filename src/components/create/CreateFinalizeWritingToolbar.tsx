/**
 * Former V4 Finalize writing toolbar (Detail | Section | Undo | Redo).
 * Controls moved to caption-adjacent actions + bottom metadata row.
 * Kept as a no-op height publisher so any stale CSS fallback does not reserve space.
 */
import { useLayoutEffect } from "react";

/** @deprecated Controls relocated; publishes zero writing-toolbar height only. */
export function CreateFinalizeWritingToolbar(_props?: unknown) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--create-finalize-writing-toolbar-height", "0px");
    return () => {
      root.style.setProperty("--create-finalize-writing-toolbar-height", "0px");
    };
  }, []);

  return null;
}
