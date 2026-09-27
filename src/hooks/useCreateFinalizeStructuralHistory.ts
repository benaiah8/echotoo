import { useCallback, useState } from "react";
import {
  cloneComposerSnapshot,
  pushComposerSnapshot,
  type FinalizeComposerSnapshot,
} from "../lib/createFlowStructuralHistory";

export function useCreateFinalizeStructuralHistory() {
  const [past, setPast] = useState<FinalizeComposerSnapshot[]>([]);
  const [future, setFuture] = useState<FinalizeComposerSnapshot[]>([]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const recordBefore = useCallback((current: FinalizeComposerSnapshot) => {
    setPast((prev) => pushComposerSnapshot(prev, current));
    setFuture([]);
  }, []);

  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  const undo = useCallback(
    (current: FinalizeComposerSnapshot): FinalizeComposerSnapshot | null => {
      let restored: FinalizeComposerSnapshot | null = null;
      setPast((prev) => {
        if (prev.length === 0) return prev;
        restored = cloneComposerSnapshot(prev[prev.length - 1]!);
        return prev.slice(0, -1);
      });
      if (!restored) return null;
      setFuture((prev) => pushComposerSnapshot(prev, current));
      return restored;
    },
    []
  );

  const redo = useCallback(
    (current: FinalizeComposerSnapshot): FinalizeComposerSnapshot | null => {
      let restored: FinalizeComposerSnapshot | null = null;
      setFuture((prev) => {
        if (prev.length === 0) return prev;
        restored = cloneComposerSnapshot(prev[prev.length - 1]!);
        return prev.slice(0, -1);
      });
      if (!restored) return null;
      setPast((prev) => pushComposerSnapshot(prev, current));
      return restored;
    },
    []
  );

  return {
    canUndo,
    canRedo,
    recordBefore,
    undo,
    redo,
    reset,
  };
}
