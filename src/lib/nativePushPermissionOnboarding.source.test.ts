/**
 * Early native notification permission onboarding — source contracts.
 * Reuses NativePushPermissionPromptGate + requestNotificationPermissionAndRegister.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  applyNativePushPromptLater,
  applyNativePushPromptNever,
  applyNativePushPromptSessionDismiss,
  isNativePushPromptLaterCooldownActive,
  isNativePushPromptNeverAgain,
  isNativePushPromptSessionDismissed,
  NATIVE_PUSH_PROMPT_DELAY_MS,
  PUSH_PROMPT_LATER_UNTIL_MS_LS_KEY,
  PUSH_PROMPT_SESSION_DISMISS_SS_KEY,
  shouldShowNativePushPermissionPrompt,
} from "./pushPromptPrefs";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe("native push permission onboarding", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1–3: early gate delay is ~700ms; waits on appContentReady", () => {
    expect(NATIVE_PUSH_PROMPT_DELAY_MS).toBe(700);
    const gate = read(
      "components/notifications/NativePushPermissionPromptGate.tsx"
    );
    expect(gate).toContain("NATIVE_PUSH_PROMPT_DELAY_MS");
    expect(gate).toContain("if (!appContentReady) return");
    expect(gate).not.toMatch(/NATIVE_PUSH_PROMPT_DELAY_MS\s*=\s*2500/);
    expect(gate).not.toContain("2500");
  });

  it("4–6: auto gate only when OS ui === prompt", () => {
    const gate = read(
      "components/notifications/NativePushPermissionPromptGate.tsx"
    );
    expect(gate).toContain('if (ui !== "prompt")');
    expect(gate).toContain("getNativePushReceiveState");
    expect(gate).not.toMatch(
      /if \(ui === "granted" \|\| ui === "unsupported"\)/
    );
  });

  it("7: Allow uses requestNotificationPermissionAndRegister", () => {
    const gate = read(
      "components/notifications/NativePushPermissionPromptGate.tsx"
    );
    expect(gate).toContain("requestNotificationPermissionAndRegister");
    expect(gate).toMatch(
      /onAllow[\s\S]*requestNotificationPermissionAndRegister\(\)/
    );
  });

  it("8–9: registration pipeline + no immediate re-request on deny", () => {
    const helper = read("lib/explicitNativePushRegistration.ts");
    const devices = read("api/services/pushDevices.ts");
    expect(helper).toContain("PushNotifications.register()");
    expect(helper).toContain("FirebaseMessaging.getToken");
    expect(helper).toContain("upsertPushDevice");
    expect(devices).toContain('onConflict: "user_id,platform"');
    /* Single requestPermissions call site; denied returns without looping. */
    expect(helper).toMatch(
      /if \(perm\.receive !== "granted"\)[\s\S]*?return r;/
    );
    const requestCount = (
      helper.match(/PushNotifications\.requestPermissions\(\)/g) ?? []
    ).length;
    expect(requestCount).toBe(1);
  });

  it("10–11: Maybe later / never / session dismiss prefs", () => {
    expect(shouldShowNativePushPermissionPrompt()).toBe(true);

    applyNativePushPromptSessionDismiss();
    expect(isNativePushPromptSessionDismissed()).toBe(true);
    expect(shouldShowNativePushPermissionPrompt()).toBe(false);

    sessionStorage.removeItem(PUSH_PROMPT_SESSION_DISMISS_SS_KEY);
    applyNativePushPromptLater();
    expect(isNativePushPromptLaterCooldownActive()).toBe(true);
    expect(isNativePushPromptSessionDismissed()).toBe(true);
    expect(shouldShowNativePushPermissionPrompt()).toBe(false);

    sessionStorage.removeItem(PUSH_PROMPT_SESSION_DISMISS_SS_KEY);
    localStorage.removeItem(PUSH_PROMPT_LATER_UNTIL_MS_LS_KEY);
    applyNativePushPromptNever();
    expect(isNativePushPromptNeverAgain()).toBe(true);
    expect(shouldShowNativePushPermissionPrompt()).toBe(false);

    const gate = read(
      "components/notifications/NativePushPermissionPromptGate.tsx"
    );
    expect(gate).toContain("applyNativePushPromptLater");
    expect(gate).toContain("Never remind me again");
    expect(gate).toContain("Stay in the loop");
    expect(gate).toContain(
      "Get notified about messages, invites, group updates, and plans."
    );
  });

  it("12–13: Profile denied → Settings; prompt → explainer/request", () => {
    const bar = read("components/profile/ProfileTopBar.tsx");
    expect(bar).toContain("openNativeAppNotificationSettings");
    expect(bar).toContain('nativePushUi === "denied"');
    expect(bar).toContain("handleNativePushMenuClick");
    expect(bar).toContain("setShowHangoutReminderModal(true)");
    expect(bar).toContain("shouldDirectlyRefreshIosPush");
    expect(bar).toContain("requestNotificationPermissionAndRegister");
  });

  it("14: PushRegistrationMount auto request remains disabled", () => {
    const mount = read("components/PushRegistrationMount.tsx");
    expect(mount).toContain("TEMP_DISABLE_PUSH_REGISTRATION = true");
    expect(mount).toMatch(
      /if \(TEMP_DISABLE_PUSH_REGISTRATION\) \{\s*return;/
    );
  });

  it("15: single listener init in explicit helper (no duplicate install path)", () => {
    const helper = read("lib/explicitNativePushRegistration.ts");
    expect(helper).toContain("let listenersInit: Promise<void> | null = null");
    expect(helper).toContain("function ensurePushListeners()");
    expect(helper).toMatch(/if \(!listenersInit\)/);
  });

  it("16–17: Android merged POST_NOTIFICATIONS; no exact-alarm / FSI", () => {
    const candidates = [
      join(
        root,
        "..",
        "android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml"
      ),
      join(
        root,
        "..",
        "android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml"
      ),
      join(
        root,
        "..",
        "android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml"
      ),
    ];
    const merged = candidates.find((p) => existsSync(p));
    expect(merged, "merged AndroidManifest from a prior Android build").toBeTruthy();
    const xml = readFileSync(merged!, "utf8");
    expect(xml).toContain(
      'android.permission.POST_NOTIFICATIONS'
    );
    expect(xml).not.toContain("USE_EXACT_ALARM");
    expect(xml).not.toContain("SCHEDULE_EXACT_ALARM");
    expect(xml).not.toContain("USE_FULL_SCREEN_INTENT");

    const appManifest = readFileSync(
      join(root, "..", "android/app/src/main/AndroidManifest.xml"),
      "utf8"
    );
    /* Plugin merge supplies POST_NOTIFICATIONS; do not duplicate in app source. */
    expect(appManifest).not.toContain("POST_NOTIFICATIONS");
    expect(appManifest).not.toContain("USE_EXACT_ALARM");
  });

  it("18: browser NotificationPermissionBanner unchanged; gate is native-only", () => {
    const banner = read(
      "components/notifications/NotificationPermissionBanner.tsx"
    );
    expect(banner).toContain('Notification.requestPermission()');
    expect(banner).not.toContain("requestNotificationPermissionAndRegister");
    expect(banner).not.toContain("PushNotifications");

    const gate = read(
      "components/notifications/NativePushPermissionPromptGate.tsx"
    );
    expect(gate).toContain("if (!isNativeApp()) return");
    expect(gate).toContain("if (!isNativeApp()) return null");

    const app = read("App.tsx");
    expect(app).toContain("NativePushPermissionPromptGate");
    expect(app).toContain("appContentReady={!showSplash}");
  });

  it("gate still excludes auth callback + Create/Owl; uses FrostedCenterModal", () => {
    const gate = read(
      "components/notifications/NativePushPermissionPromptGate.tsx"
    );
    expect(gate).toContain('AUTH_CALLBACK_PATH = "/auth/callback"');
    expect(gate).toContain("createChooserOpen || owlModalOpen");
    expect(gate).toContain("FrostedCenterModal");
    expect(gate).toContain("shouldShowNativePushPermissionPrompt");
  });
});
