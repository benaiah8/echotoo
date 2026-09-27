/**
 * Opt-in Messages Realtime diagnostics.
 * localStorage DBG_DM_REALTIME=1 (quiet by default in dev and prod).
 */

const ON = () =>
  typeof localStorage !== "undefined" &&
  localStorage.getItem("DBG_DM_REALTIME") === "1";

function ts() {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

export function logDmRealtime(
  tag: string,
  payload?: Record<string, unknown>
): void {
  if (!ON()) return;
  if (payload) {
    console.log(`[dm-realtime] ${ts()} ${tag}`, payload);
  } else {
    console.log(`[dm-realtime] ${ts()} ${tag}`);
  }
}
