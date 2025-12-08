// PWA: platform-aware “Save to Home” (mobile only) with Android prompt + iOS instructions
import { useEffect, useMemo, useState } from "react";
import { MdClose } from "react-icons/md";

interface BeforeInstallPromptEvent extends Event {
  platforms: string[];
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

/* -------- platform helpers -------- */
const ua = () => (navigator.userAgent || "").toLowerCase();
const isIOS = () => /iphone|ipad|ipod/.test(ua());
const isAndroid = () => /android/.test(ua());
const isMobile = () => isIOS() || isAndroid();
const isSafari = () =>
  /^((?!chrome|crios|android|edg|fxios).)*safari/i.test(navigator.userAgent);
const isChromeLike = () =>
  /(chrome|crios|edg)/i.test(navigator.userAgent) && !isSafari();
const isStandalone = () =>
  // iOS Safari exposes navigator.standalone; others expose display-mode
  // @ts-ignore
  (typeof navigator.standalone !== "undefined" &&
    (navigator as any).standalone === true) ||
  window.matchMedia("(display-mode: standalone)").matches;

/* -------- UI shells -------- */
type Sheet = "none" | "androidConfirm" | "iosSafari" | "iosOther" | "chooser";

function BottomSheet({
  title = "Save to Home",
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[1100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 max-w-[640px] mx-auto rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">{title}</div>
          <button className="text-xs text-[var(--text)]/70" onClick={onClose}>
            <MdClose size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(isStandalone());
  const [sheet, setSheet] = useState<Sheet>("none");

  // hide entirely on desktop
  const shouldShowFab = useMemo(() => isMobile() && !installed, [installed]);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setSheet("none");
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!shouldShowFab) return null;

  const openFlow = () => {
    // iPhone (any browser) cannot auto-install; show tailored steps
    if (isIOS()) {
      setSheet(isSafari() ? "iosSafari" : "iosOther");
      return;
    }
    // Android/Chrome: if prompt is available, show our confirm sheet; otherwise fallback to chooser
    if (deferred && (isAndroid() || isChromeLike())) {
      setSheet("androidConfirm");
      return;
    }
    setSheet("chooser");
  };

  return (
    <>
      {/* FAB — glowy, high-contrast border */}
      <div className="fixed opacity-0 bottom-20 left-3 z-[1000] hover:opacity-90">
        <button
          onClick={openFlow}
          className="px-3 py-2 rounded-lg text-xs font-semibold
                     bg-[var(--brand)] text-[var(--brand-ink)] border-2 border-white 
                     hover:opacity-90 transition "
          style={{
            boxShadow:
              "0 0 0 2px rgba(255,255,255,0.85), 0 10px 24px rgba(247,208,71,0.45), 0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          Save to Home
        </button>
      </div>

      {sheet !== "none" && (
        <BottomSheet title="Save to Home" onClose={() => setSheet("none")}>
          {sheet === "androidConfirm" && (
            <div className="text-sm text-[var(--text)]/85 space-y-3 ">
              <p>
                Add this app to your home screen for a faster, full-screen
                experience.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      await deferred?.prompt();
                      await deferred?.userChoice;
                    } catch {}
                    setSheet("none");
                  }}
                  className="px-3 py-2 rounded-lg bg-[var(--brand)] text-[var(--brand-ink)] text-xs font-semibold"
                >
                  Save
                </button>
                <button
                  onClick={() => setSheet("none")}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs"
                >
                  Later
                </button>
              </div>

              {/* Android fallback instructions (if native prompt didn’t appear) */}
              {!deferred && (
                <div className="mt-2 text-xs text-[var(--text)]/60">
                  If you don’t see the prompt, open the <b>⋮</b> menu and tap{" "}
                  <b>Install app</b> (Chrome) or <b>Add to Home screen</b>.
                </div>
              )}
            </div>
          )}

          {sheet === "iosSafari" && (
            <div className="text-sm text-[var(--text)]/85 space-y-2">
              <p className="text-[var(--text)]">On iPhone (Safari):</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Tap the <b>Share</b> icon at the bottom.
                </li>
                <li>
                  Scroll and choose <b>Add to Home Screen</b>.
                </li>
                <li>
                  Tap <b>Add</b>.
                </li>
              </ol>
              <p className="text-xs text-[var(--text)]/60 mt-2">
                Apple doesn’t allow automatic install from websites; this is the
                official way.
              </p>
            </div>
          )}

          {sheet === "iosOther" && (
            <div className="text-sm text-[var(--text)]/85 space-y-2">
              <p className="text-[var(--text)]">
                On iPhone in Chrome/Firefox/Edge:
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Tap the <b>Share</b> icon (square with arrow).
                </li>
                <li>
                  Select <b>Add to Home Screen</b>.
                </li>
                <li>
                  Tap <b>Add</b>.
                </li>
              </ol>
              <p className="text-xs text-[var(--text)]/60 mt-2">
                iOS browsers share the same install method via the Share menu.
              </p>
            </div>
          )}

          {sheet === "chooser" && (
            <div className="text-sm text-[var(--text)]/85">
              <p className="mb-2">Choose your device:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    setSheet(isSafari() ? "iosSafari" : "iosOther")
                  }
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] "
                >
                  iPhone
                </button>
                <button
                  onClick={() =>
                    setSheet(deferred ? "androidConfirm" : "androidConfirm")
                  }
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
                >
                  Android
                </button>
              </div>
              {!deferred && (
                <div className="mt-3 text-xs text-[var(--text)]/60">
                  If the Android install prompt doesn’t appear, open the{" "}
                  <b>⋮</b> menu and tap <b>Install app</b>.
                </div>
              )}
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}
