import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type CreateFlowNoticeVariant = "default" | "warning" | "progress";

/**
 * Stack items rendered by {@link CreateFlowNoticeStack} under the create top bar.
 *
 * Image uploads (or any long-running step) can call `upsertNotice` from
 * `useCreateFlowNoticesOptional()` with `variant: "progress"` and either
 * `progress: 0..1` or `indeterminate: true` (inline spinner, no fake percent), then
 * `removeNotice(id)` when finished. Multiple notices stack in insertion order.
 */
export type CreateFlowNotice = {
  id: string;
  variant?: CreateFlowNoticeVariant;
  message: string;
  /** 0–1 when variant is `progress` and not indeterminate */
  progress?: number;
  /** When variant is `progress`, show spinner + sliding bar without a numeric percent */
  indeterminate?: boolean;
  /** Primary tap action (e.g. scroll to caption). */
  onAction?: () => void;
  /** Short label for the action affordance (default: “Show”) */
  actionLabel?: string;
};

type Ctx = {
  notices: CreateFlowNotice[];
  upsertNotice: (n: CreateFlowNotice) => void;
  removeNotice: (id: string) => void;
};

const CreateFlowNoticeContext = createContext<Ctx | null>(null);

export function CreateFlowNoticeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notices, setNotices] = useState<CreateFlowNotice[]>([]);

  const upsertNotice = useCallback((n: CreateFlowNotice) => {
    setNotices((prev) => {
      const i = prev.findIndex((x) => x.id === n.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = n;
        return next;
      }
      return [...prev, n];
    });
  }, []);

  const removeNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(
    () => ({ notices, upsertNotice, removeNotice }),
    [notices, upsertNotice, removeNotice]
  );

  return (
    <CreateFlowNoticeContext.Provider value={value}>
      {children}
    </CreateFlowNoticeContext.Provider>
  );
}

export function useCreateFlowNotices(): Ctx {
  const ctx = useContext(CreateFlowNoticeContext);
  if (!ctx) {
    throw new Error(
      "useCreateFlowNotices must be used within CreateFlowNoticeProvider"
    );
  }
  return ctx;
}

/**
 * Safe for optional use (e.g. future media code) outside strict tree during tests.
 * Returns no-op impl when provider missing.
 */
export function useCreateFlowNoticesOptional(): Ctx {
  const ctx = useContext(CreateFlowNoticeContext);
  return (
    ctx ?? {
      notices: [],
      upsertNotice: () => {},
      removeNotice: () => {},
    }
  );
}
