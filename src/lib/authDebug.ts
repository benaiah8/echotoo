// Minimal, toggleable logger for auth flows.
const ON = () => localStorage.getItem("DBG_AUTH") === "1";

function ts() {
  const d = new Date();
  return d.toISOString().split("T")[1].replace("Z", "");
}

export function dbg(tag: string, ...args: any[]) {
  if (!ON()) return;
  // Keep a small ring buffer on window for quick inspection
  (window as any).__AUTHDBG = (window as any).__AUTHDBG || [];
  (window as any).__AUTHDBG.push([ts(), tag, ...args]);
  if ((window as any).__AUTHDBG.length > 200) (window as any).__AUTHDBG.shift();
  // eslint-disable-next-line no-console
  console.log(`[AUTHDBG] ${ts()} ${tag}`, ...args);
}

export function dumpAuthEnv(extra: Record<string, any> = {}) {
  const info = {
    location: {
      href: window.location.href,
      search: window.location.search,
      hash: window.location.hash,
      pathname: window.location.pathname,
    },
    detectSessionInUrl: true,
    guest_until: localStorage.getItem("guest_until"),
    ...extra,
  };
  dbg("ENV", info);
  return info;
}
