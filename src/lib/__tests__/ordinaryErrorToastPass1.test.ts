/**
 * Ordinary error toast UX Pass 1 — X + fail-safe timeout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ORDINARY_ERROR_TOAST_DURATION_MS,
  __hasOrdinaryErrorFailSafeForTests,
  __resetOrdinaryErrorFailSafesForTests,
  armOrdinaryErrorFailSafe,
} from "../../components/OrdinaryErrorToastBar";

vi.mock("react-hot-toast", () => {
  const dismiss = vi.fn();
  return {
    default: { dismiss },
    toast: { dismiss },
    ToastBar: ({ children }: { children?: unknown }) => children ?? null,
  };
});

import toast from "react-hot-toast";

const root = process.cwd();
function readSrc(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

describe("ordinary error fail-safe timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetOrdinaryErrorFailSafesForTests();
    vi.mocked(toast.dismiss).mockClear();
  });

  afterEach(() => {
    __resetOrdinaryErrorFailSafesForTests();
    vi.useRealTimers();
  });

  it("4–5: arms finite lifetime and dismisses without relying on library pause", () => {
    expect(ORDINARY_ERROR_TOAST_DURATION_MS).toBe(7000);
    armOrdinaryErrorFailSafe("err-1");
    expect(__hasOrdinaryErrorFailSafeForTests("err-1")).toBe(true);
    vi.advanceTimersByTime(6999);
    expect(toast.dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(toast.dismiss).toHaveBeenCalledWith("err-1");
    expect(__hasOrdinaryErrorFailSafeForTests("err-1")).toBe(false);
  });

  it("2: dismiss targets only the selected toast id", () => {
    armOrdinaryErrorFailSafe("err-a");
    armOrdinaryErrorFailSafe("err-b");
    vi.advanceTimersByTime(7000);
    expect(toast.dismiss).toHaveBeenCalledWith("err-a");
    expect(toast.dismiss).toHaveBeenCalledWith("err-b");
    expect(toast.dismiss).toHaveBeenCalledTimes(2);
  });
});

describe("ordinary error toast source contracts", () => {
  it("1–3: OrdinaryErrorToastBar renders dismiss X with aria-label", () => {
    const src = readSrc("components/OrdinaryErrorToastBar.tsx");
    expect(src).toContain('aria-label="Dismiss"');
    expect(src).toContain("data-ordinary-error-toast-dismiss");
    expect(src).toContain("toast.dismiss(t.id)");
    expect(src).toContain("PiX");
    expect(src).toContain("width: 44");
    expect(src).toContain("height: 44");
    expect(src).toContain("armOrdinaryErrorFailSafe");
    expect(src).toMatch(/if \(t\.type !== "error"\)/);
  });

  it("6–7: AppFloatingChrome wires error duration; success/loading not forced", () => {
    const chrome = readSrc("components/AppFloatingChrome.tsx");
    expect(chrome).toContain("OrdinaryErrorToastBar");
    expect(chrome).toContain("ORDINARY_ERROR_TOAST_DURATION_MS");
    expect(chrome).toContain("error: {");
    expect(chrome).toContain(
      "duration: ORDINARY_ERROR_TOAST_DURATION_MS"
    );
    // Success keeps iconTheme only — no forced Infinity / error duration on loading.
    expect(chrome).toMatch(
      /success:\s*\{\s*iconTheme:[\s\S]*?\},/
    );
    expect(chrome).not.toMatch(/loading:\s*\{\s*duration:/);
  });

  it("8–10: social / discover / in-app banner hosts unchanged", () => {
    const chrome = readSrc("components/AppFloatingChrome.tsx");
    expect(chrome).toContain("SOCIAL_ACTION_TOASTER_ID");
    expect(chrome).toContain("DISCOVER_PREF_TOASTER_ID");
    expect(chrome).toContain("InAppNotificationBannerHost");
    expect(chrome).toMatch(
      /toasterId=\{SOCIAL_ACTION_TOASTER_ID\}[\s\S]*duration: 6500/
    );
    expect(chrome).toMatch(
      /toasterId=\{DISCOVER_PREF_TOASTER_ID\}[\s\S]*duration: 6500/
    );

    const social = readSrc("lib/showSocialActionToast.tsx");
    expect(social).toContain("SOCIAL_ACTION_TOAST_DURATION_MS = 6500");
    expect(social).toContain("Independent dismiss timer");

    const banner = readSrc(
      "components/notifications/InAppNotificationBanner.tsx"
    );
    expect(banner).toContain('aria-label="Dismiss notification"');
  });

  it("11–14: no route toast.dismiss hacks; no social-state / video / DB edits", () => {
    const chrome = readSrc("components/AppFloatingChrome.tsx");
    expect(chrome).not.toContain("useLocation");
    expect(chrome).not.toContain("useNavigate");

    // Pass 1 files only touch chrome + OrdinaryErrorToastBar — verify those
    // helpers don't import social stores / video media acquisition.
    const bar = readSrc("components/OrdinaryErrorToastBar.tsx");
    expect(bar).not.toContain("pairUpJoinStore");
    expect(bar).not.toContain("groupUpOwnStore");
    expect(bar).not.toContain("openPlanOwnStore");
    expect(bar).not.toContain("recordVideoFromCamera");
    expect(bar).not.toContain("mediaAcquisition");
    expect(bar).not.toContain("supabase.rpc");
  });
});
