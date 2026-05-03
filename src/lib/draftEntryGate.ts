import { Paths } from "../router/Paths";

/** Query param: only when user chose “Continue draft” in the entry gate. */
export const RESUME_DRAFT_SEARCH_PARAM = "resumeDraft";
export const RESUME_DRAFT_SEARCH_VALUE = "1";

/**
 * Set when the user has entered the local create flow in this tab so step-to-step
 * navigation can hydrate from localStorage without auto-resuming on a cold `/create/activities` visit.
 */
export const CREATE_FLOW_SESSION_KEY = "createFlowSessionActive";
export const CREATE_FLOW_SESSION_VALUE = "1";

/**
 * Set only when the user explicitly continues an existing local create draft
 * (chooser “Continue draft” or `?resumeDraft=1`). Used so leave-confirm copy can
 * distinguish resume vs a fresh compose in this tab session. Cleared with
 * {@link discardAllDrafts}.
 */
export const CREATE_FLOW_RESUMED_LOCAL_DRAFT_KEY =
  "createFlowResumedLocalDraft";
export const CREATE_FLOW_RESUMED_LOCAL_DRAFT_VALUE = "1";

export function markCreateFlowSessionActive(): void {
  try {
    sessionStorage.setItem(CREATE_FLOW_SESSION_KEY, CREATE_FLOW_SESSION_VALUE);
  } catch {
    /* ignore */
  }
}

export function markCreateFlowResumedLocalDraft(): void {
  try {
    sessionStorage.setItem(
      CREATE_FLOW_RESUMED_LOCAL_DRAFT_KEY,
      CREATE_FLOW_RESUMED_LOCAL_DRAFT_VALUE
    );
  } catch {
    /* ignore */
  }
}

export function clearCreateFlowResumedLocalDraft(): void {
  try {
    sessionStorage.removeItem(CREATE_FLOW_RESUMED_LOCAL_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function isCreateFlowResumedLocalDraft(): boolean {
  try {
    return (
      sessionStorage.getItem(CREATE_FLOW_RESUMED_LOCAL_DRAFT_KEY) ===
      CREATE_FLOW_RESUMED_LOCAL_DRAFT_VALUE
    );
  } catch {
    return false;
  }
}

export function buildCreateActivitiesUrl(
  type: string,
  opts?: { resumeDraft?: boolean }
): string {
  const sp = new URLSearchParams();
  sp.set("type", type);
  if (opts?.resumeDraft) {
    sp.set(RESUME_DRAFT_SEARCH_PARAM, RESUME_DRAFT_SEARCH_VALUE);
  }
  return `${Paths.createActivities}?${sp.toString()}`;
}

/** Same query contract as {@link buildCreateActivitiesUrl}, for the Create post (finalize) step. */
export function buildCreateFinalizeUrl(
  type: string,
  opts?: { resumeDraft?: boolean }
): string {
  const sp = new URLSearchParams();
  sp.set("type", type);
  if (opts?.resumeDraft) {
    sp.set(RESUME_DRAFT_SEARCH_PARAM, RESUME_DRAFT_SEARCH_VALUE);
  }
  return `${Paths.createFinalize}?${sp.toString()}`;
}
