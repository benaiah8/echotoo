/**
 * Debug utility for tab visibility and fetch gating.
 * Opt-in only: localStorage DBG_TAB_VISIBILITY=1 (quiet by default in dev and prod).
 */
const ON = () =>
  typeof localStorage !== "undefined" &&
  localStorage.getItem("DBG_TAB_VISIBILITY") === "1";

function ts() {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

export function logTabActive(activeTab: string, prevTab: string | null) {
  if (!ON()) return;
  const dir = prevTab ? `${prevTab} → ${activeTab}` : `initial: ${activeTab}`;
  console.log(`[TabVisibility] ${ts()} activeTab ${dir}`);
}

export function logFetchStart(
  component: string,
  tabId: string,
  isVisible: boolean,
  route?: string
) {
  if (!ON()) return;
  const routeStr =
    route ?? (typeof window !== "undefined" ? window.location.pathname : "?");
  const stack = import.meta.env.DEV
    ? new Error().stack?.split("\n").slice(2, 5).join("\n")
    : undefined;
  console.log(
    `[TabVisibility] ${ts()} FETCH_START ${component} tabId=${tabId} isVisible=${isVisible} route=${routeStr}`,
    stack || ""
  );
}
