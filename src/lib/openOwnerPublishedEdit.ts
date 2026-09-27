/**
 * Owner published Edit open — immediate loading feedback + single-flight guard.
 * Fetch still completes before navigate; obsolete results are ignored if the user left.
 * Does not touch media pipelines or admin Edit.
 */
import toast from "react-hot-toast";
import type { NavigateFunction } from "react-router-dom";
import {
  persistCanonicalEditPostData,
  type CanonicalEditPostData,
} from "./editPostBootstrap";

const LOADING_MESSAGE = "Loading post for edit…";
const DEFAULT_ERROR = "Failed to load post for editing";

/** Module-level: survives menu close / source unmount. */
let ownerEditInFlight = false;
let ownerEditGeneration = 0;
let ownerEditToastId: string | null = null;

export function isOwnerPublishedEditInFlight(): boolean {
  return ownerEditInFlight;
}

/** Test helper — reset module flight state between cases. */
export function __resetOwnerPublishedEditFlightForTests(): void {
  ownerEditInFlight = false;
  ownerEditGeneration = 0;
  if (ownerEditToastId != null) {
    toast.dismiss(ownerEditToastId);
    ownerEditToastId = null;
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function logOwnerEditTiming(
  label: string,
  t0: number,
  extra?: Record<string, number>,
): void {
  if (!import.meta.env.DEV) return;
  try {
    const elapsed = Math.round(nowMs() - t0);
    console.log("[owner-edit-open]", label, { ms: elapsed, ...extra });
  } catch {
    /* ignore */
  }
}

export type OwnerPublishedEditBuildResult = {
  editData: CanonicalEditPostData;
  href: string;
};

export type OwnerPublishedEditOpenStatus =
  | "busy"
  | "ok"
  | "failed"
  | "cancelled";

type RunArgs = {
  /** Authoritative fetch + bootstrap build (must not navigate). */
  fetchAndBuild: () => Promise<OwnerPublishedEditBuildResult>;
  navigate: NavigateFunction;
  /**
   * Pathname at tap time. If it changes before settle, do not persist/navigate
   * (user left via Back or another route).
   */
  startPathname: string;
  errorMessage?: string;
};

/**
 * One owner Edit open at a time. Shows loading toast immediately.
 * On success: persist bootstrap, dismiss toast, navigate.
 * On failure: dismiss toast, error toast.
 * On leave (pathname change) or superseded gen: dismiss toast, no navigate.
 */
export async function runOwnerPublishedEditOpen(
  args: RunArgs,
): Promise<OwnerPublishedEditOpenStatus> {
  if (ownerEditInFlight) {
    return "busy";
  }

  const t0 = nowMs();
  ownerEditInFlight = true;
  const gen = ++ownerEditGeneration;
  ownerEditToastId = toast.loading(LOADING_MESSAGE);
  logOwnerEditTiming("T1_loading", t0);

  const isStillCurrent = (): boolean =>
    gen === ownerEditGeneration &&
    typeof window !== "undefined" &&
    window.location.pathname === args.startPathname;

  try {
    const built = await args.fetchAndBuild();
    logOwnerEditTiming("T2_bootstrap_ready", t0);

    if (!isStillCurrent()) {
      if (ownerEditToastId != null) {
        toast.dismiss(ownerEditToastId);
        ownerEditToastId = null;
      }
      logOwnerEditTiming("cancelled_stale", t0);
      return "cancelled";
    }

    persistCanonicalEditPostData(built.editData);
    if (ownerEditToastId != null) {
      toast.dismiss(ownerEditToastId);
      ownerEditToastId = null;
    }
    logOwnerEditTiming("T3_navigate", t0);
    args.navigate(built.href);
    return "ok";
  } catch (error) {
    console.error("Error loading post for edit:", error);
    if (gen === ownerEditGeneration) {
      if (ownerEditToastId != null) {
        toast.dismiss(ownerEditToastId);
        ownerEditToastId = null;
      }
      // Only show error if user is still on the start surface.
      if (
        typeof window !== "undefined" &&
        window.location.pathname === args.startPathname
      ) {
        const msg =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : args.errorMessage?.trim() || DEFAULT_ERROR;
        toast.error(msg);
      }
    }
    return "failed";
  } finally {
    if (gen === ownerEditGeneration) {
      ownerEditInFlight = false;
    }
  }
}

export const OWNER_PUBLISHED_EDIT_LOADING_MESSAGE = LOADING_MESSAGE;
